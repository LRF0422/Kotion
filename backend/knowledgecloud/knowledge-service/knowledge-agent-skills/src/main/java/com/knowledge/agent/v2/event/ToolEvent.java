package com.knowledge.agent.v2.event;

import java.util.Map;

/**
 * Tool events — dispatching, progress, completion, and failure of tool calls.
 */
public abstract class ToolEvent extends AgentEvent {

    private final String toolCallId;
    private final String toolName;

    protected ToolEvent(String sessionId, String toolCallId, String toolName) {
        super(sessionId);
        this.toolCallId = toolCallId;
        this.toolName = toolName;
    }

    public String getToolCallId() {
        return toolCallId;
    }

    public String getToolName() {
        return toolName;
    }

    /**
     * Emitted when a tool call is dispatched for execution.
     */
    public static class ToolDispatched extends ToolEvent {
        private final String arguments;
        private final ToolLocation location;

        public ToolDispatched(String sessionId, String toolCallId, String toolName,
                              String arguments, ToolLocation location) {
            super(sessionId, toolCallId, toolName);
            this.arguments = arguments;
            this.location = location;
        }

        @Override
        public String type() {
            return "tool.dispatched";
        }

        public String getArguments() {
            return arguments;
        }

        public ToolLocation getLocation() {
            return location;
        }
    }

    /**
     * Emitted for incremental tool execution progress.
     */
    public static class ToolProgress extends ToolEvent {
        private final double progress;  // 0.0 to 1.0
        private final String message;

        public ToolProgress(String sessionId, String toolCallId, String toolName,
                            double progress, String message) {
            super(sessionId, toolCallId, toolName);
            this.progress = progress;
            this.message = message;
        }

        @Override
        public String type() {
            return "tool.progress";
        }

        public double getProgress() {
            return progress;
        }

        public String getMessage() {
            return message;
        }
    }

    /**
     * Emitted when a tool call completes successfully.
     */
    public static class ToolCompleted extends ToolEvent {
        private final String result;
        private final long durationMs;

        public ToolCompleted(String sessionId, String toolCallId, String toolName,
                             String result, long durationMs) {
            super(sessionId, toolCallId, toolName);
            this.result = result;
            this.durationMs = durationMs;
        }

        @Override
        public String type() {
            return "tool.completed";
        }

        public String getResult() {
            return result;
        }

        public long getDurationMs() {
            return durationMs;
        }
    }

    /**
     * Emitted when a tool call fails.
     */
    public static class ToolFailed extends ToolEvent {
        private final String errorCode;
        private final String errorMessage;
        private final boolean retriable;
        private final long durationMs;

        public ToolFailed(String sessionId, String toolCallId, String toolName,
                          String errorCode, String errorMessage, boolean retriable, long durationMs) {
            super(sessionId, toolCallId, toolName);
            this.errorCode = errorCode;
            this.errorMessage = errorMessage;
            this.retriable = retriable;
            this.durationMs = durationMs;
        }

        @Override
        public String type() {
            return "tool.failed";
        }

        public String getErrorCode() {
            return errorCode;
        }

        public String getErrorMessage() {
            return errorMessage;
        }

        public boolean isRetriable() {
            return retriable;
        }

        public long getDurationMs() {
            return durationMs;
        }
    }

    /**
     * Where a tool is executed.
     */
    public enum ToolLocation {
        BACKEND,    // Server-side execution
        FRONTEND,   // Client-side execution (SSE pause)
        REMOTE,     // Remote microservice via Feign
        DYNAMIC     // Dynamically registered at runtime
    }
}
