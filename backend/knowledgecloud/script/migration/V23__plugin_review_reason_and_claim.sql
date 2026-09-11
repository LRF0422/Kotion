-- Structured rejection reasons and reviewer claim ownership for plugin review.
-- Target schema: knowledge_wiki (owns wiki_plugin_version).
-- Restart-safe: MySQL auto-commits DDL, so every object is guarded by
-- information_schema checks and the migration can be re-run after a partial apply.
DROP PROCEDURE IF EXISTS `migrate_plugin_review_reason_claim`;

DELIMITER //
CREATE PROCEDURE `migrate_plugin_review_reason_claim`()
BEGIN
    DECLARE object_count BIGINT DEFAULT 0;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'review_reason_code';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `review_reason_code` VARCHAR(32) NULL
            COMMENT 'ARTIFACT_INVALID|INTEGRITY_MISMATCH|DESCRIPTION_MISMATCH|SECURITY_RISK|POLICY_VIOLATION|OTHER'
            AFTER `review_comment`;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'claimed_by';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `claimed_by` BIGINT NULL
            COMMENT 'Reviewer who owns this candidate; null when unclaimed' AFTER `review_time`;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'claimed_by_name';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `claimed_by_name` VARCHAR(64) NULL
            COMMENT 'Claim owner display name at claim time' AFTER `claimed_by`;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'claimed_time';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `claimed_time` DATETIME NULL
            COMMENT 'Claim timestamp' AFTER `claimed_by_name`;
    END IF;

    -- Rejection-cause aggregation filters by reason code on decided rows.
    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND index_name = 'idx_wiki_plugin_version_reason_code';
    IF object_count = 0 THEN
        CREATE INDEX `idx_wiki_plugin_version_reason_code`
            ON `wiki_plugin_version` (`review_reason_code`, `review_status`);
    END IF;
END//
DELIMITER ;

CALL `migrate_plugin_review_reason_claim`();
DROP PROCEDURE IF EXISTS `migrate_plugin_review_reason_claim`;
