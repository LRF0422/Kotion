package com.knowledge.agent.llm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * LLM response DTO.
 * Contains the model's text output and/or tool calls.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LlmResponse {

    /**
     * Text content from the model.
     */
    private String content;

    /**
     * Chain-of-thought reasoning content from thinking mode.
     * DeepSeek requires this to be passed back in subsequent requests when
     * tool_calls are involved.
     */
    private String reasoningContent;

    /**
     * Tool calls requested by the model.
     */
    private List<ToolCall> toolCalls;

    /**
     * Token usage statistics.
     */
    private Usage usage;

    /**
     * Finish reason: "stop", "tool_calls", "length", etc.
     */
    private String finishReason;

    /**
     * A tool call from the LLM response.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ToolCall {
        private String id;
        private String name;
        private String arguments;
    }

    /**
     * Token usage statistics.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Usage {
        @Builder.Default
        private int promptTokens = 0;
        @Builder.Default
        private int completionTokens = 0;
        @Builder.Default
        private int totalTokens = 0;
        /**
         * Prompt tokens served from the provider's context cache (DeepSeek
         * reports these as {@code prompt_cache_hit_tokens}). High values mean
         * the request prefix was stable — the key cost-saving signal.
         */
        @Builder.Default
        private int promptCacheHitTokens = 0;
        @Builder.Default
        private int promptCacheMissTokens = 0;
    }

    /**
     * Returns true if the response contains tool calls.
     */
    public boolean hasToolCalls() {
        return toolCalls != null && !toolCalls.isEmpty();
    }
}
