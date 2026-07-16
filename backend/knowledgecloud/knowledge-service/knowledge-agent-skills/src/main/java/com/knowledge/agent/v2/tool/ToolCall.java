package com.knowledge.agent.v2.tool;

import com.knowledge.agent.v2.llm.InferenceResponse;

/**
 * Represents a tool call to be dispatched by the {@link ToolRouter}.
 *
 * <p>Created from LLM response tool calls and routed to the appropriate
 * executor based on the tool's location.
 */
public class ToolCall {

    private final String id;
    private final String name;
    private final String arguments;

    public ToolCall(String id, String name, String arguments) {
        this.id = id;
        this.name = name;
        this.arguments = arguments;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getArguments() { return arguments; }

    /**
     * Convert from an LLM inference response tool call.
     */
    public static ToolCall fromInference(InferenceResponse.ToolCallData data) {
        return new ToolCall(data.getId(), data.getName(), data.getArguments());
    }

    @Override
    public String toString() {
        return "ToolCall{id='" + id + "', name='" + name + "'}";
    }
}
