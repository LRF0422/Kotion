-- Plugin Configuration Table
-- Create table for storing user plugin configurations
--
-- `config` holds only non-sensitive fields. Credentials (API keys, tokens,
-- secrets, cookies) are stripped out by the service and stored AES-256-GCM
-- encrypted in `secret_config`; see script/migration/V35__plugin_config_secrets.sql.

CREATE TABLE `wiki_plugin_config` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT NOT NULL COMMENT 'User ID',
  `plugin_key` VARCHAR(128) NOT NULL COMMENT 'Plugin identifier',
  `config` JSON NOT NULL COMMENT 'Non-sensitive configuration JSON',
  `secret_config` TEXT DEFAULT NULL COMMENT 'AES-256-GCM encrypted credentials (v1:base64(iv||ciphertext||tag)); NULL when none',
  `create_user` BIGINT DEFAULT NULL COMMENT 'Creator user ID',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
  `update_user` BIGINT DEFAULT NULL COMMENT 'Updater user ID',
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Update time',
  `status` INT NOT NULL DEFAULT 1 COMMENT 'Status',
  `is_deleted` INT NOT NULL DEFAULT 0 COMMENT 'Soft delete flag',
  `tenant_id` VARCHAR(12) DEFAULT '000000' COMMENT 'Tenant ID',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_plugin` (`user_id`, `plugin_key`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Plugin configuration table';
