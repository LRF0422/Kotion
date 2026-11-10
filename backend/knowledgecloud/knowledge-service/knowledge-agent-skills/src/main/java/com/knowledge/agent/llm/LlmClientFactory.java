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
        clientCache.clear();
        if (providers == null || providers.isEmpty()) {
            log.warn("No LLM providers configured (agent.providers.* is empty); "
                    + "agent runs will fail until at least one provider is configured.");
            return;
        }
        for (Map.Entry<String, ProviderConfig> entry : providers.entrySet()) {
            String providerName = entry.getKey();
            ProviderConfig config = entry.getValue();
            if (config == null) {
                log.error("LLM provider '{}' has no configuration; skipped", providerName);
                continue;
            }
            // Resolve once, up front: a bad base-url/chat-path is a deployment
            // error, and failing here is far cheaper than a 404 per agent turn.
            String chatUrl;
            try {
                chatUrl = config.resolveChatUrl();
            } catch (IllegalArgumentException e) {
                throw new IllegalStateException(
                        "Invalid LLM provider '" + providerName + "': " + e.getMessage(), e);
            }
            LlmClient client = createClient(providerName, config);
            clientCache.put(providerName, client);
            log.info("LLM provider '{}' ready: POST {} (models: {}, api-key: {})",
                    providerName, chatUrl, config.getModelNames(),
                    hasText(config.getApiKey()) ? "set" : "MISSING");
            if (!hasText(config.getApiKey())) {
                // Some internal gateways authenticate per-network, so this is a
                // warning, not an error — but it is the first thing to check for a
                // 401/403 from a third-party vendor.
                log.warn("LLM provider '{}' has no api-key configured; "
                        + "requests will be sent without an Authorization header.", providerName);
            }
            if (config.getModels() == null || config.getModels().isEmpty()) {
                log.warn("LLM provider '{}' declares no models; /api/v1/models will be empty "
                        + "and model routing falls back to this provider's default.", providerName);
            }
        }
        validateDefaultSelection();
    }

    /**
     * Surface the two misconfigurations that produce a provider-side 404
     * ({@code model_not_found}) at request time: a default provider that does not
     * exist, and a default model no provider declares.
     */
    private void validateDefaultSelection() {
        if (!clientCache.containsKey(defaultProvider)) {
            log.error("agent.default-provider '{}' is not among the configured providers {}; "
                            + "runs without an explicit model cannot be served.",
                    defaultProvider, clientCache.keySet());
            return;
        }
        ProviderConfig defaultConfig = providers.get(defaultProvider);
        if (!hasText(defaultModel)) {
            log.warn("agent.default-model is empty; the provider's first declared model is used.");
            return;
        }
        if (defaultConfig != null && defaultConfig.findModelConfig(defaultModel) == null) {
            log.warn("agent.default-model '{}' is not declared by provider '{}' (declared: {}). "
                            + "The vendor will likely answer 404 model_not_found. Set agent.default-model "
                            + "to the vendor's model id, or declare '{}' as an alias of it.",
                    defaultModel, defaultProvider, defaultConfig.getModelNames(), defaultModel);
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
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
     *
     * <p>Resolution order matters for third-party vendors:
     * <ol>
     *   <li>a model name (or alias) declared under {@code agent.providers.*.models}
     *       — vendor ids often contain a slash ({@code deepseek-ai/DeepSeek-V3}),
     *       which must not be mistaken for a provider prefix;</li>
     *   <li>an explicit {@code provider/model} selector, only when the prefix is a
     *       provider that is actually configured;</li>
     *   <li>the default provider, with a warning naming the declared models.</li>
     * </ol>
     */
    public LlmClient getClientForModel(String modelName) {
        if (modelName == null || modelName.trim().isEmpty()) {
            return getClient();
        }
        String requested = modelName.trim();

        // 1) Declared model name or alias across providers.
        for (Map.Entry<String, LlmClient> entry : clientCache.entrySet()) {
            ProviderConfig config = providers.get(entry.getKey());
            if (config != null && config.findModelConfig(requested) != null) {
                return entry.getValue();
            }
        }

        // 2) Explicit "provider/model" selector (only for configured providers).
        int slash = requested.indexOf('/');
        if (slash > 0) {
            LlmClient prefixed = clientCache.get(requested.substring(0, slash));
            if (prefixed != null) {
                return prefixed;
            }
        }

        // 3) Fall back to the default provider instead of failing the run, but say
        // why the request may come back 404 from the vendor.
        log.warn("Model '{}' is not declared by any provider (declared: {}); "
                        + "falling back to provider '{}'. Add the vendor's model id under "
                        + "agent.providers.{}.models[] or map '{}' as one of its aliases.",
                requested, getAllModels(), defaultProvider, defaultProvider, requested);
        return getClient();
    }

    /**
     * Whether the given model accepts image input (multimodal / vision).
     *
     * <p>Primary signal is the per-model {@code vision: true} config flag.
     * Well-known vision model families are also recognised by name so a provider
     * that only declares model names still works without extra config.
     */
    public boolean supportsVision(String modelName) {
        String requested = modelName == null || modelName.trim().isEmpty()
                ? defaultModel
                : modelName.trim();
        if (requested == null || requested.trim().isEmpty()) {
            return false;
        }

        // Declared name or alias first (handles vendor ids that contain a slash).
        for (ProviderConfig config : providers.values()) {
            if (config == null) {
                continue;
            }
            ModelConfig model = config.findModelConfig(requested);
            if (model != null && model.getName() != null) {
                return model.isVision() || looksLikeVisionModel(model.getName());
            }
        }

        // Explicit "provider/model" form.
        int slash = requested.indexOf('/');
        if (slash > 0) {
            ProviderConfig config = providers.get(requested.substring(0, slash));
            if (config != null) {
                ModelConfig model = config.findModelConfig(requested.substring(slash + 1));
                if (model != null && model.getName() != null) {
                    return model.isVision() || looksLikeVisionModel(model.getName());
                }
            }
            requested = requested.substring(slash + 1);
        }
        return looksLikeVisionModel(requested);
    }

    /** Name heuristics for common multimodal model families. */
    private static boolean looksLikeVisionModel(String model) {
        String name = model.toLowerCase(Locale.ROOT);
        String[] markers = {
                "-vl", "vl-", "vision", "gpt-4o", "gpt-4.1", "gpt-5", "o3", "o4",
                "claude-3", "claude-4", "gemini", "llava", "internvl", "qwen-vl",
                "qwen2-vl", "qwen2.5-vl", "glm-4v", "pixtral", "minicpm-v", "cogvlm",
        };
        for (String marker : markers) {
            if (name.contains(marker)) {
                return true;
            }
        }
        return false;
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
        this.providers = providers != null ? providers : new LinkedHashMap<>();
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
         * Chat-completions path appended to {@link #baseUrl}. Accepts three shapes:
         * <ul>
         *   <li>a path — {@code /v1/chat/completions} (default) or
         *       {@code /chat/completions} for vendors whose base URL already ends
         *       with the API version (e.g. {@code .../api/paas/v4});</li>
         *   <li>a path-relative-to-base — {@code chat/completions};</li>
         *   <li>a complete URL — {@code https://<host>/v1/chat/completions}.</li>
         * </ul>
         * A leading segment the base URL already carries is never duplicated, so
         * {@code base-url: https://<host>/v1} plus the default path resolves to
         * {@code https://<host>/v1/chat/completions} (not {@code /v1/v1/...}).
         */
        private String chatPath = ChatEndpoint.DEFAULT_CHAT_PATH;
        /**
         * Extra HTTP headers sent with every chat request, for vendors that need
         * a non-Bearer credential header ({@code api-key}, {@code X-App-Id}, ...).
         * A configured {@code Authorization} header wins over the generated
         * {@code Bearer <api-key>}.
         */
        private Map<String, String> headers = new LinkedHashMap<>();
        private List<ModelConfig> models = new ArrayList<>();

        public List<String> getModelNames() {
            List<String> names = new ArrayList<>();
            for (ModelConfig m : models) {
                if (m != null && m.getName() != null) {
                    names.add(m.getName());
                }
            }
            return names;
        }

        /** Absolute URL built from {@link #baseUrl} and {@link #chatPath}. */
        public String resolveChatUrl() {
            return ChatEndpoint.resolve(baseUrl, chatPath);
        }

        /**
         * Find a model config by its declared name or one of its aliases.
         *
         * @return the matching config, the first model when {@code modelName} is
         *         blank, or {@code null} when the id is not declared by this
         *         provider (the caller decides the fallback)
         */
        public ModelConfig findModelConfig(String modelName) {
            if (models == null || models.isEmpty()) {
                return null;
            }
            if (modelName == null || modelName.trim().isEmpty()) {
                return models.get(0);
            }
            String requested = modelName.trim();
            for (ModelConfig m : models) {
                if (m != null && m.getName() != null && m.getName().equals(requested)) {
                    return m;
                }
            }
            for (ModelConfig m : models) {
                if (m == null || m.getAliases() == null) {
                    continue;
                }
                for (String alias : m.getAliases()) {
                    if (alias != null && alias.trim().equals(requested)) {
                        return m;
                    }
                }
            }
            return null;
        }
    }
}
