package com.knowledge.agent.v2.interceptor;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorChain;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Metrics interceptor — records latency, token usage, and tool call counts.
 *
 * <p>Order 40: sits in the middle of the chain to accurately measure
 * the time spent in downstream handlers (including LLM calls and tool execution).
 *
 * <p>Currently logs metrics at DEBUG level. In a production setup, this would
 * integrate with Micrometer/Prometheus via counters, timers, and gauges.
 */
@Slf4j
public class MetricsInterceptor implements AgentInterceptor {

    private final AtomicLong totalStatesProcessed = new AtomicLong(0);
    private final AtomicLong totalEventsEmitted = new AtomicLong(0);

    @Override
    public int order() {
        return 40;
    }

    @Override
    public Flux<AgentEvent> intercept(AgentSession session, AgentState from, AgentState to,
                                       InterceptorChain chain) {
        long startMs = System.currentTimeMillis();
        totalStatesProcessed.incrementAndGet();

        return chain.proceed(session)
                .doOnNext(event -> totalEventsEmitted.incrementAndGet())
                .doFinally(signal -> {
                    long duration = System.currentTimeMillis() - startMs;
                    log.debug("Metrics: session={}, state={}, duration={}ms, signal={}",
                            session.getSessionId(), to.name(), duration, signal);
                });
    }

    // ---- Accessors for testing / monitoring ----

    public long getTotalStatesProcessed() {
        return totalStatesProcessed.get();
    }

    public long getTotalEventsEmitted() {
        return totalEventsEmitted.get();
    }
}
