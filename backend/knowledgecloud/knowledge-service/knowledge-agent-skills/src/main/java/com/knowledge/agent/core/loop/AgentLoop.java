package com.knowledge.agent.core.loop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.checkpoint.DelegationRecord;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.context.ContextManager;
import com.knowledge.agent.core.delegate.Delegation;
import com.knowledge.agent.core.delegate.Delegator;
import com.knowledge.agent.core.event.RunEvent;
import com.knowledge.agent.core.event.RunEventLog;
import com.knowledge.agent.core.event.RunEvents;
import com.knowledge.agent.core.llm.LlmGateway;
import com.knowledge.agent.core.llm.LlmInferRequest;
import com.knowledge.agent.core.llm.LlmResult;
import com.knowledge.agent.core.llm.ToolCallRequest;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.PendingToolCall;
import com.knowledge.agent.core.run.RunCancelFlag;
import com.knowledge.agent.core.run.RunStatus;
import com.knowledge.agent.core.run.RunStore;
import com.knowledge.agent.core.savedskill.SavedSkillProvenance;
import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolGateway;
import com.knowledge.agent.core.tool.ToolOutcome;
import com.knowledge.agent.core.tool.ToolResultLimiter;
import com.knowledge.agent.core.tool.ToolSpec;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * AgentCore loop — the synchronous driver of one run.
 *
 * <pre>
 * loop:
 *   1. restore checkpoint (or build fresh: system prompt + memory + history)
 *   2. save checkpoint (safe boundary BEFORE inference)
 *   3. stream inference → text.delta / reasoning.delta + tool calls
 *   4. no tool calls → complete
 *   5. route tool calls: backend tools execute in-process (bounded parallel),
 *      frontend (editor) tools pause the run in WAITING_TOOLS until resume
 *   6. observe results → next step (budget → SUSPENDED, wait for continue)
 * </pre>
 *
 * <p>The loop is deliberately blocking: one loop = one executor thread. Crash
 * recovery rebuilds exactly this state from the checkpoint, so at most the
 * in-flight step is re-run (its already-emitted events are skipped by the
 * client's afterSeq).
 */
@Slf4j
public class AgentLoop implements Runnable {

    /** Creation info for a fresh run (recovered loops don't need it). */
    public interface RunInput {
        List<ChatMessage> messages();

        List<ToolSpec> clientTools();

        /**
         * Skill-owned tools registered as deferred: callable, but withheld from
         * the model's tool list until first use (their JSON Schemas would
         * otherwise inflate every prompt).
         */
        default List<ToolSpec> skillTools() {
            return java.util.Collections.emptyList();
        }

        List<String> skillFragments();

        /**
         * Extra client system-prompt text (editor rules) appended after the
         * base prompt. Must reach the model on root runs too — historically it
         * was only merged for child runs, silently dropping the editor rules.
         */
        default String systemPrompt() {
            return null;
        }

        List<String> memoryLines();

        /** Rolling session-memory summary of the conversation (may be null). */
        default String threadSummary() {
            return null;
        }

        default List<SavedSkillProvenance> savedSkillProvenance() {
            return java.util.Collections.emptyList();
        }

        String model();

        String mode();

        Double temperature();

        Integer maxTokens();

        Integer maxSteps();

        boolean noTools();
    }

    /** Notifies the supervisor when the loop reaches a terminal state. */
    public interface ExitCallback {
        void onExit(String runId);
    }

    /**
     * Provider finish reasons meaning "output hit the token ceiling", not
     * "task finished". A truncated turn must never complete the run — the model
     * simply ran out of room mid-answer.
     */
    private static final java.util.Set<String> TRUNCATED_FINISH_REASONS = new java.util.HashSet<>(
            java.util.Arrays.asList("length", "max_tokens", "max_output_tokens"));

    /** Bounded auto-continue after a truncated turn, so a bad model cannot spin. */
    private static final int MAX_TRUNCATION_CONTINUES = 3;

    /** Injected after a truncated turn to get the model to resume, not re-plan. */
    private static final String TRUNCATION_CONTINUE_NUDGE =
            "[系统] 你的上一条回复因输出长度上限被截断，当前任务尚未完成。请从中断处继续，"
            + "直接调用必要的工具把任务做完；不要重复已完成的步骤，也不要只描述计划。";

    private final AgentRun run;

    /** Replaced by initFreshCheckpoint on fresh runs; restored on recovery. */
    private Checkpoint checkpoint;

    private final RunInput runInput;
    private final RunStore runStore;
    private final CheckpointStore checkpointStore;
    private final RunEventLog eventLog;
    private final LlmGateway llmGateway;
    private final ToolGateway toolGateway;
    private final ContextManager contextManager;
    private final Delegator delegator;
    private final ObjectMapper objectMapper;
    private final AgentCoreProperties properties;
    private final ExecutorService toolExecutor;
    private final ExitCallback exitCallback;

    /** Gate the supervisor uses to deliver resume payloads / cancel. */
    private final ResumeGate gate;

    /** Cross-instance cancel marker (cancel may arrive on a non-owning node). */
    private final RunCancelFlag cancelFlag;

    /** Throttle for the external-cancel Redis lookup. */
    private static final long EXTERNAL_CANCEL_POLL_MS = 2000L;

    private volatile long lastExternalCancelCheckMs;

    private volatile boolean externallyCancelled;

    private final Map<String, ToolSpec> clientToolSpecs = new HashMap<>();

    /**
     * Deferred client tools (skill-owned): routable and executable, but absent
     * from the tools JSON until the model actually calls one, at which point the
     * spec is promoted into {@link #clientToolSpecs}. Keeps plugin schemas
     * (chart/mermaid/drawio…) out of every prompt without making them
     * uncallable.
     */
    private final Map<String, ToolSpec> deferredToolSpecs = new java.util.LinkedHashMap<>();

    /** Live sub-agent delegations keyed by the parent-side delegate call id. */
    private final Map<String, Delegation> activeDelegations = new java.util.LinkedHashMap<>();

    private volatile boolean cancelRequested;

    private long lastHotFlushMs;

    /** Working-memory holder backed by the checkpoint scratchpad. */
    private final ToolContext.ScratchpadHolder scratchpad = new ToolContext.ScratchpadHolder();

    public AgentLoop(AgentRun run, Checkpoint checkpoint, RunInput runInput,
                     RunStore runStore, CheckpointStore checkpointStore, RunEventLog eventLog,
                     LlmGateway llmGateway, ToolGateway toolGateway, ContextManager contextManager,
                     Delegator delegator, ObjectMapper objectMapper, AgentCoreProperties properties,
                     ExecutorService toolExecutor, ExitCallback exitCallback, ResumeGate gate,
                     RunCancelFlag cancelFlag) {
        this.run = run;
        this.checkpoint = checkpoint;
        this.runInput = runInput;
        this.runStore = runStore;
        this.checkpointStore = checkpointStore;
        this.eventLog = eventLog;
        this.llmGateway = llmGateway;
        this.toolGateway = toolGateway;
        this.contextManager = contextManager;
        this.delegator = delegator;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.toolExecutor = toolExecutor;
        this.exitCallback = exitCallback;
        this.gate = gate;
        this.cancelFlag = cancelFlag;
        if (runInput != null && runInput.clientTools() != null) {
            for (ToolSpec spec : runInput.clientTools()) {
                if (spec != null && spec.getName() != null) {
                    clientToolSpecs.put(spec.getName(), spec);
                }
            }
        }
        // Recovery: the client tool catalog is persisted in the checkpoint so a
        // rebuilt loop routes frontend tools exactly like the original run.
        if (checkpoint != null && checkpoint.getClientTools() != null) {
            for (ToolSpec spec : checkpoint.getClientTools()) {
                if (spec != null && spec.getName() != null) {
                    clientToolSpecs.put(spec.getName(), spec);
                }
            }
        }
        // Deferred pool: creation input for a fresh run, checkpoint on recovery.
        // Anything already activated lives in clientToolSpecs and stays there.
        if (runInput != null && runInput.skillTools() != null) {
            for (ToolSpec spec : runInput.skillTools()) {
                if (spec != null && spec.getName() != null && !clientToolSpecs.containsKey(spec.getName())) {
                    deferredToolSpecs.put(spec.getName(), spec);
                }
            }
        }
        if (checkpoint != null && checkpoint.getDeferredTools() != null) {
            for (ToolSpec spec : checkpoint.getDeferredTools()) {
                if (spec != null && spec.getName() != null && !clientToolSpecs.containsKey(spec.getName())) {
                    deferredToolSpecs.put(spec.getName(), spec);
                }
            }
        }
    }

    public void requestCancel() {
        this.cancelRequested = true;
        this.gate.cancel();
    }

    public boolean isCancelled() {
        if (cancelRequested) {
            return true;
        }
        return checkExternalCancel();
    }

    /**
     * Detect a cancellation published by another instance. Throttled so the
     * per-token sink does not hit Redis on every chunk.
     */
    private boolean checkExternalCancel() {
        if (externallyCancelled) {
            return true;
        }
        if (cancelFlag == null || run == null || run.getRunId() == null) {
            return false;
        }
        long now = System.currentTimeMillis();
        if (now - lastExternalCancelCheckMs < EXTERNAL_CANCEL_POLL_MS) {
            return false;
        }
        lastExternalCancelCheckMs = now;
        if (cancelFlag.isMarked(run.getRunId())) {
            externallyCancelled = true;
            cancelRequested = true;
            gate.cancel();
            return true;
        }
        return false;
    }

    public AgentRun getRun() {
        return run;
    }

    public ResumeGate gate() {
        return gate;
    }

    @Override
    public void run() {
        try {
            if (checkpoint == null) {
                initFreshCheckpoint();
            } else {
                // Recovery: rebuild working memory + accumulated text.
                run.setAssistantText(checkpoint.getAssistantText() != null ? checkpoint.getAssistantText() : "");
                scratchpad.write(checkpoint.getScratchpad());
                // Plan approval survives a crash: the gate is only hot state,
                // so an approved plan must be restored from the checkpoint or
                // every write tool would be re-blocked as PLAN_MODE_BLOCKED.
                run.setPlanGateOpen(checkpoint.isPlanGateOpen());
                run.setNextStep(checkpoint.getNextStep());
            }

            RunStatus status = run.statusEnum();
            // Children keep running while the parent does its own work, so a
            // rebuilt parent re-attaches to whatever it still has in flight —
            // independent of whether the parent itself was waiting for tools.
            if (!checkpoint.getDelegations().isEmpty()) {
                rebuildDelegations();
            }
            if (status == RunStatus.WAITING_TOOLS && !checkpoint.getPendingToolCalls().isEmpty()) {
                // Crashed while waiting for its OWN frontend tool results.
                run.setPendingToolCalls(new ArrayList<>(checkpoint.getPendingToolCalls()));
                if (!dispatchWaitForPending()) {
                    return;
                }
                if (!activeDelegations.isEmpty() && !delegationWait()) {
                    return;
                }
            } else if (status == RunStatus.WAITING_TOOLS) {
                // Every awaited result was already applied before the crash: the
                // step can continue instead of parking on an empty wait.
                run.setPendingToolCalls(new ArrayList<>());
            } else if (status == RunStatus.SUSPENDED && "budget".equals(run.getSuspendReason())) {
                if (!waitForBudgetGrant()) {
                    return;
                }
            } else if (status == RunStatus.SUSPENDED && "plan_approval".equals(run.getSuspendReason())) {
                if (!planApprovalWait(checkpoint.getPendingPlanCalls())) {
                    return;
                }
            }

            // Bounded auto-continue counter for turns truncated by the token limit.
            int truncationContinues = 0;
            while (!isCancelled() && !run.statusEnum().isTerminal()) {
                run.setStatus(RunStatus.RUNNING.name());
                run.touch();
                persist();

                saveCheckpoint(); // safe boundary BEFORE inference
                emit(RunEvents.STEP_STARTED, RunEvents.stepStarted(checkpoint.getNextStep()));

                List<ChatMessage> messages = contextManager.assemble(checkpoint.getMessages(),
                        checkpoint.getModel());
                int toolCount = clientToolSpecs.size() + toolGateway.backendSpecs().size();
                long estimatedTokens = contextManager.estimateTokens(messages, toolCount);
                if (estimatedTokens > properties.getContext().getMaxContextTokens() * 1.5) {
                    log.warn("Run {} context over budget: {} tokens (budget {}) — M3 compacts",
                            run.getRunId(), estimatedTokens,
                            properties.getContext().getMaxContextTokens());
                }

                LlmInferRequest inferRequest = LlmInferRequest.builder()
                        .model(checkpoint.getModel())
                        .messages(messages)
                        .toolsJson(checkpoint.isNoTools()
                                ? null
                                : toolGateway.buildToolsJson(new ArrayList<>(clientToolSpecs.values())))
                        .temperature(checkpoint.getTemperature() != null ? checkpoint.getTemperature() : 0.7)
                        .maxTokens(checkpoint.getMaxTokens() != null ? checkpoint.getMaxTokens() : 8192)
                        .build();

                LlmResult result = llmGateway.streamInfer(inferRequest, new LlmGateway.Sink() {
                    @Override
                    public void onText(String delta) {
                        run.setAssistantText((run.getAssistantText() == null ? "" : run.getAssistantText()) + delta);
                        emit(RunEvents.TEXT_DELTA, RunEvents.textDelta(delta));
                        saveHot(false);
                    }

                    @Override
                    public void onReasoning(String delta) {
                        emit(RunEvents.REASONING_DELTA, RunEvents.reasoningDelta(delta));
                    }
                }, this::isCancelled);

                checkpoint.setPromptTokens(checkpoint.getPromptTokens() + result.getPromptTokens());
                checkpoint.setCompletionTokens(checkpoint.getCompletionTokens() + result.getCompletionTokens());
                checkpoint.setCachedPromptTokens(checkpoint.getCachedPromptTokens() + result.getCachedPromptTokens());
                run.setPromptTokens(checkpoint.getPromptTokens());
                run.setCompletionTokens(checkpoint.getCompletionTokens());
                run.setCachedPromptTokens(checkpoint.getCachedPromptTokens());

                if (isCancelled()) {
                    return;
                }

                if (result.getToolCalls().isEmpty()) {
                    String finishReason = result.getFinishReason() != null
                            ? result.getFinishReason() : "stop";
                    // A turn cut off by the output-token limit is not a finished
                    // task: keep the partial answer and ask the model to resume,
                    // bounded so a pathological repeat cannot spin forever.
                    if (isTruncatedFinish(finishReason)
                            && !checkpoint.isNoTools()
                            && truncationContinues < MAX_TRUNCATION_CONTINUES) {
                        truncationContinues++;
                        if (result.getText() != null && !result.getText().isEmpty()) {
                            checkpoint.getMessages().add(ChatMessage.builder()
                                    .role("assistant")
                                    .content(result.getText())
                                    .build());
                        }
                        // user role (not system) so providers that only accept a
                        // leading system message do not reject the follow-up.
                        checkpoint.getMessages().add(ChatMessage.builder()
                                .role("user")
                                .content(TRUNCATION_CONTINUE_NUDGE)
                                .build());
                        log.warn("Run {}: response truncated (finishReason={}) — auto-continuing {}/{}",
                                run.getRunId(), finishReason,
                                truncationContinues, MAX_TRUNCATION_CONTINUES);
                        continue;
                    }
                    if (result.getText() != null && !result.getText().isEmpty()) {
                        checkpoint.getMessages().add(ChatMessage.builder()
                                .role("assistant")
                                .content(result.getText())
                                .build());
                    }
                    complete(finishReason);
                    return;
                }

                // Append the assistant message carrying tool_calls BEFORE any
                // tool messages, so the conversation stays well-formed for the
                // next inference (and for crash recovery).
                checkpoint.getMessages().add(buildAssistantMessage(result));

                List<ToolCallRequest> backendCalls = new ArrayList<>();
                List<ToolCallRequest> frontendCalls = new ArrayList<>();
                List<ToolCallRequest> planCalls = new ArrayList<>();
                List<ToolCallRequest> delegateCalls = new ArrayList<>();
                for (ToolCallRequest call : result.getToolCalls()) {
                    if ("present_plan".equals(call.getName())
                            && "plan".equalsIgnoreCase(run.getMode())) {
                        planCalls.add(call); // loop intercepts → approval suspend
                        continue;
                    }
                    if ("delegate".equals(call.getName())) {
                        if (planGateBlocks(call.getName())) {
                            rejectToolCall(call, "PLAN_MODE_BLOCKED");
                        } else {
                            delegateCalls.add(call);
                        }
                        continue;
                    }
                    BackendTool backendTool = toolGateway.backendTool(call.getName());
                    if (backendTool != null) {
                        if (planGateBlocks(call.getName())) {
                            rejectToolCall(call, "PLAN_MODE_BLOCKED");
                        } else {
                            backendCalls.add(call);
                        }
                    } else if (clientToolSpecs.containsKey(call.getName())
                            || deferredToolSpecs.containsKey(call.getName())) {
                        if (planGateBlocksClient(call.getName())) {
                            rejectToolCall(call, "PLAN_MODE_BLOCKED");
                        } else {
                            activateDeferred(call.getName());
                            frontendCalls.add(call);
                        }
                    } else {
                        rejectToolCall(call,
                                "TOOL_NOT_FOUND: 工具未注册，请检查工具名或改用可用工具");
                    }
                }

                executeBackend(backendCalls);

                // Cancellation may have arrived during a long backend tool batch;
                // never pause/suspend after a terminal cancel (that resurrects the
                // run and reconcile re-drives it).
                if (isCancelled()) {
                    return;
                }

                if (!planCalls.isEmpty()) {
                    if (!planApprovalFlow(planCalls)) {
                        return;
                    }
                }
                if (!delegateCalls.isEmpty()) {
                    spawnDelegations(delegateCalls);
                    if (!delegationWait()) {
                        return;
                    }
                }
                if (!frontendCalls.isEmpty()) {
                    if (!dispatchFrontendAndWait(frontendCalls)) {
                        return;
                    }
                }

                checkpoint.setNextStep(checkpoint.getNextStep() + 1);
                int stepBudget = checkpoint.getMaxSteps() != null
                        ? checkpoint.getMaxSteps() : properties.getRun().getMaxSteps();
                if (checkpoint.getNextStep() > stepBudget) {
                    suspendBudget();
                    if (!waitForBudgetGrant()) {
                        return;
                    }
                    checkpoint.setNextStep(1);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (!isCancelled()) {
                fail("interrupted", "loop interrupted: " + e.getMessage());
            }
        } catch (Exception e) {
            log.error("AgentLoop crashed for run {}", run.getRunId(), e);
            if (!isCancelled() && !run.statusEnum().isTerminal()) {
                // A stalled provider stream is a distinct, self-describing
                // terminal state so the UI can show "模型响应超时" instead of
                // a generic loop error.
                boolean llmTimeout = e instanceof LlmGateway.LlmTimeoutException;
                fail(llmTimeout ? "llm_timeout" : "loop_error",
                        e.getMessage() != null ? e.getMessage() : e.toString());
            }
        } finally {
            try {
                exitCallback.onExit(run.getRunId());
            } catch (Exception ignored) {
                // exit bookkeeping must never mask the run outcome
            }
        }
    }

    // ==================== steps ====================

    private void initFreshCheckpoint() {
        Checkpoint cp = new Checkpoint();
        cp.setRunId(run.getRunId());
        cp.setMode(run.getMode());
        cp.setModel(run.getModel());
        cp.setNextStep(1);
        cp.setPlanGateOpen(run.isPlanGateOpen());
        cp.setToken(run.getToken());
        // Merge skill fragments with the client-supplied system prompt. The
        // client prompt (editor rules) must reach the model on ROOT runs too —
        // it used to be merged only for children, silently dropping it here.
        List<String> fragments = new ArrayList<>();
        if (runInput != null && runInput.skillFragments() != null) {
            fragments.addAll(runInput.skillFragments());
        }
        if (runInput != null && runInput.systemPrompt() != null
                && !runInput.systemPrompt().trim().isEmpty()) {
            fragments.add(runInput.systemPrompt().trim());
        }
        List<String> memoryLines = runInput != null && runInput.memoryLines() != null
                ? new ArrayList<>(runInput.memoryLines()) : new ArrayList<>();
        cp.setSkillFragments(fragments);
        cp.setMemoryLines(memoryLines);
        cp.setSystemPrompt(runInput != null ? runInput.systemPrompt() : null);
        // Pure-text mode (inline translate / polish / summarize, the AI block,
        // ...): do NOT inject the editor-agent persona, which advertises
        // editor.*/web-search tools this run cannot call. With no tool schemas
        // offered, the model otherwise answered with a raw tool-call markup
        // (DeepSeek DSML tokens) as content — the exact inline-translation bug.
        // The caller's own instruction (hoisted into systemPrompt by
        // streamKnowledgeChat) becomes the whole system message instead.
        if (runInput != null && runInput.noTools()) {
            cp.getMessages().add(ContextManager.buildPlainTextSystemMessage(
                    runInput.systemPrompt()));
        } else {
            cp.getMessages().add(contextManager.buildSystemMessage(run,
                    fragments,
                    memoryLines,
                    new ArrayList<>(deferredToolSpecs.values()),
                    runInput != null ? runInput.threadSummary() : null));
        }
        if (runInput != null && runInput.messages() != null) {
            // A non-vision model must never receive image parts (the provider
            // rejects them); drop them up front and keep the text fallback.
            boolean vision = llmGateway.supportsVision(run.getModel());
            for (ChatMessage message : runInput.messages()) {
                if (message == null || "system".equalsIgnoreCase(message.getRole())) {
                    continue; // our own system prefix is authoritative
                }
                normalizeBlankRole(message);
                if (!vision && message.getContentParts() != null) {
                    boolean hadImage = false;
                    for (Object part : message.getContentParts()) {
                        if (part instanceof Map
                                && "image_url".equals(((Map<?, ?>) part).get("type"))) {
                            hadImage = true;
                            break;
                        }
                    }
                    message.setContentParts(null);
                    if (hadImage) {
                        // Worth a warning: the client cannot see this degradation
                        // in advance, so the user only learns about it from the
                        // model's answer ("看不到图片"). Seeing it in the log is
                        // the fastest route to "mark the model vision: true in
                        // agent.providers.<provider>.models[]".
                        log.warn("Run {}: dropping image parts — model {} is not vision-capable "
                                        + "(set vision: true in agent.providers.<provider>.models[])",
                                run.getRunId(), run.getModel());
                        String note = "（用户发送了图片，但当前模型不支持图片输入，无法查看。）";
                        message.setContent(message.getContent() == null || message.getContent().isEmpty()
                                ? note
                                : message.getContent() + "\n" + note);
                    }
                }
                cp.getMessages().add(message);
            }
        }
        if (runInput != null && runInput.clientTools() != null) {
            cp.setClientTools(new ArrayList<>(runInput.clientTools()));
        }
        if (runInput != null && runInput.savedSkillProvenance() != null) {
            cp.setSavedSkillProvenance(new ArrayList<>(runInput.savedSkillProvenance()));
        }
        cp.setDeferredTools(new ArrayList<>(deferredToolSpecs.values()));
        if (runInput != null) {
            cp.setTemperature(runInput.temperature());
            cp.setMaxTokens(runInput.maxTokens());
        }
        cp.setMaxSteps(runInput != null && runInput.maxSteps() != null
                ? runInput.maxSteps() : properties.getRun().getMaxSteps());
        cp.setNoTools(runInput != null && runInput.noTools());
        // Boundary between supplied history and messages this run produces.
        cp.setInputMessageCount(cp.getMessages().size());
        this.checkpoint = cp;
        // Fresh checkpoint is persisted by the first saveCheckpoint() call.
    }

    private void rejectToolCall(ToolCallRequest call, String error) {
        checkpoint.getMessages().add(blockedMessage(call, error));
        emit(RunEvents.TOOL_REQUESTED,
                RunEvents.toolRequested(call.getId(), call.getName(), call.getArguments()));
        emit(RunEvents.TOOL_COMPLETED,
                RunEvents.toolCompleted(call.getId(), call.getName(), false, null, error, 0));
    }

    /**
     * Executes backend tool calls in bounded parallel batches. The per-step
     * concurrency limit is {@code agent.tool.max-parallel} (previously declared
     * but never enforced).
     */
    private void executeBackend(List<ToolCallRequest> calls) throws InterruptedException {
        if (calls.isEmpty()) {
            return;
        }
        int maxParallel = Math.max(1, properties.getTool().getMaxParallel());
        for (int start = 0; start < calls.size(); start += maxParallel) {
            int end = Math.min(start + maxParallel, calls.size());
            executeBackendBatch(calls.subList(start, end));
        }
    }

    private void executeBackendBatch(List<ToolCallRequest> calls) throws InterruptedException {
        if (calls.isEmpty()) {
            return;
        }
        List<Future<ToolOutcome>> futures = new ArrayList<>();
        for (ToolCallRequest call : calls) {
            futures.add(toolExecutor.submit(() -> {
                ToolContext context = buildToolContext();
                return toolGateway.executeBackend(call.getId(), call.getName(), call.getArguments(), context);
            }));
        }
        // Start the whole parallel batch before paying the durable event-write cost.
        // Completion events are emitted only after this loop, so lifecycle order is preserved.
        for (ToolCallRequest call : calls) {
            emit(RunEvents.TOOL_REQUESTED,
                    RunEvents.toolRequested(call.getId(), call.getName(), call.getArguments()));
        }
        long deadline = System.currentTimeMillis() + properties.getTool().getTimeoutSeconds() * 1000L;
        for (int i = 0; i < calls.size(); i++) {
            ToolCallRequest call = calls.get(i);
            Future<ToolOutcome> future = futures.get(i);
            ToolOutcome outcome;
            long remaining = deadline - System.currentTimeMillis();
            try {
                if (remaining <= 0) {
                    throw new TimeoutException();
                }
                outcome = future.get(remaining, TimeUnit.MILLISECONDS);
            } catch (TimeoutException e) {
                future.cancel(true);
                outcome = ToolOutcome.failure(call.getId(), call.getName(),
                        "工具执行超时（" + properties.getTool().getTimeoutSeconds() + "s）",
                        properties.getTool().getTimeoutSeconds() * 1000L);
            } catch (Exception e) {
                outcome = ToolOutcome.failure(call.getId(), call.getName(), e.getMessage(), 0);
            }
            List<Map<String, Object>> images = outcome.isOk()
                    ? extractAgentImages(outcome.getResult())
                    : java.util.Collections.emptyList();
            // Never fan image bytes into the event log / SSE: the client already
            // holds the result it produced, and base64 would bloat Redis + MySQL.
            Object eventResult = images.isEmpty()
                    ? boundResult(outcome.getResult())
                    : imageToolSummary(images);
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(outcome.getCallId(), outcome.getTool(),
                            outcome.isOk(), eventResult,
                            outcome.getError(), outcome.getDurationMs()));
            checkpoint.getMessages().add(toolMessage(call, outcome));
            appendImageVisionMessage(images);
            checkpoint.setScratchpad(scratchpad.read());
        }
    }

    /** Pause the run for frontend (editor) tool execution; returns false on cancel/timeout. */
    private boolean dispatchFrontendAndWait(List<ToolCallRequest> frontendCalls) throws InterruptedException {
        if (isCancelled()) {
            return false;
        }
        long now = System.currentTimeMillis();
        List<PendingToolCall> pending = new ArrayList<>();
        List<String> pendingIds = new ArrayList<>();
        for (ToolCallRequest call : frontendCalls) {
            PendingToolCall pendingCall = PendingToolCall.of(call.getId(), call.getName(), call.getArguments(), now);
            pending.add(pendingCall);
            pendingIds.add(call.getId());
            checkpoint.getPendingToolCalls().add(pendingCall);
            emit(RunEvents.TOOL_REQUESTED,
                    RunEvents.toolRequested(call.getId(), call.getName(), call.getArguments()));
        }
        run.setPendingToolCalls(pending);
        pauseForPendingTools(pendingIds);
        return dispatchWaitForPending();
    }

    /** Mark the run WAITING_TOOLS and durably checkpoint the pause point. */
    private void pauseForPendingTools(List<String> pendingIds) {
        run.setPendingToolCalls(new ArrayList<>(checkpoint.getPendingToolCalls()));
        run.setStatus(RunStatus.WAITING_TOOLS.name());
        run.touch();
        emit(RunEvents.RUN_SUSPENDED, RunEvents.runSuspended("waiting_tools", pendingIds));
        saveCheckpoint();
        persist();
        saveHot(true);
    }

    /**
     * Wait on the gate for frontend tool results (fresh dispatch or recovery).
     * Returns false on cancel or timeout.
     */
    private boolean dispatchWaitForPending() throws InterruptedException {
        // Recovery-safe: honor the earliest original dispatch time, so a crash
        // and rebuild never restarts the wait clock.
        long earliest = System.currentTimeMillis();
        for (PendingToolCall pendingCall : checkpoint.getPendingToolCalls()) {
            earliest = Math.min(earliest, pendingCall.getRequestedAt());
        }
        long deadline = earliest + properties.getRun().getWaitingToolsTimeoutSeconds() * 1000L;
        while (!isCancelled() && !checkpoint.getPendingToolCalls().isEmpty()) {
            long remaining = deadline - System.currentTimeMillis();
            if (remaining <= 0) {
                fail("tool_timeout", "等待编辑器工具结果超时");
                return false;
            }
            ResumePayload payload = gate.await(Math.min(remaining, 1000L));
            if (payload == null) {
                continue;
            }
            if ("cancel".equals(payload.getAction()) || isCancelled()) {
                return false;
            }
            if (payload.getToolResults() != null && !payload.getToolResults().isEmpty()) {
                applyToolResults(payload.getToolResults());
                saveCheckpoint();
                persist();
                saveHot(false);
            }
        }
        if (isCancelled()) {
            return false;
        }
        run.setPendingToolCalls(new ArrayList<>());
        run.setStatus(RunStatus.RUNNING.name());
        run.setSuspendReason(null);
        run.touch();
        return true;
    }

    /**
     * Apply tool results idempotently by callId (retries never double-apply).
     * Results for sub-agent tools are routed to the owning child run; parent
     * results are written into the conversation.
     */
    private void applyToolResults(List<ResumePayload.ToolResultItem> items) {
        java.util.Map<String, List<ResumePayload.ToolResultItem>> bySub = new java.util.LinkedHashMap<>();
        for (ResumePayload.ToolResultItem item : items) {
            if (item == null || item.getCallId() == null) {
                continue;
            }
            PendingToolCall match = null;
            for (PendingToolCall pendingCall : checkpoint.getPendingToolCalls()) {
                if (item.getCallId().equals(pendingCall.getCallId())) {
                    match = pendingCall;
                    break;
                }
            }
            if (match == null) {
                continue; // already applied — idempotent
            }
            checkpoint.getPendingToolCalls().remove(match);
            if (match.getSubRunId() != null) {
                // Belongs to a delegated child — route it to the child run.
                bySub.computeIfAbsent(match.getSubRunId(), k -> new ArrayList<>()).add(item);
            } else {
                List<Map<String, Object>> images = item.isOk()
                        ? extractAgentImages(item.getResult())
                        : java.util.Collections.emptyList();
                String rendered = item.isOk()
                        ? (images.isEmpty() ? renderResult(item.getResult()) : imageToolSummaryJson(images))
                        : "{\"error\":\"" + escapeJson(item.getError()) + "\"}";
                checkpoint.getMessages().add(ChatMessage.builder()
                        .role("tool")
                        .toolCallId(item.getCallId())
                        .name(match.getTool())
                        .content(render(rendered))
                        .build());
                appendImageVisionMessage(images);
            }
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(item.getCallId(), match.getTool(), item.isOk(),
                            imageAwareEventResult(item.getResult()), item.getError(), 0, match.getSubRunId()));
        }
        for (java.util.Map.Entry<String, List<ResumePayload.ToolResultItem>> entry : bySub.entrySet()) {
            delegator.resumeChild(entry.getKey(), entry.getValue());
        }
    }

    private boolean waitForBudgetGrant() throws InterruptedException {
        while (!isCancelled()) {
            ResumePayload payload = gate.await(1000L);
            if (payload == null) {
                continue;
            }
            if ("cancel".equals(payload.getAction())) {
                return false;
            }
            if ("continue".equals(payload.getAction())) {
                run.setStatus(RunStatus.RUNNING.name());
                run.setSuspendReason(null);
                run.touch();
                checkpoint.setNextStep(1);
                return true;
            }
        }
        return false;
    }

    // ==================== sub-agent delegation ====================

    /** Spawn child runs for delegate tool calls (failures become tool messages). */
    private void spawnDelegations(List<ToolCallRequest> delegateCalls) {
        boolean spawnedAny = false;
        for (ToolCallRequest call : delegateCalls) {
            emit(RunEvents.TOOL_REQUESTED,
                    RunEvents.toolRequested(call.getId(), call.getName(), call.getArguments()));
            try {
                Delegation delegation = delegator.spawn(buildToolContext(), call);
                // A child can finish before we subscribe to its log (subscribe
                // happens after createChild starts the loop). Synthesize its
                // terminal now so the parent never waits the full timeout for a
                // run that is already done.
                AgentRun spawnedChild = runStore.load(delegation.getSubRunId());
                if (spawnedChild != null && spawnedChild.statusEnum().isTerminal()) {
                    delegation.setTerminal(synthesizeTerminal(spawnedChild));
                }
                activeDelegations.put(delegation.getCallId(), delegation);
                checkpoint.getDelegations().add(new DelegationRecord(
                        delegation.getCallId(), delegation.getSubRunId(), delegation.getTask(),
                        delegation.getSpawnedAt()));
                spawnedAny = true;
            } catch (Exception e) {
                checkpoint.getMessages().add(blockedMessage(call, "DELEGATE_FAILED: " + e.getMessage()));
                emit(RunEvents.TOOL_COMPLETED,
                        RunEvents.toolCompleted(call.getId(), "delegate", false, null, e.getMessage(), 0));
            }
        }
        if (spawnedAny) {
            // Persist the child handles before waiting: children are driven by the
            // client now, so this record (not a pending tool entry) is what a
            // rebuilt parent re-attaches to.
            saveCheckpoint();
            persist();
        }
    }

    /** Drop a finished delegation's recovery record. */
    private void forgetDelegation(String subRunId) {
        if (subRunId == null) {
            return;
        }
        checkpoint.getDelegations().removeIf(record -> subRunId.equals(record.getSubRunId()));
    }

    /** Rebuild delegations from the checkpoint after a crash. */
    private void rebuildDelegations() {
        java.util.Map<String, DelegationRecord> bySub = new java.util.LinkedHashMap<>();
        for (DelegationRecord record : checkpoint.getDelegations()) {
            if (record.getSubRunId() != null && record.getCallId() != null) {
                bySub.putIfAbsent(record.getSubRunId(), record);
            }
        }
        // Legacy checkpoints (written before children drove their own tools)
        // recorded the delegation only through the child's pending tool calls.
        for (PendingToolCall pendingCall : checkpoint.getPendingToolCalls()) {
            if (pendingCall.getSubRunId() != null && pendingCall.getDelegateCallId() != null) {
                bySub.putIfAbsent(pendingCall.getSubRunId(), new DelegationRecord(
                        pendingCall.getDelegateCallId(), pendingCall.getSubRunId(), null,
                        pendingCall.getRequestedAt()));
            }
        }
        for (DelegationRecord record : bySub.values()) {
            String subRunId = record.getSubRunId();
            Delegation delegation = delegator.attach(run.getRunId(), record);
            // A child that already reached terminal before the crash: drop its
            // moot pending entries and synthesize the terminal event.
            AgentRun child = runStore.load(subRunId);
            if (child != null && child.statusEnum().isTerminal()) {
                checkpoint.getPendingToolCalls()
                        .removeIf(p -> subRunId.equals(p.getSubRunId()));
                delegation.setTerminal(synthesizeTerminal(child));
            }
            activeDelegations.put(delegation.getCallId(), delegation);
        }
    }

    /** Rebuild a child's assistant text from its durable event log. */
    private String replayChildText(String subRunId) {
        try {
            StringBuilder text = new StringBuilder();
            long after = 0;
            while (true) {
                java.util.List<RunEvent> page = eventLog.replay(subRunId, after, 500);
                if (page == null || page.isEmpty()) {
                    break;
                }
                for (RunEvent event : page) {
                    after = Math.max(after, event.getSeq());
                    if (RunEvents.TEXT_DELTA.equals(event.getType())
                            && event.getPayload() != null
                            && event.getPayload().get("content") != null) {
                        text.append(event.getPayload().get("content"));
                    }
                }
                if (page.size() < 500) {
                    break;
                }
            }
            return text.length() > 0 ? text.toString() : null;
        } catch (Exception e) {
            log.warn("Could not rebuild sub-run text for {}: {}", subRunId, e.getMessage());
            return null;
        }
    }

    private RunEvent synthesizeTerminal(AgentRun child) {
        RunEvent event = new RunEvent();
        event.setSeq(child.getLastSeq());
        event.setCreateTime(System.currentTimeMillis());
        switch (child.statusEnum()) {
            case COMPLETED:
                event.setType(RunEvents.RUN_COMPLETED);
                event.setPayload(RunEvents.runCompleted(child.getFinishReason(),
                        child.getPromptTokens(), child.getCompletionTokens(), child.getCachedPromptTokens()));
                break;
            case FAILED:
                event.setType(RunEvents.RUN_FAILED);
                event.setPayload(RunEvents.runFailed(child.getErrorCode(), child.getErrorMessage()));
                break;
            default:
                event.setType(RunEvents.RUN_CANCELLED);
                event.setPayload(RunEvents.runCancelled());
        }
        return event;
    }

    /**
     * Drive all live delegations to completion: watch each child's log for its
     * terminal event and collect the result as the delegate tool result.
     *
     * <p>Children are otherwise autonomous: they pause on their own gate for
     * their frontend tools, the client drives them directly (stream + resume by
     * child run id), and the parent never parks on a child's tool call. That is
     * what lets several children work at the same time.
     */
    private boolean delegationWait() throws InterruptedException {
        while (!isCancelled() && !activeDelegations.isEmpty()) {
            long now = System.currentTimeMillis();
            List<String> finished = new ArrayList<>();
            for (Delegation delegation : activeDelegations.values()) {
                RunEvent event;
                while ((event = delegation.getSubscription().poll(0)) != null) {
                    // Child tool calls are NOT relayed into the parent's pending
                    // list any more: the child pauses on its own gate, the client
                    // streams the child's log directly and resumes the child. The
                    // parent therefore never blocks on a child's frontend tool and
                    // children progress in parallel.
                    if (event.isTerminal()) {
                        delegation.setTerminal(event);
                    }
                }
                if (delegation.getTerminal() != null) {
                    finishDelegation(delegation);
                    finished.add(delegation.getCallId());
                } else if (delegation.isExpired(now)) {
                    delegator.cancelChild(delegation.getSubRunId());
                    // Legacy checkpoints can still hold this child's pending
                    // calls (from before children drove their own tools) — settle
                    // them so a rebuilt run never waits for a dead child.
                    dropChildPendingTools(delegation.getSubRunId(), "委派超时");
                    checkpoint.getMessages().add(delegateMessage(delegation, false,
                            "委派超时（" + (delegation.getTimeoutMs() / 1000) + "s）"));
                    emit(RunEvents.SUB_FAILED,
                            RunEvents.subFailed(delegation.getCallId(), delegation.getSubRunId(), "timeout"));
                    emit(RunEvents.TOOL_COMPLETED, RunEvents.toolCompleted(delegation.getCallId(),
                            "delegate", false, null, "委派超时", 0));
                    delegation.getSubscription().close();
                    finished.add(delegation.getCallId());
                }
            }
            for (String callId : finished) {
                activeDelegations.remove(callId);
            }
            if (activeDelegations.isEmpty()) {
                break;
            }
            // Every child is working on its own: wait for its next event, a
            // cancel, or the delegation timeout.
            ResumePayload payload = gate.await(500);
            if (payload != null && "cancel".equals(payload.getAction())) {
                return false;
            }
        }
        return true;
    }

    /** Collect a finished child into the parent conversation + event log. */
    private void finishDelegation(Delegation delegation) {
        RunEvent terminal = delegation.getTerminal();
        boolean ok = RunEvents.RUN_COMPLETED.equals(terminal.getType());
        AgentRun child = runStore.load(delegation.getSubRunId());
        String childText = child != null ? child.getAssistantText() : null;
        if (childText == null || childText.isEmpty()) {
            // Cold recovery/Redis eviction: AgentRun JDBC has no assistantText,
            // but the child's durable event log can rebuild it.
            childText = replayChildText(delegation.getSubRunId());
        }
        Map<String, Object> result = RunEvents.payload("subRunId", delegation.getSubRunId(),
                "text", childText);
        if (child != null) {
            result.put("usage", RunEvents.payload(
                    "promptTokens", child.getPromptTokens(),
                    "completionTokens", child.getCompletionTokens(),
                    "cachedPromptTokens", child.getCachedPromptTokens()));
        }
        if (ok) {
            Object boundedResult = boundResult(result);
            emit(RunEvents.SUB_COMPLETED,
                    RunEvents.subCompleted(delegation.getCallId(), delegation.getSubRunId(), true, boundedResult));
            checkpoint.getMessages().add(delegateMessage(delegation, true, renderResult(boundedResult)));
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(delegation.getCallId(), "delegate", true, boundedResult, null, 0));
        } else {
            String error = str(terminal.getPayload().get("error"));
            if (error.isEmpty()) {
                error = str(terminal.getPayload().get("code"));
            }
            emit(RunEvents.SUB_FAILED,
                    RunEvents.subFailed(delegation.getCallId(), delegation.getSubRunId(), error));
            checkpoint.getMessages().add(delegateMessage(delegation, false, error));
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(delegation.getCallId(), "delegate", false, null, error, 0));
        }
        // A child can reach a terminal state while one of its frontend tool
        // calls is still outstanding (cancel / failure mid-wait) — but those
        // calls never live on the parent any more, so this only cleans up
        // legacy checkpoints written before children drove their own tools.
        dropChildPendingTools(delegation.getSubRunId(), "子 agent 已结束，工具调用未返回结果");
        forgetDelegation(delegation.getSubRunId());
        saveCheckpoint();
        delegation.getSubscription().close();
    }

    /**
     * Settle and drop a finished/cancelled child's outstanding frontend tool
     * calls. Each one is closed out on the parent event log (failed, tagged with
     * the child) so the client never keeps a call marked "running" for a child
     * that can no longer receive its result.
     */
    private void dropChildPendingTools(String subRunId, String reason) {
        List<PendingToolCall> orphaned = new ArrayList<>();
        for (PendingToolCall pending : checkpoint.getPendingToolCalls()) {
            if (subRunId.equals(pending.getSubRunId())) {
                orphaned.add(pending);
            }
        }
        for (PendingToolCall pending : orphaned) {
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(pending.getCallId(), pending.getTool(),
                            false, null, reason, 0, subRunId));
        }
        checkpoint.getPendingToolCalls().removeAll(orphaned);
    }

    private ChatMessage delegateMessage(Delegation delegation, boolean ok, String content) {
        String rendered = ok ? render(content)
                : "{\"error\":\"" + escapeJson(content) + "\"}";
        return ChatMessage.builder()
                .role("tool")
                .toolCallId(delegation.getCallId())
                .name("delegate")
                .content(rendered)
                .build();
    }

    // ==================== plan approval ====================

    /** Emit plan.proposed, suspend for approval, then apply the decision. */
    private boolean planApprovalFlow(List<ToolCallRequest> planCalls) throws InterruptedException {
        if (isCancelled()) {
            return false;
        }
        long now = System.currentTimeMillis();
        List<PendingToolCall> planPending = new ArrayList<>();
        List<String> callIds = new ArrayList<>();
        for (ToolCallRequest call : planCalls) {
            planPending.add(PendingToolCall.of(call.getId(), "present_plan", call.getArguments(), now));
            callIds.add(call.getId());
            emit(RunEvents.PLAN_PROPOSED, RunEvents.planProposed(call.getId(), call.getArguments()));
        }
        checkpoint.setPendingPlanCalls(planPending);
        run.setStatus(RunStatus.SUSPENDED.name());
        run.setSuspendReason("plan_approval");
        run.touch();
        emit(RunEvents.RUN_SUSPENDED, RunEvents.runSuspended("plan_approval", callIds));
        saveCheckpoint();
        persist();
        saveHot(true);
        return planApprovalWait(planPending);
    }

    /** Wait for the approval decision (fresh flow or crash recovery). */
    private boolean planApprovalWait(List<PendingToolCall> planPending) throws InterruptedException {
        while (!isCancelled()) {
            ResumePayload payload = gate.await(1000);
            if (payload == null) {
                continue;
            }
            if ("cancel".equals(payload.getAction())) {
                return false;
            }
            if (payload.getPlanDecision() != null) {
                boolean approved = payload.getPlanDecision().isApproved();
                String content = approved
                        ? "{\"approved\":true}"
                        : "{\"approved\":false,\"feedback\":\""
                                + escapeJson(payload.getPlanDecision().getFeedback()) + "\"}";
                for (PendingToolCall planCall : planPending) {
                    checkpoint.getMessages().add(ChatMessage.builder()
                            .role("tool")
                            .toolCallId(planCall.getCallId())
                            .name("present_plan")
                            .content(content)
                            .build());
                }
                checkpoint.getPendingPlanCalls().clear();
                if (approved) {
                    run.setPlanGateOpen(true);
                    checkpoint.setPlanGateOpen(true);
                }
                run.setStatus(RunStatus.RUNNING.name());
                run.setSuspendReason(null);
                run.touch();
                return true;
            }
        }
        return false;
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private void suspendBudget() {
        if (isCancelled()) {
            return;
        }
        run.setStatus(RunStatus.SUSPENDED.name());
        run.setSuspendReason("budget");
        run.touch();
        emit(RunEvents.RUN_SUSPENDED, RunEvents.runSuspended("budget", null));
        saveCheckpoint();
        persist();
        saveHot(true);
    }

    /** True when the provider stopped because the output hit its token ceiling. */
    private static boolean isTruncatedFinish(String finishReason) {
        return finishReason != null && TRUNCATED_FINISH_REASONS.contains(finishReason.toLowerCase());
    }

    private void complete(String finishReason) {
        if (run.statusEnum().isTerminal() || isCancelled()) {
            return; // cancelled/failed raced us — supervisor owns the terminal state
        }
        run.setStatus(RunStatus.COMPLETED.name());
        run.setFinishReason(finishReason);
        run.touch();
        emit(RunEvents.RUN_COMPLETED, RunEvents.runCompleted(finishReason,
                checkpoint.getPromptTokens(), checkpoint.getCompletionTokens(),
                checkpoint.getCachedPromptTokens()));
        saveCheckpoint();
        persist();
        saveHot(true);
    }

    private void fail(String code, String message) {
        if (run.statusEnum().isTerminal() || isCancelled()) {
            return;
        }
        run.setStatus(RunStatus.FAILED.name());
        run.setFinishReason(code);
        run.setErrorCode(code);
        run.setErrorMessage(message);
        run.touch();
        emit(RunEvents.RUN_FAILED, RunEvents.runFailed(code, message,
                checkpoint.getPromptTokens(), checkpoint.getCompletionTokens(),
                checkpoint.getCachedPromptTokens()));
        saveCheckpoint();
        persist();
        saveHot(true);
    }

    // ==================== helpers ====================

    /**
     * Client payloads occasionally omit `role` (JSON null / missing field).
     * Providers reject `role: null` with 400 BAD_REQUEST, so untagged client
     * content is treated as a user message. Repaired in place and logged with a
     * content prefix so the offending producer can be traced.
     */
    private void normalizeBlankRole(ChatMessage message) {
        if (message.getRole() == null || message.getRole().trim().isEmpty()) {
            log.warn("Run {}: blank message role from client — treating as 'user' (content prefix: {})",
                    run.getRunId(), contentPrefix(message.getContent()));
            message.setRole("user");
        }
    }

    private String contentPrefix(String value) {
        if (value == null) {
            return "";
        }
        String flat = value.replaceAll("\\s+", " ").trim();
        return flat.length() > 80 ? flat.substring(0, 80) + "…" : flat;
    }

    private ChatMessage buildAssistantMessage(LlmResult result) {
        ChatMessage message = new ChatMessage();
        message.setRole("assistant");
        message.setContent(result.getText());
        message.setReasoningContent(result.getReasoningText());
        List<ChatMessage.ToolCallInfo> toolCalls = new ArrayList<>();
        for (ToolCallRequest call : result.getToolCalls()) {
            toolCalls.add(new ChatMessage.ToolCallInfo(call.getId(), "function",
                    new ChatMessage.ToolCallInfo.FunctionInfo(call.getName(), call.getArguments())));
        }
        message.setToolCalls(toolCalls);
        return message;
    }

    private ChatMessage toolMessage(ToolCallRequest call, ToolOutcome outcome) {
        List<Map<String, Object>> images = outcome.isOk()
                ? extractAgentImages(outcome.getResult())
                : java.util.Collections.emptyList();
        String content;
        if (!outcome.isOk()) {
            content = "{\"error\":\"" + escapeJson(outcome.getError()) + "\"}";
        } else if (!images.isEmpty()) {
            // The tool text stays small; the images are attached separately as a
            // multimodal user turn (see appendImageVisionMessage).
            content = imageToolSummaryJson(images);
        } else {
            content = renderResult(outcome.getResult());
        }
        return ChatMessage.builder()
                .role("tool")
                .toolCallId(call.getId())
                .name(call.getName())
                .content(render(content))
                .build();
    }

    // ==================== multimodal (vision) tool results ====================

    /** Frontend/backend tool-result key carrying image attachments. */
    private static final String AGENT_IMAGES_KEY = "__agentImages";

    /** Extract {@code {__agentImages:[{mimeType,data,...}]}} from a tool result. */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractAgentImages(Object result) {
        if (!(result instanceof Map)) {
            return java.util.Collections.emptyList();
        }
        Object raw = ((Map<String, Object>) result).get(AGENT_IMAGES_KEY);
        if (!(raw instanceof List)) {
            return java.util.Collections.emptyList();
        }
        List<Map<String, Object>> images = new ArrayList<>();
        for (Object item : (List<Object>) raw) {
            if (item instanceof Map) {
                Map<String, Object> image = (Map<String, Object>) item;
                if (image.get("data") != null && !String.valueOf(image.get("data")).isEmpty()) {
                    images.add(image);
                }
            }
        }
        return images;
    }

    /** Compact, base64-free representation surfaced in events. */
    private Map<String, Object> imageToolSummary(List<Map<String, Object>> images) {
        Map<String, Object> summary = new java.util.LinkedHashMap<>();
        summary.put("ok", true);
        summary.put("images", images.size());
        summary.put("note", "图片已作为视觉输入附加到对话");
        return summary;
    }

    private String imageToolSummaryJson(List<Map<String, Object>> images) {
        return renderResult(imageToolSummary(images));
    }

    /** Event payload for a tool result: base64 images are replaced by a summary. */
    private Object imageAwareEventResult(Object result) {
        List<Map<String, Object>> images = extractAgentImages(result);
        return images.isEmpty() ? boundResult(result) : imageToolSummary(images);
    }

    /**
     * Attach tool-produced images to the conversation as a multimodal user
     * message so the model's own vision reads them. The images are NOT written
     * into the tool message (providers only accept images in user content) and
     * are never interpreted server-side.
     */
    private void appendImageVisionMessage(List<Map<String, Object>> images) {
        if (images == null || images.isEmpty()) {
            return;
        }
        if (!llmGateway.supportsVision(checkpoint.getModel())) {
            checkpoint.getMessages().add(ChatMessage.builder()
                    .role("user")
                    .content("（当前模型 " + checkpoint.getModel()
                            + " 不支持图片输入，无法查看图片内容；如需读图请切换到支持视觉的模型。）")
                    .build());
            return;
        }
        List<Object> parts = new ArrayList<>();
        Map<String, Object> instruction = new java.util.LinkedHashMap<>();
        instruction.put("type", "text");
        instruction.put("text", "以下是刚刚读取的图片，请直接查看图片内容后继续任务：");
        parts.add(instruction);
        for (Map<String, Object> image : images) {
            String mimeType = str(image.get("mimeType"));
            if (mimeType.isEmpty()) {
                mimeType = "image/png";
            }
            String data = str(image.get("data"));
            if (data.isEmpty()) {
                continue;
            }
            Map<String, Object> imageUrl = new java.util.LinkedHashMap<>();
            imageUrl.put("url", "data:" + mimeType + ";base64," + data);
            Map<String, Object> part = new java.util.LinkedHashMap<>();
            part.put("type", "image_url");
            part.put("image_url", imageUrl);
            parts.add(part);
        }
        if (parts.size() <= 1) {
            return;
        }
        checkpoint.getMessages().add(ChatMessage.builder()
                .role("user")
                .name(TRANSIENT_VISION_NAME)
                .content("已读取图片")
                .contentParts(parts)
                .build());
    }

    /**
     * Marker on agent-injected vision turns. Their base64 parts are kept in the
     * live checkpoint (the model needs them) but stripped before any snapshot is
     * serialized: a crash loses the image rather than writing megabytes to Redis
     * and MySQL on every step.
     */
    private static final String TRANSIENT_VISION_NAME = "__agent_vision";

    /** Temporarily drop transient vision parts; returns what to restore. */
    private Map<ChatMessage, List<Object>> stripTransientVisionParts() {
        Map<ChatMessage, List<Object>> stripped = new HashMap<>();
        for (ChatMessage message : checkpoint.getMessages()) {
            if (message != null && TRANSIENT_VISION_NAME.equals(message.getName())
                    && message.getContentParts() != null) {
                stripped.put(message, message.getContentParts());
                message.setContentParts(null);
            }
        }
        return stripped;
    }

    private ChatMessage blockedMessage(ToolCallRequest call, String reason) {
        return ChatMessage.builder()
                .role("tool")
                .toolCallId(call.getId())
                .name(call.getName())
                .content("{\"error\":\"" + escapeJson(reason) + "\"}")
                .build();
    }

    private boolean planGateBlocks(String toolName) {
        if (!"plan".equalsIgnoreCase(run.getMode()) || run.isPlanGateOpen()) {
            return false;
        }
        BackendTool tool = toolGateway.backendTool(toolName);
        return tool == null || !tool.spec().isReadOnly();
    }

    private boolean planGateBlocksClient(String toolName) {
        if (!"plan".equalsIgnoreCase(run.getMode()) || run.isPlanGateOpen()) {
            return false;
        }
        ToolSpec spec = clientSpec(toolName);
        return spec == null || !spec.isReadOnly();
    }

    /** Looks a client tool up in the active catalog, then in the deferred pool. */
    private ToolSpec clientSpec(String toolName) {
        ToolSpec spec = clientToolSpecs.get(toolName);
        return spec != null ? spec : deferredToolSpecs.get(toolName);
    }

    /**
     * Promotes a deferred tool into the active catalog on its first call, so the
     * model sees its full parameter schema from the next step onwards. No-op for
     * tools that were never deferred (or are already active).
     */
    private void activateDeferred(String toolName) {
        ToolSpec spec = deferredToolSpecs.remove(toolName);
        if (spec == null) {
            return;
        }
        clientToolSpecs.put(toolName, spec);
        if (checkpoint.getClientTools() == null) {
            checkpoint.setClientTools(new ArrayList<>());
        }
        checkpoint.getClientTools().add(spec);
        checkpoint.setDeferredTools(new ArrayList<>(deferredToolSpecs.values()));
        log.debug("Run {} activated deferred tool {}", run.getRunId(), toolName);
    }

    private ToolContext buildToolContext() {
        ToolContext context = new ToolContext();
        context.setRunId(run.getRunId());
        context.setConversationId(run.getConversationId());
        context.setModel(run.getModel());
        context.setMode(run.getMode());
        context.setUserId(run.getUserId());
        context.setTenantId(run.getTenantId());
        // Redis hot state is authoritative for the JWT; the checkpoint no
        // longer persists it (credential-at-rest).
        context.setToken(run.getToken() != null ? run.getToken() : checkpoint.getToken());
        context.setSpaceId(run.getSpaceId());
        context.setPageId(run.getPageId());
        context.setStep(checkpoint.getNextStep());
        context.setDelegateDepth(checkpoint.getDelegateDepth());
        context.setClientTools(new ArrayList<>(clientToolSpecs.values()));
        context.setDeferredTools(new ArrayList<>(deferredToolSpecs.values()));
        context.setScratchpad(scratchpad);
        // Frozen creation context, so a delegated child inherits the parent's
        // editor rules / skill fragments / memory instead of a bare prompt.
        context.setSystemPrompt(checkpoint.getSystemPrompt());
        context.setSkillFragments(checkpoint.getSkillFragments() != null
                ? new ArrayList<>(checkpoint.getSkillFragments()) : new ArrayList<>());
        context.setMemoryLines(checkpoint.getMemoryLines() != null
                ? new ArrayList<>(checkpoint.getMemoryLines()) : new ArrayList<>());
        context.setSavedSkillProvenance(checkpoint.getSavedSkillProvenance() != null
                ? new ArrayList<>(checkpoint.getSavedSkillProvenance()) : new ArrayList<>());
        context.setTemperature(checkpoint.getTemperature());
        context.setMaxTokens(checkpoint.getMaxTokens());
        context.setNoTools(checkpoint.isNoTools());
        return context;
    }

    private void saveCheckpoint() {
        checkpoint.setSeq(run.getLastSeq());
        checkpoint.setNextStep(checkpoint.getNextStep());
        checkpoint.setAssistantText(run.getAssistantText());
        checkpoint.setScratchpad(scratchpad.read());
        checkpoint.setPromptTokens(checkpoint.getPromptTokens());
        checkpoint.setCompletionTokens(checkpoint.getCompletionTokens());
        checkpoint.setCachedPromptTokens(checkpoint.getCachedPromptTokens());
        checkpoint.setDelegateDepth(checkpoint.getDelegateDepth());
        checkpoint.setPlanGateOpen(run.isPlanGateOpen());
        checkpoint.setToken(run.getToken());
        checkpoint.setSuspendReason(run.getSuspendReason());
        Map<ChatMessage, List<Object>> transientVision = stripTransientVisionParts();
        try {
            checkpointStore.save(checkpoint);
        } finally {
            for (Map.Entry<ChatMessage, List<Object>> entry : transientVision.entrySet()) {
                entry.getKey().setContentParts(entry.getValue());
            }
        }
    }

    private void emit(String type, Map<String, Object> payload) {
        try {
            run.setLastSeq(eventLog.append(run.getRunId(), type, payload).getSeq());
        } catch (Exception e) {
            log.warn("Event emit failed for {} type {}: {}", run.getRunId(), type, e.getMessage());
        }
    }

    /**
     * Persist lifecycle state. A cancelled run must never be overwritten back
     * to an active status by a late loop write, so these are no-ops once
     * cancellation is known.
     */
    private void persist() {
        if (isCancelled()) {
            return;
        }
        runStore.persist(run);
    }

    /** Hot-state flush with assistantText throttled to 1/s (O(n²) guard). */
    private void saveHot(boolean forceText) {
        if (isCancelled()) {
            return;
        }
        long now = System.currentTimeMillis();
        boolean flushText = forceText || now - lastHotFlushMs > properties.getRun().getAssistantFlushIntervalMs();
        if (flushText) {
            runStore.saveHot(run);
            lastHotFlushMs = now;
        }
    }

    private String renderResult(Object result) {
        Object bounded = boundResult(result);
        if (bounded == null) {
            return "null";
        }
        if (bounded instanceof String) {
            return (String) bounded;
        }
        try {
            return objectMapper.writeValueAsString(bounded);
        } catch (Exception e) {
            return "[tool result could not be serialized]";
        }
    }

    /**
     * Hard-cap a tool result before it reaches the checkpoint, the event log,
     * Redis/MySQL or a log line (see {@link ToolResultLimiter}).
     */
    private Object boundResult(Object result) {
        return ToolResultLimiter.bound(result, objectMapper,
                properties.getContext().getToolResultMaxChars());
    }

    /** Truncate long tool results so the context stays bounded (L1-friendly). */
    private String render(String content) {
        int maxChars = properties.getContext().getToolResultMaxChars();
        if (content == null) {
            return "";
        }
        if (content.length() <= maxChars) {
            return content;
        }
        return content.substring(0, maxChars) + "\n...[truncated]";
    }

    private String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
