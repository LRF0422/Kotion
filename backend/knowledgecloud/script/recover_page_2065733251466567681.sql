-- Recovery for page 2065733251466567681: restore blocks soft-deleted by the
-- accidental rollback. The rollback sealed a PageVersion whose change_summary
-- starts with 'Rollback to version', and tagged every deleted block with a
-- 'delete' row in wiki_block_version pointing at that version id.

-- Step 1: find the rollback version(s). Note the `id` of the row whose
-- change_summary looks like 'Rollback to version N'.
SELECT id, version, status, change_summary, create_time
FROM wiki_page_version
WHERE subject_id = 2065733251466567681
ORDER BY CAST(version AS UNSIGNED);

-- Step 2: preview exactly which blocks that rollback deleted
-- (replace @ROLLBACK_VERSION_ID with the id found above).
SET @ROLLBACK_VERSION_ID = 0; -- <<< fill in
SELECT b.id, b.type, b.sort_order, LEFT(b.text, 80) AS preview
FROM wiki_page_block b
JOIN wiki_block_version v
  ON v.block_id = b.id AND v.page_id = b.page_id
WHERE b.page_id = 2065733251466567681
  AND b.is_deleted = 1
  AND v.change_action = 'delete'
  AND v.page_version_id = @ROLLBACK_VERSION_ID;

-- Step 3: un-delete those blocks.
UPDATE wiki_page_block b
JOIN wiki_block_version v
  ON v.block_id = b.id AND v.page_id = b.page_id
SET b.is_deleted = 0
WHERE b.page_id = 2065733251466567681
  AND b.is_deleted = 1
  AND v.change_action = 'delete'
  AND v.page_version_id = @ROLLBACK_VERSION_ID;

-- Step 4 (optional cleanup): remove the delete-event rows sealed by the bad
-- rollback so future walk-backs don't treat these blocks as deleted, and drop
-- the bad rollback version itself, re-activating the previous version.
-- Only run after Step 3 succeeds and content is verified in the editor.
-- DELETE FROM wiki_block_version
--  WHERE page_id = 2065733251466567681 AND page_version_id = @ROLLBACK_VERSION_ID;
-- UPDATE wiki_page_version SET status = 'ACTIVE'
--  WHERE id = (SELECT last_version_id FROM (SELECT last_version_id FROM wiki_page_version WHERE id = @ROLLBACK_VERSION_ID) t);
-- DELETE FROM wiki_page_version WHERE id = @ROLLBACK_VERSION_ID;
