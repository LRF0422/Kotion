package com.knowledge.agent.harness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.AgentMode;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.store.AgentStateStore;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResilience;
import com.knowledge.agent.llm.LlmResponse;
import com.knowledge.agent.llm.StreamChunk;
import com.knowledge.agent.tool.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

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
    private final LlmResilience llmResilience;

    /**
     * State store for crash-recovery snapshots. Injected by Spring for the root
     * agent bean; {@code null} for hand-constructed sub-agent instances (which
     * are short-lived and do not need persistence). When {@code agent.state.backend}
     * is not set (or set to a value other than {@code file}/{@code jdbc}), no
     * {@link AgentStateStore} bean exists and Spring injects {@code null} here
     * (parameter is {@link Nullable}).
     */
    private final AgentStateStore stateStore;

    /**
     * JSON serializer used for synchronous snapshot serialization in
     * {@link #saveSnapshot}. Field-injected by Spring so that hand-constructed
     * (non-Spring) instances (e.g. {@link SubAgent}) are unaffected — they never
     * save snapshots because {@code stateStore} is {@code null}.
     */
    @Autowired
    private ObjectMapper objectMapper;

    /**
     * Snapshot every N iterations (in addition to always snapshotting at
     * tool-call boundaries). Field initializer is the default for
     * hand-constructed (non-Spring) instances.
     */
    @Value("${agent.state.snapshot-interval:5}")
    private int snapshotInterval = 5;

    /**
     * When true (default), use the token-level streaming loop that forwards LLM
     * deltas as they arrive. When false, fall back to the legacy buffer-then-emit
     * loop. Lets the streaming rewrite be rolled out / rolled back per environment.
     *
     * <p>The Java field initializer ({@code = true}) is the default for instances
     * built via {@code new HarnessLoop(...)} (e.g. {@link SubAgent}, which is not
     * a Spring bean and therefore never gets {@code @Value} injection). For
     * Spring-managed beans, {@code @Value} runs after construction and overrides
     * this. Without the initializer, hand-constructed sub-agents would default to
     * {@code false} and run the legacy buffered loop — emitting no live
     * {@code subagent_*} progress, so the UI shows sub-agents stuck at "spawned".
     */
    @Value("${agent.harness.streaming.enabled:true}")
    private boolean streamingEnabled = true;

    /**
     * Per-tool execution timeout for synchronous tools (P4). Field initializer is
     * the default for hand-constructed (non-Spring) instances; {@code @Value}
     * overrides for Spring beans. Must stay non-zero — the streaming path applies
     * {@code .timeout(toolTimeoutSeconds)} to every sync tool, so a 0 default
     * (what an uninitialized field would give a sub-agent) would time out
     * instantly.
     */
    @Value("${agent.tool.timeout-seconds:180}")
    private int toolTimeoutSeconds = 180;

    // /**
    // * Extra tool names to treat as read-only in PLAN mode, beyond the built-in
    // * heuristic (get*/search*/read*/list*/fetch*/query* +
    // delegate/search_skills).
    // * Comma-separated (P7).
    // ** /
    @Value("${agent.plan-mode.read-only-tools:}")
    private String planReadOnlyToolsCsv;

    /**
     * Constructor — used by Spring for the root agent bean (single constructor,
     * so Spring auto-detects it for constructor injection) and by {@link SubAgent}
     * (which passes {@code null} for {@code stateStore} since sub-agents are
     * short-lived and do not need crash-recovery persistence).
     *
     * @param stateStore state store for crash-recovery snapshots (nullable;
     *                   when null, all persistence is silently skipped)
     */
    public HarnessLoop(LlmClientFactory llmClientFactory,
            ToolRegistry toolRegistry,
            LlmResilience llmResilience,
            @Nullable AgentStateStore stateStore) {
        this.llmClientFactory = llmClientFactory;
        this.toolRegistry = toolRegistry;
        this.llmResilience = llmResilience;
        this.stateStore = stateStore;
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

        // Iteration state — references shared across the reactive chain
        AtomicInteger iteration = new AtomicInteger(0);
        LlmClient client = llmClientFactory.getClientForModel(model);
        LoopState state = new LoopState(workingMessages, iteration, maxIterations,
                client, toolIds, frontendTools, frontendToolNames, context);

        // Restore from checkpoint ONLY when this is an explicit resume (e.g.
        // crash recovery). The frontend reuses the same sessionId across turns,
        // so loading a stale snapshot unconditionally would clobber the new
        // user message with mid-execution state from the previous turn.
        if (state.context != null && state.context.isResume()) {
            restoreFromSnapshot(state);
        }

        // Build the appropriate Flux for the streaming or legacy loop.
        Flux<StreamEvent> loopFlux;
        if (streamingEnabled) {
            // Token-level streaming loop: each iteration is itself a Flux that
            // forwards LLM deltas live, then recurses via concatWith(defer).
            // Flux.defer ensures the first iteration's side effects (iteration
            // increment, context compression) run at subscribe time.
            loopFlux = Flux.defer(() -> runTurn(state));
        } else {
            // Legacy buffer-then-emit loop (expand over collected IterationResults).
            // 1. Seed: a Mono<IterationResult> representing the first iteration
            // 2. expand(): if the result needs to continue, run the next iteration
            // 3. Take up to maxIterations
            // 4. Flatten all events from each iteration
            loopFlux = Mono.fromCallable(() -> state)
                    .flatMapMany(s -> runIteration(s)
                            .expand(result -> {
                                if (result.shouldContinue()) {
                                    return runIteration(result.getState());
                                }
                                return Flux.empty();
                            })
                            .take(maxIterations)
                            .flatMapIterable(IterationResult::getEvents));
        }

        // Clean up the persisted snapshot when the loop terminates — whether
        // it completed normally, errored, or was cancelled. This prevents a
        // stale mid-execution snapshot from clobbering the next turn (which
        // reuses the same sessionId) with old messages.
        return loopFlux.doFinally(signal -> {
            if (stateStore != null && state.context != null) {
                String sid = state.context.getSessionId();
                if (sid != null && !sid.isEmpty()) {
                    stateStore.delete(sid);
                }
            }
        });
    }

    // -------------------------------------------------------------------------
    // Streaming loop (P1): one iteration = one Flux of live events
    // -------------------------------------------------------------------------

    /**
     * Run a single streaming iteration and recurse.
     *
     * <p>
     * Structure: {@code thinking-status} → live LLM deltas (text/reasoning
     * forwarded as they arrive) → {@code continueOrFinish} (tool execution +
     * recursion or terminal finish). The LLM stream is consumed once: a side
     * {@link ResponseAccumulator} captures the full content + tool calls while
     * deltas flow to the client, so nothing is buffered before first paint.
     */
    private Flux<StreamEvent> runTurn(LoopState state) {
        int iter = state.iteration.incrementAndGet();
        if (iter > state.maxIterations) {
            return Flux.just(StreamEvent.FinishEvent.builder()
                    .finishReason("max_iterations")
                    .build());
        }

        // Interval-based snapshot: save every N iterations as a safety net
        // (tool-call boundaries are always saved in continueOrFinish)
        if (snapshotInterval > 0 && iter % snapshotInterval == 0) {
            saveSnapshot(state);
        }

        // Context window management
        state.context.getContextManager().compressIfNeeded(state.workingMessages);

        // Rebuild tools each iteration to pick up dynamically activated skills
        List<ChatTool> mergedFrontend = mergeFrontendAndDynamicTools(
                state.initialFrontendTools, state.context.getDynamicSkillRegistry().getActiveTools());

        // PLAN mode (P7), layer 1: only advertise read-only tools to the LLM so
        // it cannot even see mutating tools.
        boolean planMode = isPlanMode(state);
        Collection<String> effectiveToolIds = state.toolIds;
        List<ChatTool> effectiveFrontend = mergedFrontend;
        if (planMode) {
            effectiveToolIds = state.toolIds == null ? null
                    : state.toolIds.stream()
                            .filter(this::isReadOnlyTool)
                            .collect(Collectors.toCollection(LinkedHashSet::new));
            effectiveFrontend = mergedFrontend.stream()
                    .filter(ft -> ft.getFunction() == null || isReadOnlyTool(ft.getFunction().getName()))
                    .collect(Collectors.toList());
        }
        String toolsJson = toolRegistry.buildToolsJson(effectiveToolIds, effectiveFrontend);

        // frontendToolNames keeps the FULL set so the classifier can still detect
        // a (disallowed) frontend tool the model might call despite the catalog.
        state.frontendToolNames.clear();
        state.frontendToolNames.addAll(toolRegistry.getFrontendToolIds());
        for (ChatTool ft : mergedFrontend) {
            if (ft.getFunction() != null) {
                state.frontendToolNames.add(ft.getFunction().getName());
            }
        }

        String dynamicPrompt = state.context.getDynamicSkillRegistry().getPromptFragment();
        if (dynamicPrompt != null && !dynamicPrompt.isEmpty()) {
            updateSystemPromptWithDynamicFragment(state.workingMessages, dynamicPrompt);
        }

        StreamEvent thinkingEvent = StreamEvent.DataEvent.builder()
                .data(Collections.singletonList(mapOf(
                        "type", "agent_status",
                        "phase", "thinking",
                        "iteration", String.valueOf(iter))))
                .build();

        LlmRequest request = LlmRequest.builder()
                .model(null)
                .messages(state.workingMessages)
                .toolsJson(toolsJson)
                .stream(true)
                .build();

        ResponseAccumulator acc = new ResponseAccumulator();

        // Live deltas: feed the accumulator and forward user-visible deltas in
        // a single pass via handle() (no buffering, no mapNotNull dependency).
        // The LLM stream is wrapped with resilience (idle/first-token timeout).
        Flux<StreamEvent> live = llmResilience.apply(state.client.streamChat(request))
                .handle((chunk, sink) -> {
                    acc.feed(chunk);
                    StreamEvent delta = ResponseAccumulator.toDeltaEvent(chunk);
                    if (delta != null) {
                        sink.next(delta);
                    }
                });

        // After the stream completes, decide: execute tools + recurse, or finish.
        Flux<StreamEvent> tail = Flux.defer(() -> continueOrFinish(acc.assemble(), state));

        return Flux.concat(Flux.just(thinkingEvent), live, tail)
                .onErrorResume(e -> {
                    log.error("HarnessLoop streaming iteration error", e);
                    return Flux.just(
                            StreamEvent.ErrorEvent.builder()
                                    .error(e.getMessage())
                                    .code("INTERNAL")
                                    .retriable(Boolean.FALSE)
                                    .build(),
                            StreamEvent.FinishEvent.builder().finishReason("error").build());
                });
    }

    /**
     * Decide the next step after a streamed LLM turn has been assembled.
     * Mirrors the legacy {@code runIteration} tail logic but returns a live Flux.
     */
    private Flux<StreamEvent> continueOrFinish(LlmResponse response, LoopState state) {
        if (response == null) {
            return Flux.just(
                    StreamEvent.ErrorEvent.builder().error("Empty LLM response").build(),
                    StreamEvent.FinishEvent.builder().finishReason("error").build());
        }

        if (!response.hasToolCalls()) {
            return Flux.just(StreamEvent.FinishEvent.builder()
                    .finishReason(response.getFinishReason() != null ? response.getFinishReason() : "stop")
                    .promptTokens(response.getUsage() != null ? response.getUsage().getPromptTokens() : 0)
                    .completionTokens(response.getUsage() != null ? response.getUsage().getCompletionTokens() : 0)
                    .build());
        }

        // PLAN mode (P7): intercept present_plan → propose the plan and pause for
        // approval. The tool is never executed; the turn ends with a dedicated
        // "plan-approval" finish reason.
        for (LlmResponse.ToolCall tc : response.getToolCalls()) {
            if ("present_plan".equals(tc.getName())) {
                return Flux.just(
                        planProposedEvent(tc.getArguments()),
                        StreamEvent.FinishEvent.builder().finishReason("plan-approval").build());
            }
        }

        boolean planMode = isPlanMode(state);

        // Separate frontend and backend tool calls. In PLAN mode, any non
        // read-only call is routed to the backend path so it gets rejected with
        // PLAN_MODE_VIOLATION (layer 3) instead of executing — even if it is a
        // frontend tool that would otherwise run on the client.
        List<LlmResponse.ToolCall> frontendCalls = new ArrayList<>();
        List<LlmResponse.ToolCall> backendCalls = new ArrayList<>();
        for (LlmResponse.ToolCall tc : response.getToolCalls()) {
            boolean allowedReadOnly = !planMode || isReadOnlyTool(tc.getName());
            if (isFrontendCall(tc.getName(), state) && allowedReadOnly) {
                frontendCalls.add(tc);
            } else {
                backendCalls.add(tc);
            }
        }

        // Frontend tools: emit calls, finish (loop pauses; client executes)
        if (!frontendCalls.isEmpty()) {
            List<StreamEvent> events = new ArrayList<>();
            for (LlmResponse.ToolCall tc : frontendCalls) {
                events.add(StreamEvent.ToolCallEvent.builder()
                        .toolCallId(tc.getId())
                        .toolName(tc.getName())
                        .args(tc.getArguments())
                        .build());
            }
            events.add(StreamEvent.FinishEvent.builder().finishReason("tool-calls").build());
            return Flux.fromIterable(events);
        }

        // Backend tools: append a single assistant message carrying all tool
        // calls, execute them (streaming), then recurse.
        List<ChatMessage.ToolCallInfo> tcInfos = new ArrayList<>();
        for (LlmResponse.ToolCall tc : response.getToolCalls()) {
            tcInfos.add(new ChatMessage.ToolCallInfo(
                    tc.getId(), "function",
                    new ChatMessage.ToolCallInfo.FunctionInfo(tc.getName(), tc.getArguments())));
        }
        ChatMessage.ChatMessageBuilder assistantMsgBuilder = ChatMessage.builder().role("assistant");
        assistantMsgBuilder.content(
                response.getContent() != null && !response.getContent().isEmpty() ? response.getContent() : null);
        if (response.getReasoningContent() != null && !response.getReasoningContent().isEmpty()) {
            assistantMsgBuilder.reasoningContent(response.getReasoningContent());
        }
        assistantMsgBuilder.toolCalls(tcInfos);
        state.workingMessages.add(assistantMsgBuilder.build());

        // Save snapshot at the tool-call boundary (natural commit point),
        // before recursing into the next LLM turn. Fire-and-forget: the
        // stateStore.save() submits to a bounded async executor and returns
        // immediately, so the reactive stream is never blocked.
        return executeBackendToolsStreaming(backendCalls, state)
                .doOnComplete(() -> saveSnapshot(state))
                .concatWith(Flux.defer(() -> runTurn(state)));
    }

    /**
     * Execute backend tool calls sequentially (ordering preserved), streaming
     * each tool's events live instead of collecting them first.
     */
    private Flux<StreamEvent> executeBackendToolsStreaming(List<LlmResponse.ToolCall> backendCalls, LoopState state) {
        return Flux.fromIterable(backendCalls)
                .concatMap(tc -> executeOneBackendTool(tc, state));
    }

    private Flux<StreamEvent> executeOneBackendTool(LlmResponse.ToolCall tc, LoopState state) {
        StreamEvent toolCallEvent = StreamEvent.ToolCallEvent.builder()
                .toolCallId(tc.getId())
                .toolName(tc.getName())
                .args(tc.getArguments())
                .build();

        // PLAN mode (P7), layer 3 — hard backstop: refuse any mutating tool, even
        // if it slipped past the catalog filter. Fed back to the LLM so it can
        // re-plan via read-only tools, never actually executed.
        if (isPlanMode(state) && !isReadOnlyTool(tc.getName())) {
            ToolResult violation = ToolResult.error(
                    "PLAN_MODE_VIOLATION: tool '" + tc.getName() + "' may modify state and cannot run in "
                            + "plan mode. Use only read-only tools, then call present_plan to submit your plan.");
            appendToolMessage(state, tc, violation.getError());
            return Flux.just(toolCallEvent,
                    StreamEvent.ToolResultEvent.builder()
                            .toolCallId(tc.getId())
                            .result(violation)
                            .build());
        }

        Tool tool = toolRegistry.get(tc.getName());
        if (tool == null) {
            // Check if the tool is from a skill that hasn't been loaded yet
            // (e.g. LLM called search_skills(activate: ...) and this tool in
            // the same response — the skill may have just been activated but
            // the tool schema isn't in frontendToolNames yet).
            String hint = buildSkillToolHint(tc.getName(), state);
            ToolResult errorResult = ToolResult.error(hint);
            appendToolMessage(state, tc,
                    errorResult.getOutput() != null ? errorResult.getOutput() : errorResult.getError());
            return Flux.just(toolCallEvent,
                    StreamEvent.ToolResultEvent.builder()
                            .toolCallId(tc.getId())
                            .result(errorResult)
                            .build());
        }

        if (tool instanceof AsyncTool) {
            AsyncTool asyncTool = (AsyncTool) tool;
            StringBuilder resultHolder = new StringBuilder();
            Flux<StreamEvent> inner = asyncTool.executeAsync(state.context, tc.getArguments())
                    .doOnNext(ev -> {
                        if (ev instanceof StreamEvent.ToolResultEvent) {
                            Object result = ((StreamEvent.ToolResultEvent) ev).getResult();
                            resultHolder.setLength(0);
                            resultHolder.append(result != null ? result.toString() : "");
                        }
                    })
                    .concatWith(Flux.defer(() -> {
                        appendToolMessage(state, tc, resultHolder.toString());
                        return Flux.<StreamEvent>empty();
                    }));
            return Flux.concat(Flux.just(toolCallEvent), inner);
        }

        // Sync tool: emit progress, then execute off the event loop.
        StreamEvent statusEvent = StreamEvent.DataEvent.builder()
                .data(Collections.singletonList(mapOf(
                        "type", "agent_status",
                        "phase", "tool_calling",
                        "tool", tc.getName())))
                .build();

        Mono<StreamEvent> resultMono = Mono.fromCallable(() -> {
            ToolResult result = tool.execute(state.context, tc.getArguments());
            appendToolMessage(state, tc, result.isSuccess()
                    ? (result.getOutput() != null ? result.getOutput() : "")
                    : (result.getError() != null ? result.getError() : "Error"));
            return (StreamEvent) StreamEvent.ToolResultEvent.builder()
                    .toolCallId(tc.getId())
                    .result(result)
                    .build();
        }).subscribeOn(Schedulers.boundedElastic())
                // Per-tool timeout (P4): a hung sync tool becomes a recoverable
                // tool error fed back to the LLM, instead of stalling the turn.
                .timeout(Duration.ofSeconds(toolTimeoutSeconds))
                .onErrorResume(err -> {
                    String msg = (err instanceof java.util.concurrent.TimeoutException)
                            ? "Tool " + tc.getName() + " timed out after " + toolTimeoutSeconds + "s"
                            : "Tool " + tc.getName() + " failed: " + err.getMessage();
                    appendToolMessage(state, tc, msg);
                    return Mono.just((StreamEvent) StreamEvent.ToolResultEvent.builder()
                            .toolCallId(tc.getId())
                            .result(ToolResult.error(msg))
                            .build());
                });

        return Flux.concat(Flux.just(toolCallEvent, statusEvent), resultMono);
    }

    private void appendToolMessage(LoopState state, LlmResponse.ToolCall tc, String content) {
        state.workingMessages.add(ChatMessage.builder()
                .role("tool")
                .toolCallId(tc.getId())
                .name(tc.getName())
                .content(content != null ? content : "")
                .build());
    }

    // ---- State snapshot / crash recovery (Task 3) ----

    /**
     * Persist a snapshot of the current loop state to disk asynchronously.
     * Fire-and-forget: {@code stateStore.save()} submits to a bounded executor
     * and returns immediately, so the reactive stream is never blocked.
     *
     * <p>Skipped silently when {@code stateStore} is null (sub-agents) or when
     * the session ID is unavailable.
     */
    private void saveSnapshot(LoopState state) {
        if (stateStore == null) {
            return;
        }
        try {
            String sessionId = state.context != null ? state.context.getSessionId() : null;
            if (sessionId == null || sessionId.isEmpty()) {
                return;
            }

            Set<String> activatedSkills = Collections.emptySet();
            if (state.context.getSkillCatalog() != null) {
                activatedSkills = state.context.getSkillCatalog().getActivatedSkillNames();
            }

            AgentStateSnapshot snapshot = AgentStateSnapshot.builder()
                    .conversationId(state.context.getConversationId())
                    .sessionId(sessionId)
                    .agentId(state.context.getAgentId())
                    .parentAgentId(null)
                    .depth(state.context.getDelegateDepth())
                    .iteration(state.iteration.get())
                    .workingMessages(new ArrayList<>(state.workingMessages))
                    .activatedSkillNames(activatedSkills)
                    .toolCallHistory(buildToolCallHistory(state.workingMessages))
                    .orchestrationPlan(state.context != null ? state.context.getOrchestrationPlan() : null)
                    .timestamp(System.currentTimeMillis())
                    .build();

            // Serialize synchronously on the reactive thread to avoid the
            // shallow-copy race: ChatMessage objects are shared references,
            // and the async executor may see them mutated in-place (e.g. by
            // updateSystemPromptWithDynamicFragment) before serialization
            // completes. By serializing to bytes here, the snapshot is a
            // stable immutable copy before the async file write.
            byte[] json = objectMapper.writeValueAsBytes(snapshot);
            stateStore.saveBytes(sessionId, json);
        } catch (Exception e) {
            log.warn("Failed to save agent state snapshot: {}", e.getMessage());
        }
    }

    /**
     * Restore the loop state from a persisted snapshot. Replaces working
     * messages, restores the iteration counter, and re-activates skills
     * that were active when the snapshot was taken.
     *
     * <p>Called once at the start of {@code run()}, before the first LLM
     * call. If no snapshot exists or loading fails, the loop starts fresh.
     */
    private void restoreFromSnapshot(LoopState state) {
        if (stateStore == null) {
            return;
        }
        String sessionId = state.context != null ? state.context.getSessionId() : null;
        if (sessionId == null || sessionId.isEmpty()) {
            return;
        }
        try {
            AgentStateSnapshot snapshot = stateStore.load(sessionId);
            if (snapshot == null) {
                return;
            }
            log.info("Restoring agent state for sessionId={}, iteration={}, messages={}",
                    sessionId, snapshot.getIteration(),
                    snapshot.getWorkingMessages() != null ? snapshot.getWorkingMessages().size() : 0);

            // Replace working messages with the snapshot's
            state.workingMessages.clear();
            if (snapshot.getWorkingMessages() != null) {
                state.workingMessages.addAll(snapshot.getWorkingMessages());
            }

            // Restore iteration count (next increment will be snapshot + 1)
            state.iteration.set(snapshot.getIteration());

            // Re-activate skills that were active at snapshot time
            if (snapshot.getActivatedSkillNames() != null && state.context.getSkillCatalog() != null) {
                for (String skillName : snapshot.getActivatedSkillNames()) {
                    state.context.getSkillCatalog().activate(skillName);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to restore agent state for sessionId={}: {}",
                    sessionId, e.getMessage());
        }
    }

    /**
     * Build a list of recent tool call records from the working messages.
     * Scans for assistant messages carrying {@code tool_calls} and pairs
     * each with its corresponding {@code tool} result message.
     */
    private List<AgentStateSnapshot.ToolCallRecord> buildToolCallHistory(
            List<ChatMessage> messages) {
        List<AgentStateSnapshot.ToolCallRecord> history = new ArrayList<>();
        // Pending tool calls (id → builder) awaiting their result message
        Map<String, AgentStateSnapshot.ToolCallRecord.ToolCallRecordBuilder> pending =
                new LinkedHashMap<>();

        for (ChatMessage msg : messages) {
            if ("assistant".equals(msg.getRole()) && msg.getToolCalls() != null) {
                for (ChatMessage.ToolCallInfo tc : msg.getToolCalls()) {
                    if (tc.getFunction() != null) {
                        AgentStateSnapshot.ToolCallRecord.ToolCallRecordBuilder b =
                                AgentStateSnapshot.ToolCallRecord.builder()
                                        .toolCallId(tc.getId())
                                        .toolName(tc.getFunction().getName())
                                        .arguments(tc.getFunction().getArguments());
                        pending.put(tc.getId(), b);
                    }
                }
            } else if ("tool".equals(msg.getRole()) && msg.getToolCallId() != null) {
                AgentStateSnapshot.ToolCallRecord.ToolCallRecordBuilder b =
                        pending.get(msg.getToolCallId());
                if (b != null) {
                    b.result(msg.getContent())
                     .success(true);
                    history.add(b.build());
                    pending.remove(msg.getToolCallId());
                }
            }
        }
        return history;
    }

    // ---- Plan mode helpers (P7) ----

    private boolean isPlanMode(LoopState state) {
        return state.context != null && state.context.getMode() == AgentMode.PLAN;
    }

    /**
     * Decide whether a tool call should be routed to the frontend for execution.
     *
     * <p>A tool registered as a (non-frontend) <b>backend</b> tool ALWAYS executes
     * on the backend — even if a skill or the client catalog also advertised a
     * tool of the same name. Without this precedence, backend tools like
     * {@code web_search} get misrouted to the client (which has no implementation),
     * producing "Tool X is not available on frontend" and stalling the agent.
     */
    private boolean isFrontendCall(String toolName, LoopState state) {
        Tool registered = toolRegistry.get(toolName);
        if (registered != null && !registered.isFrontend()) {
            return false;
        }
        return state.frontendToolNames.contains(toolName);
    }

    /**
     * Build a helpful error message for a tool that is not in the backend
     * {@link ToolRegistry} but may be available via a skill in the
     * {@link SkillCatalog}.
     *
     * <p>When the LLM calls {@code search_skills(activate: "bitable-skill")} and
     * {@code addBitableRecord(...)} in the same response, both are classified as
     * backend calls (because the skill's tools are not yet in
     * {@code frontendToolNames}). {@code search_skills} executes first and
     * activates the skill, but {@code addBitableRecord} is still not in the
     * backend {@code ToolRegistry}. Instead of returning a bare "Unknown tool",
     * this method produces a context-aware hint that tells the LLM:
     * <ul>
     * <li>Which skill provides the tool</li>
     * <li>Whether the skill was just activated (so the schema will be available
     *     next iteration) or still needs activation</li>
     * </ul>
     *
     * @param toolName function name that was not found in the ToolRegistry
     * @param state    current loop state
     * @return descriptive error message for the tool result
     */
    private String buildSkillToolHint(String toolName, LoopState state) {
        SkillCatalog catalog = state.context != null ? state.context.getSkillCatalog() : null;
        if (catalog == null || !catalog.containsTool(toolName)) {
            return "Unknown tool: " + toolName;
        }
        String skillName = catalog.findSkillNameForTool(toolName);
        DynamicSkillRegistry dynamicReg = state.context != null
                ? state.context.getDynamicSkillRegistry() : null;
        boolean justActivated = dynamicReg != null
                && dynamicReg.getActivatedSkillNames().contains(skillName);
        if (justActivated) {
            return "Tool '" + toolName + "' is provided by skill '" + skillName
                    + "', which was just activated. Its parameter schema is now loaded. "
                    + "Please call this tool again in your next response with the correct parameters.";
        }
        return "Tool '" + toolName + "' is provided by skill '" + skillName
                + "', which has not been activated yet. "
                + "Use search_skills with activate: \"" + skillName + "\" first, "
                + "then call this tool in the next response.";
    }

    /**
     * Whether a tool is safe to run in PLAN mode (read-only / no side effects).
     * Combines an explicit allowlist with a conservative name heuristic; default
     * is to treat unknown tools as mutating (default-deny).
     */
    private boolean isReadOnlyTool(String name) {
        if (name == null) {
            return false;
        }
        if ("present_plan".equals(name) || "search_skills".equals(name)) {
            // present_plan ends the plan; search_skills only reveals more tools.
            // NB: `delegate` is intentionally NOT allowed in plan mode — sub-agents
            // run a loop that doesn't yet enforce plan gating, so spawning them
            // could bypass the read-only guarantee. Disallow until that's closed.
            return true;
        }
        if (planReadOnlyToolsCsv != null && !planReadOnlyToolsCsv.isEmpty()) {
            for (String t : planReadOnlyToolsCsv.split(",")) {
                if (name.equals(t.trim())) {
                    return true;
                }
            }
        }
        String n = name.toLowerCase();
        return n.startsWith("get") || n.startsWith("search") || n.startsWith("read")
                || n.startsWith("list") || n.startsWith("fetch") || n.startsWith("query")
                || n.contains("search") || n.equals("selection") || n.equals("range") || n.equals("history");
    }

    /**
     * Build the {@code plan_proposed} annotation event from the present_plan
     * arguments (the structured PlanArtifact JSON).
     */
    private StreamEvent planProposedEvent(String planArgsJson) {
        Object plan = planArgsJson;
        try {
            // Parse so the frontend receives a structured object, not a string.
            plan = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(planArgsJson != null ? planArgsJson : "{}", Object.class);
        } catch (Exception ignore) {
            // fall back to raw string
        }
        Map<String, Object> annotation = new LinkedHashMap<>();
        annotation.put("type", "plan_proposed");
        annotation.put("plan", plan);
        return StreamEvent.DataEvent.builder()
                .data(Collections.singletonList(annotation))
                .build();
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
        state.context.getContextManager().compressIfNeeded(state.workingMessages);

        // Rebuild toolsJson on each iteration to pick up dynamically
        // activated skills (from search_skills tool)
        List<ChatTool> mergedFrontend = mergeFrontendAndDynamicTools(
                state.initialFrontendTools, state.context.getDynamicSkillRegistry().getActiveTools());
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
        String dynamicPrompt = state.context.getDynamicSkillRegistry().getPromptFragment();
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
                        // Separate frontend and backend tool calls. Backend-
                        // registered tools always run on the backend (see
                        // isFrontendCall) so tools like web_search are never
                        // misrouted to the client.
                        List<LlmResponse.ToolCall> frontendCalls = new ArrayList<>();
                        List<LlmResponse.ToolCall> backendCalls = new ArrayList<>();
                        for (LlmResponse.ToolCall tc : response.getToolCalls()) {
                            if (isFrontendCall(tc.getName(), state)) {
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
            // All tools executed — save checkpoint, then continue the loop
            saveSnapshot(state);
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
            // Check if the tool is from a skill that hasn't been loaded yet
            String hint = buildSkillToolHint(tc.getName(), state);
            ToolResult errorResult = ToolResult.error(hint);
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
        final Collection<String> toolIds; // backend tool IDs (not frontend)
        final List<ChatTool> initialFrontendTools; // mutable: merged with dynamic tools each iter
        final Set<String> frontendToolNames; // mutable: rebuilt each iter
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

    // Markers delimiting the re-renderable dynamic-skills section of the system
    // prompt. Using a replaceable section (P2) instead of blind string-append +
    // contains() makes dynamic skill activation idempotent and updatable: the
    // section is recomputed from the current DynamicCapabilityState each turn.
    private static final String DYN_BEGIN = "<<<DYNAMIC_SKILLS_BEGIN>>>";
    private static final String DYN_END = "<<<DYNAMIC_SKILLS_END>>>";

    /**
     * Render the system message's dynamic-skills section to reflect the current
     * set of activated skill fragments. Idempotent and re-renderable: any prior
     * section is replaced, not appended to.
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
        String content = first.getContent() != null ? first.getContent() : "";

        // Strip any existing dynamic section first (makes this re-renderable).
        int begin = content.indexOf(DYN_BEGIN);
        if (begin >= 0) {
            int end = content.indexOf(DYN_END);
            int cut = end >= 0 ? end + DYN_END.length() : content.length();
            content = (content.substring(0, begin) + content.substring(Math.min(cut, content.length())))
                    .replaceAll("\\s+$", "");
        }

        if (dynamicPrompt != null && !dynamicPrompt.isEmpty()) {
            content = content
                    + "\n\n" + DYN_BEGIN + "\n"
                    + "Dynamically activated skill instructions:\n"
                    + dynamicPrompt + "\n"
                    + DYN_END;
        }
        first.setContent(content);
    }
}
