package com.knowledge.agent.v2.event;

/**
 * Thinking events — LLM inference lifecycle (start, streaming delta, end).
 */
public abstract class ThinkingEvent extends AgentEvent {

    private final int iteration;

    protected ThinkingEvent(String sessionId, int iteration) {
        super(sessionId);
        this.iteration = iteration;
    }

    public int getIteration() {
        return iteration;
    }

    /**
     * Emitted when an LLM inference iteration begins.
     */
    public static class ThinkStart extends ThinkingEvent {

        public ThinkStart(String sessionId, int iteration) {
            super(sessionId, iteration);
        }

        @Override
        public String type() {
            return "think.start";
        }
    }

    /**
     * Emitted for each LLM token/chunk as it arrives (live streaming).
     */
    public static class ThinkDelta extends ThinkingEvent {

        public enum DeltaType { TEXT, REASONING }

        private final DeltaType deltaType;
        private final String content;

        public ThinkDelta(String sessionId, int iteration, DeltaType deltaType, String content) {
            super(sessionId, iteration);
            this.deltaType = deltaType;
            this.content = content;
        }

        @Override
        public String type() {
            return "think.delta";
        }

        public DeltaType getDeltaType() {
            return deltaType;
        }

        public String getContent() {
            return content;
        }
    }

    /**
     * Emitted when an LLM inference iteration completes.
     */
    public static class ThinkEnd extends ThinkingEvent {

        private final String finishReason;
        private final int promptTokens;
        private final int completionTokens;
        private final long latencyMs;
        private final int promptCacheHitTokens;
        private final int promptCacheMissTokens;

        public ThinkEnd(String sessionId, int iteration, String finishReason,
                        int promptTokens, int completionTokens, long latencyMs) {
            this(sessionId, iteration, finishReason, promptTokens, completionTokens,
                    latencyMs, 0, 0);
        }

        public ThinkEnd(String sessionId, int iteration, String finishReason,
                        int promptTokens, int completionTokens, long latencyMs,
                        int promptCacheHitTokens, int promptCacheMissTokens) {
            super(sessionId, iteration);
            this.finishReason = finishReason;
            this.promptTokens = promptTokens;
            this.completionTokens = completionTokens;
            this.latencyMs = latencyMs;
            this.promptCacheHitTokens = promptCacheHitTokens;
            this.promptCacheMissTokens = promptCacheMissTokens;
        }

        @Override
        public String type() {
            return "think.end";
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

        public long getLatencyMs() {
            return latencyMs;
        }

        public int getPromptCacheHitTokens() {
            return promptCacheHitTokens;
        }

        public int getPromptCacheMissTokens() {
            return promptCacheMissTokens;
        }
    }
}
