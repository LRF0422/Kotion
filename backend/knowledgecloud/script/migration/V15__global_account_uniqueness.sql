-- Enforce race-safe uniqueness for newly normalized global accounts.
-- Legacy rows with normalized_account IS NULL remain valid until the reviewed
-- backfill assigns them a value. Active duplicates stop the migration.

DROP PROCEDURE IF EXISTS `migrate_global_account_uniqueness`;

DELIMITER //
CREATE PROCEDURE `migrate_global_account_uniqueness`()
BEGIN
    DECLARE object_count BIGINT DEFAULT 0;
    DECLARE duplicate_count BIGINT DEFAULT 0;

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT COALESCE(NULLIF(`normalized_account`, ''), LOWER(TRIM(`account`))) AS effective_account
        FROM `knowledge_user`
        WHERE `is_deleted` = 0
          AND `account` IS NOT NULL
          AND TRIM(`account`) <> ''
        GROUP BY effective_account
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V15 blocked: duplicate active global accounts require reconciliation';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user'
      AND column_name = 'active_normalized_account';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_user`
            ADD COLUMN `active_normalized_account` VARCHAR(255)
                GENERATED ALWAYS AS (
                    CASE WHEN `is_deleted` = 0 THEN `normalized_account` ELSE NULL END
                ) STORED
                COMMENT 'Generated key for active global-account uniqueness';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user'
      AND index_name = 'uk_knowledge_user_active_normalized_account';
    IF object_count = 0 THEN
        CREATE UNIQUE INDEX `uk_knowledge_user_active_normalized_account`
            ON `knowledge_user` (`active_normalized_account`);
    END IF;
END//
DELIMITER ;

CALL `migrate_global_account_uniqueness`();
DROP PROCEDURE IF EXISTS `migrate_global_account_uniqueness`;
