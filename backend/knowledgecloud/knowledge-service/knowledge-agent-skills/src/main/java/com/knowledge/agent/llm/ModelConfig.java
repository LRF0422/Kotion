package com.knowledge.agent.llm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Per-model configuration.
 * Each model under a provider has its own settings.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ModelConfig {

    private String name;

    @Builder.Default
    private int maxTokens = 4096;

    @Builder.Default
    private double temperature = 0.7;

    private String systemPrompt;

    /**
     * Whether this model accepts image input (vision / multimodal). Enable it in
     * the provider config for any model the agent may send images to; the agent
     * degrades to a text notice when a model is not vision-capable.
     */
    @Builder.Default
    private boolean vision = false;

    /**
     * Raw provider request extensions. OpenAI-compatible stream options are sent
     * only for streaming requests.
     */
    private Map<String, Object> extra;
}
