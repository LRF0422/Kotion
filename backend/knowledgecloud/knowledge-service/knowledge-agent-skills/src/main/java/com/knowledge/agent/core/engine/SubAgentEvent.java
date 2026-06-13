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
     * The id of the agent that spawned this sub-agent. {@code null} means the
     * root agent (top-level delegate). Lets the frontend build a sub-agent tree
     * and support nested delegation (depth &gt; 1).
     */
    private String parentAgentId;

    /**
     * Delegation depth of the producing sub-agent (root spawn = 1).
     */
    private int depth;

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
     * Wrap a sub-agent event, tagging it with the agent ID only (root parent).
     */
    public static SubAgentEvent of(String agentId, StreamEvent inner) {
        return SubAgentEvent.builder().agentId(agentId).inner(inner).build();
    }

    /**
     * Wrap a sub-agent event with full identity (agent id, parent id, depth).
     */
    public static SubAgentEvent of(String agentId, String parentAgentId, int depth, StreamEvent inner) {
        return SubAgentEvent.builder()
                .agentId(agentId)
                .parentAgentId(parentAgentId)
                .depth(depth)
                .inner(inner)
                .build();
    }
}
