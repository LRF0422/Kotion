-- ============================================================
-- Custom Agent Definitions - Migration Script
-- Adds the agent_definition table: user-defined agents usable as
-- a chat entry point (ChatCompletionRequest.agentId) and as a
-- delegation target (delegate_task(agent_name)).
-- ============================================================

CREATE TABLE IF NOT EXISTS `agent_definition` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `tenant_id`      BIGINT       NOT NULL COMMENT 'Tenant ID',
    `user_id`        BIGINT       DEFAULT NULL COMMENT 'Owner (creator) user ID',
    `name`           VARCHAR(64)  NOT NULL COMMENT 'Display/delegation name; unique within a tenant',
    `description`    VARCHAR(512) DEFAULT NULL COMMENT 'Short description shown in the agent picker and delegate_task errors',
    `system_prompt`  TEXT         NOT NULL COMMENT 'System prompt applied to the session',
    `model_name`     VARCHAR(128) DEFAULT NULL COMMENT 'Model override; null = model from the chat request / default',
    `tool_ids`       JSON         DEFAULT NULL COMMENT 'JSON array of backend tool ids; null or empty = all backend tools',
    `max_iterations` INT          DEFAULT NULL COMMENT 'Max iterations per run; null = engine default',
    `enabled`        TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Whether the agent is selectable/delegatable',
    `create_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Record creation time',
    `update_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Record update time',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_tenant_name` (`tenant_id`, `name`),
    KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Custom agent definitions (prompt + model + tool set + iteration budget)';
