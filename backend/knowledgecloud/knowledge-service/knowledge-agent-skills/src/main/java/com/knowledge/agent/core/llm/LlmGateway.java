package com.knowledge.agent.core.llm;

import com.knowledge.agent.api.dto.ChatMessage;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
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
 *       are retried with exponential backoff, honouring {@code Retry-After};
 *       a stream that dies after it started answering is <em>resumed</em>
 *       (partial answer + “continue from the break”) rather than replayed, so
 *       a stalled first packet or a 30s reasoning silence no longer fails the
 *       whole run. A half-built tool call is never resumed.</li>
 * </ul>
 */
@Slf4j
@Component
public class LlmGateway {

    /**
     * Appended as the last user message when a stream breaks mid-answer. The
     * partial text is already in the transcript (and already streamed to the
     * client), so the model must continue it instead of starting over.
     */
    static final String CONTINUATION_NUDGE =
            "（系统提示：上一条回复在生成途中因网络中断被截断，只写出了上面这些内容。"
                    + "请紧接着继续写，不要重复已经写过的内容，也不要重新开头或解释原因。）";

    /**
     * Continuation prompt when the break happened before any visible text was
     * produced (only reasoning had streamed). There is no partial answer to
     * attach, so the model is simply asked to finish the turn.
     */
    static final String CONTINUATION_NUDGE_NO_TEXT =
            "（系统提示：上一次推理在输出思考内容时被网络中断。请继续推理并完成回答，"
                    + "不要重复已经输出过的内容。）";

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
        // Output survives a resumed attempt: text/reasoning deltas already
        // reached the client, so the next attempt continues this answer.
        LlmResult result = new LlmResult();
        result.setText("");
        result.setReasoningText("");

        for (int attempt = 1; ; attempt++) {
            // No output yet (e.g. the very first packet timed out): retry the
            // original request. A continuation nudge only makes sense once
            // something was actually streamed.
            LlmInferRequest attemptRequest = attempt == 1 || !hasOutput(result)
                    ? request : withContinuation(request, result);
            LlmClient client = clientFactory.getClientForModel(request.getModel());
            LlmConcurrencyGate.Permit permit = acquirePermit(client, cancelled);
            if (permit == null) {
                result.setFinishReason("cancelled");
                return result;
            }
            try {
                LlmResult attemptResult = streamInferOnce(
                        client, attemptRequest, sink, cancelled, firstTokenSeconds, idleSeconds);
                appendOutput(result, attemptResult);
                result.setFinishReason(attemptResult.getFinishReason());
                result.setToolCalls(attemptResult.getToolCalls());
                return result;
            } catch (StreamFailure failure) {
                appendOutput(result, failure.partial());
                Throwable cause = failure.getCause() == null ? failure : failure.getCause();
                boolean canRetry = !isCancelled(cancelled)
                        && attempt < maxAttempts
                        && isRetriable(cause);
                // A break after content cannot be replayed (the client already
                // rendered it); it can only be continued, and only when no
                // tool-call fragment was being assembled.
                boolean partialOutput = failure.anyChunk();
                boolean canResume = partialOutput
                        && !failure.anyToolCall()
                        && !failure.completed()
                        && properties.getLlm().isResumePartialStream();
                if (!canRetry || (partialOutput && !canResume)) {
                    RuntimeException runtime = cause instanceof RuntimeException
                            ? (RuntimeException) cause
                            : new IllegalStateException(cause);
                    if (isTimeout(runtime)) {
                        throw new LlmTimeoutException(
                                timeoutMessage(firstTokenSeconds, idleSeconds, attempt), runtime);
                    }
                    throw runtime;
                }
                long delay = retryDelayMillis(attempt, cause);
                if (partialOutput) {
                    log.warn("LLM stream broke after {} chars of output (attempt {}/{}): {} — "
                                    + "continuing from the break in {}ms",
                            length(result.getText()), attempt, maxAttempts,
                            cause.getMessage(), delay);
                } else {
                    log.warn("LLM stream failed before first chunk (attempt {}/{}): {} — retrying in {}ms",
                            attempt, maxAttempts, cause.getMessage(), delay);
                }
                sleepQuietly(delay);
            } finally {
                permit.close();
            }
        }
    }

    /**
     * Turn the original request into a continuation: the partial answer becomes
     * an assistant message and a short user nudge asks the model to keep going.
     * Never used when a tool call was half-built (its arguments cannot be
     * resumed); the caller fails that case instead.
     */
    private static LlmInferRequest withContinuation(LlmInferRequest request, LlmResult partial) {
        List<ChatMessage> messages = new ArrayList<>(
                request.getMessages() == null ? Collections.<ChatMessage>emptyList() : request.getMessages());
        boolean hasText = partial.getText() != null && !partial.getText().isEmpty();
        if (hasText) {
            messages.add(ChatMessage.builder().role("assistant").content(partial.getText()).build());
        }
        messages.add(ChatMessage.builder().role("user")
                .content(hasText ? CONTINUATION_NUDGE : CONTINUATION_NUDGE_NO_TEXT)
                .build());
        return LlmInferRequest.builder()
                .model(request.getModel())
                .messages(messages)
                .toolsJson(request.getToolsJson())
                .toolChoice(request.getToolChoice())
                .temperature(request.getTemperature())
                .maxTokens(request.getMaxTokens())
                .build();
    }

    /** Merge one attempt's output (text/reasoning/usage) into the whole answer. */
    private static void appendOutput(LlmResult target, LlmResult source) {
        if (source == null) {
            return;
        }
        if (source.getText() != null && !source.getText().isEmpty()) {
            target.setText((target.getText() == null ? "" : target.getText()) + source.getText());
        }
        if (source.getReasoningText() != null && !source.getReasoningText().isEmpty()) {
            target.setReasoningText((target.getReasoningText() == null ? "" : target.getReasoningText())
                    + source.getReasoningText());
        }
        target.setPromptTokens(target.getPromptTokens() + source.getPromptTokens());
        target.setCompletionTokens(target.getCompletionTokens() + source.getCompletionTokens());
        target.setCachedPromptTokens(target.getCachedPromptTokens() + source.getCachedPromptTokens());
    }

    private static int length(String value) {
        return value == null ? 0 : value.length();
    }

    private static boolean hasOutput(LlmResult result) {
        String text = result.getText();
        String reasoning = result.getReasoningText();
        return (text != null && !text.isEmpty())
                || (reasoning != null && !reasoning.isEmpty());
    }

    /** One provider attempt; failures are wrapped so the caller can see partial output. */
    private LlmResult streamInferOnce(LlmClient client, LlmInferRequest request, Sink sink,
                                      BooleanSupplier cancelled, int firstTokenSeconds, int idleSeconds) {
        LlmRequest llmRequest = toLlmRequest(request, true);

        LlmResult result = new LlmResult();
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        boolean anyChunk = false;
        boolean completed = false;

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
                        completed = true;
                    }
                    // Compatibility for clients that still attach usage to done.
                    applyUsage(result, chunk.getUsage());
                } else if ("usage".equals(type)) {
                    applyUsage(result, chunk.getUsage());
                }
            }
        } catch (RuntimeException e) {
            result.setToolCalls(accumulator.results());
            throw new StreamFailure(e, anyChunk, accumulator.hasFragments(), completed, result);
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

    private static String timeoutMessage(int firstTokenSeconds, int idleSeconds, int attempts) {
        String message = "LLM 流式响应超时：首包 " + firstTokenSeconds + "s、空闲 " + idleSeconds + "s 内无数据";
        return attempts > 1 ? message + "（已自动重试 " + (attempts - 1) + " 次）" : message;
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
     * A failed attempt. Carries whether any chunk arrived and whether a tool
     * call was being assembled, so the retry loop can continue a partial answer
     * but never replays a half-built tool call.
     */
    private static final class StreamFailure extends RuntimeException {
        private final boolean anyChunk;
        private final boolean anyToolCall;
        private final boolean completed;
        private final LlmResult partial;

        private StreamFailure(RuntimeException cause, boolean anyChunk, boolean anyToolCall,
                              boolean completed, LlmResult partial) {
            super(cause.getMessage(), cause);
            this.anyChunk = anyChunk;
            this.anyToolCall = anyToolCall;
            this.completed = completed;
            this.partial = partial;
        }

        private boolean anyChunk() {
            return anyChunk;
        }

        private boolean anyToolCall() {
            return anyToolCall;
        }

        /** A terminal {@code done} chunk already arrived; the answer is complete. */
        private boolean completed() {
            return completed;
        }

        private LlmResult partial() {
            return partial;
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
