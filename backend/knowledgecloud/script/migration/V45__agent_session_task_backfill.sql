-- ============================================================
-- One-time backfill marker for the cross-session task index (V44).
--
-- V44 only starts indexing task lists from the moment update_todos runs with
-- the new code. Historical sessions already hold their last whole-list snapshot
-- inside `agent_chat_session.messages_json` (the `todos` field of the last `ai`
-- node), so without a backfill the user's previously lost unfinished tasks
-- would still be invisible in the new cross-session entry.
--
-- `tasks_indexed` is the work queue for that one-time pass:
--   * DEFAULT 1 -> any session created AFTER this migration is already indexed
--     (writes go through `agent_session_task` directly) and is never scanned;
--   * this migration then flips every EXISTING row to 0, i.e. "predates the
--     index, one backfill pass pending";
--   * `SessionTaskBackfill` scans 0-rows once on startup and marks each one 1
--     (successfully or not, so a bad transcript is not retried on every boot).
--
-- The index supports the backfill scan
-- (`WHERE tasks_indexed = 0 ORDER BY update_time DESC LIMIT n`); it is also
-- kept small on purpose — only the marker + sort column.
-- ============================================================

ALTER TABLE `agent_chat_session`
    ADD COLUMN `tasks_indexed` TINYINT NOT NULL DEFAULT 1
        COMMENT '1 = task index up to date; 0 = pending one-time backfill',
    ADD KEY `idx_chat_session_tasks_backfill` (`tasks_indexed`, `update_time`);

-- Every row that exists BEFORE this migration predates the task index.
-- New rows take the column default (1) and are never scanned.
UPDATE `agent_chat_session` SET `tasks_indexed` = 0;
