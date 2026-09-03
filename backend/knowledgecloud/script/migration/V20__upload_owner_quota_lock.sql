-- File-center has no local knowledge_user table. Use a local row per upload owner
-- to serialize active-session quota checks safely within the file-center database.
CREATE TABLE IF NOT EXISTS `knowledge_upload_owner_lock` (
    `tenant_id` VARCHAR(12) NOT NULL COMMENT 'Owning tenant/context ID',
    `user_id` BIGINT NOT NULL COMMENT 'Owning user ID',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Create time',
    PRIMARY KEY (`tenant_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Per-owner lock rows for serialized upload quota checks';
