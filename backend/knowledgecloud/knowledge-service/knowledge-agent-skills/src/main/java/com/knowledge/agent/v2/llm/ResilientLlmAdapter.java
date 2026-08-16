package com.knowledge.agent.v2.llm;

import com.knowledge.agent.v2.config.AgentProperties;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.concurrent.TimeoutException;

/**
 * Resilient wrapper around any {@link LlmAdapter}.
 *
 * <p>Applies cross-cutting resilience policies:
 * <ul>
 *   <li><b>Idle timeout</b>: fails if no chunk arrives within the configured window</li>
 *   <li><b>Retry</b>: retries transient failures (only before first token for streaming)</li>
 *   <li><b>Overall timeout</b>: hard cap on total inference time</li>
 * </ul>
 *
 * <p>This replaces V1's {@code LlmResilience} utility class with a proper
 * decorator pattern that can be composed around any adapter implementation.
 */
@Slf4j
public class ResilientLlmAdapter implements LlmAdapter {

    private final LlmAdapter delegate;
    private final AgentProperties.LlmConfig config;

    public ResilientLlmAdapter(LlmAdapter delegate, AgentProperties.LlmConfig config) {
        this.delegate = delegate;
        this.config = config;
    }

    @Override
    public Flux<LlmChunk> streamInfer(InferenceRequest request) {
        // First-token guard: once ANY business token reached the client, a
        // retry would re-stream the whole response and duplicate text. From
        // that point failures propagate downstream (the engine surfaces them
        // as an error event) instead of silently re-invoking the LLM.
        java.util.concurrent.atomic.AtomicBoolean tokenEmitted =
                new java.util.concurrent.atomic.AtomicBoolean(false);

        // Overall timeout implemented with takeUntilOther + a trailing error.
        // Reactor's take(Duration) completes normally at the deadline, which
        // made a truncated response look like a successful finish.
        Flux<LlmChunk> stream = Flux.defer(() -> {
            java.util.concurrent.atomic.AtomicBoolean timedOut =
                    new java.util.concurrent.atomic.AtomicBoolean(false);
            java.util.concurrent.atomic.AtomicBoolean sourceCompleted =
                    new java.util.concurrent.atomic.AtomicBoolean(false);

            Flux<LlmChunk> source = delegate.streamInfer(request)
                    .doOnNext(chunk -> {
                        if (chunk.getType() == LlmChunk.ChunkType.TEXT_DELTA
                                || chunk.getType() == LlmChunk.ChunkType.REASONING_DELTA) {
                            tokenEmitted.set(true);
                        }
                    })
                    .doOnComplete(() -> sourceCompleted.set(true));

            Mono<Long> timeout = Mono.delay(Duration.ofSeconds(config.getTimeoutSeconds()))
                    .doOnNext(tick -> timedOut.set(true));

            return source.takeUntilOther(timeout)
                    .concatWith(Flux.defer(() -> {
                        if (timedOut.get() && !sourceCompleted.get()) {
                            return Mono.error(new LlmTimeoutException(
                                    "LLM stream overall timeout after "
                                            + config.getTimeoutSeconds() + "s", null));
                        }
                        return Mono.empty();
                    }));
        });

        return stream
                // Idle timeout: if no chunk arrives within the window, fail
                .timeout(Duration.ofSeconds(config.getIdleTimeoutSeconds()))
                // Map timeout to a descriptive error
                .onErrorMap(TimeoutException.class, e ->
                        new LlmTimeoutException("LLM stream idle timeout after "
                                + config.getIdleTimeoutSeconds() + "s", e))
                // Retry only on transient errors BEFORE the first token.
                .retryWhen(Retry.backoff(config.getMaxRetries(), Duration.ofMillis(500))
                        .filter(t -> !tokenEmitted.get() && isRetriable(t))
                        .doBeforeRetry(signal ->
                                log.warn("LLM stream retry #{}: {}",
                                        signal.totalRetries() + 1, signal.failure().getMessage()))
                        .onRetryExhaustedThrow((spec, signal) ->
                                new LlmExhaustedException("LLM retries exhausted after "
                                        + config.getMaxRetries() + " attempts", signal.failure())));
    }

    @Override
    public Mono<InferenceResponse> infer(InferenceRequest request) {
        return delegate.infer(request)
                .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                .onErrorMap(TimeoutException.class, e ->
                        new LlmTimeoutException("LLM inference timeout after "
                                + config.getTimeoutSeconds() + "s", e))
                .retryWhen(Retry.backoff(config.getMaxRetries(), Duration.ofMillis(500))
                        .filter(this::isRetriable)
                        .doBeforeRetry(signal ->
                                log.warn("LLM infer retry #{}: {}",
                                        signal.totalRetries() + 1, signal.failure().getMessage()))
                        .onRetryExhaustedThrow((spec, signal) ->
                                new LlmExhaustedException("LLM retries exhausted", signal.failure())));
    }

    @Override
    public ModelCapabilities capabilities() {
        return delegate.capabilities();
    }

    /**
     * Determine if an error is retriable (transient).
     * 429/5xx and connection failures are retriable; 4xx and timeouts are not.
     * The classification prefers the typed exception (thrown by
     * {@code OpenAiCompatibleClient} since the error-propagation fix) and only
     * falls back to message matching for legacy providers.
     */
    private boolean isRetriable(Throwable t) {
        if (t instanceof LlmTimeoutException) {
            return false; // Don't retry timeouts
        }
        if (t instanceof org.springframework.web.reactive.function.client.WebClientResponseException) {
            org.springframework.http.HttpStatus status =
                    ((org.springframework.web.reactive.function.client.WebClientResponseException) t).getStatusCode();
            return status == org.springframework.http.HttpStatus.TOO_MANY_REQUESTS
                    || (status != null && status.is5xxServerError());
        }
        if (t instanceof com.knowledge.agent.llm.OpenAiCompatibleClient.LlmApiException) {
            return t.getCause() instanceof org.springframework.web.reactive.function.client.WebClientResponseException
                    && isRetriable(t.getCause());
        }
        // Connection refused, reset, etc. are retriable
        String msg = t.getMessage();
        if (msg != null && (msg.contains("Connection refused")
                || msg.contains("connection reset")
                || msg.contains("503")
                || msg.contains("502")
                || msg.contains("429"))) {
            return true;
        }
        return false;
    }

    // ---- Custom exceptions ----

    public static class LlmTimeoutException extends RuntimeException {
        public LlmTimeoutException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    public static class LlmExhaustedException extends RuntimeException {
        public LlmExhaustedException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
