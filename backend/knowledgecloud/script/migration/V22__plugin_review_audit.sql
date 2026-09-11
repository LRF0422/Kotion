-- Plugin review audit trail: who decided, when, and why.
-- Target schema: knowledge_wiki (the wiki service database that owns wiki_plugin,
-- wiki_plugin_version and wiki_plugin_tag). Run with the Flyway/JDBC connection
-- pointed at knowledge_wiki; all checks use DATABASE(), so no schema name is
-- hard-coded and the file stays portable across environments.
-- Restart-safe because MySQL auto-commits DDL; every object is guarded by
-- information_schema checks so a partially applied migration can be re-run.
DROP PROCEDURE IF EXISTS `migrate_plugin_review_audit`;

DELIMITER //
CREATE PROCEDURE `migrate_plugin_review_audit`()
BEGIN
    DECLARE object_count BIGINT DEFAULT 0;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'review_comment';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `review_comment` VARCHAR(500) NULL
            COMMENT 'Reviewer comment; mandatory rejection reason' AFTER `review_status`;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'reviewer_id';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `reviewer_id` BIGINT NULL
            COMMENT 'Platform operator who last acted on this candidate' AFTER `review_comment`;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'reviewer_name';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `reviewer_name` VARCHAR(64) NULL
            COMMENT 'Reviewer display name at decision time' AFTER `reviewer_id`;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'review_time';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `review_time` DATETIME NULL
            COMMENT 'Timestamp of the last review action' AFTER `reviewer_name`;
    END IF;

    -- The admin review queue always filters and orders by review_status.
    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND index_name = 'idx_wiki_plugin_version_review';
    IF object_count = 0 THEN
        CREATE INDEX `idx_wiki_plugin_version_review`
            ON `wiki_plugin_version` (`review_status`, `review_time`);
    END IF;
END//
DELIMITER ;

CALL `migrate_plugin_review_audit`();
DROP PROCEDURE IF EXISTS `migrate_plugin_review_audit`;
