package com.knowledge.agent.v2.handler;

import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.StateHandler;
import com.knowledge.agent.v2.engine.Transition;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.ThinkingEvent;
import com.knowledge.agent.v2.llm.InferenceRequest;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.llm.LlmAdapter;
import com.knowledge.agent.v2.llm.LlmChunk;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;

/**
 * Handles the THINK state — LLM inference with live token streaming.
 *
 * <p>
 * This is the core handler that replaces V1's {@code runTurn()} method.
 * It performs a single LLM call, streams tokens to the event bus as they
 * arrive, accumulates the full response, and determines the next state:
 * <ul>
 * <li>Tool calls present → transition to ACT</li>
 * <li>No tool calls → transition to DONE</li>
 * <li>Error → transition to ERROR</li>
 * </ul>
 *
 * <p>
 * The handler is stateless — all accumulation happens in local variables
 * within the reactive chain. The accumulated response is stored in the
 * session's execution state for the ActHandler to consume.
 */
@Slf4j
public class ThinkHandler implements StateHandler {

    private final LlmAdapter llmAdapter;
    private final ToolRegistry toolRegistry;

    public ThinkHandler(LlmAdapter llmAdapter, ToolRegistry toolRegistry) {
        this.llmAdapter = llmAdapter;
        this.toolRegistry = toolRegistry;
    }

    @Override
    public Flux<AgentEvent> handle(AgentSession session, AgentState state) {
        int iteration = session.getExecution().nextIteration();
        String sessionId = session.getSessionId();

        log.debug("ThinkHandler: iteration {} for session {}", iteration, sessionId);

        // Build the inference request
        InferenceRequest request = buildRequest(session);

        // Emit ThinkStart event
        ThinkingEvent.ThinkStart startEvent = new ThinkingEvent.ThinkStart(sessionId, iteration);

        // Accumulate the full response while streaming deltas
        ResponseAccumulator accumulator = new ResponseAccumulator();
        long startTimeMs = System.currentTimeMillis();

        // Stream LLM chunks, converting each to an AgentEvent
        Flux<AgentEvent> liveDeltas = llmAdapter.streamInfer(request)
                .handle((chunk, sink) -> {
                    accumulator.feed(chunk);
                    if (chunk.getType() == LlmChunk.ChunkType.FINISH) {
                        // Per-iteration provider cache accounting → session totals.
                        session.getExecution().addCacheUsage(
                                chunk.getPromptCacheHitTokens(),
                                chunk.getPromptCacheMissTokens());
                    }
                    AgentEvent delta = chunkToDelta(chunk, sessionId, iteration);
                    if (delta != null) {
                        sink.next(delta);
                    }
                });

        // After streaming completes, determine the next state
        Flux<AgentEvent> tail = Flux.defer(() -> {
            long latencyMs = System.currentTimeMillis() - startTimeMs;
            InferenceResponse response = accumulator.assemble();

            // Record token usage. lastPromptTokens is the provider-reported
            // size of THIS request's context — the authoritative signal used
            // by ContextCompactor to decide when to compact.
            session.getExecution().addTokenUsage(
                    response.getPromptTokens(), response.getCompletionTokens());
            if (response.getPromptTokens() > 0) {
                session.getExecution().setLastPromptTokens(response.getPromptTokens());
            }

            // Emit ThinkEnd event (includes this iteration's cache accounting)
            ThinkingEvent.ThinkEnd endEvent = new ThinkingEvent.ThinkEnd(
                    sessionId, iteration, response.getFinishReason(),
                    response.getPromptTokens(), response.getCompletionTokens(), latencyMs,
                    response.getPromptCacheHitTokens(), response.getPromptCacheMissTokens());

            if (response.hasToolCalls()) {
                // Store tool calls in execution state for ActHandler
                session.getExecution().setPendingToolCalls(response.getToolCalls());

                // If a length-truncated text answer is immediately followed by
                // tool calls, merge them into ONE assistant message instead of
                // creating consecutive assistant messages.
                appendOrMergeAssistant(session, response,
                        session.getExecution().getLastAssistantContent() != null);
                session.getExecution().setLastAssistantContent(null);

                return Flux.just(endEvent, Transition.toAct(sessionId));
            }

            // No tool calls. Persist the final/partial assistant text into the
            // working history so snapshots and continuation requests have it.
            boolean hasText = (response.getContent() != null
                    && !response.getContent().trim().isEmpty())
                    || (response.getReasoningContent() != null
                    && !response.getReasoningContent().trim().isEmpty());

            // "length" means the model hit max_tokens / output budget before
            // finishing. Do NOT treat that as a successful terminal DONE:
            // continue the same task.
            if ("length".equalsIgnoreCase(response.getFinishReason())) {
                if (!hasText) {
                    return Flux.just(endEvent, Transition.toDone(sessionId, "length"));
                }

                String current = response.getContent() != null
                        ? response.getContent().trim()
                        : "";
                String previous = session.getExecution().getLastAssistantContent();

                // Repetition guard: if the continuation restarts the previous
                // block instead of appending new text, stop and keep the first
                // copy rather than paying for the same output repeatedly.
                if (previous != null && isRepetition(current, previous)) {
                    log.warn("ThinkHandler: repetition detected in session {} — stopping length continuation",
                            sessionId);
                    return Flux.just(endEvent, Transition.toDone(sessionId, "repetition_guard"));
                }

                // Merge into the SAME assistant message. Do NOT append a user
                // continuation turn: that made some models restart the whole
                // answer. The prompt prefix stays stable for context cache hits.
                String merged = appendOrMergeAssistant(session, response, previous != null);
                session.getExecution().setLastAssistantContent(merged);

                // Output continuation belongs to the same logical iteration.
                session.getExecution().setIteration(Math.max(0, iteration - 1));
                log.info("ThinkHandler: session {} hit output length limit; continuing the same assistant message",
                        sessionId);
                return Flux.just(endEvent, Transition.toThink(sessionId));
            }

            // Normal completion — persist the final assistant message.
            if (hasText) {
                String merged = appendOrMergeAssistant(session, response,
                        session.getExecution().getLastAssistantContent() != null);
                session.getExecution().setLastAssistantContent(merged);
            }
            return Flux.just(endEvent, Transition.toDone(sessionId, "stop"));
        });

        return Flux.concat(Flux.just(startEvent), liveDeltas, tail)
                .onErrorResume(e -> {
                    // Provider rejected the request because the assembled prompt
                    // exceeded the model context window. Instead of failing the
                    // whole task, compact once and retry the same THINK.
                    if (isContextLengthError(e)) {
                        log.warn("ThinkHandler: context-length error in session {}; "
                                + "forcing compaction and retrying", sessionId);
                        session.getExecution().setCompactNextThink(true);
                        // Context retry belongs to the same logical iteration;
                        // do not let automatic compaction retries exhaust the
                        // user-visible iteration budget.
                        session.getExecution().setIteration(Math.max(0, iteration - 1));
                        ThinkingEvent.ThinkEnd retryEnd = new ThinkingEvent.ThinkEnd(
                                sessionId, iteration, "context_length_retry",
                                0, 0, System.currentTimeMillis() - startTimeMs, 0, 0);
                        return Flux.just(retryEnd, Transition.toThink(sessionId));
                    }
                    log.error("ThinkHandler: LLM error in session {}: {}",
                            sessionId, e.getMessage(), e);
                    recordError(session, e);
                    return Flux.just(Transition.toError(sessionId, "llm_error: " + e.getMessage()));
                });
    }

    /** True when the provider rejected the prompt as too long for its context. */
    private boolean isContextLengthError(Throwable e) {
        Throwable cursor = e;
        while (cursor != null) {
            String msg = cursor.getMessage() != null
                    ? cursor.getMessage().toLowerCase(java.util.Locale.ROOT)
                    : "";
            if (msg.contains("context length")
                    || msg.contains("maximum context")
                    || msg.contains("context_length_exceeded")
                    || msg.contains("too many tokens")
                    || msg.contains("max context")
                    || msg.contains("input length")
                    || msg.contains("上下文长度")
                    || msg.contains("超过上下文")) {
                return true;
            }
            cursor = cursor.getCause();
        }
        return false;
    }

    private boolean isRepetition(String current, String previous) {
        if (previous == null || previous.trim().isEmpty()) {
            return false;
        }
        String a = current.replaceAll("\\s+", "");
        String b = previous.replaceAll("\\s+", "");
        if (a.isEmpty() || b.isEmpty()) {
            return false;
        }
        if (a.equals(b)) {
            return true;
        }
        // The model restarted and emitted the previous block plus a little more.
        if (a.length() >= b.length() && a.startsWith(b) && a.length() - b.length() < 200) {
            return true;
        }
        if (b.length() >= a.length() && b.startsWith(a) && b.length() - a.length() < 200) {
            return true;
        }
        return false;
    }

    /**
     * Preserve a machine-readable error classification so the engine can emit
     * session.failed with a useful code/retriable flag instead of INTERNAL.
     */
    private void recordError(AgentSession session, Throwable e) {
        if (e instanceof com.knowledge.agent.v2.llm.ResilientLlmAdapter.LlmTimeoutException) {
            session.getExecution().setError("LLM_TIMEOUT", e.getMessage(), true);
            return;
        }
        if (e instanceof com.knowledge.agent.v2.llm.ResilientLlmAdapter.LlmExhaustedException) {
            session.getExecution().setError("LLM_RETRIES_EXHAUSTED", e.getMessage(), false);
            return;
        }
        Throwable cause = e;
        while (cause != null) {
            if (cause instanceof org.springframework.web.reactive.function.client.WebClientResponseException) {
                org.springframework.http.HttpStatus status =
                        ((org.springframework.web.reactive.function.client.WebClientResponseException) cause).getStatusCode();
                if (status == org.springframework.http.HttpStatus.TOO_MANY_REQUESTS) {
                    session.getExecution().setError("LLM_RATE_LIMIT", e.getMessage(), true);
                    return;
                }
                if (status != null && status.is5xxServerError()) {
                    session.getExecution().setError("LLM_UPSTREAM", e.getMessage(), true);
                    return;
                }
                if (status != null && status.is4xxClientError()) {
                    session.getExecution().setError("LLM_INVALID_REQUEST", e.getMessage(), false);
                    return;
                }
            }
            cause = cause.getCause();
        }
        String msg = e.getMessage() != null ? e.getMessage() : "";
        if (msg.contains("429")) {
            session.getExecution().setError("LLM_RATE_LIMIT", msg, true);
        } else if (msg.contains("502") || msg.contains("503") || msg.contains("connection")) {
            session.getExecution().setError("LLM_UPSTREAM", msg, true);
        } else {
            session.getExecution().setError("LLM_ERROR", msg, false);
        }
    }

    private InferenceRequest buildRequest(AgentSession session) {
        List<ConversationMessage> messages = session.getExecution().getMessages();
        // Pass frontend tools from the client request so the LLM can invoke them.
        // toolIds=null means include all registered backend tools. The schema
        // JSON is cached by the frontend's capabilitiesVersion.
        //
        // PLAN mode (first read-only defense layer): the catalog shipped to the
        // LLM contains ONLY read-only tools — mutating tools are invisible to
        // the model, so it cannot even ask for them.
        java.util.Collection<String> backendIds = session.getToolIds().isEmpty()
                ? null : session.getToolIds();
        java.util.List<com.knowledge.agent.api.dto.ChatTool> frontendTools = session.getFrontendTools().isEmpty()
                ? null : session.getFrontendTools();
        String toolChoice = session.getToolChoice() != null ? session.getToolChoice() : "auto";
        String toolsJson;
        if ("none".equalsIgnoreCase(toolChoice)) {
            // Explicit no-tool mode (frontend ask mode). Do not render any tool
            // schema — an empty backend tool-id set historically meant "all
            // registered tools", which leaked server tools into read-only chat.
            toolsJson = "[]";
            backendIds = java.util.Collections.emptyList();
            frontendTools = null;
        } else if (session.isPlanMode()) {
            backendIds = toolRegistry.getReadOnlyToolIds();
            if (frontendTools != null) {
                java.util.List<com.knowledge.agent.api.dto.ChatTool> readOnlyFrontend = new java.util.ArrayList<>();
                for (com.knowledge.agent.api.dto.ChatTool ft : frontendTools) {
                    if (Boolean.TRUE.equals(ft.getReadOnly())) {
                        readOnlyFrontend.add(ft);
                    }
                }
                frontendTools = readOnlyFrontend.isEmpty() ? null : readOnlyFrontend;
            }
            toolsJson = toolRegistry.buildToolsJsonCached(
                    session.getCapabilitiesVersion(),
                    backendIds,
                    frontendTools);
        } else {
            toolsJson = toolRegistry.buildToolsJsonCached(
                    session.getCapabilitiesVersion(),
                    backendIds,
                    frontendTools);
        }

        return InferenceRequest.builder()
                .model(session.getModelName())
                .messages(messages)
                .temperature(session.getTemperature() != null
                        ? session.getTemperature() : 0.7)
                .maxTokens(session.getMaxTokens() != null
                        ? session.getMaxTokens() : 4096)
                .toolsJson(toolsJson)
                .toolChoice(toolChoice)
                .stream(true)
                .build();
    }

    private AgentEvent chunkToDelta(LlmChunk chunk, String sessionId, int iteration) {
        switch (chunk.getType()) {
            case TEXT_DELTA:
                if (chunk.getTextDelta() != null && !chunk.getTextDelta().isEmpty()) {
                    return new ThinkingEvent.ThinkDelta(
                            sessionId, iteration,
                            ThinkingEvent.ThinkDelta.DeltaType.TEXT,
                            chunk.getTextDelta());
                }
                return null;
            case REASONING_DELTA:
                if (chunk.getReasoningDelta() != null && !chunk.getReasoningDelta().isEmpty()) {
                    return new ThinkingEvent.ThinkDelta(
                            sessionId, iteration,
                            ThinkingEvent.ThinkDelta.DeltaType.REASONING,
                            chunk.getReasoningDelta());
                }
                return null;
            case TOOL_CALL_DELTA:
            case FINISH:
                // Tool call deltas are accumulated silently; FINISH is handled in tail
                return null;
            default:
                return null;
        }
    }

    /**
     * Append an assistant message, or merge into the previous length-truncated
     * assistant message when this is an automatic continuation.
     *
     * <p>The merge is the root fix for repeated output: the provider sees ONE
     * continuously-growing assistant message and the same stable prompt prefix,
     * so it can both continue correctly and keep hitting the context cache.
     */
    private String appendOrMergeAssistant(AgentSession session, InferenceResponse response,
            boolean continuation) {
        List<ConversationMessage.ToolCallInfo> toolCalls = new ArrayList<>();
        if (response.getToolCalls() != null) {
            for (InferenceResponse.ToolCallData tc : response.getToolCalls()) {
                toolCalls.add(new ConversationMessage.ToolCallInfo(
                        tc.getId(), "function", tc.getName(), tc.getArguments()));
            }
        }

        String incoming = response.getContent() != null ? response.getContent() : "";
        String incomingReasoning = response.getReasoningContent() != null
                ? response.getReasoningContent() : "";
        List<ConversationMessage> messages = session.getExecution().getMessages();

        if (continuation) {
            int last = lastAssistantWithoutToolCallsIndex(messages);
            if (last >= 0) {
                ConversationMessage previous = messages.get(last);
                String merged = (previous.getContent() != null ? previous.getContent() : "")
                        + incoming;
                String mergedReasoning =
                        (previous.getReasoningContent() != null ? previous.getReasoningContent() : "")
                                + incomingReasoning;
                messages.set(last, ConversationMessage.builder()
                        .role("assistant")
                        .content(merged)
                        .reasoningContent(mergedReasoning)
                        .toolCalls(toolCalls.isEmpty() ? null : toolCalls)
                        .build());
                session.getExecution().setMessages(messages);
                return merged;
            }
        }

        ConversationMessage assistantMsg = ConversationMessage.builder()
                .role("assistant")
                .content(incoming)
                .reasoningContent(incomingReasoning)
                .toolCalls(toolCalls.isEmpty() ? null : toolCalls)
                .build();
        session.getExecution().addMessage(assistantMsg);
        return incoming;
    }

    private int lastAssistantWithoutToolCallsIndex(List<ConversationMessage> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            ConversationMessage msg = messages.get(i);
            if ("assistant".equals(msg.getRole())
                    && (msg.getToolCalls() == null || msg.getToolCalls().isEmpty())) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Accumulates streaming chunks into a complete InferenceResponse.
     */
    private static class ResponseAccumulator {
        private final StringBuilder content = new StringBuilder();
        private final StringBuilder reasoning = new StringBuilder();
        private final List<ToolCallAccumulator> toolCalls = new ArrayList<>();
        private String finishReason = "stop";
        private int promptTokens = 0;
        private int completionTokens = 0;
        private int promptCacheHitTokens = 0;
        private int promptCacheMissTokens = 0;

        void feed(LlmChunk chunk) {
            switch (chunk.getType()) {
                case TEXT_DELTA:
                    if (chunk.getTextDelta() != null)
                        content.append(chunk.getTextDelta());
                    break;
                case REASONING_DELTA:
                    if (chunk.getReasoningDelta() != null)
                        reasoning.append(chunk.getReasoningDelta());
                    break;
                case TOOL_CALL_DELTA:
                    feedToolCall(chunk.getToolCallDelta());
                    break;
                case FINISH:
                    finishReason = chunk.getFinishReason();
                    promptTokens = chunk.getPromptTokens();
                    completionTokens = chunk.getCompletionTokens();
                    promptCacheHitTokens = chunk.getPromptCacheHitTokens();
                    promptCacheMissTokens = chunk.getPromptCacheMissTokens();
                    break;
            }
        }

        private void feedToolCall(LlmChunk.ToolCallDelta delta) {
            if (delta == null)
                return;
            int idx = delta.getIndex();
            while (toolCalls.size() <= idx) {
                toolCalls.add(new ToolCallAccumulator());
            }
            ToolCallAccumulator acc = toolCalls.get(idx);
            if (delta.getId() != null)
                acc.id = delta.getId();
            if (delta.getName() != null)
                acc.name = delta.getName();
            if (delta.getArgumentsDelta() != null)
                acc.arguments.append(delta.getArgumentsDelta());
        }

        InferenceResponse assemble() {
            List<InferenceResponse.ToolCallData> calls = null;
            if (!toolCalls.isEmpty()) {
                calls = new ArrayList<>();
                for (ToolCallAccumulator acc : toolCalls) {
                    calls.add(new InferenceResponse.ToolCallData(
                            acc.id, acc.name, acc.arguments.toString()));
                }
            }

            return InferenceResponse.builder()
                    .content(content.length() > 0 ? content.toString() : null)
                    .reasoningContent(reasoning.length() > 0 ? reasoning.toString() : null)
                    .toolCalls(calls)
                    .finishReason(finishReason)
                    .promptTokens(promptTokens)
                    .completionTokens(completionTokens)
                    .promptCacheHitTokens(promptCacheHitTokens)
                    .promptCacheMissTokens(promptCacheMissTokens)
                    .build();
        }
    }

    private static class ToolCallAccumulator {
        String id;
        String name;
        StringBuilder arguments = new StringBuilder();
    }
}
