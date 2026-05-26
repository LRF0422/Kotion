package com.knowledge.agent.tool;

import reactor.core.publisher.Flux;
import com.knowledge.agent.core.engine.StreamEvent;

/**
 * Tool interface for the agent harness.
 * Each tool provides an ID, description, JSON schema, and execution method.
 */
public interface Tool {

    /**
     * Unique tool identifier (e.g., "search_documents", "read_page").
     */
    String getId();

    /**
     * Human-readable description shown to the LLM.
     */
    String getDescription();

    /**
     * JSON Schema describing the tool's parameters.
     * Must follow OpenAI function-calling format.
     */
    String getJsonSchema();

    /**
     * Execute the tool synchronously.
     *
     * @param context execution context with user info, session, etc.
     * @param args    JSON string of arguments from the LLM
     * @return the tool result
     */
    ToolResult execute(ToolContext context, String args);

    /**
     * Whether this tool requires frontend interaction (e.g., user confirmation).
     * Frontend tools cause the harness loop to stop and wait for the client
     * to return tool results in the next message.
     *
     * @return true if this tool requires frontend interaction
     */
    default boolean isFrontend() {
        return false;
    }
}
