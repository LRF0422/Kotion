package com.knowledge.agent.v2.session;

/**
 * Agent execution mode.
 *
 * <p>Determines the behavioral constraints on the agent:
 * <ul>
 *   <li>{@link #EXECUTE}: full capabilities, can read and write</li>
 *   <li>{@link #PLAN}: read-only — can analyze but cannot modify state</li>
 * </ul>
 */
public enum AgentMode {

    /**
     * Full execution mode — agent can use all tools including write operations.
     */
    EXECUTE,

    /**
     * Plan mode — agent is restricted to read-only tools and must present
     * a plan for approval before any mutations can occur.
     */
    PLAN
}
