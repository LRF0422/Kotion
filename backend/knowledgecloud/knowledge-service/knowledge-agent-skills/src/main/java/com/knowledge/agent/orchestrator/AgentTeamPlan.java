package com.knowledge.agent.orchestrator;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Collections;
import java.util.List;

/**
 * A plan produced by {@link OrchestratorAgent} describing how to decompose
 * a user task into a team of specialized agents.
 *
 * <p>
 * The plan is consumed by {@link TeamExecutor}, which creates one
 * {@code SubAgent} per {@link AgentSpec} and runs them according to the
 * {@link OrchestrationStrategy}.
 *
 * <p>
 * When {@link #isSingleAgent()} returns {@code true}, the caller
 * ({@code AgentHarness}) skips team execution and falls through to the
 * normal single-agent {@code HarnessLoop.run()} path.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentTeamPlan {

    /**
     * The agents in this team. Empty when the strategy is
     * {@link OrchestrationStrategy#SINGLE}.
     */
    private List<AgentSpec> agents;

    /**
     * How the agents should be executed.
     */
    private OrchestrationStrategy strategy;

    /**
     * Optional prompt for a final synthesis LLM call that combines the
     * outputs of all agents into a single coherent response. When
     * {@code null}, no synthesis step is performed and the raw per-agent
     * outputs are returned.
     */
    private String synthesisPrompt;

    /**
     * Returns {@code true} if this plan describes a single-agent task
     * (no delegation needed). The caller should use the normal
     * HarnessLoop path instead of invoking {@code TeamExecutor}.
     */
    public boolean isSingleAgent() {
        return strategy == OrchestrationStrategy.SINGLE
                || agents == null
                || agents.size() <= 1;
    }

    /**
     * Factory for a single-agent plan — used as the safe fallback whenever
     * orchestration is disabled, the message is too short, or the LLM
     * planning call fails.
     */
    public static AgentTeamPlan singleAgent() {
        return AgentTeamPlan.builder()
                .agents(Collections.emptyList())
                .strategy(OrchestrationStrategy.SINGLE)
                .synthesisPrompt(null)
                .build();
    }
}
