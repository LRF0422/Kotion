package com.knowledge.agent.v2.tool;

import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.session.AgentSession;

import java.util.Optional;

/**
 * Strategy for resolving a tool's execution location.
 *
 * <p>The {@link ToolRouter} consults a chain of routing strategies to
 * determine where each tool should be executed. Strategies are ordered
 * by priority — the first strategy that returns a non-empty result wins.
 *
 * <p>This replaces V1's hardcoded {@code isFrontendCall()} logic with
 * a pluggable chain of rules.
 */
public interface RoutingStrategy {

    /**
     * Attempt to resolve the execution location for a tool.
     *
     * @param toolName the tool name as called by the LLM
     * @param session  the current agent session (for context-based routing)
     * @return the location if this strategy can resolve it, or empty to defer
     */
    Optional<ToolEvent.ToolLocation> resolve(String toolName, AgentSession session);

    /**
     * Strategy priority — lower numbers are checked first.
     */
    int order();
}
