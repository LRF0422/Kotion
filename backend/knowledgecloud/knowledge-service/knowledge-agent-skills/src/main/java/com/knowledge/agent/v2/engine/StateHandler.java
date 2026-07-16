package com.knowledge.agent.v2.engine;

import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.session.AgentSession;
import reactor.core.publisher.Flux;

/**
 * Handler for a specific agent state.
 *
 * <p>Each {@link AgentState} has one corresponding {@code StateHandler} that
 * encapsulates the business logic for that state. The handler:
 * <ol>
 *   <li>Performs the work associated with the state (e.g., call LLM, execute tools)</li>
 *   <li>Emits {@link AgentEvent}s describing what happened</li>
 *   <li>Determines the next state via a terminal {@link Transition} event</li>
 * </ol>
 *
 * <p>Handlers are stateless singletons — all mutable state lives in
 * {@link AgentSession} and its {@link com.knowledge.agent.v2.session.ExecutionState}.
 */
@FunctionalInterface
public interface StateHandler {

    /**
     * Handle entry into a state.
     *
     * <p>The returned Flux MUST eventually emit a {@link Transition} event
     * as its terminal element to indicate the next state. If no transition
     * is emitted, the engine treats it as an error (stuck state).
     *
     * @param session the current agent session (immutable shell + mutable execution state)
     * @param state   the state being entered
     * @return a Flux of events, terminated by a {@link Transition}
     */
    Flux<AgentEvent> handle(AgentSession session, AgentState state);
}
