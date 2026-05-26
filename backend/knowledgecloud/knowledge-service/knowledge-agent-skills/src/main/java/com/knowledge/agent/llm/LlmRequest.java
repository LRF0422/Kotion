package com.knowledge.agent.llm;

import com.knowledge.agent.api.dto.ChatMessage;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * LLM request DTO.
 * Carries messages, tools, model, and generation parameters.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LlmRequest {

    private String model;

    @Builder.Default
    private double temperature = 0.7;

    @Builder.Default
    private int maxTokens = 4096;

    private List<ChatMessage> messages;

    /**
     * Tool definitions in OpenAI-compatible format (serialized as JSON).
     */
    private String toolsJson;

    /**
     * Tool choice: "auto", "none", "required", or a specific function name.
     */
    @Builder.Default
    private String toolChoice = "auto";

    /**
     * Whether to stream the response.
     */
    @Builder.Default
    private boolean stream = true;
}
