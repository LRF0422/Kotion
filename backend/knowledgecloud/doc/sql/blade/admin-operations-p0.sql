-- =====================================================
-- Admin 运营功能一期（P0）新增表结构
-- 涉及模块：knowledge-agent-skills / knowledge-log / knowledge-system
-- 参考：docs/ADMIN_OPERATIONS_ROADMAP.md
-- =====================================================

-- ----------------------------
-- 1. AI 用量记录表（AgentEngine 会话完成后异步落库，session_id 唯一键防止 suspend→resume 重复计数）
-- ----------------------------
CREATE TABLE IF NOT EXISTS agent_usage_record (
    id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    session_id        VARCHAR(64)  NOT NULL COMMENT '会话ID',
    conversation_id   VARCHAR(64)  DEFAULT NULL COMMENT '对话ID',
    user_id           BIGINT       DEFAULT NULL COMMENT '用户ID',
    tenant_id         BIGINT       DEFAULT NULL COMMENT '租户ID',
    user_name         VARCHAR(64)  DEFAULT NULL COMMENT '用户名',
    model_name        VARCHAR(128) DEFAULT NULL COMMENT '模型名',
    prompt_tokens     BIGINT       NOT NULL DEFAULT 0 COMMENT '输入token数',
    completion_tokens BIGINT       NOT NULL DEFAULT 0 COMMENT '输出token数',
    total_tokens      BIGINT       NOT NULL DEFAULT 0 COMMENT '总token数',
    duration_ms       BIGINT       DEFAULT NULL COMMENT '会话耗时(ms)',
    finish_reason     VARCHAR(64)  DEFAULT NULL COMMENT '结束原因：stop/suspended:xxx',
    create_time       DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_session (session_id),
    KEY idx_user_time (user_id, create_time),
    KEY idx_model_time (model_name, create_time),
    KEY idx_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI用量记录表';

-- ----------------------------
-- 2. 模型单价表（平台管理员维护，单位：每 1K token）
-- ----------------------------
CREATE TABLE IF NOT EXISTS agent_model_price (
    id               BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    model_name       VARCHAR(128)  NOT NULL COMMENT '模型名',
    prompt_price     DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT '输入单价(每1K token)',
    completion_price DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT '输出单价(每1K token)',
    currency         VARCHAR(8)    NOT NULL DEFAULT 'CNY' COMMENT '币种',
    remark           VARCHAR(255)  DEFAULT NULL COMMENT '备注',
    create_time      DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_model (model_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI模型单价表';

-- ----------------------------
-- 3. 登录日志表（knowledge-auth 登录链路落库，主键由雪花ID生成）
-- ----------------------------
CREATE TABLE IF NOT EXISTS knowledge_log_login (
    id          BIGINT        NOT NULL COMMENT '主键',
    tenant_id   VARCHAR(12)   DEFAULT '000000' COMMENT '租户ID',
    account     VARCHAR(45)   DEFAULT NULL COMMENT '登录账号',
    user_id     BIGINT        DEFAULT NULL COMMENT '用户ID（登录成功时）',
    success     TINYINT(1)    NOT NULL COMMENT '1=成功 0=失败',
    fail_reason VARCHAR(255)  DEFAULT NULL COMMENT '失败原因：BAD_CREDENTIALS/USER_DISABLED/...',
    remote_ip   VARCHAR(64)   DEFAULT NULL COMMENT '登录IP',
    user_agent  VARCHAR(1000) DEFAULT NULL COMMENT '用户代理',
    create_time DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    KEY idx_account_time (account, create_time),
    KEY idx_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录日志表';

-- ----------------------------
-- 4. 用户状态列（knowledge_user 已有 status 列则跳过；1-正常 2-禁用）
-- ----------------------------
-- ALTER TABLE knowledge_user ADD COLUMN status INT DEFAULT 1 COMMENT '状态：1-正常 2-禁用';
UPDATE knowledge_user SET status = 1 WHERE status IS NULL;
