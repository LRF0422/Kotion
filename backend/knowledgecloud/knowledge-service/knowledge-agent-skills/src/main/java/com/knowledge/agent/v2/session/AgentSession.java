package com.knowledge.agent.v2.session;

import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.v2.engine.AgentState;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Immutable agent session — the complete context for one agent execution.
 *
 * <p>The session is the primary data carrier through the entire engine pipeline.
 * It is structurally immutable (fields are final) with the exception of
 * {@link ExecutionState}, which encapsulates all mutable state behind
 * thread-safe operations.
 *
 * <p>Design principles:
 * <ul>
 *   <li><b>Immutable shell</b>: identity, config, and tool set are fixed at creation</li>
 *   <li><b>Mutable core</b>: only {@code execution} changes during the session lifecycle</li>
 *   <li><b>Thread-safe</b>: all mutable operations go through atomic/synchronized primitives</li>
 *   <li><b>Serializable</b>: can be snapshotted for crash recovery</li>
 * </ul>
 *
 * <p>Replaces V1's {@code ToolContext} + {@code LoopState} + scattered mutable fields.
 */
public class AgentSession {

    // ---- Identity (immutable) ----
    private final String sessionId;
    private final String conversationId;
    private final String traceId;
    private final AgentIdentity identity;
    private final AgentMode mode;

    // ---- Configuration (immutable snapshot) ----
    private final int maxIterations;
    private final String modelName;
    private final String systemPrompt;
    private final Set<String> toolIds;
    /** Frontend tools sent from the client (OpenAI-compatible definitions). */
    private final List<ChatTool> frontendTools;

    // ---- Mutable execution state ----
    private final ExecutionState execution;

    // ---- Metadata ----
    private final Map<String, Object> metadata;

    private AgentSession(Builder builder) {
        this.sessionId = builder.sessionId != null ? builder.sessionId : UUID.randomUUID().toString();
        this.conversationId = builder.conversationId;
        this.traceId = builder.traceId != null ? builder.traceId : UUID.randomUUID().toString();
        this.identity = builder.identity;
        this.mode = builder.mode != null ? builder.mode : AgentMode.EXECUTE;
        this.maxIterations = builder.maxIterations > 0 ? builder.maxIterations : 20;
        this.modelName = builder.modelName;
        this.systemPrompt = builder.systemPrompt;
        this.toolIds = builder.toolIds != null
                ? Collections.unmodifiableSet(builder.toolIds)
                : Collections.emptySet();
        this.frontendTools = builder.frontendTools != null
                ? Collections.unmodifiableList(builder.frontendTools)
                : Collections.emptyList();
        this.execution = builder.execution != null ? builder.execution : new ExecutionState();
        this.metadata = builder.metadata != null
                ? Collections.unmodifiableMap(builder.metadata)
                : Collections.emptyMap();
    }

    // ---- Getters ----

    public String getSessionId() {
        return sessionId;
    }

    public String getConversationId() {
        return conversationId;
    }

    public String getTraceId() {
        return traceId;
    }

    public AgentIdentity getIdentity() {
        return identity;
    }

    public AgentMode getMode() {
        return mode;
    }

    public int getMaxIterations() {
        return maxIterations;
    }

    public String getModelName() {
        return modelName;
    }

    public String getSystemPrompt() {
        return systemPrompt;
    }

    public Set<String> getToolIds() {
        return toolIds;
    }

    public List<ChatTool> getFrontendTools() {
        return frontendTools;
    }

    public ExecutionState getExecution() {
        return execution;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    // ---- Convenience ----

    public boolean isPlanMode() {
        return mode == AgentMode.PLAN;
    }

    public boolean hasReachedMaxIterations() {
        return execution.getIteration() >= maxIterations;
    }

    public AgentState getCurrentState() {
        return execution.getCurrentState();
    }

    // ---- Builder ----

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String sessionId;
        private String conversationId;
        private String traceId;
        private AgentIdentity identity;
        private AgentMode mode;
        private int maxIterations;
        private String modelName;
        private String systemPrompt;
        private Set<String> toolIds;
        private List<ChatTool> frontendTools;
        private ExecutionState execution;
        private Map<String, Object> metadata;

        public Builder sessionId(String sessionId) {
            this.sessionId = sessionId;
            return this;
        }

        public Builder conversationId(String conversationId) {
            this.conversationId = conversationId;
            return this;
        }

        public Builder traceId(String traceId) {
            this.traceId = traceId;
            return this;
        }

        public Builder identity(AgentIdentity identity) {
            this.identity = identity;
            return this;
        }

        public Builder mode(AgentMode mode) {
            this.mode = mode;
            return this;
        }

        public Builder maxIterations(int maxIterations) {
            this.maxIterations = maxIterations;
            return this;
        }

        public Builder modelName(String modelName) {
            this.modelName = modelName;
            return this;
        }

        public Builder systemPrompt(String systemPrompt) {
            this.systemPrompt = systemPrompt;
            return this;
        }

        public Builder toolIds(Set<String> toolIds) {
            this.toolIds = toolIds;
            return this;
        }

        public Builder frontendTools(List<ChatTool> frontendTools) {
            this.frontendTools = frontendTools;
            return this;
        }

        public Builder execution(ExecutionState execution) {
            this.execution = execution;
            return this;
        }

        public Builder metadata(Map<String, Object> metadata) {
            this.metadata = metadata;
            return this;
        }

        public AgentSession build() {
            return new AgentSession(this);
        }
    }
}
