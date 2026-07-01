package com.knowledge.agent.harness;

import com.knowledge.agent.channel.AgentChannel;
import com.knowledge.agent.tool.DynamicSkillRegistry;
import com.knowledge.agent.tool.SkillCatalog;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmResilience;
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
 *
 * <p>
 * Per-request mutable objects ({@link ContextManager}, {@link SkillCatalog},
 * {@link DynamicSkillRegistry}) are created fresh for each sub-agent so that
 * concurrent delegations never share mutable state.
 */
@Component
public class SubAgentFactory {

    private final LlmClientFactory llmClientFactory;
    private final ContextManagerConfig contextManagerConfig;
    private final ToolRegistry toolRegistry;
    private final LlmResilience llmResilience;

    public SubAgentFactory(LlmClientFactory llmClientFactory,
            ContextManagerConfig contextManagerConfig,
            ToolRegistry toolRegistry,
            LlmResilience llmResilience) {
        this.llmClientFactory = llmClientFactory;
        this.contextManagerConfig = contextManagerConfig;
        this.toolRegistry = toolRegistry;
        this.llmResilience = llmResilience;
    }

    /**
     * Create a new SubAgent.
     *
     * <p>
     * Creates fresh per-request instances of {@link ContextManager},
     * {@link SkillCatalog}, and {@link DynamicSkillRegistry} and attaches
     * them to the provided {@link ToolContext} so the sub-agent (and its
     * HarnessLoop) can use them without sharing state with the parent agent
     * or other concurrent requests.
     *
     * @param agentId    unique sub-agent identifier
     * @param description task description for the sub-agent
     * @param toolIds    tools available to this sub-agent
     * @param channel    coordination channel (may be null)
     * @param context    tool execution context (with incremented depth) —
     *                   will have per-request instances set on it
     * @return a new SubAgent instance with all dependencies injected
     */
    public SubAgent create(String agentId,
            String description,
            Set<String> toolIds,
            AgentChannel channel,
            ToolContext context) {
        return create(agentId, description, toolIds, channel, context, null);
    }

    /**
     * Create a new SubAgent with an optional custom system prompt.
     *
     * <p>
     * When {@code customSystemPrompt} is non-null, the SubAgent uses it as
     * the base of its system prompt instead of the default
     * "You are a specialized sub-agent…" text. This is used by the
     * orchestrator ({@code TeamExecutor}) to give each agent a distinct
     * persona (e.g. "You are a document reader…").
     *
     * @param agentId            unique sub-agent identifier
     * @param description        task description for the sub-agent
     * @param toolIds            tools available to this sub-agent
     * @param channel            coordination channel (may be null)
     * @param context            tool execution context (with incremented depth)
     * @param customSystemPrompt custom system prompt, or null for default
     * @return a new SubAgent instance with all dependencies injected
     */
    public SubAgent create(String agentId,
            String description,
            Set<String> toolIds,
            AgentChannel channel,
            ToolContext context,
            String customSystemPrompt) {
        // Create fresh per-request instances for this sub-agent
        DynamicSkillRegistry dynamicSkillRegistry = new DynamicSkillRegistry();
        SkillCatalog skillCatalog = new SkillCatalog();
        ContextManager contextManager = new ContextManager(contextManagerConfig);

        // Attach to the context so HarnessLoop and tools can find them
        context.setSkillCatalog(skillCatalog);
        context.setDynamicSkillRegistry(dynamicSkillRegistry);
        context.setContextManager(contextManager);

        return new SubAgent(agentId, description,
                toolRegistry, toolIds, channel, context,
                llmClientFactory, llmResilience, customSystemPrompt);
    }

    LlmClientFactory getLlmClientFactory() {
        return llmClientFactory;
    }

    ContextManagerConfig getContextManagerConfig() {
        return contextManagerConfig;
    }
}
