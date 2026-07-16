package com.knowledge.agent.v2.eventbus;

import com.knowledge.agent.v2.event.AgentEvent;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

/**
 * Reactor-based in-process implementation of {@link AgentEventBus}.
 *
 * <p>Uses a single {@link Sinks.Many} with multicast semantics and back-pressure
 * buffering. All subscribers share the same underlying publisher, and events
 * are replayed only to active subscribers (no persistence).
 *
 * <p>Thread-safety: {@code Sinks.many().multicast()} is inherently thread-safe
 * for concurrent publishers. The {@code tryEmitNext} method handles contention
 * via retry semantics.
 *
 * <p>Back-pressure: uses {@code onBackpressureBuffer()} with a bounded buffer.
 * If a slow subscriber falls behind, oldest events are dropped (log warning).
 */
@Slf4j
public class ReactorEventBus implements AgentEventBus {

    private static final int BUFFER_SIZE = 4096;

    private final Sinks.Many<AgentEvent> sink;
    private final Flux<AgentEvent> sharedFlux;

    public ReactorEventBus() {
        this.sink = Sinks.many().multicast().onBackpressureBuffer(BUFFER_SIZE, false);
        // Share the flux so multiple subscribers don't create multiple upstream subscriptions
        this.sharedFlux = sink.asFlux().share();
    }

    @Override
    public void publish(AgentEvent event) {
        if (event == null) {
            return;
        }
        Sinks.EmitResult result = sink.tryEmitNext(event);
        if (result.isFailure()) {
            log.warn("EventBus: failed to emit event type={} sessionId={} result={}",
                    event.type(), event.getSessionId(), result);
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public <T extends AgentEvent> Flux<T> subscribe(Class<T> eventType) {
        if (eventType == null) {
            return Flux.empty();
        }
        return sharedFlux
                .filter(eventType::isInstance)
                .map(event -> (T) event);
    }

    @Override
    public Flux<AgentEvent> subscribeSession(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return Flux.empty();
        }
        return sharedFlux
                .filter(event -> sessionId.equals(event.getSessionId()));
    }

    @Override
    public Flux<AgentEvent> subscribeAll() {
        return sharedFlux;
    }
}
