-- Page/Block management refactor migration
-- 1) Drop legacy `content` LONGTEXT from wiki_page_version (versions are now metadata-only;
--    actual content is reconstructed from wiki_page_block / wiki_block_version snapshots).
-- 2) Add change tracking fields to wiki_block_version so each save records the action
--    (create/update/delete) plus the previous version number for optimistic concurrency.
-- 3) Drop the legacy wiki_block table (replaced entirely by wiki_page_block).

-- 1. wiki_page_version: drop `content` column
ALTER TABLE `wiki_page_version`
    DROP COLUMN `content`;

-- 2. wiki_block_version: add change_action + prev_version
ALTER TABLE `wiki_block_version`
    ADD COLUMN `change_action` varchar(16) NULL DEFAULT NULL COMMENT '变更动作 create/update/delete' AFTER `version`,
    ADD COLUMN `prev_version`  int          NULL DEFAULT NULL COMMENT '上一版本号' AFTER `change_action`;

-- Composite index for fast "latest version of block" / chain lookups
ALTER TABLE `wiki_block_version`
    ADD INDEX `idx_block_version_block_ver` (`block_id`, `version`);

-- 3. Drop legacy wiki_block table
DROP TABLE IF EXISTS `wiki_block`;
