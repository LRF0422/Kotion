package com.knowledge.agent.core.llm;

import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResponse;
import com.knowledge.agent.llm.StreamChunk;
import com.knowledge.agent.core.config.AgentCoreProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.PrematureCloseException;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.time.Duration;
import java.util.Iterator;
import java.util.concurrent.TimeoutException;
import java.util.function.BooleanSupplier;

/**
 * AgentCore LLM gateway — a synchronous facade over the shared
 * {@link LlmClientFactory} (OpenAI-compatible providers configured via
 * {@code agent.providers.*}).
 *
 * <p>The core loop is deliberately synchronous: streaming is consumed through
 * a blocking iterator, deltas are surfaced through a {@link Sink}, and tool
 * call fragments are merged by a {@link ToolCallAccumulator}. Cancellation is
 * cooperative via the {@code cancelled} flag (checked between chunks) and
 * thread interruption.
 *
 * <p>Two pieces of shared-provider protection live here, because this is the
 * single choke point every inference goes through:
 * <ul>
 *   <li>{@link LlmConcurrencyGate} bounds concurrent provider calls globally
 *       (and optionally per provider), so many agents cannot stampede one
 *       provider and turn every call into a timeout;</li>
 *   <li>retriable failures (429 / 5xx / connect / timeout / premature close)
 *       are retried with exponential backoff, honouring {@code Retry-After},
 *       but only before any content has arrived — a half-streamed answer is
 *       never duplicated.</li>
 * </ul>
 */
@Slf4j
@Component
public class LlmGateway {

    private final LlmClientFactory clientFactory;
    private final AgentCoreProperties properties;
    private final LlmConcurrencyGate concurrencyGate;
    private final int maxAttempts;
    private final long retryBaseDelayMs;
    private final long retryMaxDelayMs;
    private final long acquireTimeoutMillis;

    public LlmGateway(LlmClientFactory clientFactory, AgentCoreProperties properties) {
        this.clientFactory = clientFactory;
        this.properties = properties;
        AgentCoreProperties.Llm llm = properties.getLlm();
        this.concurrencyGate = new LlmConcurrencyGate(
                llm.getMaxConcurrentCalls(), llm.getProviderMaxConcurrent());
        this.maxAttempts = Math.max(1, llm.getMaxAttempts());
        this.acquireTimeoutMillis = Math.max(0L, (long) llm.getAcquireTimeoutSeconds()) * 1000L;
        this.retryBaseDelayMs = Math.max(0L, llm.getRetryBaseDelayMs());
        this.retryMaxDelayMs = Math.max(this.retryBaseDelayMs, llm.getRetryMaxDelayMs());
    }

    /**
     * Whether the resolved model accepts image input. Used by the loop to decide
     * between attaching multimodal image parts and a plain-text degradation.
     */
    public boolean supportsVision(String model) {
        return clientFactory.supportsVision(model);
    }

    /** Delta sink — the loop feeds text/reasoning events from here. */
    public interface Sink {
        void onText(String delta);

        void onReasoning(String delta);
    }

    /** Streaming inference (the normal path). */
    public LlmResult streamInfer(LlmInferRequest request, Sink sink, BooleanSupplier cancelled) {
        int firstTokenSeconds = Math.max(1, properties.getLlm().getTimeoutSeconds());
        int idleSeconds = Math.max(1, properties.getLlm().getIdleTimeoutSeconds());
        if (isCancelled(cancelled)) {
            return cancelledResult();
        }
        for (int attempt = 1; ; attempt++) {
            LlmClient client = clientFactory.getClientForModel(request.getModel());
            LlmConcurrencyGate.Permit permit = acquirePermit(client, cancelled);
            if (permit == null) {
                return cancelledResult();
            }
            try {
                return streamInferOnce(client, request, sink, cancelled, firstTokenSeconds, idleSeconds);
            } catch (StreamFailure failure) {
                Throwable cause = failure.getCause() == null ? failure : failure.getCause();
                boolean canRetry = !failure.anyChunk()
                        && attempt < maxAttempts
                        && !isCancelled(cancelled)
                        && isRetriable(cause);
                if (!canRetry) {
                    RuntimeException runtime = cause instanceof RuntimeException
                            ? (RuntimeException) cause
                            : new IllegalStateException(cause);
                    if (isTimeout(runtime)) {
                        throw new LlmTimeoutException(timeoutMessage(firstTokenSeconds, idleSeconds), runtime);
                    }
                    throw runtime;
                }
                long delay = retryDelayMillis(attempt, cause);
                log.warn("LLM stream failed before first chunk (attempt {}/{}): {} — retrying in {}ms",
                        attempt, maxAttempts, cause.getMessage(), delay);
                sleepQuietly(delay);
            } finally {
                permit.close();
            }
        }
    }

    /** One provider attempt; failures are wrapped so the caller can see partial output. */
    private LlmResult streamInferOnce(LlmClient client, LlmInferRequest request, Sink sink,
                                      BooleanSupplier cancelled, int firstTokenSeconds, int idleSeconds) {
        LlmRequest llmRequest = toLlmRequest(request, true);

        LlmResult result = new LlmResult();
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        boolean anyChunk = false;

        try {
            Iterator<StreamChunk> iterator = withStreamTimeouts(
                    client.streamChat(llmRequest), firstTokenSeconds, idleSeconds)
                    .toStream()
                    .iterator();
            while (iterator.hasNext()) {
                if (isCancelled(cancelled)) {
                    result.setFinishReason("cancelled");
                    break;
                }
                StreamChunk chunk;
                try {
                    chunk = iterator.next();
                } catch (RuntimeException e) {
                    // Blocking iterator throws on interruption — surface as cancel.
                    if (Thread.currentThread().isInterrupted() || isCancelled(cancelled)) {
                        result.setFinishReason("cancelled");
                        break;
                    }
                    throw e;
                }
                anyChunk = true;

                if (chunk == null) {
                    continue;
                }
                String type = chunk.getType();
                if ("content".equals(type)) {
                    if (chunk.getContent() != null) {
                        result.setText(result.getText() + chunk.getContent());
                        if (sink != null) {
                            sink.onText(chunk.getContent());
                        }
                    }
                } else if ("reasoning_content".equals(type)) {
                    if (chunk.getReasoningContent() != null) {
                        result.setReasoningText(result.getReasoningText() + chunk.getReasoningContent());
                        if (sink != null) {
                            sink.onReasoning(chunk.getReasoningContent());
                        }
                    }
                } else if ("tool_call".equals(type)) {
                    accumulator.onFragment(chunk.getToolCallId(), chunk.getToolCallName(),
                            chunk.getToolCallArgumentsDelta(), chunk.getToolCallIndex());
                } else if ("done".equals(type)) {
                    if (chunk.getFinishReason() != null) {
                        result.setFinishReason(chunk.getFinishReason());
                    }
                    // Compatibility for clients that still attach usage to done.
                    applyUsage(result, chunk.getUsage());
                } else if ("usage".equals(type)) {
                    applyUsage(result, chunk.getUsage());
                }
            }
        } catch (RuntimeException e) {
            throw new StreamFailure(e, anyChunk);
        }

        result.setToolCalls(accumulator.results());
        return result;
    }

    /**
     * Bound the provider stream so a stalled connection cannot park the run's
     * loop thread forever:
     * <ul>
     *   <li>{@code firstTokenSeconds} — max wait for the first chunk (TTFT);</li>
     *   <li>{@code idleSeconds} — max silence between any two chunks.</li>
     * </ul>
     * On breach the iterator throws a {@link TimeoutException} (surfaced as
     * {@link LlmTimeoutException}) instead of blocking indefinitely.
     */
    private static Flux<StreamChunk> withStreamTimeouts(Flux<StreamChunk> stream,
                                                        int firstTokenSeconds, int idleSeconds) {
        return stream.timeout(
                Mono.delay(Duration.ofSeconds(firstTokenSeconds)),
                chunk -> Mono.delay(Duration.ofSeconds(idleSeconds)));
    }

    private static String timeoutMessage(int firstTokenSeconds, int idleSeconds) {
        return "LLM 流式响应超时：首包 " + firstTokenSeconds + "s、空闲 " + idleSeconds + "s 内无数据";
    }

    /** True when the failure (or any cause) is a stream/socket timeout. */
    private static boolean isTimeout(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof TimeoutException || current instanceof LlmTimeoutException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    /**
     * Whether a pre-first-chunk failure is worth retrying: provider rate limits
     * and server errors, plus transport-level failures. A 4xx (other than 429)
     * is the caller's fault and is never retried.
     */
    private static boolean isRetriable(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof WebClientResponseException) {
                int status = ((WebClientResponseException) current).getRawStatusCode();
                return status == 429 || status >= 500;
            }
            if (current instanceof TimeoutException
                    || current instanceof SocketTimeoutException
                    || current instanceof ConnectException
                    || current instanceof UnknownHostException
                    || current instanceof PrematureCloseException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    /** Exponential backoff with jitter, capped; {@code Retry-After} wins when present. */
    private long retryDelayMillis(int attempt, Throwable cause) {
        long retryAfter = retryAfterMillis(cause);
        if (retryAfter > 0L) {
            return Math.min(retryAfter, retryMaxDelayMs);
        }
        if (retryBaseDelayMs <= 0L) {
            return 0L;
        }
        long exponential = retryBaseDelayMs * (1L << Math.min(attempt - 1, 10));
        long jitter = (long) (exponential * 0.2d * Math.random());
        return Math.min(retryMaxDelayMs, exponential + jitter);
    }

    /** {@code Retry-After} in seconds, when the provider sent one. */
    private static long retryAfterMillis(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof WebClientResponseException) {
                String header = ((WebClientResponseException) current).getHeaders().getFirst("Retry-After");
                if (header != null && !header.trim().isEmpty()) {
                    try {
                        return Long.parseLong(header.trim()) * 1000L;
                    } catch (NumberFormatException ignored) {
                        // HTTP-date form is rare here; fall back to backoff.
                    }
                }
            }
            current = current.getCause();
        }
        return 0L;
    }

    /** Take a provider slot; {@code null} means the run was cancelled while waiting. */
    private LlmConcurrencyGate.Permit acquirePermit(LlmClient client, BooleanSupplier cancelled) {
        String provider = client != null ? client.getProviderName() : null;
        try {
            return concurrencyGate.acquire(provider, cancelled, acquireTimeoutMillis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmBusyException("LLM 调用在等待并发配额时被中断 (provider=" + provider + ")", e);
        } catch (LlmConcurrencyGate.BusyException e) {
            throw new LlmBusyException(e.getMessage(), e);
        }
    }

    private static void sleepQuietly(long millis) {
        if (millis <= 0L) {
            return;
        }
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static boolean isCancelled(BooleanSupplier cancelled) {
        return cancelled != null && cancelled.getAsBoolean();
    }

    private static LlmResult cancelledResult() {
        LlmResult result = new LlmResult();
        result.setFinishReason("cancelled");
        return result;
    }

    /**
     * A failed attempt. Carries whether any chunk arrived, so the retry loop
     * never restarts an inference that already streamed output to the client.
     */
    private static final class StreamFailure extends RuntimeException {
        private final boolean anyChunk;

        private StreamFailure(RuntimeException cause, boolean anyChunk) {
            super(cause.getMessage(), cause);
            this.anyChunk = anyChunk;
        }

        private boolean anyChunk() {
            return anyChunk;
        }
    }

    /** Provider stream stalled past the configured timeouts. */
    public static class LlmTimeoutException extends RuntimeException {
        public LlmTimeoutException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** No provider slot became free within {@code agent.llm.acquire-timeout-seconds}. */
    public static class LlmBusyException extends RuntimeException {
        public LlmBusyException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** Non-streaming inference — planning/summarization calls. */
    public LlmResult infer(LlmInferRequest request) {
        LlmClient client = clientFactory.getClientForModel(request.getModel());
        LlmConcurrencyGate.Permit permit = acquirePermit(client, null);
        try {
            LlmResponse response = client.chat(toLlmRequest(request, false));
            LlmResult result = new LlmResult();
            if (response != null) {
                result.setFinishReason(response.getFinishReason() != null ? response.getFinishReason() : "stop");
                if (response.getContent() != null) {
                    result.setText(response.getContent());
                }
                applyUsage(result, response.getUsage());
            }
            return result;
        } finally {
            permit.close();
        }
    }

    private void applyUsage(LlmResult result, LlmResponse.Usage usage) {
        if (usage == null) {
            return;
        }
        result.setPromptTokens(usage.getPromptTokens());
        result.setCompletionTokens(usage.getCompletionTokens());
        result.setCachedPromptTokens(usage.getPromptCacheHitTokens());
    }

    private LlmRequest toLlmRequest(LlmInferRequest request, boolean stream) {
        return LlmRequest.builder()
                .model(request.getModel())
                .messages(request.getMessages())
                .toolsJson(request.getToolsJson())
                .toolChoice(request.getToolChoice())
                .temperature(request.getTemperature())
                .maxTokens(request.getMaxTokens())
                .stream(stream)
                .build();
    }
}
