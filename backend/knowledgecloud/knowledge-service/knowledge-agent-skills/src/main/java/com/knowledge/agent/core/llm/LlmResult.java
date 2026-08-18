package com.knowledge.agent.core.llm;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * Complete result of one inference (after streaming finished).
 */
@Data
public class LlmResult {

    private String finishReason = "stop";

    private long promptTokens;

    private long completionTokens;

    /**
     * Prompt tokens served from the provider's context cache (subset of
     * {@link #promptTokens}) — the cache-hit signal surfaced to the client.
     */
    private long cachedPromptTokens;

    /** Accumulated visible assistant text. */
    private String text = "";

    /** Accumulated chain-of-thought reasoning (thinking mode). */
    private String reasoningText = "";

    /** Fully-accumulated tool calls (empty when the model answered directly). */
    private List<ToolCallRequest> toolCalls = new ArrayList<>();
}
