package com.knowledge.agent.v2.tool;

import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.session.AgentSession;

import java.util.Optional;

/**
 * Routing strategy that classifies tools as FRONTEND if they were sent
 * in the client request's capability catalog (skills[].tools[] or tools[]).
 *
 * <p>The frontend ships tool definitions for tools it can execute locally
 * (editor operations, plugin tools, etc.). Any tool whose name appears in
 * {@code session.getFrontendTools()} is dispatched to the frontend via the
 * SUSPENDED mechanism.
 *
 * <p>Order=50 — higher priority than {@link RegistryRoutingStrategy} (order=100)
 * so that session-scoped frontend tools override the default registry lookup.
 *
 * <p>Safety: if the tool is already registered in the backend's ToolRegistry
 * as a non-frontend (backend-executable) tool, we defer to the registry
 * strategy to avoid incorrectly routing backend tools to the frontend.
 */
public class SessionFrontendRoutingStrategy implements RoutingStrategy {

    private final ToolRegistry toolRegistry;

    public SessionFrontendRoutingStrategy(ToolRegistry toolRegistry) {
        this.toolRegistry = toolRegistry;
    }

    @Override
    public Optional<ToolEvent.ToolLocation> resolve(String toolName, AgentSession session) {
        if (session.getFrontendTools() == null || session.getFrontendTools().isEmpty()) {
            return Optional.empty();
        }

        // If the tool is in the backend registry as a non-frontend tool, defer.
        // This prevents the frontend from accidentally hijacking backend tools.
        Tool registeredTool = toolRegistry.get(toolName);
        if (registeredTool != null && !registeredTool.isFrontend()) {
            return Optional.empty();
        }

        for (ChatTool tool : session.getFrontendTools()) {
            if (tool.getFunction() != null
                    && toolName.equals(tool.getFunction().getName())) {
                return Optional.of(ToolEvent.ToolLocation.FRONTEND);
            }
        }

        return Optional.empty();
    }

    @Override
    public int order() {
        return 50;
    }
}
