-- ============================================================
-- AgentCore chat session optimistic lock.
--
-- SessionTranscriptProjector does read-modify-write on the canonical model log.
-- A per-conversation lock only serializes writers within one process, so with
-- more than one service instance (or a reconcile takeover) two runs could
-- overwrite each other's transcript. `version` turns the write into a compare-
-- and-swap: a writer that read version N may only persist while the row is
-- still at N, then the row advances to N+1. On conflict the projector re-reads
-- and recomputes.
-- ============================================================

ALTER TABLE `agent_chat_session`
    ADD COLUMN `version` BIGINT NOT NULL DEFAULT 0 COMMENT 'Optimistic-lock version for transcript CAS';
