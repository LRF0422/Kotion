-- Block content hash migration
-- Adds content_hash column for change detection during full-save, enabling incremental block updates

ALTER TABLE `wiki_page_block` ADD COLUMN `content_hash` VARCHAR(32) DEFAULT NULL COMMENT 'MD5 hash of block content for change detection';
