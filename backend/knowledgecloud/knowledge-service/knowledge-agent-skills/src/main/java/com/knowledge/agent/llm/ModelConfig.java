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

    private Map<String, Object> extra;
}
