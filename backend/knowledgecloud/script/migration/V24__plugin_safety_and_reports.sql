-- P1 plugin safety & governance:
--   1. capability/permission declarations and heuristic scan report per version
--   2. takedown / emergency recall flag on the plugin
--   3. plugin report table for user reports
-- Target schema: knowledge_wiki. Restart-safe (MySQL auto-commits DDL).
DROP PROCEDURE IF EXISTS `migrate_plugin_safety_and_reports`;

DELIMITER //
CREATE PROCEDURE `migrate_plugin_safety_and_reports`()
BEGIN
    DECLARE object_count BIGINT DEFAULT 0;

    -- --- wiki_plugin_version: declared permissions + heuristic scan result ---
    SELECT COUNT(*) INTO object_count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wiki_plugin_version' AND column_name = 'permissions_json';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `permissions_json` JSON NULL
            COMMENT 'Declared capability permissions, e.g. ["NETWORK","STORAGE"]' AFTER `version_description`;
    END IF;

    SELECT COUNT(*) INTO object_count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wiki_plugin_version' AND column_name = 'scan_status';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `scan_status` VARCHAR(16) NULL
            COMMENT 'PASS|WARN|FAIL heuristic safety scan' AFTER `permissions_json`;
    END IF;

    SELECT COUNT(*) INTO object_count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wiki_plugin_version' AND column_name = 'scan_report';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `scan_report` TEXT NULL
            COMMENT 'JSON array of scan findings' AFTER `scan_status`;
    END IF;

    -- --- wiki_plugin: takedown / emergency recall ---
    SELECT COUNT(*) INTO object_count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wiki_plugin' AND column_name = 'suspended';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin`
            ADD COLUMN `suspended` TINYINT(1) NOT NULL DEFAULT 0
            COMMENT '1 = taken down / not purchasable' AFTER `status`;
    END IF;

    SELECT COUNT(*) INTO object_count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wiki_plugin' AND column_name = 'suspend_reason';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin`
            ADD COLUMN `suspend_reason` VARCHAR(500) NULL COMMENT 'Takedown reason' AFTER `suspended`;
    END IF;

    SELECT COUNT(*) INTO object_count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wiki_plugin' AND column_name = 'suspend_time';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin`
            ADD COLUMN `suspend_time` DATETIME NULL COMMENT 'Takedown timestamp' AFTER `suspend_reason`;
    END IF;

    SELECT COUNT(*) INTO object_count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wiki_plugin' AND column_name = 'suspend_by';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin`
            ADD COLUMN `suspend_by` BIGINT NULL COMMENT 'Operator who took it down' AFTER `suspend_time`;
    END IF;

    SELECT COUNT(*) INTO object_count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wiki_plugin' AND column_name = 'suspend_by_name';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin`
            ADD COLUMN `suspend_by_name` VARCHAR(64) NULL COMMENT 'Operator display name' AFTER `suspend_by`;
    END IF;

    SELECT COUNT(*) INTO object_count FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'wiki_plugin' AND index_name = 'idx_wiki_plugin_suspended';
    IF object_count = 0 THEN
        CREATE INDEX `idx_wiki_plugin_suspended` ON `wiki_plugin` (`suspended`, `status`, `is_deleted`);
    END IF;

    -- --- plugin reports ---
    CREATE TABLE IF NOT EXISTS `wiki_plugin_report` (
        `id`           BIGINT NOT NULL COMMENT 'Primary key',
        `plugin_id`    BIGINT NOT NULL,
        `version_id`   BIGINT NULL COMMENT 'Reported version, null for plugin-level',
        `reason_type`  VARCHAR(32) NOT NULL COMMENT 'MALICIOUS|PRIVACY|COPYRIGHT|SPAM|OTHER',
        `reason_text`  VARCHAR(500) NULL,
        `reporter_id`  BIGINT NOT NULL,
        `reporter_name` VARCHAR(64) NULL,
        `status`       VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING|RESOLVED|REJECTED',
        `handler_id`   BIGINT NULL,
        `handle_note`  VARCHAR(500) NULL,
        `handle_time`  DATETIME NULL,
        `tenant_id`    VARCHAR(12) NULL,
        `create_user`  BIGINT NULL,
        `create_time`  DATETIME NULL,
        `update_user`  BIGINT NULL,
        `update_time`  DATETIME NULL,
        `is_deleted`   INT NOT NULL DEFAULT 0,
        PRIMARY KEY (`id`),
        KEY `idx_plugin_report_status` (`status`, `create_time`),
        KEY `idx_plugin_report_plugin` (`plugin_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='User reports for plugins';
END//
DELIMITER ;

CALL `migrate_plugin_safety_and_reports`();
DROP PROCEDURE IF EXISTS `migrate_plugin_safety_and_reports`;
