package com.knowledge.agent.v2.llm;

/**
 * Declares capabilities of the underlying LLM model.
 *
 * <p>Used by the engine to adapt behavior — e.g., only advertise tools
 * if the model supports function calling, enable thinking mode for
 * models that support chain-of-thought reasoning.
 */
public class ModelCapabilities {

    private final boolean supportsToolCalling;
    private final boolean supportsStreaming;
    private final boolean supportsThinkingMode;
    private final int maxContextTokens;
    private final String modelId;

    private ModelCapabilities(Builder builder) {
        this.supportsToolCalling = builder.supportsToolCalling;
        this.supportsStreaming = builder.supportsStreaming;
        this.supportsThinkingMode = builder.supportsThinkingMode;
        this.maxContextTokens = builder.maxContextTokens;
        this.modelId = builder.modelId;
    }

    public boolean isSupportsToolCalling() { return supportsToolCalling; }
    public boolean isSupportsStreaming() { return supportsStreaming; }
    public boolean isSupportsThinkingMode() { return supportsThinkingMode; }
    public int getMaxContextTokens() { return maxContextTokens; }
    public String getModelId() { return modelId; }

    public static Builder builder() { return new Builder(); }

    /**
     * Default capabilities — full feature support (safe default for OpenAI-compatible models).
     */
    public static ModelCapabilities defaultCapabilities(String modelId) {
        return builder()
                .modelId(modelId)
                .supportsToolCalling(true)
                .supportsStreaming(true)
                .supportsThinkingMode(false)
                .maxContextTokens(128000)
                .build();
    }

    public static class Builder {
        private boolean supportsToolCalling = true;
        private boolean supportsStreaming = true;
        private boolean supportsThinkingMode = false;
        private int maxContextTokens = 128000;
        private String modelId;

        public Builder supportsToolCalling(boolean val) { this.supportsToolCalling = val; return this; }
        public Builder supportsStreaming(boolean val) { this.supportsStreaming = val; return this; }
        public Builder supportsThinkingMode(boolean val) { this.supportsThinkingMode = val; return this; }
        public Builder maxContextTokens(int val) { this.maxContextTokens = val; return this; }
        public Builder modelId(String val) { this.modelId = val; return this; }

        public ModelCapabilities build() { return new ModelCapabilities(this); }
    }
}
