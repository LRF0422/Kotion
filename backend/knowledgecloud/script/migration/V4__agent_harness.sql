-- ============================================================
-- Agent Harness - Long tasks / Memory / User profile (V4)
--
-- Adds three tables to the knowledge-agent-skills schema:
--   agent_task          - async long-running agent jobs (Redis-primary + JDBC fallback)
--   agent_memory        - cross-session long-term memory (Redis-primary + JDBC fallback)
--   agent_user_profile  - per-user profile (画像) recording (Redis-primary + JDBC fallback)
--
-- Timestamps are epoch millis (BIGINT) to stay symmetric with the Redis
-- hot-cache representation and avoid timezone drift between tiers.
-- ============================================================

CREATE TABLE IF NOT EXISTS `agent_task` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `task_id`         VARCHAR(64)  NOT NULL COMMENT 'Task/job identifier (UUID)',
    `session_id`      VARCHAR(128) DEFAULT NULL COMMENT 'Agent session id',
    `conversation_id` VARCHAR(128) DEFAULT NULL COMMENT 'Conversation id',
    `user_id`         BIGINT       DEFAULT NULL COMMENT 'Owning user',
    `tenant_id`       BIGINT       DEFAULT NULL COMMENT 'Owning tenant',
    `status`          VARCHAR(32)  NOT NULL DEFAULT 'QUEUED' COMMENT 'QUEUED|RUNNING|SUSPENDED|WAITING_TOOLS|COMPLETED|FAILED|CANCELLED',
    `finish_reason`   VARCHAR(64)  DEFAULT NULL COMMENT 'stop | suspended:xxx | cancelled | error',
    `prompt_tokens`   INT          NOT NULL DEFAULT 0 COMMENT 'Cumulative prompt tokens',
    `completion_tokens` INT        NOT NULL DEFAULT 0 COMMENT 'Cumulative completion tokens',
    `total_tokens`    INT          NOT NULL DEFAULT 0 COMMENT 'prompt + completion',
    `error_message`   TEXT         COMMENT 'Failure detail when status=FAILED',
    `create_time`     BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `update_time`     BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_task_id` (`task_id`),
    KEY `idx_session_id` (`session_id`),
    KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Async long-running agent tasks';

CREATE TABLE IF NOT EXISTS `agent_memory` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `memory_id`        VARCHAR(64)  NOT NULL COMMENT 'Memory entry id (UUID)',
    `scope`            VARCHAR(128) NOT NULL COMMENT 'Scope key, e.g. u:<userId>:t:<tenantId>',
    `user_id`          BIGINT       DEFAULT NULL COMMENT 'Owning user',
    `tenant_id`        BIGINT       DEFAULT NULL COMMENT 'Owning tenant',
    `type`             VARCHAR(32)  NOT NULL DEFAULT 'note' COMMENT 'fact|preference|note',
    `content`          TEXT         NOT NULL COMMENT 'Memory content',
    `importance`       INT          NOT NULL DEFAULT 0 COMMENT 'Importance score (0-100)',
    `tags`             VARCHAR(512) DEFAULT NULL COMMENT 'Comma-separated tags',
    `create_time`      BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `update_time`      BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `last_access_time` BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_memory_id` (`memory_id`),
    KEY `idx_scope` (`scope`),
    KEY `idx_scope_time` (`scope`, `last_access_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Cross-session long-term agent memory';

CREATE TABLE IF NOT EXISTS `agent_user_profile` (
    `id`                 BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `user_id`            BIGINT       NOT NULL COMMENT 'Owning user',
    `tenant_id`          BIGINT       NOT NULL COMMENT 'Owning tenant',
    `profile_json`       LONGTEXT     COMMENT 'Full structured profile JSON',
    `language`           VARCHAR(16)  DEFAULT NULL COMMENT 'Detected interaction language',
    `preferred_model`    VARCHAR(128) DEFAULT NULL COMMENT 'Most-used model',
    `tool_usage_json`    TEXT         COMMENT 'JSON map toolId -> usage count',
    `skill_usage_json`   TEXT         COMMENT 'JSON map skillName -> usage count',
    `interaction_count`  INT          NOT NULL DEFAULT 0 COMMENT 'Number of agent sessions',
    `total_tokens`       INT          NOT NULL DEFAULT 0 COMMENT 'Cumulative tokens',
    `create_time`        BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    `update_time`        BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_tenant` (`user_id`, `tenant_id`),
    KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Per-user agent profile (画像)';
