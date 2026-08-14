package com.knowledge.agent.v2.job;

import java.util.List;

/**
 * Persistence for {@link AgentJob} — Redis-primary with a JDBC cold fallback.
 *
 * <p>All methods are best-effort; {@link #load} returns {@code null} when the
 * job is unknown to both tiers.
 */
public interface AgentJobStore {

    void save(AgentJob job);

    AgentJob load(String taskId);

    void delete(String taskId);

    /** Most recent jobs for a user (newest first). */
    List<AgentJob> listByUser(Long userId, int limit);
}
