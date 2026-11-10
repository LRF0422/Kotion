package com.knowledge.agent.llm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
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

    /**
     * Additional ids clients may use for this model. The model is still sent to
     * the provider under {@link #name}, so a deployment can keep the ids the app
     * already sends ({@code deepseek-chat}, a {@code default-model} value, an old
     * client preference) while the vendor only serves its own id
     * ({@code deepseek-v3}, {@code DeepSeek-V3}, ...). A request that uses an
     * alias is mapped to {@link #name} before the provider call, which also
     * avoids the vendor's {@code 404 model_not_found}.
     */
    @Builder.Default
    private List<String> aliases = new ArrayList<>();

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
