package com.knowledge.agent.v2.llm;

import java.util.List;

/**
 * Complete LLM inference response (non-streaming).
 *
 * <p>Produced by {@link LlmAdapter#infer(InferenceRequest)} for planning
 * and orchestration scenarios where streaming is not needed.
 */
public class InferenceResponse {

    private final String content;
    private final String reasoningContent;
    private final List<ToolCallData> toolCalls;
    private final String finishReason;
    private final int promptTokens;
    private final int completionTokens;

    private InferenceResponse(Builder builder) {
        this.content = builder.content;
        this.reasoningContent = builder.reasoningContent;
        this.toolCalls = builder.toolCalls;
        this.finishReason = builder.finishReason != null ? builder.finishReason : "stop";
        this.promptTokens = builder.promptTokens;
        this.completionTokens = builder.completionTokens;
    }

    public String getContent() { return content; }
    public String getReasoningContent() { return reasoningContent; }
    public List<ToolCallData> getToolCalls() { return toolCalls; }
    public String getFinishReason() { return finishReason; }
    public int getPromptTokens() { return promptTokens; }
    public int getCompletionTokens() { return completionTokens; }

    public boolean hasToolCalls() {
        return toolCalls != null && !toolCalls.isEmpty();
    }

    public static Builder builder() { return new Builder(); }

    /**
     * Represents a single tool call from the LLM.
     */
    public static class ToolCallData {
        private final String id;
        private final String name;
        private final String arguments;

        public ToolCallData(String id, String name, String arguments) {
            this.id = id;
            this.name = name;
            this.arguments = arguments;
        }

        public String getId() { return id; }
        public String getName() { return name; }
        public String getArguments() { return arguments; }
    }

    public static class Builder {
        private String content;
        private String reasoningContent;
        private List<ToolCallData> toolCalls;
        private String finishReason;
        private int promptTokens;
        private int completionTokens;

        public Builder content(String content) { this.content = content; return this; }
        public Builder reasoningContent(String reasoningContent) { this.reasoningContent = reasoningContent; return this; }
        public Builder toolCalls(List<ToolCallData> toolCalls) { this.toolCalls = toolCalls; return this; }
        public Builder finishReason(String finishReason) { this.finishReason = finishReason; return this; }
        public Builder promptTokens(int promptTokens) { this.promptTokens = promptTokens; return this; }
        public Builder completionTokens(int completionTokens) { this.completionTokens = completionTokens; return this; }

        public InferenceResponse build() { return new InferenceResponse(this); }
    }
}
