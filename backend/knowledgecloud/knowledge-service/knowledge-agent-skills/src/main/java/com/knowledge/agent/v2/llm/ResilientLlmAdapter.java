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
        return delegate.streamInfer(request)
                // Idle timeout: if no chunk arrives within the window, fail
                .timeout(Duration.ofSeconds(config.getIdleTimeoutSeconds()))
                // Overall timeout for the entire stream
                .take(Duration.ofSeconds(config.getTimeoutSeconds()))
                // Map timeout to a descriptive error
                .onErrorMap(TimeoutException.class, e ->
                        new LlmTimeoutException("LLM stream idle timeout after "
                                + config.getIdleTimeoutSeconds() + "s", e))
                // Retry only on connection/transient errors (not on timeout after first token)
                .retryWhen(Retry.backoff(config.getMaxRetries(), Duration.ofMillis(500))
                        .filter(this::isRetriable)
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
     * Connection errors and 5xx responses are retriable; 4xx and timeouts are not.
     */
    private boolean isRetriable(Throwable t) {
        if (t instanceof LlmTimeoutException) {
            return false; // Don't retry timeouts
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
