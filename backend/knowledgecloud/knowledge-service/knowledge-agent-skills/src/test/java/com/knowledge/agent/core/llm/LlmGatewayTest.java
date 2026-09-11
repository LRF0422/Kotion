package com.knowledge.agent.core.llm;

import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResponse;
import com.knowledge.agent.llm.StreamChunk;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LlmGatewayTest {

    @Test
    void propagatesUsageThatArrivesAfterDoneChunk() {
        LlmResponse.Usage usage = usage(100, 20, 30);
        LlmClient client = mock(LlmClient.class);
        when(client.streamChat(any(LlmRequest.class))).thenReturn(Flux.just(
                StreamChunk.content("answer"),
                StreamChunk.done("stop"),
                StreamChunk.usage(usage)));

        LlmResult result = gateway(client).streamInfer(request(), null, () -> false);

        assertEquals("answer", result.getText());
        assertEquals("stop", result.getFinishReason());
        assertEquals(100, result.getPromptTokens());
        assertEquals(20, result.getCompletionTokens());
        assertEquals(30, result.getCachedPromptTokens());
    }

    @Test
    void keepsLegacyUsageAttachedToDoneChunk() {
        LlmResponse.Usage usage = usage(80, 10, 25);
        LlmClient client = mock(LlmClient.class);
        when(client.streamChat(any(LlmRequest.class))).thenReturn(Flux.just(
                StreamChunk.done("stop", usage)));

        LlmResult result = gateway(client).streamInfer(request(), null, () -> false);

        assertEquals("stop", result.getFinishReason());
        assertEquals(80, result.getPromptTokens());
        assertEquals(10, result.getCompletionTokens());
        assertEquals(25, result.getCachedPromptTokens());
    }

    @Test
    void surfacesIdleTimeoutAsDomainException() {
        AgentCoreProperties properties = new AgentCoreProperties();
        properties.getLlm().setIdleTimeoutSeconds(1);
        LlmClient client = mock(LlmClient.class);
        when(client.streamChat(any(LlmRequest.class)))
                .thenReturn(Flux.concat(Flux.just(StreamChunk.content("partial")), Flux.never()));

        assertThrows(LlmGateway.LlmTimeoutException.class,
                () -> gateway(client, properties).streamInfer(request(), null, () -> false));
    }

    private LlmGateway gateway(LlmClient client) {
        return gateway(client, new AgentCoreProperties());
    }

    private LlmGateway gateway(LlmClient client, AgentCoreProperties properties) {
        LlmClientFactory clientFactory = mock(LlmClientFactory.class);
        when(clientFactory.getClientForModel("test-model")).thenReturn(client);
        return new LlmGateway(clientFactory, properties);
    }

    private LlmInferRequest request() {
        return LlmInferRequest.builder()
                .model("test-model")
                .messages(Collections.emptyList())
                .build();
    }

    private LlmResponse.Usage usage(int prompt, int completion, int cachedPrompt) {
        return LlmResponse.Usage.builder()
                .promptTokens(prompt)
                .completionTokens(completion)
                .totalTokens(prompt + completion)
                .promptCacheHitTokens(cachedPrompt)
                .promptCacheMissTokens(prompt - cachedPrompt)
                .build();
    }
}
