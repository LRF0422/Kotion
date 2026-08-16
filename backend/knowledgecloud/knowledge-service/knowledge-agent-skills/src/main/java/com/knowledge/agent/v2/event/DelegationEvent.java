package com.knowledge.agent.v2.event;

/**
 * Delegation events — sub-agent spawning, progress, and completion.
 */
public abstract class DelegationEvent extends AgentEvent {

    private final String agentId;
    private final String parentAgentId;
    private final int depth;

    protected DelegationEvent(String sessionId, String agentId, String parentAgentId, int depth) {
        super(sessionId);
        this.agentId = agentId;
        this.parentAgentId = parentAgentId;
        this.depth = depth;
    }

    public String getAgentId() {
        return agentId;
    }

    public String getParentAgentId() {
        return parentAgentId;
    }

    public int getDepth() {
        return depth;
    }

    /**
     * Emitted when a sub-agent is spawned.
     */
    public static class SubAgentSpawned extends DelegationEvent {
        private final String taskDescription;
        private final String agentName;

        public SubAgentSpawned(String sessionId, String agentId, String parentAgentId,
                               int depth, String agentName, String taskDescription) {
            super(sessionId, agentId, parentAgentId, depth);
            this.agentName = agentName;
            this.taskDescription = taskDescription;
        }

        @Override
        public String type() {
            return "agent.spawned";
        }

        public String getTaskDescription() {
            return taskDescription;
        }

        public String getAgentName() {
            return agentName;
        }
    }

    /**
     * Emitted for incremental sub-agent progress.
     */
    public static class SubAgentProgress extends DelegationEvent {
        private final int iteration;
        private final String status;

        public SubAgentProgress(String sessionId, String agentId, String parentAgentId,
                                int depth, int iteration, String status) {
            super(sessionId, agentId, parentAgentId, depth);
            this.iteration = iteration;
            this.status = status;
        }

        @Override
        public String type() {
            return "agent.progress";
        }

        public int getIteration() {
            return iteration;
        }

        public String getStatus() {
            return status;
        }
    }

    /**
     * Emitted for each streamed text delta of a sub-agent, so the frontend
     * can render live per-node output instead of waiting for completion.
     */
    public static class SubAgentOutput extends DelegationEvent {
        private final String content;

        public SubAgentOutput(String sessionId, String agentId, String parentAgentId,
                              int depth, String content) {
            super(sessionId, agentId, parentAgentId, depth);
            this.content = content;
        }

        @Override
        public String type() {
            return "agent.output";
        }

        public String getContent() {
            return content;
        }
    }

    /**
     * Emitted for each streamed reasoning delta of a sub-agent.
     */
    public static class SubAgentReasoning extends DelegationEvent {
        private final String content;

        public SubAgentReasoning(String sessionId, String agentId, String parentAgentId,
                                 int depth, String content) {
            super(sessionId, agentId, parentAgentId, depth);
            this.content = content;
        }

        @Override
        public String type() {
            return "agent.reasoning";
        }

        public String getContent() {
            return content;
        }
    }

    /**
     * Emitted when a sub-agent dispatches a backend tool call.
     */
    public static class SubAgentToolCall extends DelegationEvent {
        private final String toolCallId;
        private final String toolName;
        private final String arguments;

        public SubAgentToolCall(String sessionId, String agentId, String parentAgentId,
                                int depth, String toolCallId, String toolName, String arguments) {
            super(sessionId, agentId, parentAgentId, depth);
            this.toolCallId = toolCallId;
            this.toolName = toolName;
            this.arguments = arguments;
        }

        @Override
        public String type() {
            return "agent.tool_call";
        }

        public String getToolCallId() {
            return toolCallId;
        }

        public String getToolName() {
            return toolName;
        }

        public String getArguments() {
            return arguments;
        }
    }

    /**
     * Emitted when a sub-agent tool call completes or fails.
     */
    public static class SubAgentToolResult extends DelegationEvent {
        private final String toolCallId;
        private final String result;
        private final String error;

        public SubAgentToolResult(String sessionId, String agentId, String parentAgentId,
                                  int depth, String toolCallId, String result, String error) {
            super(sessionId, agentId, parentAgentId, depth);
            this.toolCallId = toolCallId;
            this.result = result;
            this.error = error;
        }

        @Override
        public String type() {
            return "agent.tool_result";
        }

        public String getToolCallId() {
            return toolCallId;
        }

        public String getResult() {
            return result;
        }

        public String getError() {
            return error;
        }
    }

    /**
     * Emitted when a sub-agent completes its task.
     */
    public static class SubAgentCompleted extends DelegationEvent {
        private final String result;
        private final String error;
        private final long durationMs;
        private final boolean success;
        private final int promptTokens;
        private final int completionTokens;

        public SubAgentCompleted(String sessionId, String agentId, String parentAgentId,
                                 int depth, String result, String error, long durationMs,
                                 boolean success, int promptTokens, int completionTokens) {
            super(sessionId, agentId, parentAgentId, depth);
            this.result = result;
            this.error = error;
            this.durationMs = durationMs;
            this.success = success;
            this.promptTokens = promptTokens;
            this.completionTokens = completionTokens;
        }

        @Override
        public String type() {
            return "agent.completed";
        }

        public String getResult() {
            return result;
        }

        public String getError() {
            return error;
        }

        public long getDurationMs() {
            return durationMs;
        }

        public boolean isSuccess() {
            return success;
        }

        public int getPromptTokens() {
            return promptTokens;
        }

        public int getCompletionTokens() {
            return completionTokens;
        }
    }
}
