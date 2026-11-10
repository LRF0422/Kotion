package com.knowledge.agent.llm;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LlmClientFactoryTest {

    @Test
    void vendorModelIdContainingSlashRoutesToDeclaringProvider() {
        // SiliconFlow-style ids: "deepseek-ai/DeepSeek-V3" is a model id, not a
        // "<provider>/<model>" selector. The old code split on '/' first and threw
        // "No LLM client found for provider: deepseek-ai".
        LlmClientFactory factory = factory("siliconflow",
                "siliconflow", provider("https://api.siliconflow.cn/v1",
                        model("deepseek-ai/DeepSeek-V3")),
                "openai", provider("https://api.openai.com/v1", model("gpt-4o")));

        assertEquals("siliconflow",
                factory.getClientForModel("deepseek-ai/DeepSeek-V3").getProviderName());
    }

    @Test
    void requestUsingAliasRoutesToProviderDeclaringIt() {
        LlmClientFactory factory = factory("vendor",
                "vendor", provider("https://vendor.example/v1",
                        model("deepseek-v3", "deepseek-chat")),
                "official", provider("https://api.deepseek.com/v1", model("deepseek-chat")));

        assertEquals("vendor", factory.getClientForModel("deepseek-chat").getProviderName());
    }

    @Test
    void explicitProviderPrefixSelectsThatProvider() {
        LlmClientFactory factory = factory("vendor",
                "vendor", provider("https://vendor.example/v1",
                        model("deepseek-v3", "deepseek-chat")),
                "official", provider("https://api.deepseek.com/v1", model("deepseek-chat")));

        assertEquals("official",
                factory.getClientForModel("official/deepseek-chat").getProviderName());
    }

    @Test
    void unknownModelFallsBackToDefaultProvider() {
        LlmClientFactory factory = factory("vendor",
                "vendor", provider("https://vendor.example/v1", model("deepseek-v3")),
                "openai", provider("https://api.openai.com/v1", model("gpt-4o")));

        assertEquals("vendor", factory.getClientForModel("some-retired-model").getProviderName());
    }

    @Test
    void resolvedChatUrlIsExposedForDiagnostics() {
        LlmClientFactory factory = factory("vendor",
                "vendor", provider("https://aigw-gzgy2.cucloud.cn:8443/v1", model("deepseek-v3")));

        OpenAiCompatibleClient client =
                (OpenAiCompatibleClient) factory.getClientForModel("deepseek-v3");
        assertEquals("https://aigw-gzgy2.cucloud.cn:8443/v1/chat/completions",
                client.getChatUrl());
    }

    @Test
    void invalidBaseUrlFailsAtStartupWithProviderName() {
        Map<String, LlmClientFactory.ProviderConfig> providers = new LinkedHashMap<>();
        providers.put("broken", provider("vendor.example", model("m")));
        LlmClientFactory factory = new LlmClientFactory();
        factory.setProviders(providers);

        IllegalStateException error = assertThrows(IllegalStateException.class, factory::init);
        assertTrue(error.getMessage().contains("broken"));
        assertTrue(error.getMessage().contains("base-url"));
    }

    @Test
    void visionFlagAndAliasesDriveSupportsVision() {
        ModelConfig visionModel = model("my-multimodal-model", "chat-vision");
        visionModel.setVision(true);
        LlmClientFactory factory = factory("vendor",
                "vendor", provider("https://vendor.example/v1",
                        visionModel, model("plain-text-model", "chat-text")));

        assertTrue(factory.supportsVision("chat-vision"));
        assertTrue(factory.supportsVision("my-multimodal-model"));
        assertFalse(factory.supportsVision("chat-text"));
        // Unknown names fall back to the well-known name heuristics.
        assertTrue(factory.supportsVision("glm-4v"));
        assertFalse(factory.supportsVision("deepseek-chat"));
    }

    // ---- helpers ----

    /**
     * Build a factory from (providerName, providerConfig) pairs and run init().
     * The default provider is set before init so startup validation sees it.
     * Plain Object varargs keeps the helper free of generic-array warnings.
     */
    private static LlmClientFactory factory(String defaultProvider, Object... nameAndProvider) {
        Map<String, LlmClientFactory.ProviderConfig> providers = new LinkedHashMap<>();
        for (int i = 0; i + 1 < nameAndProvider.length; i += 2) {
            providers.put((String) nameAndProvider[i],
                    (LlmClientFactory.ProviderConfig) nameAndProvider[i + 1]);
        }
        LlmClientFactory factory = new LlmClientFactory();
        factory.setDefaultProvider(defaultProvider);
        factory.setProviders(providers);
        factory.init();
        return factory;
    }

    private static LlmClientFactory.ProviderConfig provider(String baseUrl, ModelConfig... models) {
        LlmClientFactory.ProviderConfig config = new LlmClientFactory.ProviderConfig();
        config.setBaseUrl(baseUrl);
        config.setApiKey("test-key");
        config.setModels(new ArrayList<>(Arrays.asList(models)));
        return config;
    }

    private static ModelConfig model(String name, String... aliases) {
        List<String> aliasList = aliases.length == 0
                ? new ArrayList<>()
                : new ArrayList<>(Arrays.asList(aliases));
        return ModelConfig.builder()
                .name(name)
                .aliases(aliasList)
                .build();
    }
}