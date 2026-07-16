package com.knowledge.agent.v2.eventbus;

import com.knowledge.agent.v2.event.AgentEvent;
import reactor.core.publisher.Flux;

/**
 * In-process event bus for decoupled inter-module communication.
 *
 * <p>All agent modules communicate through this bus instead of direct method
 * calls. This enables:
 * <ul>
 *   <li>SSE output by simply subscribing to session events</li>
 *   <li>Audit logging as an independent event consumer</li>
 *   <li>Metrics collection without coupling to execution logic</li>
 *   <li>Multi-agent coordination through event pub/sub</li>
 * </ul>
 *
 * <p>The bus supports two subscription models:
 * <ul>
 *   <li><b>Type-based</b>: subscribe to all events of a specific type</li>
 *   <li><b>Session-based</b>: subscribe to all events from a specific session</li>
 * </ul>
 *
 * <p>Events are delivered asynchronously. Back-pressure is handled via
 * Reactor's built-in mechanisms.
 */
public interface AgentEventBus {

    /**
     * Publish an event to the bus. Fire-and-forget; never blocks.
     *
     * @param event the event to publish (must not be null)
     */
    void publish(AgentEvent event);

    /**
     * Subscribe to all events of a specific type (and subtypes).
     *
     * @param eventType the event class to filter on
     * @param <T>       the event type
     * @return a Flux of matching events
     */
    <T extends AgentEvent> Flux<T> subscribe(Class<T> eventType);

    /**
     * Subscribe to all events from a specific agent session.
     *
     * @param sessionId the session ID to filter on
     * @return a Flux of all events from that session
     */
    Flux<AgentEvent> subscribeSession(String sessionId);

    /**
     * Subscribe to all events (unfiltered). Use with caution — high volume.
     *
     * @return a Flux of all events flowing through the bus
     */
    Flux<AgentEvent> subscribeAll();
}
