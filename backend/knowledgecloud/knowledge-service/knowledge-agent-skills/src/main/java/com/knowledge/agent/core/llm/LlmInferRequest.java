package com.knowledge.agent.core.llm;

import com.knowledge.agent.api.dto.ChatMessage;
import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * One LLM inference request in the AgentCore loop.
 */
@Data
@Builder
public class LlmInferRequest {

    private String model;

    private List<ChatMessage> messages;

    /** Tool definitions in OpenAI-compatible JSON (null = no tools). */
    private String toolsJson;

    /** auto | none | required | specific function name. */
    @Builder.Default
    private String toolChoice = "auto";

    @Builder.Default
    private double temperature = 0.7;

    @Builder.Default
    private int maxTokens = 4096;
}
