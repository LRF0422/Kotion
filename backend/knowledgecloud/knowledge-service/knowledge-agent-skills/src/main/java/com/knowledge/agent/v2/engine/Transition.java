package com.knowledge.agent.v2.engine;

import com.knowledge.agent.v2.event.AgentEvent;

/**
 * A special event that signals a state transition within the engine.
 *
 * <p>Every {@link StateHandler} must emit exactly one {@code Transition} as
 * the last meaningful event in its Flux. The engine uses this to determine
 * which state to enter next.
 *
 * <p>Transitions are internal to the engine — they are NOT forwarded to the
 * EventBus or SSE output. They are consumed by the engine loop and replaced
 * with {@link com.knowledge.agent.v2.event.StateEvent.StateTransition} events
 * for external observability.
 */
public class Transition extends AgentEvent {

    private final AgentState nextState;
    private final String reason;

    /**
     * Create a transition to the next state.
     *
     * @param sessionId the session this transition belongs to
     * @param nextState the state to transition to
     * @param reason    human-readable reason for the transition (for debugging)
     */
    public Transition(String sessionId, AgentState nextState, String reason) {
        super(sessionId);
        this.nextState = nextState;
        this.reason = reason;
    }

    @Override
    public String type() {
        return "internal.transition";
    }

    public AgentState getNextState() {
        return nextState;
    }

    public String getReason() {
        return reason;
    }

    // ---- Factory methods for common transitions ----

    public static Transition toThink(String sessionId) {
        return new Transition(sessionId, AgentState.THINK, "continue_thinking");
    }

    public static Transition toAct(String sessionId) {
        return new Transition(sessionId, AgentState.ACT, "tool_calls_pending");
    }

    public static Transition toObserve(String sessionId) {
        return new Transition(sessionId, AgentState.OBSERVE, "tools_executed");
    }

    public static Transition toDone(String sessionId, String reason) {
        return new Transition(sessionId, AgentState.DONE, reason);
    }

    public static Transition toError(String sessionId, String reason) {
        return new Transition(sessionId, AgentState.ERROR, reason);
    }

    public static Transition toSuspended(String sessionId, String reason) {
        return new Transition(sessionId, AgentState.SUSPENDED, reason);
    }
}
