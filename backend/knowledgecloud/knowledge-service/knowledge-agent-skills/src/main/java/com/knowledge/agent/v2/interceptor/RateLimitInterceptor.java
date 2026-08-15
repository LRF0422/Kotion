package com.knowledge.agent.v2.interceptor;

import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.Transition;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.SystemEvent;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorChain;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Rate limit interceptor — throttles agent executions per tenant.
 *
 * <p>Order 20: runs early to reject excess requests before any expensive
 * processing (LLM calls, tool execution) occurs.
 *
 * <p>Uses a simple sliding-window counter per tenant. When the limit is
 * exceeded, the interceptor short-circuits with a rate-limited error event.
 */
@Slf4j
public class RateLimitInterceptor implements AgentInterceptor {

    private final AgentProperties.RateLimitConfig config;
    private final Map<String, WindowCounter> counters = new ConcurrentHashMap<>();

    public RateLimitInterceptor(AgentProperties.RateLimitConfig config) {
        this.config = config;
    }

    @Override
    public int order() {
        return 20;
    }

    @Override
    public boolean appliesTo(AgentState from, AgentState to) {
        // Only apply on THINK transitions (LLM calls are the expensive path)
        return to == AgentState.THINK;
    }

    @Override
    public Flux<AgentEvent> intercept(AgentSession session, AgentState from, AgentState to,
                                       InterceptorChain chain) {
        if (!config.isEnabled()) {
            return chain.proceed(session);
        }

        String tenantKey = resolveTenantKey(session);
        WindowCounter counter = counters.computeIfAbsent(tenantKey,
                k -> new WindowCounter(config.getRequestsPerMinute()));

        if (!counter.tryAcquire()) {
            log.warn("Rate limited: tenant={}, session={}", tenantKey, session.getSessionId());
            SystemEvent.RateLimited rateLimitEvent = new SystemEvent.RateLimited(
                    session.getSessionId(), tenantKey, config.getRequestsPerMinute());
            // MUST emit a Transition: a short-circuited handler without one used
            // to make the engine complete silently, and the job reconciler then
            // revived the RUNNING job every 15s → endless rate-limit churn.
            // Suspending cleanly lets the client retry once the window resets.
            Transition suspend = Transition.toSuspended(session.getSessionId(), "rate_limited");
            return Flux.just(rateLimitEvent, suspend);
        }

        return chain.proceed(session);
    }

    private String resolveTenantKey(AgentSession session) {
        if (session.getIdentity() != null && session.getIdentity().getTenantId() != null) {
            return "tenant:" + session.getIdentity().getTenantId();
        }
        return "session:" + session.getSessionId();
    }

    /**
     * Simple sliding-window rate counter (per-minute resolution).
     */
    private static class WindowCounter {
        private final int maxPerMinute;
        private final AtomicInteger count = new AtomicInteger(0);
        private volatile long windowStartMs = System.currentTimeMillis();

        WindowCounter(int maxPerMinute) {
            this.maxPerMinute = maxPerMinute;
        }

        boolean tryAcquire() {
            long now = System.currentTimeMillis();
            if (now - windowStartMs > 60_000) {
                // Reset window
                synchronized (this) {
                    if (now - windowStartMs > 60_000) {
                        count.set(0);
                        windowStartMs = now;
                    }
                }
            }
            return count.incrementAndGet() <= maxPerMinute;
        }
    }
}
