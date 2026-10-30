-- ============================================================
-- Agent session tasks: the cross-session "open tasks" index.
--
-- The model's task list (update_todos) used to live only inside one run's
-- transcript projection, so a task list was lost when the user left a session
-- while the run was still running/suspended. This table stores the LATEST
-- whole-list snapshot of every session, one row per item, written by the engine
-- at the moment update_todos executes.
--
-- Semantics:
--   * whole-list overwrite: each write upserts the snapshot's items and deletes
--     the session's rows that are no longer in it (an empty list clears it);
--   * completed rows are kept (history/future stats) but the read API only
--     returns pending / in_progress;
--   * no FK: agent_chat_session is keyed by an auto-increment id and its
--     business key is (tenant_id, user_id, session_id); session deletion cleans
--     these rows explicitly (ChatSessionController).
--
-- Timestamps are epoch millis, matching the other AgentCore tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS `agent_session_task` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `tenant_id`    BIGINT       NOT NULL COMMENT 'Owning tenant',
    `user_id`      BIGINT       NOT NULL COMMENT 'Owning user',
    `session_id`   VARCHAR(128) NOT NULL COMMENT 'Session id (== conversationId)',
    `item_id`      VARCHAR(64)  NOT NULL COMMENT 'update_todos item.id',
    `title`        VARCHAR(512) NOT NULL COMMENT 'Task title',
    `status`       VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending|in_progress|completed',
    `sort_index`   INT          NOT NULL DEFAULT 0 COMMENT 'Position within the whole-list snapshot',
    `run_id`       VARCHAR(64)  DEFAULT NULL COMMENT 'Run that last wrote this row (audit)',
    `create_time`  BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `update_time`  BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_session_task_item` (`tenant_id`, `user_id`, `session_id`, `item_id`),
    KEY `idx_session_task_open` (`tenant_id`, `user_id`, `status`, `update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Agent session task list snapshot (update_todos)';
