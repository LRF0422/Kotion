package com.knowledge.agent.harness;

import com.knowledge.agent.channel.AgentChannel;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.llm.LlmClientFactory;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Factory for creating {@link SubAgent} instances with proper Spring
 * dependency injection.
 *
 * <p>
 * Replaces the static {@code SubAgent.SpringContextHelper} anti-pattern.
 * SubAgents are created outside of Spring's component lifecycle (they are
 * per-delegation, short-lived objects), so they cannot use constructor
 * injection. Instead, this factory — which IS a Spring bean — injects the
 * required dependencies and passes them through the SubAgent constructor.
 */
@Component
public class SubAgentFactory {

    private final LlmClientFactory llmClientFactory;
    private final ContextManager contextManager;
    private final ToolRegistry toolRegistry;

    public SubAgentFactory(LlmClientFactory llmClientFactory,
            ContextManager contextManager,
            ToolRegistry toolRegistry) {
        this.llmClientFactory = llmClientFactory;
        this.contextManager = contextManager;
        this.toolRegistry = toolRegistry;
    }

    /**
     * Create a new SubAgent.
     *
     * @param agentId    unique sub-agent identifier
     * @param description task description for the sub-agent
     * @param toolIds    tools available to this sub-agent
     * @param channel    coordination channel (may be null)
     * @param context    tool execution context (with incremented depth)
     * @return a new SubAgent instance with all dependencies injected
     */
    public SubAgent create(String agentId,
            String description,
            Set<String> toolIds,
            AgentChannel channel,
            ToolContext context) {
        return new SubAgent(agentId, description,
                toolRegistry, toolIds, channel, context,
                llmClientFactory, contextManager);
    }

    LlmClientFactory getLlmClientFactory() {
        return llmClientFactory;
    }

    ContextManager getContextManager() {
        return contextManager;
    }
}
