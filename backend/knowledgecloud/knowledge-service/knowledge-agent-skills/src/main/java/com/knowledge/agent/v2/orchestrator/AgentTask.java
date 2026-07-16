package com.knowledge.agent.v2.orchestrator;

import java.util.Collections;
import java.util.Map;
import java.util.Set;

/**
 * A single task node in the execution DAG.
 *
 * <p>Each {@code AgentTask} represents one unit of work to be performed by
 * a sub-agent. It carries all the configuration needed to spawn an isolated
 * child session:
 * <ul>
 *   <li>{@code taskId} — unique within the plan (used as dependency key)</li>
 *   <li>{@code agentName} — human-readable name for events/logging</li>
 *   <li>{@code description} — natural-language task description (becomes the user message)</li>
 *   <li>{@code modelName} — optional model override for this sub-agent</li>
 *   <li>{@code toolIds} — restricted tool set (empty = inherit parent's tools)</li>
 *   <li>{@code maxIterations} — per-task iteration cap</li>
 *   <li>{@code systemPrompt} — optional custom system prompt for the sub-agent</li>
 * </ul>
 *
 * <p>Tasks are immutable once constructed. Build via {@link #builder()}.
 */
public class AgentTask {

    private final String taskId;
    private final String agentName;
    private final String description;
    private final String modelName;
    private final Set<String> toolIds;
    private final int maxIterations;
    private final String systemPrompt;
    private final Map<String, Object> metadata;

    private AgentTask(Builder builder) {
        if (builder.taskId == null || builder.taskId.isEmpty()) {
            throw new IllegalArgumentException("taskId is required");
        }
        if (builder.description == null || builder.description.isEmpty()) {
            throw new IllegalArgumentException("description is required");
        }
        this.taskId = builder.taskId;
        this.agentName = builder.agentName != null ? builder.agentName : builder.taskId;
        this.description = builder.description;
        this.modelName = builder.modelName;
        this.toolIds = builder.toolIds != null
                ? Collections.unmodifiableSet(builder.toolIds)
                : Collections.emptySet();
        this.maxIterations = builder.maxIterations > 0 ? builder.maxIterations : 10;
        this.systemPrompt = builder.systemPrompt;
        this.metadata = builder.metadata != null
                ? Collections.unmodifiableMap(builder.metadata)
                : Collections.emptyMap();
    }

    // ---- Getters ----

    public String getTaskId() { return taskId; }
    public String getAgentName() { return agentName; }
    public String getDescription() { return description; }
    public String getModelName() { return modelName; }
    public Set<String> getToolIds() { return toolIds; }
    public int getMaxIterations() { return maxIterations; }
    public String getSystemPrompt() { return systemPrompt; }
    public Map<String, Object> getMetadata() { return metadata; }

    /**
     * Whether this task has a custom tool set (vs inheriting from parent).
     */
    public boolean hasCustomToolSet() {
        return !toolIds.isEmpty();
    }

    @Override
    public String toString() {
        return "AgentTask{id=" + taskId + ", name=" + agentName + "}";
    }

    // ---- Builder ----

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String taskId;
        private String agentName;
        private String description;
        private String modelName;
        private Set<String> toolIds;
        private int maxIterations;
        private String systemPrompt;
        private Map<String, Object> metadata;

        public Builder taskId(String taskId) { this.taskId = taskId; return this; }
        public Builder agentName(String agentName) { this.agentName = agentName; return this; }
        public Builder description(String description) { this.description = description; return this; }
        public Builder modelName(String modelName) { this.modelName = modelName; return this; }
        public Builder toolIds(Set<String> toolIds) { this.toolIds = toolIds; return this; }
        public Builder maxIterations(int maxIterations) { this.maxIterations = maxIterations; return this; }
        public Builder systemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; return this; }
        public Builder metadata(Map<String, Object> metadata) { this.metadata = metadata; return this; }

        public AgentTask build() {
            return new AgentTask(this);
        }
    }
}
