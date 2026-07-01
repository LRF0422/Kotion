-- =====================================================================
-- Agent Skills DDL
-- Compatible with MySQL 5.7+
-- =====================================================================

-- Skill registry table (persists skill metadata for enabled/disabled state)
CREATE TABLE IF NOT EXISTS agent_skill (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    skill_id      VARCHAR(64)  NOT NULL UNIQUE COMMENT 'Unique skill identifier',
    name          VARCHAR(128) NOT NULL COMMENT 'Skill display name',
    description   TEXT COMMENT 'Skill description',
    type          VARCHAR(32)  NOT NULL COMMENT 'BUILTIN | PLUGIN | REMOTE',
    tier          VARCHAR(32)  NOT NULL DEFAULT 'DOMAIN' COMMENT 'CORE | DOMAIN | ADVANCED | CUSTOM',
    version       VARCHAR(32)  COMMENT 'Version string',
    author        VARCHAR(64)  COMMENT 'Author / plugin owner',
    categories    JSON COMMENT 'Domain category list, e.g. ["coding","research"]',
    parameters    JSON COMMENT 'Parameter definitions (JSON Schema)',
    config        JSON COMMENT 'Skill-specific configuration',
    enabled       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=enabled, 0=disabled',
    sort          INT          NOT NULL DEFAULT 0 COMMENT 'Display sort order',
    create_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted    TINYINT(1)   NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent skill registry';

-- Plugin table (tracks installed external JAR plugins)
CREATE TABLE IF NOT EXISTS agent_plugin (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    plugin_id     VARCHAR(64)  NOT NULL UNIQUE COMMENT 'Plugin identifier',
    name          VARCHAR(128) NOT NULL COMMENT 'Plugin name',
    description   TEXT COMMENT 'Plugin description',
    version       VARCHAR(32)  COMMENT 'Plugin version',
    author        VARCHAR(64)  COMMENT 'Plugin author',
    jar_path      VARCHAR(512) COMMENT 'Local path to the JAR file',
    source_url    VARCHAR(512) COMMENT 'Original download URL',
    status        VARCHAR(32)  NOT NULL DEFAULT 'LOADED' COMMENT 'LOADED | DISABLED | ERROR',
    skill_count   INT          NOT NULL DEFAULT 0 COMMENT 'Number of skills provided by this plugin',
    load_time     DATETIME     COMMENT 'When the plugin was loaded',
    create_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted    TINYINT(1)   NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Installed external plugins';

-- Remote skill configuration table
CREATE TABLE IF NOT EXISTS agent_remote_skill (
    id                BIGINT       PRIMARY KEY AUTO_INCREMENT,
    skill_id          VARCHAR(64)  NOT NULL UNIQUE COMMENT 'Unique skill identifier',
    endpoint          VARCHAR(512) NOT NULL COMMENT 'HTTP endpoint or gRPC address',
    protocol          VARCHAR(32)  NOT NULL DEFAULT 'HTTP' COMMENT 'HTTP | GRPC',
    auth_type         VARCHAR(32)  COMMENT 'none | bearer | basic | apikey',
    auth_config       JSON COMMENT 'Authentication configuration',
    timeout_ms        INT          NOT NULL DEFAULT 30000 COMMENT 'Request timeout in ms',
    retry_count       INT          NOT NULL DEFAULT 3 COMMENT 'Max retry attempts',
    request_template  TEXT COMMENT 'Request body template (supports {{param}} placeholders)',
    response_mapping  TEXT COMMENT 'JSONPath response field mapping',
    create_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted        TINYINT(1)   NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Remote skill HTTP/gRPC endpoints';

-- Conversation table (tracks chat sessions)
CREATE TABLE IF NOT EXISTS agent_conversation (
    id                BIGINT       PRIMARY KEY AUTO_INCREMENT,
    conversation_id   VARCHAR(64)  NOT NULL UNIQUE COMMENT 'Conversation identifier',
    user_id           BIGINT       COMMENT 'User id',
    title             VARCHAR(256) COMMENT 'Conversation title (auto-generated)',
    model             VARCHAR(64)  COMMENT 'LLM model used',
    total_tokens      INT          NOT NULL DEFAULT 0 COMMENT 'Cumulative token usage',
    message_count     INT          NOT NULL DEFAULT 0,
    last_message_time DATETIME     COMMENT 'Timestamp of last message',
    create_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted        TINYINT(1)   NOT NULL DEFAULT 0,
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent chat conversations';

-- Message table (stores individual chat messages)
CREATE TABLE IF NOT EXISTS agent_message (
    id              BIGINT       PRIMARY KEY AUTO_INCREMENT,
    message_id      VARCHAR(64)  NOT NULL UNIQUE COMMENT 'Message identifier',
    conversation_id VARCHAR(64)  NOT NULL COMMENT 'Parent conversation',
    role            VARCHAR(32)  NOT NULL COMMENT 'user | assistant | system | tool',
    content         TEXT COMMENT 'Message text content',
    tool_calls      JSON COMMENT 'Tool call invocations (for assistant messages)',
    tool_call_id    VARCHAR(64)  COMMENT 'Tool call id (for tool-result messages)',
    tokens          INT          NOT NULL DEFAULT 0 COMMENT 'Token count for this message',
    create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conversation (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent chat messages';

-- Agent execution session (records solo and team runs)
CREATE TABLE IF NOT EXISTS agent_session (
    id              BIGINT       PRIMARY KEY AUTO_INCREMENT,
    session_id      VARCHAR(64)  NOT NULL UNIQUE COMMENT 'Session identifier',
    conversation_id VARCHAR(64)  NOT NULL COMMENT 'Links to agent_conversation',
    user_id         BIGINT       COMMENT 'User id',
    execution_mode  VARCHAR(32)  NOT NULL DEFAULT 'SOLO' COMMENT 'SOLO | TEAM',
    task            TEXT COMMENT 'Original user task text',
    task_plan       JSON COMMENT 'Decomposed sub-tasks (null for SOLO)',
    roles_used      JSON COMMENT 'Transient roles assembled at runtime (null for SOLO)',
    status          VARCHAR(32)  NOT NULL DEFAULT 'RUNNING' COMMENT 'RUNNING | COMPLETED | FAILED',
    result          TEXT COMMENT 'Final synthesized result',
    create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time        DATETIME     COMMENT 'When the session finished',
    INDEX idx_conversation (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent execution sessions (solo + team)';

-- Agent state snapshot table (persists full agent state for crash recovery)
CREATE TABLE IF NOT EXISTS agent_state_snapshot (
    id              BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT 'Primary key',
    session_id      VARCHAR(128) NOT NULL COMMENT 'Agent session ID',
    conversation_id VARCHAR(128) COMMENT 'Conversation ID',
    agent_id        VARCHAR(128) COMMENT 'Agent ID (null for root agent)',
    parent_agent_id VARCHAR(128) COMMENT 'Parent agent ID',
    depth           INT          NOT NULL DEFAULT 0 COMMENT 'Delegate depth (0 for root)',
    iteration       INT          NOT NULL DEFAULT 0 COMMENT 'Loop iteration when snapshot was taken',
    snapshot        LONGTEXT     COMMENT 'Full JSON snapshot of AgentStateSnapshot',
    timestamp       BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis when snapshot was taken',
    create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Record creation time',
    update_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Record update time',
    UNIQUE KEY uk_session_id (session_id),
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent state snapshots for crash recovery';
