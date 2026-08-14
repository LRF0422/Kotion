-- ============================================================
-- Agent Harness - Durable event-sourced resume (V5)
--
-- 1. agent_task gains the reconnect checkpoint columns:
--      last_seq        - highest event seq durably logged for this task
--      assistant_text  - accumulated assistant output (reconnect reconstruction)
-- 2. agent_task_event: durable event log mirror (Redis ZSET is the hot path;
--    this table is the cold audit/fallback tier). Replay uses (task_id, seq).
--
-- Run once (Flyway-style migration).
-- ============================================================

ALTER TABLE `agent_task`
    ADD COLUMN `last_seq`       BIGINT      NOT NULL DEFAULT 0 COMMENT 'Highest durably-logged event seq (reconnect checkpoint)',
    ADD COLUMN `assistant_text` LONGTEXT    COMMENT 'Accumulated assistant output for reconnect reconstruction';

CREATE TABLE IF NOT EXISTS `agent_task_event` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `task_id`     VARCHAR(64)  NOT NULL COMMENT 'Task/job identifier',
    `seq`         BIGINT       NOT NULL COMMENT 'Monotonic event sequence within the task',
    `event_type`  VARCHAR(64)  NOT NULL COMMENT 'SSE event type (session.created, think.delta, ...)',
    `payload`     LONGTEXT     COMMENT 'JSON payload exactly as streamed over SSE (minus seq)',
    `create_time` BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_task_seq` (`task_id`, `seq`),
    KEY `idx_task_id` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Durable per-task agent event log (cold tier for replay)';
