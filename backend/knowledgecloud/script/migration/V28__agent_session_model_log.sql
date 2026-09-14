-- ============================================================
-- AgentCore session MODEL LOG (context source of truth)
--
-- The chat session store now keeps two engine-written artifacts:
--   * `model_messages_json` — the canonical ChatMessage[] the engine feeds
--     back into ContextManager (source of truth for model context);
--   * `messages_json`       — the UI projection (display read model).
--
-- With this column the client no longer has to resend conversation history:
-- the engine accumulates it across runs and rebuilds the request from its own
-- log (compaction still happens at assemble time).
-- ============================================================

ALTER TABLE `agent_chat_session`
    ADD COLUMN `model_messages_json` LONGTEXT
        COMMENT 'Canonical ChatMessage[] — engine-owned context history';
