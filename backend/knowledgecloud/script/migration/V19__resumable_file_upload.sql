-- Resumable file-upload persistence foundation.
--
-- This migration is additive and restart-safe because MySQL auto-commits DDL.
-- It changes file sizes to BIGINT, links completed files to one upload session,
-- and creates session/part state tables without adding provider APIs.
-- Compatible with MySQL 5.7 and MySQL 8.0.

DROP PROCEDURE IF EXISTS `migrate_resumable_file_upload`;

DELIMITER //
CREATE PROCEDURE `migrate_resumable_file_upload`()
BEGIN
    DECLARE object_count BIGINT DEFAULT 0;
    DECLARE current_data_type VARCHAR(64);
    DECLARE current_column_type VARCHAR(255);
    DECLARE current_nullable VARCHAR(3);
    DECLARE current_default TEXT;
    DECLARE current_comment TEXT;
    DECLARE ddl_statement LONGTEXT;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_file';
    IF object_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V19 requires base table knowledge_file';
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_file'
      AND column_name = 'size';
    IF object_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V19 requires base column knowledge_file.size';
    END IF;

    -- Preserve the deployed column nullability, default, unsigned flag, and
    -- comment while widening only its numeric type.
    SELECT data_type, column_type, is_nullable, column_default, column_comment
    INTO current_data_type, current_column_type, current_nullable, current_default, current_comment
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_file'
      AND column_name = 'size';

    IF LOWER(current_data_type) <> 'bigint' THEN
        SET ddl_statement = CONCAT(
            'ALTER TABLE `knowledge_file` MODIFY COLUMN `size` BIGINT',
            IF(LOWER(current_column_type) LIKE '%unsigned%', ' UNSIGNED', ''),
            IF(current_nullable = 'YES', ' NULL', ' NOT NULL'),
            CASE
                WHEN current_default IS NULL AND current_nullable = 'YES' THEN ' DEFAULT NULL'
                WHEN current_default IS NULL THEN ''
                ELSE CONCAT(' DEFAULT ', QUOTE(current_default))
            END,
            IF(current_comment IS NULL OR current_comment = '', '', CONCAT(' COMMENT ', QUOTE(current_comment)))
        );
        SET @v19_ddl_statement = ddl_statement;
        PREPARE stmt FROM @v19_ddl_statement;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SET @v19_ddl_statement = NULL;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'knowledge_file'
      AND column_name = 'upload_session_id';
    IF object_count = 0 THEN
        ALTER TABLE `knowledge_file`
            ADD COLUMN `upload_session_id` BIGINT NULL
                COMMENT 'Resumable upload session that completed this file' AFTER `size`;
    ELSE
        SELECT data_type, is_nullable
        INTO current_data_type, current_nullable
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'knowledge_file'
          AND column_name = 'upload_session_id';
        IF LOWER(current_data_type) <> 'bigint' OR current_nullable <> 'YES' THEN
            ALTER TABLE `knowledge_file`
                MODIFY COLUMN `upload_session_id` BIGINT NULL
                    COMMENT 'Resumable upload session that completed this file';
        END IF;
    END IF;

    SELECT COUNT(*) INTO object_count
    FROM (
        SELECT index_name
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'knowledge_file'
          AND non_unique = 0
        GROUP BY index_name
        HAVING COUNT(*) = 1
           AND MAX(CASE WHEN column_name = 'upload_session_id' THEN 1 ELSE 0 END) = 1
    ) AS unique_upload_session_indexes;
    IF object_count = 0 THEN
        SELECT COUNT(*) INTO object_count
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'knowledge_file'
          AND index_name = 'uk_knowledge_file_upload_session_id';
        IF object_count > 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'V19 found incompatible index uk_knowledge_file_upload_session_id';
        END IF;
        CREATE UNIQUE INDEX `uk_knowledge_file_upload_session_id`
            ON `knowledge_file` (`upload_session_id`);
    END IF;

    CREATE TABLE IF NOT EXISTS `knowledge_upload_session` (
        `id` BIGINT NOT NULL COMMENT 'Primary key',
        `tenant_id` VARCHAR(12) NOT NULL COMMENT 'Owning tenant/context ID',
        `user_id` BIGINT NOT NULL COMMENT 'Owning user ID',
        `client_uuid` VARCHAR(64) NOT NULL COMMENT 'Client-generated idempotency UUID',
        `repository_key` VARCHAR(64) NOT NULL COMMENT 'Destination file repository key',
        `parent_id` BIGINT NOT NULL DEFAULT 0 COMMENT 'Destination parent folder ID',
        `original_name` VARCHAR(512) NOT NULL COMMENT 'Original client file name',
        `content_type` VARCHAR(255) NULL COMMENT 'Declared media content type',
        `expected_size` BIGINT NOT NULL COMMENT 'Expected complete file size in bytes',
        `provider` VARCHAR(32) NOT NULL COMMENT 'Object-storage provider name',
        `bucket` VARCHAR(128) NOT NULL COMMENT 'Object-storage bucket',
        `object_key` VARCHAR(1024) NOT NULL COMMENT 'Provider-neutral destination object key',
        `provider_upload_id` VARCHAR(255) NULL COMMENT 'Multipart upload ID assigned by the provider',
        `part_size` BIGINT NOT NULL COMMENT 'Configured part size in bytes',
        `part_count` INT NOT NULL COMMENT 'Expected number of parts',
        `confirmed_bytes` BIGINT NOT NULL DEFAULT 0 COMMENT 'Bytes confirmed as persisted by the provider',
        `status` VARCHAR(32) NOT NULL DEFAULT 'CREATED' COMMENT 'CREATED|UPLOADING|COMPLETING|COMPLETED|FAILED|ABORTING|ABORTED|EXPIRED',
        `failure_stage` VARCHAR(32) NULL COMMENT 'Stage that produced the last failure',
        `failure_code` VARCHAR(64) NULL COMMENT 'Stable failure classification',
        `failure_message` TEXT NULL COMMENT 'Last failure detail',
        `retryable` TINYINT NOT NULL DEFAULT 1 COMMENT 'Whether the session may be retried',
        `retry_count` INT NOT NULL DEFAULT 0 COMMENT 'Session-level retry count',
        `completed_file_id` BIGINT NULL COMMENT 'knowledge_file row created on completion',
        `checksum_algorithm` VARCHAR(32) NULL COMMENT 'Whole-file checksum algorithm',
        `checksum` VARCHAR(255) NULL COMMENT 'Expected or confirmed whole-file checksum',
        `version` BIGINT NOT NULL DEFAULT 0 COMMENT 'Optimistic concurrency version',
        `last_activity_time` DATETIME NOT NULL COMMENT 'Last client or provider activity time',
        `expires_at` DATETIME NOT NULL COMMENT 'Time after which the session may be expired for inactivity',
        `max_expires_at` DATETIME NOT NULL COMMENT 'Hard maximum lifetime of the session',
        `create_user` BIGINT NULL COMMENT 'Creator',
        `create_time` DATETIME NULL COMMENT 'Create time',
        `update_user` BIGINT NULL COMMENT 'Updater',
        `update_time` DATETIME NULL COMMENT 'Update time',
        `is_deleted` INT NOT NULL DEFAULT 0 COMMENT 'Soft-delete flag',
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_upload_session_client` (`tenant_id`, `user_id`, `client_uuid`, `is_deleted`),
        KEY `idx_upload_session_owner_status` (`tenant_id`, `user_id`, `status`, `is_deleted`),
        KEY `idx_upload_session_destination` (`tenant_id`, `repository_key`, `parent_id`, `is_deleted`),
        KEY `idx_upload_session_expiry` (`status`, `expires_at`, `is_deleted`),
        KEY `idx_upload_session_activity` (`status`, `last_activity_time`, `is_deleted`),
        UNIQUE KEY `uk_upload_session_completed_file` (`completed_file_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      COMMENT='Resumable multipart file upload sessions';

    CREATE TABLE IF NOT EXISTS `knowledge_upload_part` (
        `id` BIGINT NOT NULL COMMENT 'Primary key',
        `tenant_id` VARCHAR(12) NOT NULL COMMENT 'Owning tenant/context ID',
        `user_id` BIGINT NOT NULL COMMENT 'Owning user ID',
        `upload_session_id` BIGINT NOT NULL COMMENT 'Owning upload session ID',
        `part_number` INT NOT NULL COMMENT 'One-based multipart part number',
        `byte_offset` BIGINT NOT NULL COMMENT 'Zero-based byte offset in the complete file',
        `part_size` BIGINT NOT NULL COMMENT 'Part size in bytes',
        `etag` VARCHAR(255) NULL COMMENT 'Provider ETag after upload confirmation',
        `provider_checksum` VARCHAR(255) NULL COMMENT 'Checksum returned by the provider',
        `checksum_algorithm` VARCHAR(32) NULL COMMENT 'Client checksum algorithm',
        `checksum` VARCHAR(255) NULL COMMENT 'Client checksum for the part',
        `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING|UPLOADING|COMPLETED|FAILED',
        `attempt_count` INT NOT NULL DEFAULT 0 COMMENT 'Number of upload attempts',
        `uploaded_at` DATETIME NULL COMMENT 'Time the provider confirmed this part',
        `create_user` BIGINT NULL COMMENT 'Creator',
        `create_time` DATETIME NULL COMMENT 'Create time',
        `update_user` BIGINT NULL COMMENT 'Updater',
        `update_time` DATETIME NULL COMMENT 'Update time',
        `is_deleted` INT NOT NULL DEFAULT 0 COMMENT 'Soft-delete flag',
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_upload_part_number` (`upload_session_id`, `part_number`, `is_deleted`),
        KEY `idx_upload_part_owner_status` (`tenant_id`, `user_id`, `upload_session_id`, `status`, `is_deleted`),
        KEY `idx_upload_part_session_status` (`upload_session_id`, `status`, `is_deleted`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      COMMENT='Parts belonging to resumable file upload sessions';
END//
DELIMITER ;

CALL `migrate_resumable_file_upload`();
DROP PROCEDURE IF EXISTS `migrate_resumable_file_upload`;
