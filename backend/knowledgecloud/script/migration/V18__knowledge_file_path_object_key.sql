-- Normalize knowledge_file.path to the provider-neutral OSS object key.
-- Required Flyway placeholders:
--   ossEndpoint, for example http://192.168.3.43:9000
--   ossBucket,   for example knowledge
--
-- Deploy the compatibility resolver before running this migration.

DROP PROCEDURE IF EXISTS `migrate_knowledge_file_path_object_key`;

DELIMITER //
CREATE PROCEDURE `migrate_knowledge_file_path_object_key`()
BEGIN
    DECLARE configured_endpoint VARCHAR(1024);
    DECLARE configured_bucket VARCHAR(255);
    DECLARE legacy_prefix VARCHAR(1536);
    DECLARE invalid_count BIGINT DEFAULT 0;
    DECLARE empty_key_count BIGINT DEFAULT 0;

    SET configured_endpoint = TRIM(TRAILING '/' FROM TRIM('http://192.168.3.43:9000'));
    SET configured_bucket = TRIM(BOTH '/' FROM TRIM('knowledge'));

    IF configured_endpoint = '' OR configured_bucket = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V18 blocked: ossEndpoint and ossBucket placeholders are required';
    END IF;

    SET legacy_prefix = CONCAT(configured_endpoint, '/', configured_bucket, '/');

    SELECT COUNT(*) INTO invalid_count
    FROM `knowledge_file`
    WHERE `type` = 'FILE'
      AND (`path` LIKE 'http://%' OR `path` LIKE 'https://%')
      AND `path` NOT LIKE CONCAT(legacy_prefix, '%');

    IF invalid_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V18 blocked: HTTP file paths do not match the configured OSS endpoint and bucket';
    END IF;

    SELECT COUNT(*) INTO empty_key_count
    FROM `knowledge_file`
    WHERE `type` = 'FILE'
      AND `path` = legacy_prefix;

    IF empty_key_count > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'V18 blocked: at least one legacy OSS URL has an empty object key';
    END IF;

    UPDATE `knowledge_file`
    SET `path` = SUBSTRING(`path`, CHAR_LENGTH(legacy_prefix) + 1)
    WHERE `type` = 'FILE'
      AND `path` LIKE CONCAT(legacy_prefix, '%');
END//
DELIMITER ;

CALL `migrate_knowledge_file_path_object_key`();
DROP PROCEDURE IF EXISTS `migrate_knowledge_file_path_object_key`;
