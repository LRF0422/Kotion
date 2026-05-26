package com.knowledge.agent.core.engine;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Wrapper event that preserves the original {@link StreamEvent} type from a
 * sub-agent while adding {@code agentId} metadata.
 *
 * <p>
 * Previously, DelegateTool flattened all sub-agent events into generic
 * {@link DataEvent}s, losing type information. This meant the
 * {@link DataStreamEncoder} could not apply correct wire-format codes
 * (e.g., {@code 0:} for text, {@code 9:} for tool calls). SubAgentEvent
 * solves this by keeping the original event intact so the encoder can
 * dispatch on its actual type.
 *
 * <p>
 * The encoder checks {@code instanceof SubAgentEvent} first and unwraps
 * the inner event for type-specific encoding, injecting {@code agentId}
 * into the payload.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SubAgentEvent extends StreamEvent {

    /**
     * The sub-agent that produced this event.
     */
    private String agentId;

    /**
     * The original event from the sub-agent's HarnessLoop.
     * Preserves the concrete type (TextEvent, ToolCallEvent, etc.) so
     * that the SSE / Data-Stream encoder can use the correct wire format.
     */
    private StreamEvent inner;

    @Override
    public String getType() {
        return "subagent";
    }

    // ---- Convenience helpers ----

    /**
     * Wrap a sub-agent event, tagging it with the agent ID.
     */
    public static SubAgentEvent of(String agentId, StreamEvent inner) {
        return SubAgentEvent.builder().agentId(agentId).inner(inner).build();
    }
}
