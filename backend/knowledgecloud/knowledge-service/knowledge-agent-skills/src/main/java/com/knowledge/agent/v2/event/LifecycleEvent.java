package com.knowledge.agent.v2.event;

/**
 * Lifecycle events — session creation, completion, and failure.
 */
public abstract class LifecycleEvent extends AgentEvent {

    protected LifecycleEvent(String sessionId) {
        super(sessionId);
    }

    /**
     * Emitted when a new agent session is created and ready to execute.
     */
    public static class SessionCreated extends LifecycleEvent {
        private final String conversationId;
        private final String traceId;

        public SessionCreated(String sessionId, String conversationId, String traceId) {
            super(sessionId);
            this.conversationId = conversationId;
            this.traceId = traceId;
        }

        @Override
        public String type() {
            return "session.created";
        }

        public String getConversationId() {
            return conversationId;
        }

        public String getTraceId() {
            return traceId;
        }
    }

    /**
     * Emitted when a session completes successfully.
     */
    public static class SessionCompleted extends LifecycleEvent {
        private final String finishReason;
        private final int promptTokens;
        private final int completionTokens;
        private final long durationMs;
        private final int promptCacheHitTokens;
        private final int promptCacheMissTokens;

        public SessionCompleted(String sessionId, String finishReason,
                                int promptTokens, int completionTokens, long durationMs) {
            this(sessionId, finishReason, promptTokens, completionTokens, durationMs, 0, 0);
        }

        public SessionCompleted(String sessionId, String finishReason,
                                int promptTokens, int completionTokens, long durationMs,
                                int promptCacheHitTokens, int promptCacheMissTokens) {
            super(sessionId);
            this.finishReason = finishReason;
            this.promptTokens = promptTokens;
            this.completionTokens = completionTokens;
            this.durationMs = durationMs;
            this.promptCacheHitTokens = promptCacheHitTokens;
            this.promptCacheMissTokens = promptCacheMissTokens;
        }

        @Override
        public String type() {
            return "session.completed";
        }

        public String getFinishReason() {
            return finishReason;
        }

        public int getPromptTokens() {
            return promptTokens;
        }

        public int getCompletionTokens() {
            return completionTokens;
        }

        public long getDurationMs() {
            return durationMs;
        }

        public int getPromptCacheHitTokens() {
            return promptCacheHitTokens;
        }

        public int getPromptCacheMissTokens() {
            return promptCacheMissTokens;
        }
    }

    /**
     * Emitted when a session fails with an unrecoverable error.
     */
    public static class SessionFailed extends LifecycleEvent {
        private final String errorCode;
        private final String errorMessage;
        private final boolean retriable;

        public SessionFailed(String sessionId, String errorCode, String errorMessage, boolean retriable) {
            super(sessionId);
            this.errorCode = errorCode;
            this.errorMessage = errorMessage;
            this.retriable = retriable;
        }

        @Override
        public String type() {
            return "session.failed";
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
    }
}
