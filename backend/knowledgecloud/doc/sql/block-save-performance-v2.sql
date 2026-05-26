-- Block save performance optimization v2
-- Addresses slow save for large pages (hundreds of thousands of characters / thousands of blocks)
--
-- Key changes:
-- 1. Content hash now excludes structural fields (parentId, sortOrder, path).
--    Existing content_hash values will auto-invalidate on first save (one-time cost).
--    To force immediate invalidation, run the UPDATE below.
-- 2. Uses INSERT ... ON DUPLICATE KEY UPDATE instead of separate SELECT + saveBatch + updateBatchById.
-- 3. Structural-only changes (reordering) use lightweight UPDATE (no large JSON columns).
--
-- OPTIONAL: Force content_hash invalidation to trigger full recompute on next save.
-- This ensures the new hash formula takes effect immediately without waiting for user edits.
-- Safe to run: only affects change detection, not actual content.

UPDATE wiki_page_block SET content_hash = NULL WHERE content_hash IS NOT NULL;

-- Verify index on id column exists (critical for ON DUPLICATE KEY UPDATE performance)
-- This should already exist from block-index-optimization.sql
CREATE INDEX IF NOT EXISTS idx_page_content_id ON wiki_page_block(id);
