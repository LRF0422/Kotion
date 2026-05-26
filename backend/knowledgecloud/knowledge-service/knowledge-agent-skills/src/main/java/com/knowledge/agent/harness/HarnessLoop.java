package com.knowledge.agent.harness;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResponse;
import com.knowledge.agent.llm.StreamChunk;
import com.knowledge.agent.tool.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The agentic loop: LLM call → tool call → observe → repeat.
 *
 * <p>
 * Single unified loop — no upfront mode decision.
 * The agent autonomously decides whether to work solo or spawn sub-agents
 * by choosing to call the {@code delegate} tool.
 *
 * <p>
 * <b>Reactive implementation</b>: the loop is expressed as a recursive
 * {@code Flux.expand()} chain instead of a blocking {@code while} loop.
 * Each iteration is fully asynchronous — no thread is blocked waiting for
 * the LLM stream to complete. This avoids pinning Netty event-loop threads
 * and ensures that downstream back-pressure works correctly.
 */
@Slf4j
@Component
public class HarnessLoop {

    private final LlmClientFactory llmClientFactory;
    private final ToolRegistry toolRegistry;
    private final ContextManager contextManager;
    private final DynamicSkillRegistry dynamicSkillRegistry;

    public HarnessLoop(LlmClientFactory llmClientFactory,
            ToolRegistry toolRegistry,
            ContextManager contextManager,
            DynamicSkillRegistry dynamicSkillRegistry) {
        this.llmClientFactory = llmClientFactory;
        this.toolRegistry = toolRegistry;
        this.contextManager = contextManager;
        this.dynamicSkillRegistry = dynamicSkillRegistry;
    }

    /**
     * Run the agentic loop without frontend tools (backward-compatible overload).
     */
    public Flux<StreamEvent> run(List<ChatMessage> messages,
            String model,
            Collection<String> toolIds,
            String systemPrompt,
            ToolContext context,
            int maxIterations) {
        return run(messages, model, toolIds, systemPrompt, context, maxIterations, null);
    }

    /**
     * Run the agentic loop, returning a Flux of StreamEvents.
     *
     * @param messages      conversation history
     * @param model         the model to use (can be null for default)
     * @param toolIds       tools to make available (can be null for all)
     * @param systemPrompt  system prompt (can be null for default)
     * @param context       tool execution context
     * @param maxIterations max loop iterations (safety limit)
     * @param frontendTools frontend tools from the client request (included in LLM
     *                      tool list)
     * @return Flux of StreamEvent
     */
    public Flux<StreamEvent> run(List<ChatMessage> messages,
            String model,
            Collection<String> toolIds,
            String systemPrompt,
            ToolContext context,
            int maxIterations,
            List<ChatTool> frontendTools) {

        // Build the set of frontend tool names for classification during the loop
        Set<String> frontendToolNames = new LinkedHashSet<>();
        // Also include any tools registered in the registry as frontend
        frontendToolNames.addAll(toolRegistry.getFrontendToolIds());
        if (frontendTools != null) {
            for (ChatTool ft : frontendTools) {
                if (ft.getFunction() != null) {
                    frontendToolNames.add(ft.getFunction().getName());
                }
            }
        }

        // Prepare the initial working messages (add system prompt once)
        List<ChatMessage> workingMessages = new ArrayList<>(messages);
        if (systemPrompt != null && !systemPrompt.isEmpty()) {
            boolean hasSystemMessage = messages.stream()
                    .anyMatch(m -> "system".equals(m.getRole()));
            if (!hasSystemMessage) {
                ChatMessage systemMsg = ChatMessage.builder()
                        .role("system")
                        .content(systemPrompt)
                        .build();
                workingMessages.add(0, systemMsg);
            }
        }

        // Iteration state — mutable references shared across the reactive chain
        AtomicInteger iteration = new AtomicInteger(0);
        LlmClient client = llmClientFactory.getClientForModel(model);

        // Use expand() for a fully reactive loop:
        // 1. Seed: a Mono<IterationResult> representing the first iteration
        // 2. expand(): if the result needs to continue, run the next iteration
        // 3. Take up to maxIterations
        // 4. Flatten all events from each iteration
        return Mono.fromCallable(() -> new LoopState(workingMessages, iteration, maxIterations,
                client, toolIds, frontendTools, frontendToolNames, context))
                .flatMapMany(state -> runIteration(state)
                        .expand(result -> {
                            if (result.shouldContinue()) {
                                return runIteration(result.getState());
                            }
                            return Flux.empty();
                        })
                        .take(maxIterations)
                        .flatMapIterable(IterationResult::getEvents));
    }

    /**
     * Run a single iteration of the agentic loop.
     *
     * @return an IterationResult containing the emitted events and a flag
     *         indicating whether the loop should continue
     */
    private Mono<IterationResult> runIteration(LoopState state) {
        int iter = state.iteration.incrementAndGet();

        // Context window management
        contextManager.compressIfNeeded(state.workingMessages);

        // Rebuild toolsJson on each iteration to pick up dynamically
        // activated skills (from search_skills tool)
        List<ChatTool> mergedFrontend = mergeFrontendAndDynamicTools(
                state.initialFrontendTools, dynamicSkillRegistry.getActiveTools());
        String toolsJson = toolRegistry.buildToolsJson(state.toolIds, mergedFrontend);

        // Also update frontendToolNames with dynamic tools
        state.frontendToolNames.clear();
        state.frontendToolNames.addAll(toolRegistry.getFrontendToolIds());
        for (ChatTool ft : mergedFrontend) {
            if (ft.getFunction() != null) {
                state.frontendToolNames.add(ft.getFunction().getName());
            }
        }

        // If dynamic skills added prompt fragments, inject into working
        // messages by updating the system message
        String dynamicPrompt = dynamicSkillRegistry.getPromptFragment();
        if (dynamicPrompt != null && !dynamicPrompt.isEmpty()) {
            updateSystemPromptWithDynamicFragment(state.workingMessages, dynamicPrompt);
        }

        // Emit agent_status: thinking
        StreamEvent thinkingEvent = StreamEvent.DataEvent.builder()
                .data(Collections.singletonList(mapOf(
                        "type", "agent_status",
                        "phase", "thinking",
                        "iteration", String.valueOf(iter))))
                .build();

        // Build and send LLM request (streaming)
        LlmRequest request = LlmRequest.builder()
                .model(null) // model already selected via client
                .messages(state.workingMessages)
                .toolsJson(toolsJson)
                .stream(true)
                .build();

        return state.client.streamChat(request)
                .collectList()
                .map(chunks -> assembleResponse(chunks))
                .flatMap(response -> {
                    List<StreamEvent> events = new ArrayList<>();
                    events.add(thinkingEvent);

                    if (response == null) {
                        events.add(StreamEvent.ErrorEvent.builder().error("Empty LLM response").build());
                        return Mono.just(new IterationResult(events, false, state));
                    }

                    // Emit text events for content
                    if (response.getContent() != null && !response.getContent().isEmpty()) {
                        events.add(StreamEvent.TextEvent.builder()
                                .content(response.getContent())
                                .build());
                    }

                    // Emit reasoning events for thinking mode content
                    if (response.getReasoningContent() != null && !response.getReasoningContent().isEmpty()) {
                        events.add(StreamEvent.ReasoningEvent.builder()
                                .reasoningContent(response.getReasoningContent())
                                .build());
                    }

                    // Handle tool calls
                    if (response.hasToolCalls()) {
                        // Separate frontend and backend tool calls
                        List<LlmResponse.ToolCall> frontendCalls = new ArrayList<>();
                        List<LlmResponse.ToolCall> backendCalls = new ArrayList<>();
                        for (LlmResponse.ToolCall tc : response.getToolCalls()) {
                            if (state.frontendToolNames.contains(tc.getName())) {
                                frontendCalls.add(tc);
                            } else {
                                backendCalls.add(tc);
                            }
                        }

                        // Frontend tools: emit events, stop loop
                        if (!frontendCalls.isEmpty()) {
                            for (LlmResponse.ToolCall tc : frontendCalls) {
                                events.add(StreamEvent.ToolCallEvent.builder()
                                        .toolCallId(tc.getId())
                                        .toolName(tc.getName())
                                        .args(tc.getArguments())
                                        .build());
                            }
                            events.add(StreamEvent.FinishEvent.builder()
                                    .finishReason("tool-calls")
                                    .build());
                            return Mono.just(new IterationResult(events, false, state));
                        }

                        // Backend tools: dispatch sync vs async
                        // Add a SINGLE assistant message with both content and tool_calls.
                        List<ChatMessage.ToolCallInfo> tcInfos = new ArrayList<>();
                        for (LlmResponse.ToolCall tc : response.getToolCalls()) {
                            tcInfos.add(new ChatMessage.ToolCallInfo(
                                    tc.getId(), "function",
                                    new ChatMessage.ToolCallInfo.FunctionInfo(tc.getName(), tc.getArguments())));
                        }
                        ChatMessage.ChatMessageBuilder assistantMsgBuilder = ChatMessage.builder()
                                .role("assistant");
                        if (response.getContent() != null && !response.getContent().isEmpty()) {
                            assistantMsgBuilder.content(response.getContent());
                        } else {
                            assistantMsgBuilder.content(null);
                        }
                        if (response.getReasoningContent() != null && !response.getReasoningContent().isEmpty()) {
                            assistantMsgBuilder.reasoningContent(response.getReasoningContent());
                        }
                        assistantMsgBuilder.toolCalls(tcInfos);
                        state.workingMessages.add(assistantMsgBuilder.build());

                        // Execute backend tools sequentially within the iteration
                        return executeBackendTools(backendCalls, events, state);
                    } else {
                        // No tool calls — agent is done
                        events.add(StreamEvent.FinishEvent.builder()
                                .finishReason(
                                        response.getFinishReason() != null ? response.getFinishReason() : "stop")
                                .promptTokens(
                                        response.getUsage() != null ? response.getUsage().getPromptTokens() : 0)
                                .completionTokens(
                                        response.getUsage() != null ? response.getUsage().getCompletionTokens() : 0)
                                .build());
                        return Mono.just(new IterationResult(events, false, state));
                    }
                })
                .onErrorResume(e -> {
                    log.error("HarnessLoop iteration error", e);
                    List<StreamEvent> events = new ArrayList<>();
                    events.add(thinkingEvent);
                    events.add(StreamEvent.ErrorEvent.builder().error(e.getMessage()).build());
                    events.add(StreamEvent.FinishEvent.builder().finishReason("error").build());
                    return Mono.just(new IterationResult(events, false, state));
                });
    }

    /**
     * Execute backend tool calls sequentially, collecting events.
     * Returns an IterationResult that indicates the loop should continue.
     */
    private Mono<IterationResult> executeBackendTools(List<LlmResponse.ToolCall> backendCalls,
            List<StreamEvent> events,
            LoopState state) {

        // Process tools sequentially via recursive Mono
        return processToolCallsSequentially(backendCalls, 0, events, state);
    }

    /**
     * Process tool calls one by one, maintaining ordering guarantees.
     * AsyncTool results are streamed; sync tools are executed inline.
     */
    private Mono<IterationResult> processToolCallsSequentially(List<LlmResponse.ToolCall> toolCalls,
            int index,
            List<StreamEvent> events,
            LoopState state) {

        if (index >= toolCalls.size()) {
            // All tools executed — continue the loop
            return Mono.just(new IterationResult(events, true, state));
        }

        LlmResponse.ToolCall tc = toolCalls.get(index);
        events.add(StreamEvent.ToolCallEvent.builder()
                .toolCallId(tc.getId())
                .toolName(tc.getName())
                .args(tc.getArguments())
                .build());

        Tool tool = toolRegistry.get(tc.getName());
        if (tool == null) {
            // Unknown tool
            ToolResult errorResult = ToolResult.error("Unknown tool: " + tc.getName());
            events.add(StreamEvent.ToolResultEvent.builder()
                    .toolCallId(tc.getId())
                    .result(errorResult)
                    .build());
            state.workingMessages.add(ChatMessage.builder()
                    .role("tool")
                    .toolCallId(tc.getId())
                    .name(tc.getName())
                    .content(errorResult.getOutput() != null ? errorResult.getOutput()
                            : errorResult.getError())
                    .build());
            return processToolCallsSequentially(toolCalls, index + 1, events, state);
        }

        if (tool instanceof AsyncTool) {
            // AsyncTool: execute and collect all events (still within the
            // reactive chain — no blocking). The Flux is collected into a
            // list so we can extract the final ToolResultEvent.
            AsyncTool asyncTool = (AsyncTool) tool;
            return asyncTool.executeAsync(state.context, tc.getArguments())
                    .collectList()
                    .flatMap(asyncEvents -> {
                        // Add all async events to the iteration's event list
                        String toolResultContent = "";
                        for (StreamEvent event : asyncEvents) {
                            events.add(event);
                            if (event instanceof StreamEvent.ToolResultEvent) {
                                Object result = ((StreamEvent.ToolResultEvent) event).getResult();
                                toolResultContent = result != null ? result.toString() : "";
                            }
                        }
                        // Add tool result to working messages for the next LLM call
                        state.workingMessages.add(ChatMessage.builder()
                                .role("tool")
                                .toolCallId(tc.getId())
                                .name(tc.getName())
                                .content(toolResultContent)
                                .build());
                        return processToolCallsSequentially(toolCalls, index + 1, events, state);
                    });
        } else {
            // Sync tool: execute, emit progress, continue
            events.add(StreamEvent.DataEvent.builder()
                    .data(Collections.singletonList(mapOf(
                            "type", "agent_status",
                            "phase", "tool_calling",
                            "tool", tc.getName())))
                    .build());

            ToolResult result = tool.execute(state.context, tc.getArguments());
            events.add(StreamEvent.ToolResultEvent.builder()
                    .toolCallId(tc.getId())
                    .result(result)
                    .build());

            state.workingMessages.add(ChatMessage.builder()
                    .role("tool")
                    .toolCallId(tc.getId())
                    .name(tc.getName())
                    .content(result.isSuccess()
                            ? (result.getOutput() != null ? result.getOutput() : "")
                            : (result.getError() != null ? result.getError() : "Error"))
                    .build());

            return processToolCallsSequentially(toolCalls, index + 1, events, state);
        }
    }

    // ---- Iteration result and loop state ----

    /**
     * Result of a single loop iteration. Carries the events to emit and
     * a flag indicating whether the loop should continue.
     */
    private static class IterationResult {
        private final List<StreamEvent> events;
        private final boolean shouldContinue;
        private final LoopState state;

        IterationResult(List<StreamEvent> events, boolean shouldContinue, LoopState state) {
            this.events = events;
            this.shouldContinue = shouldContinue;
            this.state = state;
        }

        List<StreamEvent> getEvents() {
            return events;
        }

        boolean shouldContinue() {
            return shouldContinue;
        }

        LoopState getState() {
            return state;
        }
    }

    /**
     * Mutable state shared across loop iterations.
     * Encapsulates working messages, iteration counter, and references
     * needed by each iteration.
     */
    private static class LoopState {
        final List<ChatMessage> workingMessages;
        final AtomicInteger iteration;
        final int maxIterations;
        final LlmClient client;
        final Collection<String> toolIds;  // backend tool IDs (not frontend)
        final List<ChatTool> initialFrontendTools;  // mutable: merged with dynamic tools each iter
        final Set<String> frontendToolNames;  // mutable: rebuilt each iter
        final ToolContext context;

        LoopState(List<ChatMessage> workingMessages,
                AtomicInteger iteration,
                int maxIterations,
                LlmClient client,
                Collection<String> toolIds,
                List<ChatTool> initialFrontendTools,
                Set<String> frontendToolNames,
                ToolContext context) {
            this.workingMessages = workingMessages;
            this.iteration = iteration;
            this.maxIterations = maxIterations;
            this.client = client;
            this.toolIds = toolIds;
            this.initialFrontendTools = initialFrontendTools;
            this.frontendToolNames = frontendToolNames;
            this.context = context;
        }
    }

    // ---- Helpers ----

    private LlmResponse assembleResponse(List<StreamChunk> chunks) {
        StringBuilder contentBuilder = new StringBuilder();
        StringBuilder reasoningContentBuilder = new StringBuilder();
        List<LlmResponse.ToolCall> toolCalls = new ArrayList<>();
        Map<String, StringBuilder> toolCallArgs = new LinkedHashMap<>();

        String finishReason = "stop";
        LlmResponse.Usage usage = LlmResponse.Usage.builder().build();

        // Map: tool-call index → tool-call id (populated from the first chunk of each
        // call)
        Map<Integer, String> indexToId = new LinkedHashMap<>();

        for (StreamChunk chunk : chunks) {
            if ("content".equals(chunk.getType())) {
                contentBuilder.append(chunk.getContent() != null ? chunk.getContent() : "");
            } else if ("reasoning_content".equals(chunk.getType())) {
                reasoningContentBuilder.append(chunk.getReasoningContent() != null ? chunk.getReasoningContent() : "");
            } else if ("tool_call".equals(chunk.getType())) {
                String id = chunk.getToolCallId();
                Integer idx = chunk.getToolCallIndex();

                // First chunk of a tool call carries both id and name
                if (id != null && !id.isEmpty() && idx != null) {
                    indexToId.put(idx, id);
                }

                // Resolve the effective id: prefer explicit id, fall back to index lookup
                String effectiveId = (id != null && !id.isEmpty()) ? id : (idx != null ? indexToId.get(idx) : null);

                if (effectiveId != null) {
                    if (chunk.getToolCallName() != null && !chunk.getToolCallName().isEmpty()) {
                        // Start of a new tool call
                        toolCallArgs.put(effectiveId, new StringBuilder());
                    }
                    if (chunk.getToolCallArgumentsDelta() != null) {
                        toolCallArgs.computeIfAbsent(effectiveId, k -> new StringBuilder())
                                .append(chunk.getToolCallArgumentsDelta());
                    }
                }
            } else if ("done".equals(chunk.getType())) {
                if (chunk.getFinishReason() != null) {
                    finishReason = chunk.getFinishReason();
                }
                if (chunk.getUsage() != null) {
                    usage = chunk.getUsage();
                }
            }
        }

        // Assemble tool calls from accumulated arguments
        for (Map.Entry<String, StringBuilder> entry : toolCallArgs.entrySet()) {
            // Extract tool name from first occurrence
            String toolName = "";
            for (StreamChunk chunk : chunks) {
                if ("tool_call".equals(chunk.getType()) && entry.getKey().equals(chunk.getToolCallId())
                        && chunk.getToolCallName() != null && !chunk.getToolCallName().isEmpty()) {
                    toolName = chunk.getToolCallName();
                    break;
                }
            }
            toolCalls.add(LlmResponse.ToolCall.builder()
                    .id(entry.getKey())
                    .name(toolName)
                    .arguments(entry.getValue().toString())
                    .build());
        }

        return LlmResponse.builder()
                .content(contentBuilder.toString())
                .reasoningContent(reasoningContentBuilder.toString())
                .toolCalls(toolCalls)
                .finishReason(finishReason)
                .usage(usage)
                .build();
    }

    private Map<String, Object> mapOf(String k1, Object v1, String k2, Object v2, String k3, Object v3) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put(k1, v1);
        map.put(k2, v2);
        map.put(k3, v3);
        return map;
    }

    /**
     * Merge the initial frontend tools with dynamically activated skill tools.
     * Deduplicates by function name; initial tools take precedence.
     */
    private List<ChatTool> mergeFrontendAndDynamicTools(
            List<ChatTool> initialFrontendTools,
            List<ChatTool> dynamicTools) {
        Map<String, ChatTool> merged = new LinkedHashMap<>();
        // Dynamic tools first (lower priority)
        if (dynamicTools != null) {
            for (ChatTool dt : dynamicTools) {
                if (dt != null && dt.getFunction() != null && dt.getFunction().getName() != null) {
                    merged.putIfAbsent(dt.getFunction().getName(), dt);
                }
            }
        }
        // Initial frontend tools override (higher priority)
        if (initialFrontendTools != null) {
            for (ChatTool ft : initialFrontendTools) {
                if (ft != null && ft.getFunction() != null && ft.getFunction().getName() != null) {
                    merged.put(ft.getFunction().getName(), ft);
                }
            }
        }
        return new ArrayList<>(merged.values());
    }

    /**
     * Update the system message in workingMessages to include dynamic prompt
     * fragments from newly activated skills. Only adds fragments that aren't
     * already present (idempotent).
     */
    private void updateSystemPromptWithDynamicFragment(
            List<ChatMessage> workingMessages, String dynamicPrompt) {
        if (workingMessages.isEmpty()) {
            return;
        }
        ChatMessage first = workingMessages.get(0);
        if (!"system".equals(first.getRole())) {
            return;
        }
        String currentContent = first.getContent() != null ? first.getContent() : "";
        // Only append if not already present (idempotent check)
        if (!currentContent.contains(dynamicPrompt)) {
            String newContent = currentContent + "\n\nDynamically activated skill instructions:\n" + dynamicPrompt;
            first.setContent(newContent);
        }
    }
}
