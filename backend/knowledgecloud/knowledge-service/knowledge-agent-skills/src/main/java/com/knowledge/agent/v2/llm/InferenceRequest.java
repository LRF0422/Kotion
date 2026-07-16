package com.knowledge.agent.v2.llm;

import com.knowledge.agent.v2.session.ConversationMessage;

import java.util.List;

/**
 * Request DTO for LLM inference in V2 engine.
 *
 * <p>Encapsulates all information needed for an LLM call. Immutable — build
 * via the static {@link #builder()} method.
 */
public class InferenceRequest {

    private final String model;
    private final List<ConversationMessage> messages;
    private final String toolsJson;
    private final String toolChoice;
    private final double temperature;
    private final int maxTokens;
    private final boolean stream;

    private InferenceRequest(Builder builder) {
        this.model = builder.model;
        this.messages = builder.messages;
        this.toolsJson = builder.toolsJson;
        this.toolChoice = builder.toolChoice != null ? builder.toolChoice : "auto";
        this.temperature = builder.temperature;
        this.maxTokens = builder.maxTokens > 0 ? builder.maxTokens : 4096;
        this.stream = builder.stream;
    }

    public String getModel() { return model; }
    public List<ConversationMessage> getMessages() { return messages; }
    public String getToolsJson() { return toolsJson; }
    public String getToolChoice() { return toolChoice; }
    public double getTemperature() { return temperature; }
    public int getMaxTokens() { return maxTokens; }
    public boolean isStream() { return stream; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String model;
        private List<ConversationMessage> messages;
        private String toolsJson;
        private String toolChoice;
        private double temperature = 0.7;
        private int maxTokens = 4096;
        private boolean stream = true;

        public Builder model(String model) { this.model = model; return this; }
        public Builder messages(List<ConversationMessage> messages) { this.messages = messages; return this; }
        public Builder toolsJson(String toolsJson) { this.toolsJson = toolsJson; return this; }
        public Builder toolChoice(String toolChoice) { this.toolChoice = toolChoice; return this; }
        public Builder temperature(double temperature) { this.temperature = temperature; return this; }
        public Builder maxTokens(int maxTokens) { this.maxTokens = maxTokens; return this; }
        public Builder stream(boolean stream) { this.stream = stream; return this; }

        public InferenceRequest build() { return new InferenceRequest(this); }
    }
}
