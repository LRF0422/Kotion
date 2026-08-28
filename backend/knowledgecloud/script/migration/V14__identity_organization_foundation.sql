-- Identity and organization schema foundation.
--
-- This migration is deliberately additive and restart-safe because MySQL
-- auto-commits DDL. It creates no users, memberships, role assignments, or
-- permission assignments and performs no semantic backfill.
-- Compatible with MySQL 5.7 and MySQL 8.0.

DROP PROCEDURE IF EXISTS `migrate_identity_organization_foundation`;

DELIMITER //
CREATE PROCEDURE `migrate_identity_organization_foundation`()
BEGIN
    DECLARE object_count BIGINT DEFAULT 0;

    -- Fail clearly rather than silently creating incomplete replacements for
    -- the three core identity tables supplied by the base schema.
    SELECT COUNT(*) INTO object_count
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'knowledge_user';
    IF object_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V14 requires base table knowledge_user';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'knowledge_tenant';
    IF object_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V14 requires base table knowledge_tenant';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'knowledge_role';
    IF object_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V14 requires base table knowledge_role';
    END IF;

    -- Global identity fields. normalized_account remains nullable and is not
    -- unique until the preflight report is clean and an explicit backfill has
    -- been reviewed. personal_context_id uses the canonical VARCHAR(12)
    -- tenant/context identifier width.
    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user'
      AND column_name = 'normalized_account';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_user`
            ADD COLUMN `normalized_account` VARCHAR(255) NULL
                COMMENT 'Globally normalized login account; populated by an explicit rollout';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user'
      AND column_name = 'personal_context_id';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_user`
            ADD COLUMN `personal_context_id` VARCHAR(12) NULL
                COMMENT 'Personal tenant/context identifier; populated by an explicit rollout';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user'
      AND column_name = 'auth_version';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_user`
            ADD COLUMN `auth_version` INT NOT NULL DEFAULT 0
                COMMENT 'Incrementing authentication invalidation version';
    END IF;

    -- Tenant ownership is intentionally nullable until existing tenants have
    -- been classified and ownership has been explicitly reconciled.
    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_tenant'
      AND column_name = 'tenant_type';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_tenant`
            ADD COLUMN `tenant_type` VARCHAR(20) NULL
                COMMENT 'INDIVIDUAL or TEAM; populated by an explicit rollout';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_tenant'
      AND column_name = 'owner_user_id';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_tenant`
            ADD COLUMN `owner_user_id` BIGINT NULL
                COMMENT 'Owning user; populated by an explicit rollout';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_tenant'
      AND column_name = 'status';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_tenant`
            ADD COLUMN `status` INT NULL COMMENT 'Tenant lifecycle status';
    END IF;

    -- Role classification fields remain nullable so legacy aliases are not
    -- silently promoted to canonical role codes or kinds.
    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_role'
      AND column_name = 'role_code';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_role`
            ADD COLUMN `role_code` VARCHAR(64) NULL
                COMMENT 'Canonical role code; populated by an explicit rollout';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_role'
      AND column_name = 'role_kind';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_role`
            ADD COLUMN `role_kind` VARCHAR(32) NULL
                COMMENT 'Role kind: ORGANIZATION or PLATFORM';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_role'
      AND column_name = 'built_in';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_role`
            ADD COLUMN `built_in` TINYINT(1) NULL
                COMMENT 'Whether the role is platform-managed';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_role'
      AND column_name = 'status';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_role`
            ADD COLUMN `status` INT NULL COMMENT 'Role lifecycle status';
    END IF;

    -- Some deployments already have this relationship table even though it is
    -- absent from the legacy bootstrap SQL. CREATE IF NOT EXISTS establishes a
    -- complete foundation without replacing an existing table.
    CREATE TABLE IF NOT EXISTS `knowledge_user_role` (
        `id` BIGINT NOT NULL COMMENT 'Primary key',
        `tenant_id` VARCHAR(12) NULL COMMENT 'Tenant/context ID',
        `user_id` BIGINT NOT NULL COMMENT 'User ID',
        `role_id` BIGINT NOT NULL COMMENT 'Role ID',
        `scope_type` VARCHAR(32) NULL COMMENT 'Optional assignment scope type',
        `scope_id` VARCHAR(64) NULL COMMENT 'Optional assignment scope ID',
        `create_user` BIGINT NULL COMMENT 'Creator',
        `create_time` DATETIME NULL COMMENT 'Create time',
        `update_user` BIGINT NULL COMMENT 'Updater',
        `update_time` DATETIME NULL COMMENT 'Update time',
        `is_deleted` INT NOT NULL DEFAULT 0 COMMENT 'Soft-delete flag',
        PRIMARY KEY (`id`),
        KEY `idx_knowledge_user_role_user` (`user_id`, `is_deleted`),
        KEY `idx_knowledge_user_role_role` (`role_id`, `is_deleted`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      COMMENT='Scoped user role assignments';

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user_role'
      AND column_name = 'scope_type';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_user_role`
            ADD COLUMN `scope_type` VARCHAR(32) NULL
                COMMENT 'Optional assignment scope type';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user_role'
      AND column_name = 'scope_id';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_user_role`
            ADD COLUMN `scope_id` VARCHAR(64) NULL
                COMMENT 'Optional assignment scope ID';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user_role'
      AND index_name = 'idx_knowledge_user_role_scope';
    IF object_count = 0 THEN
        CREATE INDEX `idx_knowledge_user_role_scope`
            ON `knowledge_user_role` (`tenant_id`, `scope_type`, `scope_id`, `is_deleted`);
    END IF;

    -- Organization membership is the canonical context membership source.
    -- member_role is the built-in role projection; custom permissions remain
    -- in role/permission assignments.
    CREATE TABLE IF NOT EXISTS `knowledge_organization_member` (
        `id` BIGINT NOT NULL COMMENT 'Primary key',
        `tenant_id` VARCHAR(12) NOT NULL COMMENT 'Organization tenant/context ID',
        `user_id` BIGINT NOT NULL COMMENT 'Global user ID',
        `display_name` VARCHAR(64) NULL COMMENT 'Organization-specific display name',
        `job_title` VARCHAR(128) NULL COMMENT 'Organization-specific job title',
        `member_role` VARCHAR(32) NULL COMMENT 'Built-in role projection',
        `status` INT NULL COMMENT 'Membership lifecycle status',
        `joined_at` DATETIME NULL COMMENT 'Join time',
        `invited_by` BIGINT NULL COMMENT 'Inviting user ID',
        `invitation_token` VARCHAR(128) NULL COMMENT 'Pending invitation token',
        `invitation_expires_at` DATETIME NULL COMMENT 'Pending invitation expiry time',
        `create_user` BIGINT NULL COMMENT 'Creator',
        `create_time` DATETIME NULL COMMENT 'Create time',
        `update_user` BIGINT NULL COMMENT 'Updater',
        `update_time` DATETIME NULL COMMENT 'Update time',
        `is_deleted` INT NOT NULL DEFAULT 0 COMMENT 'Soft-delete flag',
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_organization_member_active` (`tenant_id`, `user_id`, `is_deleted`),
        KEY `idx_organization_member_user` (`user_id`, `is_deleted`),
        KEY `idx_organization_member_invitation_token` (`invitation_token`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      COMMENT='Organization membership';

    CREATE TABLE IF NOT EXISTS `knowledge_member_dept` (
        `id` BIGINT NOT NULL COMMENT 'Primary key',
        `tenant_id` VARCHAR(12) NOT NULL COMMENT 'Organization tenant/context ID',
        `member_id` BIGINT NOT NULL COMMENT 'Organization member ID',
        `dept_id` BIGINT NOT NULL COMMENT 'Department ID',
        `is_primary` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Whether this is the primary department',
        `create_user` BIGINT NULL COMMENT 'Creator',
        `create_time` DATETIME NULL COMMENT 'Create time',
        `update_user` BIGINT NULL COMMENT 'Updater',
        `update_time` DATETIME NULL COMMENT 'Update time',
        `is_deleted` INT NOT NULL DEFAULT 0 COMMENT 'Soft-delete flag',
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_member_dept_active` (`member_id`, `dept_id`, `is_deleted`),
        KEY `idx_member_dept_tenant_dept` (`tenant_id`, `dept_id`, `is_deleted`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      COMMENT='Organization member department assignments';

    CREATE TABLE IF NOT EXISTS `knowledge_role_permission` (
        `id` BIGINT NOT NULL COMMENT 'Primary key',
        `tenant_id` VARCHAR(12) NULL COMMENT 'Tenant/context ID; null for global roles',
        `role_id` BIGINT NOT NULL COMMENT 'Role ID',
        `permission_code` VARCHAR(255) NOT NULL COMMENT 'Canonical permission code',
        `create_user` BIGINT NULL COMMENT 'Creator',
        `create_time` DATETIME NULL COMMENT 'Create time',
        `update_user` BIGINT NULL COMMENT 'Updater',
        `update_time` DATETIME NULL COMMENT 'Update time',
        `is_deleted` INT NOT NULL DEFAULT 0 COMMENT 'Soft-delete flag',
        PRIMARY KEY (`id`),
        KEY `idx_role_permission_role_code` (`role_id`, `permission_code`(191), `is_deleted`),
        KEY `idx_role_permission_tenant` (`tenant_id`, `is_deleted`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      COMMENT='Canonical role permission assignments';

    CREATE TABLE IF NOT EXISTS `knowledge_auth_session` (
        `id` BIGINT NOT NULL COMMENT 'Primary key',
        `session_key` VARCHAR(128) NOT NULL COMMENT 'Opaque session identifier',
        `user_id` BIGINT NOT NULL COMMENT 'Global user ID',
        `audience` VARCHAR(64) NULL COMMENT 'Token/session audience',
        `context_type` VARCHAR(32) NULL COMMENT 'Active context type',
        `context_id` VARCHAR(12) NULL COMMENT 'Active tenant/context ID',
        `refresh_token_hash` VARCHAR(255) NULL COMMENT 'One-way refresh token hash',
        `auth_version` INT NOT NULL DEFAULT 0 COMMENT 'User auth version at issue time',
        `issued_at` DATETIME NOT NULL COMMENT 'Issue time',
        `expires_at` DATETIME NOT NULL COMMENT 'Expiry time',
        `last_seen_at` DATETIME NULL COMMENT 'Last activity time',
        `revoked_at` DATETIME NULL COMMENT 'Revocation time',
        `device_name` VARCHAR(128) NULL COMMENT 'Client device label',
        `remote_ip` VARCHAR(64) NULL COMMENT 'Client network address',
        `user_agent` VARCHAR(512) NULL COMMENT 'Client user agent',
        `status` INT NULL COMMENT 'Session lifecycle status',
        `create_user` BIGINT NULL COMMENT 'Creator',
        `create_time` DATETIME NULL COMMENT 'Create time',
        `update_user` BIGINT NULL COMMENT 'Updater',
        `update_time` DATETIME NULL COMMENT 'Update time',
        `is_deleted` INT NOT NULL DEFAULT 0 COMMENT 'Soft-delete flag',
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_auth_session_key` (`session_key`),
        KEY `idx_auth_session_user_status` (`user_id`, `status`, `is_deleted`),
        KEY `idx_auth_session_context` (`context_type`, `context_id`, `user_id`, `is_deleted`),
        KEY `idx_auth_session_expiry` (`expires_at`, `is_deleted`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      COMMENT='Server-side authentication sessions';
END//
DELIMITER ;

CALL `migrate_identity_organization_foundation`();
DROP PROCEDURE IF EXISTS `migrate_identity_organization_foundation`;
