package com.knowledge.agent.v2.pipeline;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.StateHandler;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * The interceptor pipeline — assembles and executes the interceptor chain
 * for each state transition.
 *
 * <p>On each transition, the pipeline:
 * <ol>
 *   <li>Filters interceptors by {@link AgentInterceptor#appliesTo(AgentState, AgentState)}</li>
 *   <li>Sorts them by {@link AgentInterceptor#order()}</li>
 *   <li>Builds a chain where each interceptor wraps the next</li>
 *   <li>The innermost element of the chain is the {@link StateHandler}</li>
 * </ol>
 *
 * <p>This is analogous to how Spring's {@code WebFilterChain} works, but for
 * agent state transitions instead of HTTP requests.
 */
@Slf4j
public class InterceptorPipeline {

    private final List<AgentInterceptor> interceptors;

    public InterceptorPipeline(List<AgentInterceptor> interceptors) {
        // Sort by order, defensive copy
        this.interceptors = interceptors == null
                ? new ArrayList<>()
                : interceptors.stream()
                    .sorted(Comparator.comparingInt(AgentInterceptor::order))
                    .collect(Collectors.toList());
        log.info("InterceptorPipeline initialized with {} interceptors: {}",
                this.interceptors.size(),
                this.interceptors.stream()
                        .map(i -> i.getClass().getSimpleName() + "(" + i.order() + ")")
                        .collect(Collectors.joining(", ")));
    }

    /**
     * Execute the pipeline for a state transition.
     *
     * <p>Builds the chain by filtering applicable interceptors, then wraps
     * the state handler as the terminal element.
     *
     * @param session the agent session
     * @param from    source state
     * @param to      target state
     * @param handler the state handler to execute at the end of the chain
     * @return a Flux of events produced by the chain
     */
    public Flux<AgentEvent> execute(AgentSession session, AgentState from, AgentState to,
                                    StateHandler handler) {
        // Filter interceptors applicable to this transition
        List<AgentInterceptor> applicable = interceptors.stream()
                .filter(i -> i.appliesTo(from, to))
                .collect(Collectors.toList());

        // Build the chain from inside out:
        // The innermost element is the state handler
        InterceptorChain chain = buildChain(applicable, 0, from, to, handler);

        return chain.proceed(session);
    }

    /**
     * Recursively build the interceptor chain.
     *
     * <p>At index == applicable.size(), we've reached the end of the interceptor
     * list, so we return the handler as the terminal chain element.
     */
    private InterceptorChain buildChain(List<AgentInterceptor> applicable, int index,
                                        AgentState from, AgentState to,
                                        StateHandler handler) {
        if (index >= applicable.size()) {
            // Terminal: execute the actual state handler
            return (s) -> handler.handle(s, to);
        }

        AgentInterceptor current = applicable.get(index);
        InterceptorChain next = buildChain(applicable, index + 1, from, to, handler);

        return (s) -> current.intercept(s, from, to, next);
    }

    /**
     * Get the number of registered interceptors.
     */
    public int size() {
        return interceptors.size();
    }

    /**
     * Get interceptors (unmodifiable, for testing/inspection).
     */
    public List<AgentInterceptor> getInterceptors() {
        return java.util.Collections.unmodifiableList(interceptors);
    }
}
