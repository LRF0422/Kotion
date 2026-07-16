package com.knowledge.agent.v2.llm;

/**
 * A single chunk from a streaming LLM response.
 *
 * <p>Each chunk may contain:
 * <ul>
 *   <li>Text delta (incremental content)</li>
 *   <li>Reasoning delta (chain-of-thought)</li>
 *   <li>Tool call fragment (incremental tool call data)</li>
 *   <li>Finish signal (stream complete)</li>
 * </ul>
 *
 * <p>Chunks are emitted by {@link LlmAdapter#streamInfer(InferenceRequest)}
 * and consumed by the ThinkHandler to forward live deltas to the event stream.
 */
public class LlmChunk {

    public enum ChunkType {
        TEXT_DELTA,
        REASONING_DELTA,
        TOOL_CALL_DELTA,
        FINISH
    }

    private final ChunkType type;
    private final String textDelta;
    private final String reasoningDelta;
    private final ToolCallDelta toolCallDelta;
    private final String finishReason;
    private final int promptTokens;
    private final int completionTokens;

    private LlmChunk(Builder builder) {
        this.type = builder.type;
        this.textDelta = builder.textDelta;
        this.reasoningDelta = builder.reasoningDelta;
        this.toolCallDelta = builder.toolCallDelta;
        this.finishReason = builder.finishReason;
        this.promptTokens = builder.promptTokens;
        this.completionTokens = builder.completionTokens;
    }

    public ChunkType getType() { return type; }
    public String getTextDelta() { return textDelta; }
    public String getReasoningDelta() { return reasoningDelta; }
    public ToolCallDelta getToolCallDelta() { return toolCallDelta; }
    public String getFinishReason() { return finishReason; }
    public int getPromptTokens() { return promptTokens; }
    public int getCompletionTokens() { return completionTokens; }

    public boolean isFinish() { return type == ChunkType.FINISH; }

    /**
     * Incremental tool call data from the LLM stream.
     */
    public static class ToolCallDelta {
        private final int index;
        private final String id;
        private final String name;
        private final String argumentsDelta;

        public ToolCallDelta(int index, String id, String name, String argumentsDelta) {
            this.index = index;
            this.id = id;
            this.name = name;
            this.argumentsDelta = argumentsDelta;
        }

        public int getIndex() { return index; }
        public String getId() { return id; }
        public String getName() { return name; }
        public String getArgumentsDelta() { return argumentsDelta; }
    }

    // ---- Factory methods ----

    public static LlmChunk textDelta(String content) {
        return new Builder().type(ChunkType.TEXT_DELTA).textDelta(content).build();
    }

    public static LlmChunk reasoningDelta(String content) {
        return new Builder().type(ChunkType.REASONING_DELTA).reasoningDelta(content).build();
    }

    public static LlmChunk toolCallDelta(int index, String id, String name, String argsDelta) {
        return new Builder().type(ChunkType.TOOL_CALL_DELTA)
                .toolCallDelta(new ToolCallDelta(index, id, name, argsDelta)).build();
    }

    public static LlmChunk finish(String reason, int promptTokens, int completionTokens) {
        return new Builder().type(ChunkType.FINISH).finishReason(reason)
                .promptTokens(promptTokens).completionTokens(completionTokens).build();
    }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private ChunkType type;
        private String textDelta;
        private String reasoningDelta;
        private ToolCallDelta toolCallDelta;
        private String finishReason;
        private int promptTokens;
        private int completionTokens;

        public Builder type(ChunkType type) { this.type = type; return this; }
        public Builder textDelta(String textDelta) { this.textDelta = textDelta; return this; }
        public Builder reasoningDelta(String reasoningDelta) { this.reasoningDelta = reasoningDelta; return this; }
        public Builder toolCallDelta(ToolCallDelta toolCallDelta) { this.toolCallDelta = toolCallDelta; return this; }
        public Builder finishReason(String finishReason) { this.finishReason = finishReason; return this; }
        public Builder promptTokens(int promptTokens) { this.promptTokens = promptTokens; return this; }
        public Builder completionTokens(int completionTokens) { this.completionTokens = completionTokens; return this; }

        public LlmChunk build() { return new LlmChunk(this); }
    }
}
