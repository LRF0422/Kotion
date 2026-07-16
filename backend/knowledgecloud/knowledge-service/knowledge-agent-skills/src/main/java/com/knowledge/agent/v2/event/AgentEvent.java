package com.knowledge.agent.v2.event;

import java.time.Instant;
import java.util.UUID;

/**
 * Base class for all agent events in the V2 architecture.
 *
 * <p>Events are the fundamental communication unit between all layers of the
 * agent engine. They are immutable value objects that describe something that
 * happened (past tense) during agent execution.
 *
 * <p>Every event carries:
 * <ul>
 *   <li>{@code eventId} — globally unique event identifier</li>
 *   <li>{@code sessionId} — the agent session that produced this event</li>
 *   <li>{@code timestamp} — when the event occurred</li>
 *   <li>{@code type} — machine-readable event type for SSE serialization</li>
 * </ul>
 */
public abstract class AgentEvent {

    private final String eventId;
    private final String sessionId;
    private final Instant timestamp;

    protected AgentEvent(String sessionId) {
        this.eventId = UUID.randomUUID().toString();
        this.sessionId = sessionId;
        this.timestamp = Instant.now();
    }

    protected AgentEvent(String eventId, String sessionId, Instant timestamp) {
        this.eventId = eventId;
        this.sessionId = sessionId;
        this.timestamp = timestamp;
    }

    /**
     * Machine-readable event type used for SSE event field and routing.
     * Format: "{category}.{action}" (e.g., "think.delta", "tool.completed").
     */
    public abstract String type();

    public String getEventId() {
        return eventId;
    }

    public String getSessionId() {
        return sessionId;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    @Override
    public String toString() {
        return getClass().getSimpleName() + "{type=" + type() + ", sessionId=" + sessionId + "}";
    }
}
