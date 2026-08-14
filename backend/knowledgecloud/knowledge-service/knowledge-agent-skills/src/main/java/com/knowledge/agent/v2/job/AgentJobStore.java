package com.knowledge.agent.v2.job;

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

    void delete(String taskId);

    /** Most recent jobs for a user (newest first). */
    List<AgentJob> listByUser(Long userId, int limit);
}
