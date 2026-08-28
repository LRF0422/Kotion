-- Identity and organization rollout preflight (read-only).
--
-- Run after V14 has established nullable foundation columns and before any
-- identity/member/role/permission backfill. Every result row requires review;
-- this script makes no repair or ownership decision.
-- Compatible with MySQL 5.7 and MySQL 8.0.

SET SESSION group_concat_max_len = 1048576;
SET SESSION TRANSACTION READ ONLY;
START TRANSACTION WITH CONSISTENT SNAPSHOT;

SELECT '01_duplicate_global_accounts' AS preflight_check;
SELECT
    LOWER(TRIM(`account`)) AS normalized_account_candidate,
    COUNT(*) AS active_user_count,
    GROUP_CONCAT(CAST(`id` AS CHAR) ORDER BY `id` SEPARATOR ',') AS user_ids,
    GROUP_CONCAT(DISTINCT `tenant_id` ORDER BY `tenant_id` SEPARATOR ',') AS tenant_ids,
    GROUP_CONCAT(DISTINCT `account` ORDER BY `account` SEPARATOR ',') AS stored_accounts
FROM `knowledge_user`
WHERE `is_deleted` = 0
  AND `account` IS NOT NULL
  AND TRIM(`account`) <> ''
GROUP BY LOWER(TRIM(`account`))
HAVING COUNT(*) > 1
ORDER BY normalized_account_candidate;

SELECT '02_multi_user_individual_tenants' AS preflight_check;
SELECT
    t.`id` AS tenant_pk,
    t.`tenant_id`,
    t.`tenant_name`,
    t.`owner_user_id`,
    COUNT(u.`id`) AS active_user_count,
    GROUP_CONCAT(CAST(u.`id` AS CHAR) ORDER BY u.`id` SEPARATOR ',') AS user_ids
FROM `knowledge_tenant` t
JOIN `knowledge_user` u
  ON u.`tenant_id` = t.`tenant_id`
 AND u.`is_deleted` = 0
WHERE t.`is_deleted` = 0
  AND UPPER(TRIM(t.`tenant_type`)) = 'INDIVIDUAL'
GROUP BY t.`id`, t.`tenant_id`, t.`tenant_name`, t.`owner_user_id`
HAVING COUNT(u.`id`) > 1
ORDER BY t.`tenant_id`;

SELECT '03a_relation_roles_missing_from_legacy_user_role_id' AS preflight_check;
SELECT
    u.`id` AS user_id,
    u.`tenant_id` AS user_tenant_id,
    u.`role_id` AS legacy_role_ids,
    ur.`id` AS user_role_id,
    ur.`tenant_id` AS relation_tenant_id,
    ur.`role_id` AS relation_role_id,
    ur.`scope_type`,
    ur.`scope_id`,
    CASE
        WHEN ur.`tenant_id` IS NOT NULL AND ur.`tenant_id` <> u.`tenant_id`
            THEN 'RELATION_TENANT_MISMATCH'
        ELSE 'RELATION_ROLE_NOT_IN_LEGACY_CSV'
    END AS mismatch_reason
FROM `knowledge_user_role` ur
JOIN `knowledge_user` u ON u.`id` = ur.`user_id`
WHERE ur.`is_deleted` = 0
  AND u.`is_deleted` = 0
  AND (
      (ur.`tenant_id` IS NOT NULL AND ur.`tenant_id` <> u.`tenant_id`)
      OR FIND_IN_SET(
          CAST(ur.`role_id` AS CHAR),
          REPLACE(COALESCE(u.`role_id`, ''), ' ', '')
      ) = 0
  )
ORDER BY u.`id`, ur.`role_id`;

SELECT '03b_legacy_user_role_id_tokens_missing_from_relation' AS preflight_check;
SELECT
    u.`id` AS user_id,
    u.`tenant_id`,
    u.`role_id` AS legacy_role_ids,
    1 + LENGTH(REPLACE(u.`role_id`, ' ', ''))
        - LENGTH(REPLACE(REPLACE(u.`role_id`, ' ', ''), ',', '')) AS legacy_token_count,
    (
        SELECT COUNT(DISTINCT ur.`role_id`)
        FROM `knowledge_user_role` ur
        WHERE ur.`user_id` = u.`id`
          AND ur.`is_deleted` = 0
          AND FIND_IN_SET(
              CAST(ur.`role_id` AS CHAR),
              REPLACE(u.`role_id`, ' ', '')
          ) > 0
    ) AS matched_relation_role_count,
    (
        SELECT GROUP_CONCAT(CAST(ur.`role_id` AS CHAR) ORDER BY ur.`role_id` SEPARATOR ',')
        FROM `knowledge_user_role` ur
        WHERE ur.`user_id` = u.`id`
          AND ur.`is_deleted` = 0
    ) AS relation_role_ids
FROM `knowledge_user` u
WHERE u.`is_deleted` = 0
  AND u.`role_id` IS NOT NULL
  AND TRIM(u.`role_id`) <> ''
  AND 1 + LENGTH(REPLACE(u.`role_id`, ' ', ''))
          - LENGTH(REPLACE(REPLACE(u.`role_id`, ' ', ''), ',', ''))
      <> (
          SELECT COUNT(DISTINCT ur.`role_id`)
          FROM `knowledge_user_role` ur
          WHERE ur.`user_id` = u.`id`
            AND ur.`is_deleted` = 0
            AND FIND_IN_SET(
                CAST(ur.`role_id` AS CHAR),
                REPLACE(u.`role_id`, ' ', '')
            ) > 0
      )
ORDER BY u.`id`;

-- wiki_space.user_id is the current owner source. Very old bootstrap schemas
-- only have create_user; select that as a diagnostic fallback rather than
-- inventing or updating an owner.
SELECT COUNT(*) INTO @has_space_user_id
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'wiki_space'
  AND column_name = 'user_id';

SELECT COUNT(*) INTO @has_space_member
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'wiki_space_member';

SET @space_owner_expr = IF(
    @has_space_user_id = 1,
    's.`user_id`',
    's.`create_user`'
);

SELECT '04_space_owner_member_mismatches' AS preflight_check;
SET @space_owner_member_sql = IF(
    @has_space_member = 1,
    CONCAT(
        'SELECT s.`id` AS space_id, s.`tenant_id`, ', @space_owner_expr, ' AS recorded_owner_user_id, ',
        'IF(', @has_space_user_id, ' = 1, ''wiki_space.user_id'', ''wiki_space.create_user_fallback'') AS owner_source, ',
        'owners.owner_member_count, owners.owner_member_user_ids, ',
        'CASE ',
        'WHEN ', @space_owner_expr, ' IS NULL THEN ''SPACE_OWNER_IS_NULL'' ',
        'WHEN COALESCE(owners.owner_member_count, 0) = 0 THEN ''OWNER_MEMBER_MISSING'' ',
        'WHEN owners.recorded_owner_is_owner = 0 THEN ''OWNER_MEMBER_POINTS_TO_DIFFERENT_USER'' ',
        'WHEN owners.owner_member_count > 1 THEN ''MULTIPLE_OWNER_MEMBERS'' ',
        'END AS mismatch_reason ',
        'FROM `wiki_space` s ',
        'LEFT JOIN (',
        'SELECT m.`space_id`, COUNT(*) AS owner_member_count, ',
        'GROUP_CONCAT(CAST(m.`user_id` AS CHAR) ORDER BY m.`user_id` SEPARATOR '','') AS owner_member_user_ids, ',
        'MAX(CASE WHEN m.`user_id` = ', @space_owner_expr, ' THEN 1 ELSE 0 END) AS recorded_owner_is_owner ',
        'FROM `wiki_space_member` m JOIN `wiki_space` s ON s.`id` = m.`space_id` ',
        'WHERE m.`is_deleted` = 0 AND m.`role` = ''OWNER'' ',
        'GROUP BY m.`space_id`',
        ') owners ON owners.`space_id` = s.`id` ',
        'WHERE s.`is_deleted` = 0 AND (',
        @space_owner_expr, ' IS NULL ',
        'OR COALESCE(owners.owner_member_count, 0) = 0 ',
        'OR owners.recorded_owner_is_owner = 0 ',
        'OR owners.owner_member_count > 1) ',
        'ORDER BY s.`id`'
    ),
    'SELECT ''SKIPPED: wiki_space_member does not exist'' AS diagnostic'
);
PREPARE space_owner_member_stmt FROM @space_owner_member_sql;
EXECUTE space_owner_member_stmt;
DEALLOCATE PREPARE space_owner_member_stmt;

-- Support both the current (user_id/space_id/permissions) permission shape and
-- the oldest bootstrap (owner_id/space_key/operation/has_permission) shape.
-- The report never converts either representation.
SELECT COUNT(*) INTO @current_permission_columns
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'wiki_space_permission'
  AND column_name IN ('user_id', 'space_id', 'permissions');

SELECT COUNT(*) INTO @legacy_permission_columns
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'wiki_space_permission'
  AND column_name IN ('owner_id', 'owner_type', 'space_key', 'operation', 'has_permission');

SELECT '05_legacy_space_permission_mismatches' AS preflight_check;
SET @legacy_permission_sql = CASE
    WHEN @has_space_member = 0 THEN
        'SELECT ''SKIPPED: wiki_space_member does not exist'' AS diagnostic'
    WHEN @current_permission_columns = 3 THEN
        CONCAT(
            'SELECT p.`id` AS permission_id, p.`space_id`, p.`user_id`, ',
            'CAST(p.`permissions` AS CHAR) AS legacy_permissions, m.`role` AS member_role, ',
            'CASE ',
            'WHEN m.`id` IS NULL THEN ''LEGACY_PERMISSION_WITHOUT_MEMBER'' ',
            'WHEN m.`role` IN (''OWNER'', ''ADMIN'') AND UPPER(CAST(p.`permissions` AS CHAR)) NOT LIKE ''%ADMIN%'' ',
            'THEN ''MEMBER_ROLE_STRONGER_THAN_LEGACY_PERMISSION'' ',
            'WHEN m.`role` = ''MEMBER'' AND UPPER(CAST(p.`permissions` AS CHAR)) NOT LIKE ''%WRITE%'' ',
            'AND UPPER(CAST(p.`permissions` AS CHAR)) NOT LIKE ''%ADMIN%'' ',
            'THEN ''MEMBER_ROLE_STRONGER_THAN_LEGACY_PERMISSION'' ',
            'WHEN m.`role` = ''GUEST'' AND (UPPER(CAST(p.`permissions` AS CHAR)) LIKE ''%WRITE%'' ',
            'OR UPPER(CAST(p.`permissions` AS CHAR)) LIKE ''%ADMIN%'') ',
            'THEN ''LEGACY_PERMISSION_STRONGER_THAN_MEMBER_ROLE'' ',
            'END AS mismatch_reason ',
            'FROM `wiki_space_permission` p ',
            'LEFT JOIN `wiki_space_member` m ON m.`space_id` = p.`space_id` ',
            'AND m.`user_id` = p.`user_id` AND m.`is_deleted` = 0 ',
            'WHERE p.`is_deleted` = 0 AND (m.`id` IS NULL ',
            'OR (m.`role` IN (''OWNER'', ''ADMIN'') AND UPPER(CAST(p.`permissions` AS CHAR)) NOT LIKE ''%ADMIN%'') ',
            'OR (m.`role` = ''MEMBER'' AND UPPER(CAST(p.`permissions` AS CHAR)) NOT LIKE ''%WRITE%'' ',
            'AND UPPER(CAST(p.`permissions` AS CHAR)) NOT LIKE ''%ADMIN%'') ',
            'OR (m.`role` = ''GUEST'' AND (UPPER(CAST(p.`permissions` AS CHAR)) LIKE ''%WRITE%'' ',
            'OR UPPER(CAST(p.`permissions` AS CHAR)) LIKE ''%ADMIN%''))) ',
            'ORDER BY p.`space_id`, p.`user_id`, p.`id`'
        )
    WHEN @legacy_permission_columns = 5 THEN
        CONCAT(
            'SELECT p.`id` AS permission_id, s.`id` AS space_id, p.`space_key`, ',
            'p.`owner_type`, p.`owner_id`, p.`operation`, p.`has_permission`, m.`role` AS member_role, ',
            'CASE ',
            'WHEN s.`id` IS NULL THEN ''LEGACY_SPACE_KEY_NOT_FOUND'' ',
            'WHEN UPPER(p.`owner_type`) <> ''USER'' THEN ''LEGACY_OWNER_TYPE_NOT_MEMBER_BASED'' ',
            'WHEN m.`id` IS NULL THEN ''LEGACY_PERMISSION_WITHOUT_MEMBER'' ',
            'WHEN p.`has_permission` = 0 AND UPPER(p.`operation`) IN (''READ'', ''WRITE'', ''ADMIN'') ',
            'AND (m.`role` IN (''OWNER'', ''ADMIN'') OR (m.`role` = ''MEMBER'' AND UPPER(p.`operation`) IN (''READ'', ''WRITE''))) ',
            'THEN ''LEGACY_DENY_CONFLICTS_WITH_MEMBER_ROLE'' ',
            'WHEN p.`has_permission` = 1 AND ((m.`role` = ''MEMBER'' AND UPPER(p.`operation`) = ''ADMIN'') ',
            'OR (m.`role` = ''GUEST'' AND UPPER(p.`operation`) IN (''WRITE'', ''ADMIN''))) ',
            'THEN ''LEGACY_GRANT_STRONGER_THAN_MEMBER_ROLE'' ',
            'END AS mismatch_reason ',
            'FROM `wiki_space_permission` p ',
            'LEFT JOIN `wiki_space` s ON s.`space_key` = p.`space_key` AND s.`is_deleted` = 0 ',
            'LEFT JOIN `wiki_space_member` m ON m.`space_id` = s.`id` AND m.`user_id` = p.`owner_id` ',
            'AND m.`is_deleted` = 0 ',
            'WHERE p.`is_deleted` = 0 AND (s.`id` IS NULL OR UPPER(p.`owner_type`) <> ''USER'' OR m.`id` IS NULL ',
            'OR (p.`has_permission` = 0 AND UPPER(p.`operation`) IN (''READ'', ''WRITE'', ''ADMIN'') ',
            'AND (m.`role` IN (''OWNER'', ''ADMIN'') OR (m.`role` = ''MEMBER'' AND UPPER(p.`operation`) IN (''READ'', ''WRITE'')))) ',
            'OR (p.`has_permission` = 1 AND ((m.`role` = ''MEMBER'' AND UPPER(p.`operation`) = ''ADMIN'') ',
            'OR (m.`role` = ''GUEST'' AND UPPER(p.`operation`) IN (''WRITE'', ''ADMIN''))))) ',
            'ORDER BY p.`space_key`, p.`owner_id`, p.`id`'
        )
    ELSE
        'SELECT ''SKIPPED: unsupported or missing wiki_space_permission schema'' AS diagnostic'
END;
PREPARE legacy_permission_stmt FROM @legacy_permission_sql;
EXECUTE legacy_permission_stmt;
DEALLOCATE PREPARE legacy_permission_stmt;

ROLLBACK;
SET SESSION TRANSACTION READ WRITE;
