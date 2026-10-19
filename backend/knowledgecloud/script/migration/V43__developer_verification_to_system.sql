-- Move developer verification into the system (identity) domain.
--
-- V42 created `wiki_developer` while the feature briefly lived in
-- knowledge-wiki. Developer verification is an account-level profile and now
-- belongs to knowledge-system, whose tables are `knowledge_*` in the same
-- database. This migration renames/copies the V42 table so either history
-- (V42 applied or not) converges on `knowledge_developer`.
--
-- Restart-safe: all branches are guarded by information_schema checks.
DROP PROCEDURE IF EXISTS `migrate_developer_verification_to_system`;

DELIMITER //
CREATE PROCEDURE `migrate_developer_verification_to_system`()
BEGIN
    DECLARE wiki_exists BIGINT DEFAULT 0;
    DECLARE system_exists BIGINT DEFAULT 0;

    SELECT COUNT(*) INTO wiki_exists
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'wiki_developer';

    SELECT COUNT(*) INTO system_exists
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'knowledge_developer';

    IF system_exists = 0 AND wiki_exists > 0 THEN
        -- V42 ran: keep its rows and its indexes.
        ALTER TABLE `wiki_developer` RENAME TO `knowledge_developer`;
    ELSEIF system_exists = 0 AND wiki_exists = 0 THEN
        -- V42 was skipped/never applied: create the final shape directly.
        CREATE TABLE `knowledge_developer` (
            `id`                 BIGINT NOT NULL COMMENT 'Primary key',
            `user_id`            BIGINT NOT NULL COMMENT 'Owner user id',
            `user_name`          VARCHAR(64) NULL COMMENT 'Account name at submission time',
            `display_name`       VARCHAR(64) NOT NULL COMMENT 'Developer / entity name shown on plugins',
            `contact_name`       VARCHAR(64) NOT NULL COMMENT 'Contact person',
            `contact_email`      VARCHAR(128) NOT NULL COMMENT 'Contact email',
            `contact_phone`      VARCHAR(32) NOT NULL COMMENT 'Contact phone',
            `id_type`            VARCHAR(32) NOT NULL COMMENT 'ID_CARD|PASSPORT|BUSINESS_LICENSE|OTHER',
            `id_number`          VARCHAR(128) NOT NULL COMMENT 'Certificate / license number (masked to the owner)',
            `intro`              VARCHAR(1000) NULL COMMENT 'Developer introduction',
            `qualification_path` VARCHAR(512) NULL COMMENT 'Uploaded qualification material object path',
            `status`             VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING|APPROVED|REJECTED|SUSPENDED',
            `reject_reason`      VARCHAR(500) NULL COMMENT 'Reason shown to the developer when rejected/revoked',
            `review_comment`     VARCHAR(500) NULL COMMENT 'Internal review comment',
            `reviewer_id`        BIGINT NULL,
            `reviewer_name`      VARCHAR(64) NULL,
            `review_time`        DATETIME NULL,
            `tenant_id`          VARCHAR(12) NULL,
            `create_user`        BIGINT NULL,
            `create_time`        DATETIME NULL,
            `update_user`        BIGINT NULL,
            `update_time`        DATETIME NULL,
            `is_deleted`         INT NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uk_developer_user` (`user_id`),
            KEY `idx_developer_status` (`status`, `is_deleted`),
            KEY `idx_developer_create_time` (`create_time`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Developer verification profiles';
    ELSEIF system_exists > 0 AND wiki_exists > 0 THEN
        -- Both shapes exist (partial manual fix): keep rows, then retire V42's table.
        INSERT IGNORE INTO `knowledge_developer` SELECT * FROM `wiki_developer`;
        DROP TABLE `wiki_developer`;
    END IF;
END //

DELIMITER ;

CALL `migrate_developer_verification_to_system`();

DROP PROCEDURE IF EXISTS `migrate_developer_verification_to_system`;
