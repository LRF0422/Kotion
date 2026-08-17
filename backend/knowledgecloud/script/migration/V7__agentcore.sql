-- ============================================================
-- AgentCore — 全新 agent 运行时（从 0 重设计，V7）
--
-- 全新表（与旧 agent_task/agent_memory 等表不冲突，旧表保留数据备查）：
--   agent_run             - run 主体（一次 agent 执行单元）
--   agent_run_event       - 事件冷层（只追加，按 (run_id, seq) 回放）
--   agent_run_checkpoint  - 断点快照（每 run 保留最新一份）
--   agent_long_memory     - 跨会话长期记忆（user/space/page 分级 scope）
--   agent_thread          - 会话（标题/摘要/活跃 run 指针）
--
-- 时间戳统一 epoch millis（BIGINT），与 Redis 热层表示对称。
-- ============================================================

CREATE TABLE IF NOT EXISTS `agent_run` (
    `id`                BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `run_id`            VARCHAR(64)  NOT NULL COMMENT 'Run id (UUID)',
    `conversation_id`   VARCHAR(128) NOT NULL COMMENT 'Conversation/thread id',
    `parent_run_id`     VARCHAR(64)  DEFAULT NULL COMMENT 'Parent run id for sub-agent delegation',
    `user_id`           BIGINT       DEFAULT NULL COMMENT 'Owning user',
    `tenant_id`         BIGINT       DEFAULT NULL COMMENT 'Owning tenant',
    `model`             VARCHAR(128) DEFAULT NULL COMMENT 'Model id',
    `mode`              VARCHAR(16)  NOT NULL DEFAULT 'execute' COMMENT 'execute | plan',
    `space_id`          VARCHAR(64)  DEFAULT NULL COMMENT 'Editor space scope (memory scoping)',
    `page_id`           VARCHAR(64)  DEFAULT NULL COMMENT 'Editor page scope (memory scoping)',
    `status`            VARCHAR(32)  NOT NULL DEFAULT 'QUEUED' COMMENT 'QUEUED|RUNNING|WAITING_TOOLS|SUSPENDED|COMPLETED|FAILED|CANCELLED',
    `finish_reason`     VARCHAR(64)  DEFAULT NULL COMMENT 'stop | budget | approved | cancelled | error | tool_timeout',
    `suspend_reason`    VARCHAR(64)  DEFAULT NULL COMMENT 'plan_approval | budget (when SUSPENDED)',
    `error_code`        VARCHAR(64)  DEFAULT NULL COMMENT 'Error code when FAILED',
    `error_message`     TEXT         COMMENT 'Failure detail when status=FAILED',
    `last_seq`          BIGINT       NOT NULL DEFAULT 0 COMMENT 'Highest durably-logged event seq',
    `prompt_tokens`     INT          NOT NULL DEFAULT 0 COMMENT 'Cumulative prompt tokens',
    `completion_tokens` INT          NOT NULL DEFAULT 0 COMMENT 'Cumulative completion tokens',
    `create_time`       BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `update_time`       BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_run_id` (`run_id`),
    KEY `idx_conversation_id` (`conversation_id`),
    KEY `idx_parent_run_id` (`parent_run_id`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_status_update` (`status`, `update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AgentCore run (one agent execution unit)';

CREATE TABLE IF NOT EXISTS `agent_run_event` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `run_id`      VARCHAR(64)  NOT NULL COMMENT 'Run id',
    `seq`         BIGINT       NOT NULL COMMENT 'Monotonic event sequence within the run',
    `event_type`  VARCHAR(64)  NOT NULL COMMENT 'Event type (run.created, text.delta, ...)',
    `payload`     LONGTEXT     COMMENT 'JSON payload exactly as streamed over SSE (minus seq)',
    `create_time` BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_run_seq` (`run_id`, `seq`),
    KEY `idx_run_id` (`run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AgentCore durable per-run event log (cold tier for replay)';

CREATE TABLE IF NOT EXISTS `agent_run_checkpoint` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `run_id`      VARCHAR(64)  NOT NULL COMMENT 'Run id',
    `seq`         BIGINT       NOT NULL DEFAULT 0 COMMENT 'Event seq at snapshot time',
    `state_json`  LONGTEXT     COMMENT 'Full serializable run state (messages/pending tools/scratchpad/usage...)',
    `create_time` BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_run_id` (`run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AgentCore run checkpoint (latest snapshot per run)';

CREATE TABLE IF NOT EXISTS `agent_long_memory` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `memory_id`        VARCHAR(64)  NOT NULL COMMENT 'Memory entry id (UUID)',
    `scope`            VARCHAR(128) NOT NULL COMMENT 'Scope key: u:{userId} / u:{userId}:s:{spaceId} / u:{userId}:s:{spaceId}:p:{pageId}',
    `user_id`          BIGINT       DEFAULT NULL COMMENT 'Owning user',
    `tenant_id`        BIGINT       DEFAULT NULL COMMENT 'Owning tenant',
    `space_id`         VARCHAR(64)  DEFAULT NULL COMMENT 'Space scope (nullable)',
    `page_id`          VARCHAR(64)  DEFAULT NULL COMMENT 'Page scope (nullable)',
    `type`             VARCHAR(32)  NOT NULL DEFAULT 'note' COMMENT 'fact | preference | note | episode',
    `content`          TEXT         NOT NULL COMMENT 'Memory content',
    `importance`       INT          NOT NULL DEFAULT 0 COMMENT 'Importance score (0-100)',
    `tags`             VARCHAR(512) DEFAULT NULL COMMENT 'Comma-separated tags',
    `embedding_ref`    VARCHAR(128) DEFAULT NULL COMMENT 'Reserved: external embedding store reference',
    `create_time`      BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `update_time`      BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `last_access_time` BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_memory_id` (`memory_id`),
    KEY `idx_scope` (`scope`),
    KEY `idx_scope_time` (`scope`, `last_access_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AgentCore cross-session long-term memory';

CREATE TABLE IF NOT EXISTS `agent_thread` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `thread_id`     VARCHAR(128) NOT NULL COMMENT 'Conversation/thread id (JSON contract: conversationId)',
    `user_id`       BIGINT       DEFAULT NULL COMMENT 'Owning user',
    `tenant_id`     BIGINT       DEFAULT NULL COMMENT 'Owning tenant',
    `title`         VARCHAR(255) DEFAULT NULL COMMENT 'Conversation title',
    `summary`       TEXT         COMMENT 'LLM-generated conversation summary (session memory)',
    `active_run_id` VARCHAR(64)  DEFAULT NULL COMMENT 'Current active run id (single-active invariant)',
    `create_time`   BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `update_time`   BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_thread_id` (`thread_id`),
    KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AgentCore conversation thread (title/summary/active run)';
