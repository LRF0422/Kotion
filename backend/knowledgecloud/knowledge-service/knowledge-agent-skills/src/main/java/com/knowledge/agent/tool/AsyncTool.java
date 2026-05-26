package com.knowledge.agent.tool;

import reactor.core.publisher.Flux;
import com.knowledge.agent.core.engine.StreamEvent;

/**
 * Async tool interface for tools that need reactive execution.
 * Extends Tool with an executeAsync method that returns a Flux of StreamEvents.
 *
 * Use this for tools that:
 * - Spawn sub-agents (e.g., DelegateTool)
 * - Need to stream intermediate progress events
 * - Perform long-running operations with real-time feedback
 *
 * The final event in the Flux MUST be a ToolResultEvent so the
 * harness loop can continue.
 */
public interface AsyncTool extends Tool {

    /**
     * Execute the tool asynchronously, returning a stream of events.
     *
     * The Flux should:
     * 1. Emit DataEvent/other events for progress/lifecycle
     * 2. End with a ToolResultEvent containing the final result
     *
     * @param context execution context with user info, session, etc.
     * @param args    JSON string of arguments from the LLM
     * @return a Flux of StreamEvent, ending with ToolResultEvent
     */
    Flux<StreamEvent> executeAsync(ToolContext context, String args);
}
