-- ============================================================
-- Session groups: user-created folders for the AI chat session list.
--
-- The sidebar used to group conversations only by recency (today / yesterday /
-- last week / earlier). Users with dozens of chats asked for their own,
-- named groups, so a group is a first-class client-owned record:
--
--   * agent_session_group holds one row per group (owner-scoped, ordered by
--     sort_index so the list keeps the user's arrangement across devices);
--   * agent_chat_session.group_id is the session's membership. It is
--     client-owned UI metadata exactly like title / bound_page_json, so it
--     travels through the existing PUT /api/agent/v1/sessions/{id} upsert;
--   * deleting a group reassigns nothing server-side by cascade: the group
--     controller clears group_id on its members first ("ungrouped"), which
--     keeps every conversation and its position in the recency list intact.
--
-- No FK: agent_chat_session is keyed by an auto-increment id and its business
-- key is (tenant_id, user_id, session_id); the group id is a client-generated
-- string (VARCHAR(64)), not a database identity.
--
-- Timestamps are epoch millis, matching the other AgentCore tables.
-- ============================================================

ALTER TABLE `agent_chat_session`
    ADD COLUMN `group_id` VARCHAR(64) DEFAULT NULL COMMENT 'Client-owned session group id (NULL = ungrouped)' AFTER `bound_page_json`,
    ADD KEY `idx_chat_session_owner_group` (`tenant_id`, `user_id`, `group_id`);

CREATE TABLE IF NOT EXISTS `agent_session_group` (
    `id`           BIGINT      NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `tenant_id`    BIGINT      NOT NULL COMMENT 'Owning tenant',
    `user_id`      BIGINT      NOT NULL COMMENT 'Owning user',
    `group_id`     VARCHAR(64) NOT NULL COMMENT 'Client-generated group id',
    `name`         VARCHAR(64) NOT NULL COMMENT 'Display name',
    `sort_index`   INT         NOT NULL DEFAULT 0 COMMENT 'Position in the sidebar list (ascending)',
    `create_time`  BIGINT      NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `update_time`  BIGINT      NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_session_group_owner_group` (`tenant_id`, `user_id`, `group_id`),
    KEY `idx_session_group_owner_order` (`tenant_id`, `user_id`, `sort_index`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Agent chat session groups (user-created conversation folders)';