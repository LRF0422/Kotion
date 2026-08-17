package com.knowledge.agentcore.run;

/**
 * Durable run state access — Redis hot tier with JDBC cold fallback.
 */
public interface RunStore {

    /** Persist hot state to Redis (TTL) — cheap, called on every state change. */
    void saveHot(AgentRun run);

    /**
     * Persist to the JDBC cold tier (upsert). Called on lifecycle boundaries:
     * create, suspend, waiting, terminal.
     */
    void persist(AgentRun run);

    /** Load by run id: Redis first, JDBC fallback. */
    AgentRun load(String runId);
}
