package com.knowledge.agent.v2.engine;

/**
 * States of the Agent execution state machine.
 *
 * <p>The state machine follows the "Perceive-Think-Act" cycle:
 * <pre>
 *   INIT → THINK → ACT → OBSERVE → THINK → ... → DONE
 *       ↘ ACT ──(frontend tools / plan approval)──▶ SUSPENDED
 * </pre>
 * <p>Multi-agent delegation runs INSIDE the ACT state as the
 * {@code delegate_task} backend tool — there is no separate DELEGATE state.
 *
 * <p>Terminal states: {@link #DONE}, {@link #ERROR}, {@link #SUSPENDED}.
 * {@code SUSPENDED} is a soft-terminal: the session can be resumed by the
 * frontend submitting tool results.
 */
public enum AgentState {

    /**
     * Initial state — resolve skills, build tool set, prepare context window.
     */
    INIT,

    /**
     * LLM inference in progress — streaming tokens to the client.
     */
    THINK,

    /**
     * Executing tool calls produced by the LLM.
     */
    ACT,

    /**
     * Observing tool results and deciding the next transition:
     * back to THINK (continue), or to DONE (finished).
     */
    OBSERVE,

    /**
     * Normal completion — the agent produced a final response.
     */
    DONE,

    /**
     * Abnormal termination — an unrecoverable error occurred.
     */
    ERROR,

    /**
     * Suspended — waiting for external input (e.g., frontend tool execution).
     * The session is persisted and can be resumed.
     */
    SUSPENDED;

    /**
     * Whether this state is terminal (no further transitions possible
     * without external intervention).
     */
    public boolean isTerminal() {
        return this == DONE || this == ERROR || this == SUSPENDED;
    }

    /**
     * Whether this state represents an active processing phase.
     */
    public boolean isActive() {
        return this == THINK || this == ACT || this == OBSERVE;
    }
}
