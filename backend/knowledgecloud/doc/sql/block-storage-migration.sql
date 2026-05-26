-- Block-first storage architecture migration
-- Adds sort_order column for maintaining sibling ordering in flat block storage

ALTER TABLE `wiki_page_block` ADD COLUMN `sort_order` INT DEFAULT 0 COMMENT 'sibling order within parent';

-- Composite index for efficient tree assembly: query all blocks for a page ordered by parent + sort
CREATE INDEX idx_page_block_sort ON wiki_page_block(page_id, parent_id, sort_order);
