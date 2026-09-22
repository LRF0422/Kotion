-- ============================================================
-- V39: AgentCore derived user profile (低敏感用户画像)
--
-- 从引擎拥有的规范会话日志 (agent_chat_session.model_messages_json) 派生
-- 的结构化用户特征，供推荐系统消费，并支持用户查看/编辑/删除/关闭。
--
-- 与既有记忆体系的边界：
--   * agent_long_memory  = Agent 的自由文本长期记忆（注入模型上下文）
--   * agent_thread       = 单会话滚动摘要（会话记忆）
--   * agent_user_profile = 结构化 trait（维度 + 值 + 置信度 + 证据），
--                          不注入 agent_long_memory，只作推荐特征。
--
-- 隐私约束：只存低敏感维度；不推断性别/精神状态/性格等敏感属性。
-- 用户删除写 status='suppressed' 墓碑（占用唯一键），阻止抽取复活。
--
-- Timestamps are epoch millis, matching the other AgentCore tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_user_profile (
    id             BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    trait_id       VARCHAR(64)  NOT NULL COMMENT 'Trait id (UUID)',
    tenant_id      BIGINT       NOT NULL COMMENT 'Owning tenant',
    user_id        BIGINT       NOT NULL COMMENT 'Owning user',
    dimension      VARCHAR(32)  NOT NULL COMMENT 'Allowlisted dimension',
    trait_value    VARCHAR(128) NOT NULL COMMENT 'Trait value',
    confidence     INT          NOT NULL DEFAULT 0 COMMENT 'Confidence 0-100',
    source         VARCHAR(16)  NOT NULL DEFAULT 'inferred' COMMENT 'inferred | user',
    status         VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT 'active | suppressed',
    locked         TINYINT      NOT NULL DEFAULT 0 COMMENT 'User-owned; extractor must not overwrite',
    evidence_count INT          NOT NULL DEFAULT 0 COMMENT 'Number of supporting observations',
    first_seen     BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    last_seen      BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    expires_at     BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis; 0 = never',
    create_time    BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    update_time    BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (id),
    UNIQUE KEY uk_profile_owner_dim_value (tenant_id, user_id, dimension, trait_value),
    KEY idx_profile_owner_status (tenant_id, user_id, status),
    KEY idx_profile_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='AgentCore derived user profile traits (low-sensitivity)';

CREATE TABLE IF NOT EXISTS agent_user_profile_evidence (
    id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    tenant_id   BIGINT       NOT NULL COMMENT 'Owning tenant',
    user_id     BIGINT       NOT NULL COMMENT 'Owning user',
    trait_id    VARCHAR(64)  NOT NULL COMMENT 'Owning trait id',
    session_id  VARCHAR(128) DEFAULT NULL COMMENT 'Source chat session',
    run_id      VARCHAR(64)  DEFAULT NULL COMMENT 'Source run',
    excerpt     VARCHAR(255) DEFAULT NULL COMMENT 'Redacted + truncated supporting text',
    observed_at BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    create_time BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (id),
    KEY idx_evidence_trait (tenant_id, user_id, trait_id),
    KEY idx_evidence_created (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Supporting evidence for profile traits (redacted)';

CREATE TABLE IF NOT EXISTS agent_profile_extraction (
    id                      BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    tenant_id               BIGINT       NOT NULL COMMENT 'Owning tenant',
    user_id                 BIGINT       NOT NULL COMMENT 'Owning user',
    session_id              VARCHAR(128) NOT NULL COMMENT 'Chat session',
    extracted_message_count INT          NOT NULL DEFAULT 0 COMMENT 'model log length already processed',
    last_run_id             VARCHAR(64)  DEFAULT NULL COMMENT 'Run that produced the last extraction',
    model                   VARCHAR(64)  DEFAULT NULL COMMENT 'Model used',
    status                  VARCHAR(16)  NOT NULL DEFAULT 'ok' COMMENT 'ok | failed',
    create_time             BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    update_time             BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (id),
    UNIQUE KEY uk_profile_extract_session (tenant_id, user_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Per-session profile extraction watermark';

CREATE TABLE IF NOT EXISTS agent_user_profile_consent (
    id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    tenant_id   BIGINT      NOT NULL COMMENT 'Owning tenant',
    user_id     BIGINT      NOT NULL COMMENT 'Owning user',
    enabled     TINYINT     NOT NULL DEFAULT 0 COMMENT 'Whether the user opted in',
    agreed_at   BIGINT      NOT NULL DEFAULT 0 COMMENT 'Epoch millis of the latest opt-in',
    create_time BIGINT      NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    update_time BIGINT      NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (id),
    UNIQUE KEY uk_profile_consent_owner (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='User consent for profile derivation (opt-in)';
