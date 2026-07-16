package com.knowledge.agent.v2.pipeline;

import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.session.AgentSession;
import reactor.core.publisher.Flux;

/**
 * Represents the remaining chain of interceptors to be executed.
 *
 * <p>Each interceptor receives a chain and must call {@link #proceed(AgentSession)}
 * to continue execution (unless short-circuiting). The chain is built by the
 * {@link InterceptorPipeline} and consumed recursively.
 */
@FunctionalInterface
public interface InterceptorChain {

    /**
     * Proceed to the next interceptor in the chain, or the final state handler
     * if no interceptors remain.
     *
     * @param session the (possibly modified) agent session
     * @return a Flux of events from downstream interceptors and the handler
     */
    Flux<AgentEvent> proceed(AgentSession session);
}
