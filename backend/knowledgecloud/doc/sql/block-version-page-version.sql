-- Add page_version column to wiki_block_version for querying blocks by page version number
-- This enables independent block version management without coupling to page_version_id

ALTER TABLE wiki_block_version
ADD COLUMN page_version VARCHAR(50) COMMENT '页面版本号' AFTER page_version_id,
ADD INDEX idx_page_version (page_id, page_version);

-- Note: Old data with page_version_id but no page_version can be migrated by:
-- UPDATE wiki_block_version bv
-- INNER JOIN wiki_page_version pv ON bv.page_version_id = pv.id
-- SET bv.page_version = pv.version
-- WHERE bv.page_version IS NULL;
