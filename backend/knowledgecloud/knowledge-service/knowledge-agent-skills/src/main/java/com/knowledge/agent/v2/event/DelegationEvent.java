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
     * Emitted when a sub-agent completes its task.
     */
    public static class SubAgentCompleted extends DelegationEvent {
        private final String result;
        private final long durationMs;
        private final boolean success;

        public SubAgentCompleted(String sessionId, String agentId, String parentAgentId,
                                 int depth, String result, long durationMs, boolean success) {
            super(sessionId, agentId, parentAgentId, depth);
            this.result = result;
            this.durationMs = durationMs;
            this.success = success;
        }

        @Override
        public String type() {
            return "agent.completed";
        }

        public String getResult() {
            return result;
        }

        public long getDurationMs() {
            return durationMs;
        }

        public boolean isSuccess() {
            return success;
        }
    }
}
