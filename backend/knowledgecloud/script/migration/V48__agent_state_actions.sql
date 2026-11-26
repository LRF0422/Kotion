-- ============================================================
-- Agent runtime state persistence (V48): pending actions
--
--   agent_tool_call      frontend tool execution ledger + approval
--   agent_form_request   server-side form inbox (requestUserForm)
--
-- These tables make "close the app and reopen" work for states that used to
-- live only in renderer memory/localStorage:
--   - a tool that started but never finished is `started`/`uncertain` and can
--     be retried only after an explicit decision (never silently replayed);
--   - an approval survives a restart and is not asked twice;
--   - a form survives a restart and can be answered from another device.
--
-- Timestamps are epoch millis, owner-scoped by (tenant_id, user_id); no FKs.
-- ============================================================

CREATE TABLE IF NOT EXISTS `agent_tool_call` (
    `id`                 BIGINT       NOT NULL AUTO_INCREMENT,
    `call_id`            VARCHAR(64)  NOT NULL COMMENT 'Frontend tool call id',
    `run_id`             VARCHAR(64)  NOT NULL,
    `conversation_id`    VARCHAR(128) DEFAULT NULL,
    `tenant_id`          BIGINT       NOT NULL,
    `user_id`            BIGINT       NOT NULL,
    `tool_name`          VARCHAR(128) NOT NULL,
    `args_hash`          VARCHAR(64)  NOT NULL COMMENT 'sha256 of args; args_json is optional',
    `args_json`          TEXT         COMMENT 'Optional args snapshot; sensitive tools should omit/redact',
    `status`             VARCHAR(24)  NOT NULL DEFAULT 'pending'
        COMMENT 'pending|awaiting_approval|approved|rejected|started|completed|failed|cancelled|uncertain',
    `approval_json`      TEXT         COMMENT 'ToolApprovalRequest payload rendered by the host',
    `approval_expires_at` BIGINT      DEFAULT NULL,
    `approval_note`      TEXT         COMMENT 'Decision note/reason',
    `result_json`        TEXT         COMMENT 'Result; hard cap 16KB, larger payloads keep only a marker',
    `result_truncated`   TINYINT      NOT NULL DEFAULT 0,
    `error`              TEXT         COMMENT 'Failure detail; hard cap 4KB',
    `idempotency_key`    VARCHAR(128) NOT NULL COMMENT 'sha256(runId + callId + argsHash) by default',
    `attempt`            INT          NOT NULL DEFAULT 1,
    `started_at`         BIGINT       DEFAULT NULL,
    `finished_at`        BIGINT       DEFAULT NULL,
    `create_time`        BIGINT       NOT NULL,
    `update_time`        BIGINT       NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_run_call` (`run_id`, `call_id`),
    UNIQUE KEY `uk_idem` (`idempotency_key`),
    KEY `idx_run_status` (`run_id`, `status`),
    KEY `idx_owner_status` (`tenant_id`, `user_id`, `status`, `update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Frontend tool execution ledger + approval';

CREATE TABLE IF NOT EXISTS `agent_form_request` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `form_id`         VARCHAR(64)  NOT NULL,
    `conversation_id` VARCHAR(128) NOT NULL,
    `run_id`          VARCHAR(64)  DEFAULT NULL,
    `call_id`         VARCHAR(64)  DEFAULT NULL,
    `tenant_id`       BIGINT       NOT NULL,
    `user_id`         BIGINT       NOT NULL,
    `title`           VARCHAR(120) NOT NULL,
    `schema_json`     TEXT         NOT NULL COMMENT 'Fields / batch / description / submitLabel',
    `status`          VARCHAR(16)  NOT NULL DEFAULT 'pending'
        COMMENT 'pending|answered|cancelled|expired',
    `values_json`     TEXT         COMMENT 'Single-record answer',
    `rows_json`       TEXT         COMMENT 'Batch answer (array of records)',
    `cancel_reason`   VARCHAR(500) DEFAULT NULL,
    `created_at`      BIGINT       NOT NULL,
    `answered_at`     BIGINT       DEFAULT NULL,
    `delivered_at`    BIGINT       DEFAULT NULL,
    `expires_at`      BIGINT       DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_form_id` (`form_id`),
    KEY `idx_pending` (`tenant_id`, `user_id`, `conversation_id`, `status`, `created_at`),
    KEY `idx_owner_status` (`tenant_id`, `user_id`, `status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Dynamic form requests (server inbox)';