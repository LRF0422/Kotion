-- ============================================================
-- AgentCore personal saved skills
--
-- Skills are private to one tenant/user owner. The owner-lock table provides
-- a stable row for serializing per-owner quota checks during creation.
-- Timestamps use epoch millis, matching the other AgentCore tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS `agent_saved_skill` (
    `id`                       BIGINT        NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    `skill_id`                 VARCHAR(64)   NOT NULL COMMENT 'Public skill id (UUID)',
    `tenant_id`                BIGINT        NOT NULL COMMENT 'Owning tenant',
    `user_id`                  BIGINT        NOT NULL COMMENT 'Owning user',
    `name`                     VARCHAR(128)  NOT NULL COMMENT 'Human-readable skill name',
    `description`              VARCHAR(1000) NOT NULL COMMENT 'Concise purpose description',
    `trigger_text`             TEXT          NOT NULL COMMENT 'Primary retrieval trigger text',
    `example_intents_json`     TEXT          COMMENT 'JSON array of example user intents',
    `tags_json`                TEXT          COMMENT 'JSON array of retrieval tags',
    `system_prompt_fragment`   TEXT          NOT NULL COMMENT 'Validated reusable procedure',
    `required_tool_names_json` TEXT          COMMENT 'JSON array of required tool names',
    `optional_tool_names_json` TEXT          COMMENT 'JSON array of optional tool names',
    `source_conversation_id`   VARCHAR(128)  NOT NULL COMMENT 'Conversation used to compile the skill',
    `source_run_id`            VARCHAR(64)   NOT NULL COMMENT 'Run used to compile the skill',
    `source_schema_version`    VARCHAR(32)   NOT NULL DEFAULT 'v1' COMMENT 'Transcript projector schema version',
    `source_fingerprint`       CHAR(64)      NOT NULL COMMENT 'SHA-256 of the canonical sanitized transcript',
    `enabled`                  TINYINT(1)    NOT NULL DEFAULT 1 COMMENT 'Whether automatic retrieval may use the skill',
    `version`                  INT           NOT NULL DEFAULT 1 COMMENT 'Skill definition version',
    `use_count`                BIGINT        NOT NULL DEFAULT 0 COMMENT 'Number of successful run injections',
    `last_used_time`           BIGINT        DEFAULT NULL COMMENT 'Epoch millis of latest injection',
    `embedding_ref`            VARCHAR(128)  DEFAULT NULL COMMENT 'Reserved for an external embedding store',
    `create_time`              BIGINT        NOT NULL COMMENT 'Epoch millis',
    `update_time`              BIGINT        NOT NULL COMMENT 'Epoch millis',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_saved_skill_id` (`skill_id`),
    UNIQUE KEY `uk_saved_skill_owner_fingerprint` (`tenant_id`, `user_id`, `source_fingerprint`),
    KEY `idx_saved_skill_owner_enabled` (`tenant_id`, `user_id`, `enabled`, `update_time`),
    KEY `idx_saved_skill_owner_source_run` (`tenant_id`, `user_id`, `source_run_id`),
    KEY `idx_saved_skill_owner_created` (`tenant_id`, `user_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='AgentCore owner-scoped skills compiled from conversations';

CREATE TABLE IF NOT EXISTS `agent_saved_skill_owner_lock` (
    `tenant_id`  BIGINT NOT NULL COMMENT 'Owning tenant',
    `user_id`    BIGINT NOT NULL COMMENT 'Owning user',
    `create_time` BIGINT NOT NULL COMMENT 'Epoch millis',
    PRIMARY KEY (`tenant_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Per-owner lock rows for serialized saved-skill quota checks';
