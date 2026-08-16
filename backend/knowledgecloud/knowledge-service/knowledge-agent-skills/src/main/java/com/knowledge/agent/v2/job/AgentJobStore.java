package com.knowledge.agent.v2.job;

import java.util.Collections;
import java.util.List;

/**
 * Persistence for {@link AgentJob} — Redis-primary with a JDBC cold fallback.
 *
 * <p>All methods are best-effort; {@link #load} returns {@code null} when the
 * job is unknown to both tiers.
 */
public interface AgentJobStore {

    /** Persist to both tiers (Redis + JDBC). Used on status transitions. */
    void save(AgentJob job);

    /**
     * Persist to the Redis hot tier only — cheap enough to call on every
     * event (streaming checkpoints: lastSeq + assistantText) without
     * hammering MySQL.
     */
    void saveHot(AgentJob job);

    AgentJob load(String taskId);

    /** Load the most recent job for a session (legacy session-based resume). */
    AgentJob loadBySessionId(String sessionId);

    void delete(String taskId);

    /** Most recent jobs for a user (newest first). */
    List<AgentJob> listByUser(Long userId, int limit);

    /** Active (non-terminal) task count for a tenant (concurrency quota). */
    long countActive(Long tenantId);

    /** Active jobs in a conversation (used by V3 single-active-task rule). */
    default List<AgentJob> listActiveByConversation(String conversationId, Long userId, Long tenantId) {
        return Collections.emptyList();
    }

    /**
     * RUNNING/QUEUED jobs whose update_time is older than {@code cutoffMs}.
     * Used by the reconciler to fail stale DB rows that no live executor owns.
     */
    default List<AgentJob> listStaleRunning(Long tenantId, long cutoffMs, int limit) {
        return Collections.emptyList();
    }
}
