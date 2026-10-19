-- Developer verification (开发者认证).
--
-- Publishing or managing a plugin requires an APPROVED developer profile. One
-- profile per user; a rejected/revoked profile can be edited and resubmitted,
-- which moves it back to PENDING for another manual review.
--
-- Target schema: knowledge (owns wiki_plugin*). Restart-safe: CREATE TABLE IF
-- NOT EXISTS, and MySQL auto-commits DDL.
CREATE TABLE IF NOT EXISTS `wiki_developer` (
    `id`                 BIGINT NOT NULL COMMENT 'Primary key',
    `user_id`            BIGINT NOT NULL COMMENT 'Owner user id',
    `user_name`          VARCHAR(64) NULL COMMENT 'Account name at submission time',
    `display_name`       VARCHAR(64) NOT NULL COMMENT 'Developer / entity name shown on plugins',
    `contact_name`       VARCHAR(64) NOT NULL COMMENT 'Contact person',
    `contact_email`      VARCHAR(128) NOT NULL COMMENT 'Contact email',
    `contact_phone`      VARCHAR(32) NOT NULL COMMENT 'Contact phone',
    `id_type`            VARCHAR(32) NOT NULL COMMENT 'ID_CARD|PASSPORT|BUSINESS_LICENSE|OTHER',
    `id_number`          VARCHAR(128) NOT NULL COMMENT 'Certificate / license number (never exposed raw to the owner)',
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
