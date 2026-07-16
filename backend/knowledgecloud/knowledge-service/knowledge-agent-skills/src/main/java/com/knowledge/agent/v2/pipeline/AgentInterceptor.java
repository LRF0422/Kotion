package com.knowledge.agent.v2.pipeline;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.session.AgentSession;
import reactor.core.publisher.Flux;

/**
 * Interceptor for the Agent execution pipeline.
 *
 * <p>Interceptors form a chain (similar to Servlet Filters or Spring WebFilters)
 * that wraps each state transition. They can:
 * <ul>
 *   <li>Add pre/post processing around state handler execution</li>
 *   <li>Short-circuit execution (e.g., rate limiting)</li>
 *   <li>Transform or augment emitted events</li>
 *   <li>Record metrics and audit trails</li>
 * </ul>
 *
 * <p>Interceptors are ordered by {@link #order()} — lower values execute first
 * (outermost in the chain). The innermost element of the chain is the actual
 * {@link com.knowledge.agent.v2.engine.StateHandler}.
 */
public interface AgentInterceptor {

    /**
     * Execution priority. Lower values execute first (outermost wrapper).
     * Convention:
     * <ul>
     *   <li>0-19: Security/auth</li>
     *   <li>20-39: Rate limiting / guards</li>
     *   <li>40-59: Metrics / observability</li>
     *   <li>60-79: Context management</li>
     *   <li>80-99: Audit / logging</li>
     *   <li>100+: Persistence</li>
     * </ul>
     */
    int order();

    /**
     * Intercept a state transition.
     *
     * <p>Implementations MUST call {@code chain.proceed(session)} to continue
     * the chain, unless they intend to short-circuit (e.g., reject the request).
     *
     * @param session the current agent session
     * @param from    the state being transitioned from
     * @param to      the state being transitioned to
     * @param chain   the remaining interceptor chain
     * @return a Flux of events (may include events from the handler + interceptor's own events)
     */
    Flux<AgentEvent> intercept(AgentSession session, AgentState from, AgentState to,
                               InterceptorChain chain);

    /**
     * Optional: whether this interceptor applies to a given transition.
     * Default: applies to all transitions.
     *
     * @param from the source state
     * @param to   the target state
     * @return true if this interceptor should be invoked for this transition
     */
    default boolean appliesTo(AgentState from, AgentState to) {
        return true;
    }
}
