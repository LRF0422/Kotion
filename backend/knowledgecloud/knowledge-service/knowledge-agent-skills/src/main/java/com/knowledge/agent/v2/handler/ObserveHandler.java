package com.knowledge.agent.v2.handler;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.StateHandler;
import com.knowledge.agent.v2.engine.Transition;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

/**
 * Handles the OBSERVE state — post-tool-execution decision point.
 *
 * <p>
 * After tools have been executed (ACT state), the OBSERVE handler:
 * <ul>
 * <li>Evaluates the conversation state</li>
 * <li>Checks iteration limits</li>
 * <li>Decides whether to loop back to THINK for another LLM call</li>
 * </ul>
 *
 * <p>
 * In the current implementation, OBSERVE always transitions back to THINK
 * (the LLM decides when to stop by not returning tool calls). Future
 * enhancements may add:
 * <ul>
 * <li>Context window compression before the next LLM call</li>
 * <li>Checkpoint/snapshot logic</li>
 * <li>Abort conditions based on error patterns</li>
 * </ul>
 */
@Slf4j
public class ObserveHandler implements StateHandler {

    @Override
    public Flux<AgentEvent> handle(AgentSession session, AgentState state) {
        String sessionId = session.getSessionId();
        int iteration = session.getExecution().getIteration();

        log.debug("ObserveHandler: session {} at iteration {}, deciding next step",
                sessionId, iteration);

        // Iteration budget exhausted: suspend instead of forcing DONE so the
        // user can grant another budget round via /chat/resume {action:"continue"}
        if (session.hasReachedMaxIterations()) {
            log.warn("ObserveHandler: session {} reached max iterations ({}), suspending for continue",
                    sessionId, session.getMaxIterations());
            return Flux.just(Transition.toSuspended(sessionId, "iteration_budget_exhausted"));
        }

        // Default: loop back to THINK for the next LLM call
        log.debug("ObserveHandler: session {} → THINK for iteration {}",
                sessionId, iteration + 1);
        return Flux.just(Transition.toThink(sessionId));
    }
}
