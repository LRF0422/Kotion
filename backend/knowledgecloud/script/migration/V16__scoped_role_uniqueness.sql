-- Make scoped role definitions and assignments race-safe without rewriting
-- legacy rows whose role_code/scope columns are still null.

DROP PROCEDURE IF EXISTS `migrate_scoped_role_uniqueness`;

DELIMITER //
CREATE PROCEDURE `migrate_scoped_role_uniqueness`()
BEGIN
    DECLARE object_count BIGINT DEFAULT 0;
    DECLARE duplicate_count BIGINT DEFAULT 0;

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT `tenant_id`, `role_kind`, `role_code`
        FROM `knowledge_role`
        WHERE `is_deleted` = 0
          AND `role_kind` IS NOT NULL
          AND `role_code` IS NOT NULL
        GROUP BY `tenant_id`, `role_kind`, `role_code`
        HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V16 blocked: duplicate scoped role codes require reconciliation';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_role'
      AND column_name = 'active_scoped_role_key';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_role`
            ADD COLUMN `active_scoped_role_key` VARCHAR(180)
                GENERATED ALWAYS AS (
                    CASE
                        WHEN `is_deleted` = 0 AND `role_kind` IS NOT NULL AND `role_code` IS NOT NULL
                        THEN CONCAT(`tenant_id`, '|', `role_kind`, '|', `role_code`)
                        ELSE NULL
                    END
                ) STORED;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_role'
      AND index_name = 'uk_knowledge_role_active_scope_code';
    IF object_count = 0 THEN
        CREATE UNIQUE INDEX `uk_knowledge_role_active_scope_code`
            ON `knowledge_role` (`active_scoped_role_key`);
    END IF;

    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT `user_id`, `role_id`, `scope_type`, `scope_id`
        FROM `knowledge_user_role`
        WHERE `is_deleted` = 0
          AND `scope_type` IS NOT NULL
          AND `scope_id` IS NOT NULL
        GROUP BY `user_id`, `role_id`, `scope_type`, `scope_id`
        HAVING COUNT(*) > 1
    ) duplicates;
    IF duplicate_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V16 blocked: duplicate scoped user-role assignments require reconciliation';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user_role'
      AND column_name = 'active_scoped_assignment_key';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_user_role`
            ADD COLUMN `active_scoped_assignment_key` VARCHAR(180)
                GENERATED ALWAYS AS (
                    CASE
                        WHEN `is_deleted` = 0 AND `scope_type` IS NOT NULL AND `scope_id` IS NOT NULL
                        THEN CONCAT(`user_id`, '|', `role_id`, '|', `scope_type`, '|', `scope_id`)
                        ELSE NULL
                    END
                ) STORED;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_user_role'
      AND index_name = 'uk_knowledge_user_role_active_scope';
    IF object_count = 0 THEN
        CREATE UNIQUE INDEX `uk_knowledge_user_role_active_scope`
            ON `knowledge_user_role` (`active_scoped_assignment_key`);
    END IF;
END//
DELIMITER ;

CALL `migrate_scoped_role_uniqueness`();
DROP PROCEDURE IF EXISTS `migrate_scoped_role_uniqueness`;
