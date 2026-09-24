package com.knowledge.agent.core.llm;

import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResponse;
import com.knowledge.agent.llm.StreamChunk;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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

    @Test
    void retriesRateLimitBeforeFirstChunkThenSucceeds() {
        AgentCoreProperties properties = new AgentCoreProperties();
        properties.getLlm().setRetryBaseDelayMs(0);
        LlmClient client = mock(LlmClient.class);
        when(client.streamChat(any(LlmRequest.class)))
                .thenThrow(tooManyRequests())
                .thenReturn(Flux.just(StreamChunk.content("ok"), StreamChunk.done("stop")));

        LlmResult result = gateway(client, properties).streamInfer(request(), null, () -> false);

        assertEquals("ok", result.getText());
        verify(client, times(2)).streamChat(any(LlmRequest.class));
    }

    @Test
    void neverRestartsAnInferenceThatAlreadyStreamedContent() {
        AgentCoreProperties properties = new AgentCoreProperties();
        properties.getLlm().setRetryBaseDelayMs(0);
        LlmClient client = mock(LlmClient.class);
        // Content is delivered first, the retriable error a moment later — the
        // realistic shape of a stream that dies after it started answering.
        when(client.streamChat(any(LlmRequest.class))).thenReturn(Flux.concat(
                Flux.just(StreamChunk.content("partial")),
                Mono.delay(Duration.ofMillis(50)).thenMany(Flux.<StreamChunk>error(tooManyRequests()))));

        assertThrows(WebClientResponseException.class,
                () -> gateway(client, properties).streamInfer(request(), null, () -> false));
        verify(client, times(1)).streamChat(any(LlmRequest.class));
    }

    @Test
    void stopsRetryingAtMaxAttempts() {
        AgentCoreProperties properties = new AgentCoreProperties();
        properties.getLlm().setRetryBaseDelayMs(0);
        properties.getLlm().setMaxAttempts(2);
        LlmClient client = mock(LlmClient.class);
        when(client.streamChat(any(LlmRequest.class))).thenThrow(tooManyRequests());

        assertThrows(WebClientResponseException.class,
                () -> gateway(client, properties).streamInfer(request(), null, () -> false));
        verify(client, times(2)).streamChat(any(LlmRequest.class));
    }

    @Test
    void failsBusyWhenAllProviderSlotsAreTaken() throws Exception {
        AgentCoreProperties properties = new AgentCoreProperties();
        properties.getLlm().setMaxConcurrentCalls(1);
        properties.getLlm().setAcquireTimeoutSeconds(0);

        CountDownLatch inFlight = new CountDownLatch(1);
        LlmClient client = mock(LlmClient.class);
        when(client.streamChat(any(LlmRequest.class))).thenAnswer(invocation -> {
            inFlight.countDown();
            return Flux.concat(Flux.just(StreamChunk.content("held")), Flux.never());
        });

        LlmGateway gateway = gateway(client, properties);
        ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "llm-gate-test");
            thread.setDaemon(true);
            return thread;
        });
        Future<LlmResult> first = executor.submit(
                () -> gateway.streamInfer(request(), null, () -> false));
        try {
            assertTrue(inFlight.await(2, TimeUnit.SECONDS), "the first call must reach the provider");
            assertThrows(LlmGateway.LlmBusyException.class,
                    () -> gateway.streamInfer(request(), null, () -> false));
        } finally {
            first.cancel(true);
            executor.shutdownNow();
        }
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

    private static WebClientResponseException tooManyRequests() {
        return WebClientResponseException.create(429, "Too Many Requests",
                new HttpHeaders(), new byte[0], null);
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
