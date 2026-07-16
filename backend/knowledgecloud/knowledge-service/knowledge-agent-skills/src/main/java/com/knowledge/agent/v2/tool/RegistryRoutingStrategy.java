package com.knowledge.agent.v2.tool;

import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.session.AgentSession;

import java.util.Optional;

/**
 * Default routing strategy that consults V1's {@link ToolRegistry}.
 *
 * <p>A tool is classified as:
 * <ul>
 *   <li>BACKEND if it is registered and {@code isFrontend() == false}</li>
 *   <li>FRONTEND if it is registered and {@code isFrontend() == true}</li>
 *   <li>Empty (deferred) if the tool is not registered at all</li>
 * </ul>
 *
 * <p>This is the lowest-priority strategy (order=100), ensuring that more
 * specific strategies (e.g., session-scoped frontend tools from the client
 * request) are checked first.
 */
public class RegistryRoutingStrategy implements RoutingStrategy {

    private final ToolRegistry toolRegistry;

    public RegistryRoutingStrategy(ToolRegistry toolRegistry) {
        this.toolRegistry = toolRegistry;
    }

    @Override
    public Optional<ToolEvent.ToolLocation> resolve(String toolName, AgentSession session) {
        Tool tool = toolRegistry.get(toolName);
        if (tool == null) {
            return Optional.empty(); // Not in registry — defer to next strategy
        }
        return Optional.of(tool.isFrontend()
                ? ToolEvent.ToolLocation.FRONTEND
                : ToolEvent.ToolLocation.BACKEND);
    }

    @Override
    public int order() {
        return 100;
    }
}
