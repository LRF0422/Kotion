package com.knowledge.agent.orchestrator;

/**
 * Execution strategy for a team of agents.
 *
 * <ul>
 * <li>{@link #SINGLE} — Single agent, no delegation. The orchestrator
 *     falls back to this when the task is simple enough for the root
 *     HarnessLoop to handle alone.</li>
 * <li>{@link #PARALLEL} — All agents run concurrently via
 *     {@code Flux.flatMap} with a bounded concurrency limit.</li>
 * <li>{@link #SEQUENTIAL} — Agents run one after another in dependency
 *     order via {@code Flux.concat}.</li>
 * <li>{@link #HYBRID} — Mix of parallel and sequential: independent
 *     groups run in parallel, but groups with dependencies run
 *     sequentially after their dependencies complete.</li>
 * </ul>
 */
public enum OrchestrationStrategy {
    SINGLE,
    PARALLEL,
    SEQUENTIAL,
    HYBRID
}
