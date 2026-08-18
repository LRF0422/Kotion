-- ============================================================
-- AgentCore — prompt cache accounting (V8)
--
-- Adds cached_prompt_tokens to agent_run: the subset of prompt_tokens
-- that the provider served from its context cache (DeepSeek
-- prompt_cache_hit_tokens / OpenAI prompt_tokens_details.cached_tokens).
-- The chat UI renders it as the run's cache hit rate; admin usage
-- analytics can use it for cost accuracy.
-- ============================================================

ALTER TABLE `agent_run`
    ADD COLUMN `cached_prompt_tokens` INT NOT NULL DEFAULT 0
        COMMENT 'Cumulative prompt tokens served from the provider context cache' AFTER `completion_tokens`;
