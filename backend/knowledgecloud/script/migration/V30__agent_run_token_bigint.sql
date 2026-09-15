-- ============================================================
-- AgentCore — widen run token counters to BIGINT (V30)
--
-- prompt/completion/cached counters were INT, which overflows past ~2.1B
-- tokens (a long-lived tenant can reach it, and Java was casting long -> int
-- on every persist). Widen to BIGINT to match the Java long.
-- ============================================================

ALTER TABLE `agent_run`
    MODIFY COLUMN `prompt_tokens`        BIGINT NOT NULL DEFAULT 0 COMMENT 'Cumulative prompt tokens',
    MODIFY COLUMN `completion_tokens`    BIGINT NOT NULL DEFAULT 0 COMMENT 'Cumulative completion tokens',
    MODIFY COLUMN `cached_prompt_tokens` BIGINT NOT NULL DEFAULT 0 COMMENT 'Cumulative prompt tokens served from the provider context cache';
