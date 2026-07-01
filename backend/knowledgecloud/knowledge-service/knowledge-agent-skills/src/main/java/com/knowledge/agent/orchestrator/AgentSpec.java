package com.knowledge.agent.orchestrator;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Specification for a single agent within an {@link AgentTeamPlan}.
 *
 * <p>
 * Each spec is produced by {@link OrchestratorAgent} during planning and
 * consumed by {@link TeamExecutor} to create a {@code SubAgent} with the
 * specified tools, system prompt, and dependency ordering.
 *
 * <p>
 * The {@code requiredSkillNames} are capability keywords (e.g.
 * {@code "search"}, {@code "read"}) that get resolved to concrete tool IDs
 * via {@link com.knowledge.agent.tool.ProgressiveDiscovery#resolve}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentSpec {

    /**
     * Unique agent identifier within the team (e.g. {@code "reader"},
     * {@code "writer"}).
     */
    private String agentId;

    /**
     * Human-readable name shown in SSE events (e.g. "Document Reader").
     */
    private String name;

    /**
     * Short description of the agent's responsibility.
     */
    private String description;

    /**
     * Custom system prompt for this agent. When non-null, the
     * {@code SubAgentFactory} uses this instead of the default sub-agent
     * prompt, allowing the orchestrator to give each agent a distinct
     * persona.
     */
    private String systemPrompt;

    /**
     * Capability keywords / skill names that get resolved to concrete tool
     * IDs via {@link com.knowledge.agent.tool.ProgressiveDiscovery#resolve}.
     */
    private List<String> requiredSkillNames;

    /**
     * IDs of other agents that must complete before this one starts.
     * Used for {@link OrchestrationStrategy#SEQUENTIAL} and
     * {@link OrchestrationStrategy#HYBRID} execution.
     */
    private List<String> dependencies;

    /**
     * Estimated number of LLM iterations this agent will need. Used for
     * progress estimation only; does not affect execution.
     */
    private int estimatedSteps;
}
