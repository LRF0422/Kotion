package com.knowledge.agent.core.llm;

import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResponse;
import com.knowledge.agent.llm.StreamChunk;
import com.knowledge.agent.core.config.AgentCoreProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

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
 */
@Slf4j
@Component
public class LlmGateway {

    private final LlmClientFactory clientFactory;
    private final AgentCoreProperties properties;

    public LlmGateway(LlmClientFactory clientFactory, AgentCoreProperties properties) {
        this.clientFactory = clientFactory;
        this.properties = properties;
    }

    /** Delta sink — the loop feeds text/reasoning events from here. */
    public interface Sink {
        void onText(String delta);

        void onReasoning(String delta);
    }

    /** Streaming inference (the normal path). */
    public LlmResult streamInfer(LlmInferRequest request, Sink sink, BooleanSupplier cancelled) {
        return streamInfer(request, sink, cancelled, 1);
    }

    private LlmResult streamInfer(LlmInferRequest request, Sink sink, BooleanSupplier cancelled, int attempt) {
        LlmClient client = clientFactory.getClientForModel(request.getModel());
        LlmRequest llmRequest = toLlmRequest(request, true);

        LlmResult result = new LlmResult();
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        boolean anyChunk = false;
        int firstTokenSeconds = Math.max(1, properties.getLlm().getTimeoutSeconds());
        int idleSeconds = Math.max(1, properties.getLlm().getIdleTimeoutSeconds());

        try {
            Iterator<StreamChunk> iterator = withStreamTimeouts(
                    client.streamChat(llmRequest), firstTokenSeconds, idleSeconds)
                    .toStream()
                    .iterator();
            while (iterator.hasNext()) {
                if (cancelled != null && cancelled.getAsBoolean()) {
                    result.setFinishReason("cancelled");
                    break;
                }
                StreamChunk chunk;
                try {
                    chunk = iterator.next();
                } catch (RuntimeException e) {
                    // Blocking iterator throws on interruption — surface as cancel.
                    if (Thread.currentThread().isInterrupted() || (cancelled != null && cancelled.getAsBoolean())) {
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
            // Retry once for transient transport errors before any content arrived.
            if (!anyChunk && attempt < 2 && !(cancelled != null && cancelled.getAsBoolean())) {
                log.warn("LLM stream failed before first chunk (attempt {}): {} — retrying",
                        attempt, e.getMessage());
                return streamInfer(request, sink, cancelled, attempt + 1);
            }
            if (isTimeout(e)) {
                throw new LlmTimeoutException(timeoutMessage(firstTokenSeconds, idleSeconds), e);
            }
            throw e;
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

    /** Provider stream stalled past the configured timeouts. */
    public static class LlmTimeoutException extends RuntimeException {
        public LlmTimeoutException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** Non-streaming inference — planning/summarization calls. */
    public LlmResult infer(LlmInferRequest request) {
        LlmClient client = clientFactory.getClientForModel(request.getModel());
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
