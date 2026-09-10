package com.knowledge.agent.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OpenAiCompatibleClientTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void parsesDeepSeekFinishChunkWithUsage() {
        OpenAiCompatibleClient client = client(Collections.emptyMap());
        String frame = "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],"
                + "\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":20,\"total_tokens\":120,"
                + "\"prompt_cache_hit_tokens\":30,\"prompt_cache_miss_tokens\":70}}";

        List<StreamChunk> chunks = client.parseStreamChunk(frame).collectList().block();

        assertEquals(2, chunks.size());
        assertEquals("done", chunks.get(0).getType());
        assertEquals("stop", chunks.get(0).getFinishReason());
        assertEquals("usage", chunks.get(1).getType());
        assertUsage(chunks.get(1).getUsage(), 100, 20, 120, 30, 70);
    }

    @Test
    void parsesOpenAiUsageOnlyChunkWithEmptyChoices() {
        OpenAiCompatibleClient client = client(Collections.emptyMap());
        String frame = "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":100,"
                + "\"completion_tokens\":20,\"total_tokens\":120,"
                + "\"prompt_tokens_details\":{\"cached_tokens\":30}}}";

        List<StreamChunk> chunks = client.parseStreamChunk(frame).collectList().block();

        assertEquals(1, chunks.size());
        assertEquals("usage", chunks.get(0).getType());
        assertUsage(chunks.get(0).getUsage(), 100, 20, 120, 30, 70);
    }

    @Test
    void includesConfiguredStreamUsageOptionForStreamingRequest() throws Exception {
        Map<String, Object> streamOptions = new LinkedHashMap<>();
        streamOptions.put("include_usage", true);
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("stream_options", streamOptions);
        OpenAiCompatibleClient client = client(extra);

        JsonNode body = objectMapper.readTree(client.buildRequestBody(request(), true));

        assertTrue(body.get("stream").asBoolean());
        assertTrue(body.path("stream_options").path("include_usage").asBoolean());
    }

    @Test
    void omitsStreamOptionsFromNonStreamingRequest() throws Exception {
        Map<String, Object> streamOptions = new LinkedHashMap<>();
        streamOptions.put("include_usage", true);
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("stream_options", streamOptions);
        OpenAiCompatibleClient client = client(extra);

        JsonNode body = objectMapper.readTree(client.buildRequestBody(request(), false));

        assertFalse(body.get("stream").asBoolean());
        assertFalse(body.has("stream_options"));
    }

    @Test
    void doesNotInventStreamOptionsForUnconfiguredProvider() throws Exception {
        OpenAiCompatibleClient client = client(Collections.emptyMap());

        JsonNode body = objectMapper.readTree(client.buildRequestBody(request(), true));

        assertTrue(body.get("stream").asBoolean());
        assertFalse(body.has("stream_options"));
    }

    private OpenAiCompatibleClient client(Map<String, Object> extra) {
        ModelConfig model = ModelConfig.builder()
                .name("test-model")
                .extra(extra)
                .build();
        LlmClientFactory.ProviderConfig provider = new LlmClientFactory.ProviderConfig();
        provider.setBaseUrl("http://localhost");
        provider.setModels(Collections.singletonList(model));
        return new OpenAiCompatibleClient("test", provider);
    }

    private LlmRequest request() {
        return LlmRequest.builder()
                .model("test-model")
                .messages(Collections.emptyList())
                .build();
    }

    private void assertUsage(LlmResponse.Usage usage, int prompt, int completion,
            int total, int cacheHit, int cacheMiss) {
        assertEquals(prompt, usage.getPromptTokens());
        assertEquals(completion, usage.getCompletionTokens());
        assertEquals(total, usage.getTotalTokens());
        assertEquals(cacheHit, usage.getPromptCacheHitTokens());
        assertEquals(cacheMiss, usage.getPromptCacheMissTokens());
    }
}
