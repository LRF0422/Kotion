-- ============================================================
-- AgentCore chat session projection metadata (engine-written)
--
-- V26 introduced `agent_chat_session` as a client-written transcript store.
-- This migration turns it into the engine-owned PROJECTION CACHE:
--   * the engine accumulates the session transcript across runs and writes it
--     on run create / run terminal (see SessionTranscriptProjector);
--   * `source_run_id` / `as_of_seq` record the run + event seq the projection
--     reflects, so a cold read can tell how fresh it is;
--   * `schema_version` versions the projected JSON shape.
--
-- The durable source of truth stays the run log: `agent_run_checkpoint`
-- (full model-visible conversation per run) + `agent_run_event` (append-only
-- execution events). This table is a derived read model and may be rebuilt.
-- ============================================================

ALTER TABLE `agent_chat_session`
    ADD COLUMN `schema_version` INT         NOT NULL DEFAULT 1 COMMENT 'Projection JSON schema version',
    ADD COLUMN `source_run_id`  VARCHAR(64) DEFAULT NULL COMMENT 'Run that produced this projection',
    ADD COLUMN `as_of_seq`      BIGINT      NOT NULL DEFAULT 0 COMMENT 'Run event seq reflected by the projection';
