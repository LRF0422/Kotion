-- Approved plugin submission lifecycle and marketplace integrity.
-- This migration is deliberately restart-safe because MySQL auto-commits DDL.

DROP PROCEDURE IF EXISTS `migrate_plugin_submission_lifecycle`;

DELIMITER //
CREATE PROCEDURE `migrate_plugin_submission_lifecycle`()
BEGIN
    DECLARE issue_count BIGINT DEFAULT 0;
    DECLARE object_count BIGINT DEFAULT 0;

    -- Preserve legacy rows that did not persist developer_id explicitly.
    UPDATE `wiki_plugin`
    SET `developer_id` = `create_user`
    WHERE `developer_id` IS NULL
      AND `create_user` IS NOT NULL;

    -- Blank historical keys receive a deterministic, valid identity.
    UPDATE `wiki_plugin`
    SET `plugin_key` = CONCAT('legacy-', `id`)
    WHERE `plugin_key` IS NULL OR TRIM(`plugin_key`) = '';

    SELECT COUNT(*) INTO issue_count
    FROM `wiki_plugin`
    WHERE CHAR_LENGTH(`plugin_key`) > 50;
    IF issue_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V13 preflight: wiki_plugin.plugin_key exceeds 50 characters';
    END IF;

    SELECT COUNT(*) INTO issue_count
    FROM (
        SELECT `plugin_key`
        FROM `wiki_plugin`
        GROUP BY `plugin_key`
        HAVING COUNT(*) > 1
    ) duplicate_keys;
    IF issue_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V13 preflight: duplicate wiki_plugin.plugin_key values must be resolved';
    END IF;

    SELECT COUNT(*) INTO issue_count
    FROM `wiki_plugin_version`
    WHERE `resource_path` IS NULL OR TRIM(`resource_path`) = '';
    IF issue_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V13 preflight: wiki_plugin_version.resource_path contains null/blank values';
    END IF;

    -- Widen the legacy integer/string version column before converting its data.
    ALTER TABLE `wiki_plugin_version`
        MODIFY COLUMN `version` VARCHAR(64) NOT NULL COMMENT 'Semantic version x.y.z';

    UPDATE `wiki_plugin_version`
    SET `version` = CONCAT(CAST(`version` AS UNSIGNED), '.0.0')
    WHERE `version` REGEXP '^[0-9]+$';

    SELECT COUNT(*) INTO issue_count
    FROM `wiki_plugin_version`
    WHERE CHAR_LENGTH(`version`) > 64
       OR `version` NOT REGEXP '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$';
    IF issue_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V13 preflight: plugin versions must be strict x.y.z semver with max length 64';
    END IF;

    SELECT COUNT(*) INTO issue_count
    FROM (
        SELECT `subject_id`, `version`
        FROM `wiki_plugin_version`
        GROUP BY `subject_id`, `version`
        HAVING COUNT(*) > 1
    ) duplicate_versions;
    IF issue_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V13 preflight: duplicate plugin semantic versions must be resolved';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'review_status';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `review_status` VARCHAR(32) NULL AFTER `status`
            COMMENT 'PENDING/IN_PROGRESS/REJECTED/DONE review lifecycle';
    END IF;

    ALTER TABLE `wiki_plugin_version`
        MODIFY COLUMN `status` VARCHAR(32) NOT NULL COMMENT 'DRAFT/PENDING/ACTIVE/IN_ACTIVE',
        MODIFY COLUMN `resource_path` VARCHAR(1024) NOT NULL COMMENT 'Canonical JavaScript object path',
        MODIFY COLUMN `integrity` VARCHAR(128) NULL COMMENT 'SRI hash, e.g. sha384-xxx';

    -- Legacy unpublished submissions used DRAFT for their review candidate.
    UPDATE `wiki_plugin_version` v
    JOIN `wiki_plugin` p ON p.`id` = v.`subject_id`
    SET v.`status` = 'PENDING'
    WHERE v.`status` = 'DRAFT'
      AND p.`status` IN ('PENDING', 'IN_PROGRESS')
      AND v.`is_deleted` = 0
      AND p.`is_deleted` = 0;

    UPDATE `wiki_plugin_version`
    SET `review_status` = CASE
        WHEN `status` IN ('ACTIVE', 'IN_ACTIVE') THEN 'DONE'
        WHEN `status` = 'PENDING' THEN 'PENDING'
        ELSE `review_status`
    END;

    UPDATE `wiki_plugin_version` v
    JOIN `wiki_plugin` p ON p.`id` = v.`subject_id`
    SET v.`review_status` = 'REJECTED'
    WHERE v.`status` = 'DRAFT'
      AND p.`status` = 'REJECTED'
      AND v.`is_deleted` = 0
      AND p.`is_deleted` = 0;

    -- Existing published plugins remain visible under the DONE + ACTIVE rule.
    UPDATE `wiki_plugin` p
    JOIN `wiki_plugin_version` active_version
      ON active_version.`subject_id` = p.`id`
     AND active_version.`status` = 'ACTIVE'
     AND active_version.`is_deleted` = 0
    SET p.`status` = 'DONE',
        p.`current_version_id` = active_version.`id`
    WHERE p.`is_deleted` = 0;

    -- Normalize tags and retain an active row in preference to a deleted duplicate.
    UPDATE `wiki_plugin_tag`
    SET `content` = LOWER(TRIM(`content`));

    DELETE duplicate_tag
    FROM `wiki_plugin_tag` duplicate_tag
    JOIN `wiki_plugin_tag` keeper
      ON keeper.`plugin_id` = duplicate_tag.`plugin_id`
     AND keeper.`content` = duplicate_tag.`content`
     AND (keeper.`is_deleted` < duplicate_tag.`is_deleted`
          OR (keeper.`is_deleted` = duplicate_tag.`is_deleted` AND keeper.`id` < duplicate_tag.`id`));

    ALTER TABLE `wiki_plugin`
        MODIFY COLUMN `plugin_key` VARCHAR(50) NOT NULL COMMENT 'Immutable plugin identifier',
        MODIFY COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING'
            COMMENT 'PENDING/IN_PROGRESS/REJECTED/DONE';

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin'
      AND index_name = 'uk_wiki_plugin_plugin_key';
    IF object_count = 0 THEN
        CREATE UNIQUE INDEX `uk_wiki_plugin_plugin_key`
            ON `wiki_plugin` (`plugin_key`);
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND index_name = 'uk_wiki_plugin_version_subject_version';
    IF object_count = 0 THEN
        CREATE UNIQUE INDEX `uk_wiki_plugin_version_subject_version`
            ON `wiki_plugin_version` (`subject_id`, `version`);
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin'
      AND index_name = 'idx_wiki_plugin_owner_status';
    IF object_count = 0 THEN
        CREATE INDEX `idx_wiki_plugin_owner_status`
            ON `wiki_plugin` (`developer_id`, `status`, `is_deleted`);
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin'
      AND index_name = 'idx_wiki_plugin_marketplace';
    IF object_count = 0 THEN
        CREATE INDEX `idx_wiki_plugin_marketplace`
            ON `wiki_plugin` (`status`, `category`, `is_deleted`);
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND index_name = 'idx_wiki_plugin_version_subject_status';
    IF object_count = 0 THEN
        CREATE INDEX `idx_wiki_plugin_version_subject_status`
            ON `wiki_plugin_version` (`subject_id`, `status`, `is_deleted`);
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_tag'
      AND index_name = 'uk_wiki_plugin_tag_content';
    IF object_count = 0 THEN
        CREATE UNIQUE INDEX `uk_wiki_plugin_tag_content`
            ON `wiki_plugin_tag` (`plugin_id`, `content`);
    END IF;
END//
DELIMITER ;

CALL `migrate_plugin_submission_lifecycle`();
DROP PROCEDURE IF EXISTS `migrate_plugin_submission_lifecycle`;
