-- ============================================================
-- AgentCore — model price provisioning + prompt-cache pricing (V29)
--
-- The cost analytics query joins agent_model_price, but the table was only
-- defined in doc/sql/blade/admin-operations-p0.sql (not a Flyway migration),
-- so a fresh deployment failed the /admin/ai/usage/by-model endpoint. This
-- migration provisions it under script/migration and adds the cached-prompt
-- unit price used by the cache-aware cost formula.
--
-- Idempotent: CREATE IF NOT EXISTS plus an information_schema-guarded ALTER so
-- it is safe on databases where the doc SQL was already applied.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_model_price (
    id                 BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    model_name         VARCHAR(128)  NOT NULL COMMENT '模型名',
    prompt_price       DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT '输入单价(每1K token)',
    cache_prompt_price DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT '缓存输入单价(每1K token)',
    completion_price   DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT '输出单价(每1K token)',
    currency           VARCHAR(8)    NOT NULL DEFAULT 'CNY' COMMENT '币种',
    remark             VARCHAR(255)  DEFAULT NULL COMMENT '备注',
    create_time        DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time        DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_model (model_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI模型单价表';

SET @cache_col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'agent_model_price'
      AND COLUMN_NAME = 'cache_prompt_price'
);
SET @ddl := IF(@cache_col_exists = 0,
    'ALTER TABLE agent_model_price ADD COLUMN cache_prompt_price DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT ''缓存输入单价(每1K token)'' AFTER prompt_price',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
