package com.knowledge.agent.v2.interceptor;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorChain;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import reactor.core.publisher.Flux;

/**
 * Tracing interceptor — injects trace context into MDC for correlated logging.
 *
 * <p>Order 10 (outermost): ensures all downstream interceptors and handlers
 * have trace context available in their log statements.
 *
 * <p>Sets MDC keys: {@code traceId}, {@code sessionId}, {@code state}.
 * The MDC is cleaned up after the downstream chain completes.
 */
@Slf4j
public class TracingInterceptor implements AgentInterceptor {

    @Override
    public int order() {
        return 10;
    }

    @Override
    public Flux<AgentEvent> intercept(AgentSession session, AgentState from, AgentState to,
                                       InterceptorChain chain) {
        return chain.proceed(session)
                .doOnSubscribe(sub -> {
                    MDC.put("traceId", session.getTraceId());
                    MDC.put("sessionId", session.getSessionId());
                    MDC.put("state", to.name());
                    log.trace("Entering state {} for session {}", to, session.getSessionId());
                })
                .doFinally(signal -> {
                    MDC.remove("traceId");
                    MDC.remove("sessionId");
                    MDC.remove("state");
                });
    }
}
