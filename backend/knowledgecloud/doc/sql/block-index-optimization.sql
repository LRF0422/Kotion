-- 数据库索引优化脚本
-- 为块相关查询创建索引以提升性能

-- 为 PageContent 表创建索引
CREATE INDEX IF NOT EXISTS idx_page_content_page_id ON wiki_page_block(page_id);
CREATE INDEX IF NOT EXISTS idx_page_content_id ON wiki_page_block(id);
CREATE INDEX IF NOT EXISTS idx_page_content_parent_id ON wiki_page_block(parent_id);
CREATE INDEX IF NOT EXISTS idx_page_content_type ON wiki_page_block(type);
CREATE INDEX IF NOT EXISTS idx_page_content_path ON wiki_page_block(path);

-- 为 PageBlock 表创建索引
CREATE INDEX IF NOT EXISTS idx_page_block_page_id ON wiki_block(page_id);
CREATE INDEX IF NOT EXISTS idx_page_block_type ON wiki_block(type);

-- 为 PageVersion 表创建索引（针对内容查询优化）
CREATE INDEX IF NOT EXISTS idx_page_version_subject_status ON wiki_page_version(subject_id, status);
CREATE INDEX IF NOT EXISTS idx_page_version_status_version ON wiki_page_version(status, version DESC);

-- 为块索引表创建复合索引
CREATE INDEX IF NOT EXISTS idx_block_index_page_path ON wiki_block_index(page_id, path);
CREATE INDEX IF NOT EXISTS idx_block_index_type ON wiki_block_index(type);
CREATE INDEX IF NOT EXISTS idx_block_index_parent ON wiki_block_index(parent_id);

-- 为常用查询模式创建覆盖索引
CREATE INDEX IF NOT EXISTS idx_page_content_covering ON wiki_page_block(page_id, id, type, parent_id) 
INCLUDE (content, text, attrs);

-- 分析表统计信息
ANALYZE TABLE wiki_page_block;
ANALYZE TABLE wiki_block;
ANALYZE TABLE wiki_page_version;
ANALYZE TABLE wiki_block_index;

-- 显示索引信息（可选）
-- SHOW INDEX FROM wiki_page_block;
-- SHOW INDEX FROM wiki_block;
-- SHOW INDEX FROM wiki_page_version;
-- SHOW INDEX FROM wiki_block_index;