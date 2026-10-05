-- Per-version plugin icon.
--
-- A published version may rebrand the plugin: the icon is part of the version,
-- reviewed with it, and promoted to `wiki_plugin` only on approval. The entity
-- had an `icon` property marked `@TableField(exist = false)` (a display-only
-- placeholder), so nothing was ever persisted and the promotion read back null.
--
-- Target schema: knowledge (owns wiki_plugin_version).
-- Restart-safe: MySQL auto-commits DDL, so the column is guarded by an
-- information_schema check and the migration can be re-run after a partial apply.
DROP PROCEDURE IF EXISTS `migrate_plugin_version_icon`;

DELIMITER //
CREATE PROCEDURE `migrate_plugin_version_icon`()
BEGIN
    DECLARE object_count BIGINT DEFAULT 0;

    SELECT COUNT(*) INTO object_count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'wiki_plugin_version'
      AND column_name = 'icon';
    IF object_count = 0 THEN
        ALTER TABLE `wiki_plugin_version`
            ADD COLUMN `icon` VARCHAR(512) NULL
            COMMENT 'Icon this version carries; promoted to the plugin on approval'
            AFTER `integrity`;
    END IF;
END //

DELIMITER ;

CALL `migrate_plugin_version_icon`();

DROP PROCEDURE IF EXISTS `migrate_plugin_version_icon`;
