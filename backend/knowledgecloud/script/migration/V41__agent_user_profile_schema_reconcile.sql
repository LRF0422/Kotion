-- ============================================================
-- V41: reconcile the two incompatible `agent_user_profile` shapes.
--
-- History:
--   * V4__agent_harness.sql (retired v2 harness) created `agent_user_profile`
--     as a JSON-blob mirror: profile_json / language / preferred_model /
--     tool_usage_json / skill_usage_json / interaction_count / total_tokens.
--   * V39__agent_user_profile.sql (derived-traits P0) re-used the SAME table
--     name but wrote `CREATE TABLE IF NOT EXISTS`, which is a silent no-op on
--     any database that already ran V4. The other three tables it creates
--     (evidence / extraction / consent) were created normally, so opting in
--     worked while every trait read/write failed with
--     "Unknown column 'trait_id'" — the UI looked enabled but could never
--     list or add a single trait.
--
-- V39 is already applied and therefore immutable (Flyway checksum). This
-- migration reconciles the schema without assuming deployment history:
--   1. trait shape already correct (fresh install / V39 applied cleanly) → no-op;
--   2. legacy V4 shape present → archive it as `agent_user_profile_v2_legacy`
--      (no code in this repository reads it any more; keep the data instead of
--      destroying it) and create the trait table;
--   3. table missing → create the trait table;
--   4. a shape that is neither → fail loudly instead of silently misbehaving.
--
-- Safe to re-run by hand: the archive branch only fires while the legacy
-- columns are still on `agent_user_profile`.
-- ============================================================

DROP PROCEDURE IF EXISTS `reconcile_agent_user_profile_schema`;

DELIMITER //
CREATE PROCEDURE `reconcile_agent_user_profile_schema`()
BEGIN
    DECLARE table_count INT DEFAULT 0;
    DECLARE trait_count INT DEFAULT 0;
    DECLARE legacy_count INT DEFAULT 0;
    DECLARE archived_count INT DEFAULT 0;
    DECLARE needs_create INT DEFAULT 0;

    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'agent_user_profile';

    IF table_count = 0 THEN
        SET needs_create = 1;
    ELSE
        SELECT COUNT(*) INTO trait_count
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'agent_user_profile'
          AND column_name IN ('trait_id', 'dimension', 'trait_value');

        IF trait_count = 3 THEN
            -- Already the derived-traits shape: nothing to do.
            SET needs_create = 0;
        ELSE
            SELECT COUNT(*) INTO legacy_count
            FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'agent_user_profile'
              AND column_name IN ('profile_json', 'preferred_model', 'interaction_count');

            IF legacy_count = 0 THEN
                -- Unknown shape: do not drop or guess, let the deploy stop here.
                SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'V41: agent_user_profile matches neither the legacy nor the trait shape';
            END IF;

            -- Retired V4 harness table. Archive instead of dropping so the
            -- historical rows remain inspectable; drop it after verification.
            SELECT COUNT(*) INTO archived_count
            FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = 'agent_user_profile_v2_legacy';

            IF archived_count = 0 THEN
                RENAME TABLE `agent_user_profile` TO `agent_user_profile_v2_legacy`;
            ELSE
                -- A previous manual reconciliation already archived a copy.
                DROP TABLE `agent_user_profile`;
            END IF;

            SET needs_create = 1;
        END IF;
    END IF;

    IF needs_create = 1 THEN
        CREATE TABLE IF NOT EXISTS `agent_user_profile` (
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
    END IF;
END//
DELIMITER ;

CALL `reconcile_agent_user_profile_schema`();
DROP PROCEDURE IF EXISTS `reconcile_agent_user_profile_schema`;
