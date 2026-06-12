-- 子树收集改用递归 CTE 后的索引保障
--
-- collectSubtreeIdsFromDb 由「逐层 BFS（每层一次查询）」改为单次递归 CTE
-- （PageContentMapper.selectSubtreeIds）。其递归段
--     SELECT c.id FROM wiki_page_block c
--     JOIN subtree s ON c.parent_id = s.id
--     WHERE c.page_id = ?
-- 需要以 (page_id, parent_id) 为左前缀的复合索引才能避免回表扫描。
--
-- 既有迁移 block-storage-migration.sql 的 idx_page_block_sort(page_id, parent_id,
-- sort_order) 已能提供该前缀；此处再显式补一个窄复合索引，防止上述迁移在某些环境
-- 未全部执行。幂等，可重复执行。
CREATE INDEX IF NOT EXISTS idx_page_block_page_parent ON wiki_page_block(page_id, parent_id);

-- 刷新统计信息，帮助优化器选用新索引
ANALYZE TABLE wiki_page_block;
