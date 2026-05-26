-- Fix "Out of sort memory" issue for wiki_page_version queries
-- The content column (LONGTEXT) causes sort buffer overflow when MySQL sorts rows

-- Composite indexes for getDraftVersion: WHERE subject_id=? AND status='DRAFT' ORDER BY create_time DESC
-- and getCurrentActiveVersion: WHERE subject_id=? AND status='ACTIVE' ORDER BY version DESC
-- These allow MySQL to use index scan instead of filesort, avoiding sort buffer overflow.
CREATE INDEX IF NOT EXISTS idx_page_version_subject_status_time
    ON wiki_page_version(subject_id, status, create_time DESC);

CREATE INDEX IF NOT EXISTS idx_page_version_subject_status_ver
    ON wiki_page_version(subject_id, status, version DESC);

-- Composite index for findByPageId: WHERE page_id=? ORDER BY sort_order ASC
-- Existing idx_page_block_sort is (page_id, parent_id, sort_order) which doesn't cover this query pattern
CREATE INDEX IF NOT EXISTS idx_page_block_page_sort
    ON wiki_page_block(page_id, sort_order);

-- Composite index for block version queries: WHERE page_version_id=? ORDER BY sort_order ASC
CREATE INDEX IF NOT EXISTS idx_block_version_pv_sort
    ON wiki_block_version(page_version_id, sort_order);

-- Composite index for block history: WHERE block_id=? ORDER BY version DESC
CREATE INDEX IF NOT EXISTS idx_block_version_block_ver
    ON wiki_block_version(block_id, version DESC);

-- Clean up any duplicate DRAFT versions that were created by the legacy updateBlock bug
-- Keep only the latest draft per page (run once, then safe to remove)
-- DELETE v FROM wiki_page_version v
-- INNER JOIN (
--     SELECT subject_id, MAX(create_time) AS max_time
--     FROM wiki_page_version
--     WHERE status = 'DRAFT'
--     GROUP BY subject_id
--     HAVING COUNT(*) > 1
-- ) dup ON v.subject_id = dup.subject_id
-- WHERE v.status = 'DRAFT' AND v.create_time < dup.max_time;
