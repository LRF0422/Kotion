-- ============================================================
-- Page version sealing policy
--
-- Background: every incremental save (autosave fires ~3s after the last
-- keystroke) used to seal a brand-new ACTIVE wiki_page_version row. A single
-- editing session therefore produced dozens of versions and the history UI
-- became unusable.
--
-- New model: an autosave-sealed version stays "open" and absorbs subsequent
-- autosaves from the same author until an idle gap or a session cap closes it.
-- Explicit user saves, bulk imports and rollbacks seal their own version and
-- are never absorbed into, so they stay identifiable in history.
--
-- seal_kind tells the two apart:
--   AUTOSAVE   - opened by an incremental save, may absorb further autosaves
--   CHECKPOINT - explicit user save / bulk import, closed on creation
--   ROLLBACK   - created by a version rollback, closed on creation
-- ============================================================

ALTER TABLE `wiki_page_version`
    ADD COLUMN `seal_kind` VARCHAR(16) NOT NULL DEFAULT 'CHECKPOINT'
        COMMENT 'How this version was sealed: AUTOSAVE / CHECKPOINT / ROLLBACK';

-- Pre-existing rows were all sealed by the old "save is publish" path. Marking
-- them CHECKPOINT (the column default) keeps them closed, so the first autosave
-- after this migration opens a fresh version instead of retroactively absorbing
-- edits into a historical one.

-- The sealing step reads the ACTIVE row FOR UPDATE on every effective patch;
-- make sure that lookup is index-backed rather than a table scan.
CREATE INDEX `idx_page_version_subject_status`
    ON `wiki_page_version` (`subject_id`, `status`);

-- The walk-back reader and the sealing step both filter block-version rows by
-- page and by "not yet sealed" (page_version_id IS NULL).
CREATE INDEX `idx_block_version_page_sealed`
    ON `wiki_block_version` (`page_id`, `page_version_id`);
