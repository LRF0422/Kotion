package com.knowledge.agentcore.llm;

import lombok.Data;

/**
 * One fully-accumulated tool call produced by an inference (streaming
 * fragments merged by {@link ToolCallAccumulator}).
 */
@Data
public class ToolCallRequest {

    /** Tool call id (LLM-generated; resume idempotency key). */
    private String id;

    /** Tool/function name. */
    private String name;

    /** Arguments as a JSON object string. */
    private String arguments;

    public static ToolCallRequest of(String id, String name, String arguments) {
        ToolCallRequest call = new ToolCallRequest();
        call.setId(id);
        call.setName(name);
        call.setArguments(arguments == null ? "" : arguments);
        return call;
    }
}
