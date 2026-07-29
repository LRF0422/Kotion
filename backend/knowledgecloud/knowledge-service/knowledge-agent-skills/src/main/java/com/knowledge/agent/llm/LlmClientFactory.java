package com.knowledge.agent.llm;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.*;

/**
 * Factory for creating LLM clients from YAML configuration.
 * Reads the agent.providers.* config and creates LlmClient instances.
 */
@Slf4j
@Component
@ConfigurationProperties(prefix = "agent")
public class LlmClientFactory {

    private Map<String, ProviderConfig> providers = new LinkedHashMap<>();
    private String defaultProvider = "deepseek";
    private String defaultModel = "deepseek-chat";

    // Cache of created clients keyed by provider name
    private final Map<String, LlmClient> clientCache = new LinkedHashMap<>();

    @PostConstruct
    public void init() {
        for (Map.Entry<String, ProviderConfig> entry : providers.entrySet()) {
            String providerName = entry.getKey();
            ProviderConfig config = entry.getValue();
            LlmClient client = createClient(providerName, config);
            clientCache.put(providerName, client);
            log.info("Initialized LLM client for provider: {} (models: {})",
                    providerName, config.getModelNames());
        }
    }

    private LlmClient createClient(String providerName, ProviderConfig config) {
        return new OpenAiCompatibleClient(providerName, config);
    }

    /**
     * Get the default LLM client.
     */
    public LlmClient getClient() {
        return getClient(defaultProvider);
    }

    /**
     * Get an LLM client by provider name.
     */
    public LlmClient getClient(String providerName) {
        LlmClient client = clientCache.get(providerName);
        if (client == null) {
            throw new IllegalArgumentException("No LLM client found for provider: " + providerName);
        }
        return client;
    }

    /**
     * Get an LLM client that supports the given model.
     * Checks all providers for a matching model name.
     */
    public LlmClient getClientForModel(String modelName) {
        if (modelName == null || modelName.isEmpty()) {
            return getClient();
        }
        // Check "provider/model" format
        if (modelName.contains("/")) {
            String[] parts = modelName.split("/", 2);
            return getClient(parts[0]);
        }
        // Search all providers for matching model
        for (Map.Entry<String, LlmClient> entry : clientCache.entrySet()) {
            if (entry.getValue().getAvailableModels().contains(modelName)) {
                return entry.getValue();
            }
        }
        // Fallback to default
        return getClient();
    }

    /**
     * Get all available providers.
     */
    public List<String> getAvailableProviders() {
        return new ArrayList<>(clientCache.keySet());
    }

    /**
     * Get all models grouped by provider.
     */
    public Map<String, List<String>> getAllModels() {
        Map<String, List<String>> result = new LinkedHashMap<>();
        for (Map.Entry<String, LlmClient> entry : clientCache.entrySet()) {
            result.put(entry.getKey(), entry.getValue().getAvailableModels());
        }
        return result;
    }

    // ---- Getters/Setters for ConfigurationProperties ----

    public Map<String, ProviderConfig> getProviders() {
        return providers;
    }

    public void setProviders(Map<String, ProviderConfig> providers) {
        this.providers = providers;
    }

    public String getDefaultProvider() {
        return defaultProvider;
    }

    public void setDefaultProvider(String defaultProvider) {
        this.defaultProvider = defaultProvider;
    }

    public String getDefaultModel() {
        return defaultModel;
    }

    public void setDefaultModel(String defaultModel) {
        this.defaultModel = defaultModel;
    }

    /**
     * Provider configuration from YAML.
     */
    @Data
    public static class ProviderConfig {
        private String baseUrl;
        private String apiKey;
        /**
         * Chat completions endpoint path. Defaults to the OpenAI-style path.
         * Zhipu (bigmodel.cn) uses "/chat/completions" under its /api/paas/v4 base URL.
         */
        private String chatPath = "/v1/chat/completions";
        private List<ModelConfig> models = new ArrayList<>();

        public List<String> getModelNames() {
            List<String> names = new ArrayList<>();
            for (ModelConfig m : models) {
                names.add(m.getName());
            }
            return names;
        }

        /**
         * Find a model config by name.
         */
        public ModelConfig getModelConfig(String modelName) {
            if (modelName == null && !models.isEmpty()) {
                return models.get(0);
            }
            for (ModelConfig m : models) {
                if (m.getName().equals(modelName)) {
                    return m;
                }
            }
            // Return first model as fallback
            return models.isEmpty() ? null : models.get(0);
        }
    }
}
