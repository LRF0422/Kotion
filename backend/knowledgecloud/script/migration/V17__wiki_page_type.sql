ALTER TABLE `wiki_page`
    ADD COLUMN `page_type` VARCHAR(191) NULL DEFAULT NULL COMMENT 'Opaque component page type' AFTER `title`;
