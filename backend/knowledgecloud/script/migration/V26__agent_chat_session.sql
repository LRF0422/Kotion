-- ============================================================
-- AgentCore chat session persistence (UI session records)
--
-- Per-user, cross-device persistence of the AI side panel's chat sessions:
-- session metadata (title / @-page bindings) plus the full message list as an
-- opaque JSON blob. This is deliberately separate from `agent_thread`, which
-- stays focused on runtime session memory (LLM summary / active-run pointer).
--
-- session_id is the frontend session id and equals the conversationId sent to
-- /api/agent/v1/runs, so a session can be correlated with its agent_thread and
-- agent_run rows without an extra mapping table.
--
-- Timestamps are epoch millis, matching the other AgentCore tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS `agent_chat_session` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `session_id`       VARCHAR(128) NOT NULL COMMENT 'Session id (== conversationId / threadId)',
    `tenant_id`        BIGINT       NOT NULL COMMENT 'Owning tenant',
    `user_id`          BIGINT       NOT NULL COMMENT 'Owning user',
    `title`            VARCHAR(255) DEFAULT NULL COMMENT 'Conversation title',
    `target_page_json` TEXT         COMMENT 'JSON ChatTargetPage the agent edits off-screen',
    `bound_page_json`  TEXT         COMMENT 'JSON ChatTargetPage this session belongs to',
    `messages_json`    LONGTEXT     COMMENT 'JSON array of the chat UI Message list',
    `message_count`    INT          NOT NULL DEFAULT 0 COMMENT 'Cached length of messages_json',
    `create_time`      BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `update_time`      BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_chat_session_owner_session` (`tenant_id`, `user_id`, `session_id`),
    KEY `idx_chat_session_owner_updated` (`tenant_id`, `user_id`, `update_time`),
    KEY `idx_chat_session_owner_created` (`tenant_id`, `user_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='AgentCore per-user chat session records (UI message history)';
