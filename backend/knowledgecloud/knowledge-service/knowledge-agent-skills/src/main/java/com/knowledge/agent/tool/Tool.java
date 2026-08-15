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

    /**
     * Whether this tool is read-only (no side effects). Read-only tools remain
     * available in PLAN mode; mutating tools are hard-gated by the engine when
     * the session runs in {@code AgentMode.PLAN}.
     *
     * @return true when the tool never mutates external state
     */
    default boolean isReadOnly() {
        return false;
    }

    /**
     * Optional per-tool timeout override in seconds. When non-null, the
     * executor uses this instead of the global {@code agent.tool.timeout-seconds}.
     * Long-running tools (e.g. {@code delegate_task}, which runs a full
     * sub-agent loop) override this to avoid being killed by the default.
     *
     * @return timeout in seconds, or null to use the configured default
     */
    default Integer getTimeoutOverrideSeconds() {
        return null;
    }
}
