-- ============================================================
-- Agent background tasks (V47) — 客户端执行，服务端存储
--
-- 4 tables:
--   agent_bg_task        task record + lease + progress/result/checkpoint
--   agent_bg_task_log    append-only logs (seq cursor, batch idempotency)
--   agent_bg_task_watch  per-conversation agent update subscription
--   agent_bg_task_note   outbox for update/completion notes (client ack)
--
-- Timestamps are epoch millis (BIGINT), consistent with the other agent tables.
-- No foreign keys (repo convention); every read is owner-scoped by
-- (tenant_id, user_id).
-- ============================================================

CREATE TABLE IF NOT EXISTS `agent_bg_task` (
    `id`                BIGINT       NOT NULL AUTO_INCREMENT,
    `task_id`           VARCHAR(64)  NOT NULL COMMENT 'Server task id (bt_ + uuid)',
    `client_task_id`    VARCHAR(64)  NOT NULL COMMENT 'Client idempotency key',
    `client_id`         VARCHAR(128) DEFAULT NULL COMMENT 'Client install id that can attach/resume',
    `tenant_id`         BIGINT       NOT NULL,
    `user_id`           BIGINT       NOT NULL,
    `conversation_id`   VARCHAR(128) DEFAULT NULL COMMENT 'Conversation task; null for plugin-level tasks',
    `run_id`            VARCHAR(64)  DEFAULT NULL COMMENT 'Run that started it (audit)',
    `plugin_key`        VARCHAR(128) DEFAULT NULL COMMENT 'Plugin key (metadata, not identity)',
    `tool_name`         VARCHAR(128) DEFAULT NULL,
    `kind`              VARCHAR(80)  NOT NULL COMMENT 'e.g. ssh-docker-logs / jenkins-build',
    `title`             VARCHAR(512) NOT NULL,
    `mode`              VARCHAR(16)  NOT NULL DEFAULT 'job' COMMENT 'job|watch',
    `state`             VARCHAR(24)  NOT NULL DEFAULT 'running'
        COMMENT 'running|cancelling|disconnected|succeeded|failed|cancelled',
    `progress_json`     TEXT         COMMENT 'TaskProgress: percent/current/total/message',
    `result_json`       TEXT         COMMENT 'Result; server hard cap 16KB',
    `result_truncated`  TINYINT      NOT NULL DEFAULT 0,
    `error`             TEXT         COMMENT 'Failure reason; hard cap 4KB',
    `meta_json`         TEXT         COMMENT 'Plugin metadata; hard cap 32KB',
    `checkpoint_json`   TEXT         COMMENT 'Plugin resume checkpoint; hard cap 32KB',
    `resumable`         TINYINT      NOT NULL DEFAULT 0,
    `resume_policy`     VARCHAR(16)  NOT NULL DEFAULT 'never' COMMENT 'never|manual|auto',
    `attempt`           INT          NOT NULL DEFAULT 1 COMMENT 'Execution attempt (incremented on attach)',
    `heartbeat_ms`      INT          NOT NULL DEFAULT 15000 COMMENT 'Client heartbeat interval',
    `lease_token_hash`  VARCHAR(64)  DEFAULT NULL COMMENT 'sha256 of the current lease token',
    `lease_expires_at`  BIGINT       DEFAULT NULL,
    `last_heartbeat_at` BIGINT       DEFAULT NULL,
    `cancel_requested`  TINYINT      NOT NULL DEFAULT 0,
    `cancel_deadline`   BIGINT       DEFAULT NULL COMMENT 'Force-cancel after this instant',
    `consumed_at`       BIGINT       DEFAULT NULL COMMENT 'Agent already received the terminal result',
    `log_seq`           BIGINT       NOT NULL DEFAULT 0 COMMENT 'Highest allocated log seq',
    `log_first_seq`     BIGINT       NOT NULL DEFAULT 0 COMMENT 'Lowest retained log seq',
    `created_at`        BIGINT       NOT NULL,
    `updated_at`        BIGINT       NOT NULL,
    `finished_at`       BIGINT       DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_task_id` (`task_id`),
    UNIQUE KEY `uk_client_task` (`tenant_id`, `user_id`, `client_task_id`),
    KEY `idx_owner_state` (`tenant_id`, `user_id`, `state`, `updated_at`),
    KEY `idx_conversation` (`tenant_id`, `conversation_id`, `updated_at`),
    KEY `idx_client` (`tenant_id`, `user_id`, `client_id`, `state`),
    KEY `idx_lease` (`state`, `lease_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent background tasks (client executes, server stores)';

CREATE TABLE IF NOT EXISTS `agent_bg_task_log` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `task_id`     VARCHAR(64)  NOT NULL,
    `seq`         BIGINT       NOT NULL COMMENT 'Monotonic seq within the task, starts at 1',
    `batch_id`    VARCHAR(64)  NOT NULL COMMENT 'Client batch idempotency key',
    `batch_seq`   INT          NOT NULL COMMENT 'Index within the batch (0..n-1)',
    `kind`        VARCHAR(16)  NOT NULL DEFAULT 'log' COMMENT 'log|summary|state',
    `level`       VARCHAR(8)   NOT NULL DEFAULT 'info' COMMENT 'debug|info|warn|error',
    `message`     VARCHAR(2000) NOT NULL,
    `at`          BIGINT       NOT NULL COMMENT 'Client-side timestamp',
    `create_time` BIGINT       NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_task_seq` (`task_id`, `seq`),
    UNIQUE KEY `uk_batch_seq` (`task_id`, `batch_id`, `batch_seq`),
    KEY `idx_task_seq` (`task_id`, `seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Background task incremental logs (ring-retained)';

CREATE TABLE IF NOT EXISTS `agent_bg_task_watch` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `watch_id`        VARCHAR(64)  NOT NULL,
    `task_id`         VARCHAR(64)  NOT NULL,
    `tenant_id`       BIGINT       NOT NULL,
    `user_id`         BIGINT       NOT NULL,
    `conversation_id` VARCHAR(128) NOT NULL,
    `policy_json`     TEXT         NOT NULL COMMENT 'level/match/minIntervalMs/maxNotes/maxDurationMs',
    `state`           VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT 'active|ended',
    `notes`           INT          NOT NULL DEFAULT 0,
    `last_seq`        BIGINT       NOT NULL DEFAULT 0,
    `last_note_at`    BIGINT       DEFAULT NULL,
    `created_at`      BIGINT       NOT NULL,
    `updated_at`      BIGINT       NOT NULL,
    `expires_at`      BIGINT       DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_watch_id` (`watch_id`),
    UNIQUE KEY `uk_task_conversation` (`task_id`, `conversation_id`),
    KEY `idx_active` (`state`, `expires_at`),
    KEY `idx_owner` (`tenant_id`, `user_id`, `state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Background task agent update subscriptions';

CREATE TABLE IF NOT EXISTS `agent_bg_task_note` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `note_id`         VARCHAR(64)  NOT NULL,
    `task_id`         VARCHAR(64)  NOT NULL,
    `watch_id`        VARCHAR(64)  DEFAULT NULL,
    `tenant_id`       BIGINT       NOT NULL,
    `user_id`         BIGINT       NOT NULL,
    `conversation_id` VARCHAR(128) NOT NULL,
    `kind`            VARCHAR(16)  NOT NULL COMMENT 'update|completion|ended',
    `seq_from`        BIGINT       DEFAULT NULL,
    `seq_to`          BIGINT       DEFAULT NULL,
    `payload_json`    TEXT         NOT NULL COMMENT 'Rendered note text + structured summary',
    `dedupe_key`      VARCHAR(160) NOT NULL COMMENT 'watch:from:to:kind / task:done',
    `created_at`      BIGINT       NOT NULL,
    `delivered_at`    BIGINT       DEFAULT NULL,
    `attempts`        INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_note_id` (`note_id`),
    UNIQUE KEY `uk_dedupe` (`dedupe_key`),
    KEY `idx_pending` (`tenant_id`, `user_id`, `conversation_id`, `delivered_at`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Background task note outbox (client ack)';