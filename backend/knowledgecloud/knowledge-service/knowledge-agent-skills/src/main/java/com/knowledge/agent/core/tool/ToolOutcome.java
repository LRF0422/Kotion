package com.knowledge.agentcore.tool;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Result of one tool execution inside a step — surfaced as
 * {@code tool.completed} and written back into the conversation.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ToolOutcome {

    private String callId;

    private String tool;

    private boolean ok;

    /** JSON-serializable result (rendered to a string for the LLM). */
    private Object result;

    private String error;

    private long durationMs;

    public static ToolOutcome success(String callId, String tool, Object result, long durationMs) {
        return new ToolOutcome(callId, tool, true, result, null, durationMs);
    }

    public static ToolOutcome failure(String callId, String tool, String error, long durationMs) {
        return new ToolOutcome(callId, tool, false, null, error, durationMs);
    }
}
