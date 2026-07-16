package com.knowledge.agent.v2.orchestrator;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Execution plan for multi-agent orchestration.
 *
 * <p>Represents a DAG (Directed Acyclic Graph) of agent tasks where:
 * <ul>
 *   <li>Each node is an {@link AgentTask} to be executed by a sub-agent</li>
 *   <li>Edges represent dependencies between tasks</li>
 *   <li>Tasks with no dependencies can execute in parallel</li>
 * </ul>
 *
 * <p>This replaces V1's PARALLEL/SEQUENTIAL/HYBRID strategy enum with
 * a unified graph model that naturally supports all patterns.
 */
public class ExecutionPlan {

    private final String planId;
    private final List<AgentTask> tasks;
    private final Map<String, Set<String>> dependencies;  // taskId → depends-on-taskIds
    private final SynthesisStrategy synthesisStrategy;

    public ExecutionPlan(String planId, List<AgentTask> tasks,
                         Map<String, Set<String>> dependencies,
                         SynthesisStrategy synthesisStrategy) {
        this.planId = planId;
        this.tasks = tasks;
        this.dependencies = dependencies;
        this.synthesisStrategy = synthesisStrategy != null
                ? synthesisStrategy : SynthesisStrategy.LLM_MERGE;
    }

    public String getPlanId() { return planId; }
    public List<AgentTask> getTasks() { return tasks; }
    public Map<String, Set<String>> getDependencies() { return dependencies; }
    public SynthesisStrategy getSynthesisStrategy() { return synthesisStrategy; }

    /**
     * Get tasks that have no dependencies (ready to execute immediately).
     */
    public List<AgentTask> getRootTasks() {
        return tasks.stream()
                .filter(task -> {
                    Set<String> deps = dependencies.get(task.getTaskId());
                    return deps == null || deps.isEmpty();
                })
                .collect(java.util.stream.Collectors.toList());
    }

    /**
     * Get tasks that depend on the given completed task.
     */
    public List<AgentTask> getDependentsOf(String completedTaskId) {
        return tasks.stream()
                .filter(task -> {
                    Set<String> deps = dependencies.get(task.getTaskId());
                    return deps != null && deps.contains(completedTaskId);
                })
                .collect(java.util.stream.Collectors.toList());
    }

    /**
     * Check if all dependencies for a task are satisfied.
     */
    public boolean isReady(String taskId, Set<String> completedTasks) {
        Set<String> deps = dependencies.get(taskId);
        if (deps == null || deps.isEmpty()) return true;
        return completedTasks.containsAll(deps);
    }

    /**
     * Strategy for merging results from multiple sub-agents.
     */
    public enum SynthesisStrategy {
        /** Use LLM to synthesize/merge results intelligently */
        LLM_MERGE,
        /** Simple concatenation of results */
        CONCATENATE,
        /** Use the result from the last task in topological order */
        LAST_RESULT,
        /** Custom function-based merge */
        CUSTOM
    }
}
