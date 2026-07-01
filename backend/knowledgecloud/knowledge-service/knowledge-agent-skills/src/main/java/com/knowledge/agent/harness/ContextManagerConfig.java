package com.knowledge.agent.harness;

import com.knowledge.agent.llm.LlmClientFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Stateless Spring bean that holds configuration values for {@link ContextManager}.
 *
 * <p>
 * Extracted from {@code ContextManager} so that {@code ContextManager} itself can be
 * a plain per-request class. This bean is a singleton — it holds only immutable
 * config values (read from {@code application.yml}) plus a lazily-injected
 * {@link LlmClientFactory} reference (set once at startup via
 * {@link #setLlmClientFactory(LlmClientFactory)} to avoid circular-dependency
 * issues).
 *
 * <p>
 * Each per-request {@code ContextManager} instance receives this config and
 * reads the values it needs.
 */
@Component
public class ContextManagerConfig {

    @Value("${agent.context.max-tokens:32768}")
    private int maxTokens;

    @Value("${agent.context.compression-threshold:0.75}")
    private double compressionThreshold;

    @Value("${agent.context.strategy:truncate}")
    private String strategy;

    /**
     * The LLM client factory used by the summarize strategy.
     * Injected lazily to avoid circular dependency issues.
     */
    private volatile LlmClientFactory llmClientFactory;

    /**
     * Set the LLM client factory for the summarize strategy.
     * Called by the framework after construction to avoid circular deps.
     */
    public void setLlmClientFactory(LlmClientFactory factory) {
        this.llmClientFactory = factory;
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public double getCompressionThreshold() {
        return compressionThreshold;
    }

    public String getStrategy() {
        return strategy;
    }

    public LlmClientFactory getLlmClientFactory() {
        return llmClientFactory;
    }
}
