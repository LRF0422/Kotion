package com.knowledge.agent.v2.engine;

import com.knowledge.agent.v2.session.AgentSession;

/**
 * Callback invoked by {@link AgentEngine} when a session reaches a terminal
 * (DONE / SUSPENDED) state, carrying the full session so implementations can
 * access identity, model and token counters.
 *
 * <p>
 * Kept as a small interface in the engine package so the engine never
 * depends on persistence code. Implementations must be non-blocking or
 * offload their work — they are called on the reactive engine thread.
 */
@FunctionalInterface
public interface AgentUsageListener {

    /**
     * Called once per session termination.
     *
     * @param session      the finished session
     * @param finishReason terminal reason (stop / suspended:xxx)
     * @param durationMs   session elapsed time in milliseconds
     */
    void record(AgentSession session, String finishReason, long durationMs);
}
