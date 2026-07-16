package com.knowledge.agent.v2.interceptor;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorChain;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

/**
 * Audit interceptor — logs state transitions for compliance/debugging.
 *
 * <p>Order 90: runs near the end of the chain to record what actually
 * happened (after all guards and transformations are applied).
 *
 * <p>Records: session ID, user, state transition, timestamp, and event count.
 * In production, this would write to an audit log (database, Kafka, etc.).
 */
@Slf4j
public class AuditInterceptor implements AgentInterceptor {

    @Override
    public int order() {
        return 90;
    }

    @Override
    public Flux<AgentEvent> intercept(AgentSession session, AgentState from, AgentState to,
                                       InterceptorChain chain) {
        String userId = session.getIdentity() != null
                ? String.valueOf(session.getIdentity().getUserId()) : "unknown";

        log.info("AUDIT: session={}, user={}, transition={} → {}, mode={}",
                session.getSessionId(), userId, from, to, session.getMode());

        return chain.proceed(session)
                .doOnComplete(() ->
                        log.info("AUDIT: session={}, state={} completed",
                                session.getSessionId(), to));
    }
}
