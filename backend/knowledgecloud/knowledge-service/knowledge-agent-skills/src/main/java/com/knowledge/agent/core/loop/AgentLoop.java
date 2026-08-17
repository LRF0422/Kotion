package com.knowledge.agent.core.loop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
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
import com.knowledge.agent.core.run.RunStatus;
import com.knowledge.agent.core.run.RunStore;
import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolGateway;
import com.knowledge.agent.core.tool.ToolOutcome;
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

        List<String> skillFragments();

        List<String> memoryLines();

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

    private final Map<String, ToolSpec> clientToolSpecs = new HashMap<>();

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
                     ExecutorService toolExecutor, ExitCallback exitCallback, ResumeGate gate) {
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
    }

    public void requestCancel() {
        this.cancelRequested = true;
        this.gate.cancel();
    }

    public boolean isCancelled() {
        return cancelRequested;
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
            }

            RunStatus status = run.statusEnum();
            if (status == RunStatus.WAITING_TOOLS && !checkpoint.getPendingToolCalls().isEmpty()) {
                // Crashed while waiting for frontend tool results — resume the wait.
                run.setPendingToolCalls(new ArrayList<>(checkpoint.getPendingToolCalls()));
                if (hasSubPending()) {
                    // Mixed/sub-agent pending: rebuild delegations so child
                    // results route correctly and terminal events drain.
                    rebuildDelegations();
                }
                if (!dispatchWaitForPending()) {
                    return;
                }
                if (!activeDelegations.isEmpty() && !delegationWait()) {
                    return;
                }
            } else if (status == RunStatus.SUSPENDED && "budget".equals(run.getSuspendReason())) {
                if (!waitForBudgetGrant()) {
                    return;
                }
            } else if (status == RunStatus.SUSPENDED && "plan_approval".equals(run.getSuspendReason())) {
                if (!planApprovalWait(checkpoint.getPendingPlanCalls())) {
                    return;
                }
            }

            while (!cancelRequested && !run.statusEnum().isTerminal()) {
                run.setStatus(RunStatus.RUNNING.name());
                run.touch();
                persist();

                saveCheckpoint(); // safe boundary BEFORE inference
                emit(RunEvents.STEP_STARTED, RunEvents.stepStarted(checkpoint.getNextStep()));

                List<ChatMessage> messages = contextManager.assemble(checkpoint.getMessages());
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
                run.setPromptTokens(checkpoint.getPromptTokens());
                run.setCompletionTokens(checkpoint.getCompletionTokens());

                if (isCancelled()) {
                    return;
                }

                if (result.getToolCalls().isEmpty()) {
                    complete(result.getFinishReason() != null ? result.getFinishReason() : "stop");
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
                            checkpoint.getMessages().add(blockedMessage(call, "PLAN_MODE_BLOCKED"));
                        } else {
                            delegateCalls.add(call);
                        }
                        continue;
                    }
                    BackendTool backendTool = toolGateway.backendTool(call.getName());
                    if (backendTool != null) {
                        if (planGateBlocks(call.getName())) {
                            checkpoint.getMessages().add(blockedMessage(call, "PLAN_MODE_BLOCKED"));
                        } else {
                            backendCalls.add(call);
                        }
                    } else if (clientToolSpecs.containsKey(call.getName())) {
                        if (planGateBlocksClient(call.getName())) {
                            checkpoint.getMessages().add(blockedMessage(call, "PLAN_MODE_BLOCKED"));
                        } else {
                            frontendCalls.add(call);
                        }
                    } else {
                        checkpoint.getMessages().add(blockedMessage(call,
                                "TOOL_NOT_FOUND: 工具未注册，请检查工具名或改用可用工具"));
                    }
                }

                executeBackend(backendCalls);

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
            if (!cancelRequested) {
                fail("interrupted", "loop interrupted: " + e.getMessage());
            }
        } catch (Exception e) {
            log.error("AgentLoop crashed for run {}", run.getRunId(), e);
            if (!cancelRequested && !run.statusEnum().isTerminal()) {
                fail("loop_error", e.getMessage());
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
        cp.getMessages().add(contextManager.buildSystemMessage(run,
                runInput != null ? runInput.skillFragments() : null,
                runInput != null ? runInput.memoryLines() : null));
        if (runInput != null && runInput.messages() != null) {
            for (ChatMessage message : runInput.messages()) {
                if (message == null || "system".equalsIgnoreCase(message.getRole())) {
                    continue; // our own system prefix is authoritative
                }
                cp.getMessages().add(message);
            }
        }
        if (runInput != null && runInput.clientTools() != null) {
            cp.setClientTools(new ArrayList<>(runInput.clientTools()));
        }
        if (runInput != null) {
            cp.setTemperature(runInput.temperature());
            cp.setMaxTokens(runInput.maxTokens());
        }
        cp.setMaxSteps(runInput != null && runInput.maxSteps() != null
                ? runInput.maxSteps() : properties.getRun().getMaxSteps());
        cp.setNoTools(runInput != null && runInput.noTools());
        this.checkpoint = cp;
        // Fresh checkpoint is persisted by the first saveCheckpoint() call.
    }

    /** Executes backend tool calls in parallel, bounded by the executor. */
    private void executeBackend(List<ToolCallRequest> calls) throws InterruptedException {
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
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(outcome.getCallId(), outcome.getTool(),
                            outcome.isOk(), outcome.getResult(), outcome.getError(), outcome.getDurationMs()));
            checkpoint.getMessages().add(toolMessage(call, outcome));
            checkpoint.setScratchpad(scratchpad.read());
        }
    }

    /** Pause the run for frontend (editor) tool execution; returns false on cancel/timeout. */
    private boolean dispatchFrontendAndWait(List<ToolCallRequest> frontendCalls) throws InterruptedException {
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
        while (!cancelRequested && !checkpoint.getPendingToolCalls().isEmpty()) {
            long remaining = deadline - System.currentTimeMillis();
            if (remaining <= 0) {
                fail("tool_timeout", "等待编辑器工具结果超时");
                return false;
            }
            ResumePayload payload = gate.await(Math.min(remaining, 1000L));
            if (payload == null) {
                continue;
            }
            if ("cancel".equals(payload.getAction()) || cancelRequested) {
                return false;
            }
            if (payload.getToolResults() != null && !payload.getToolResults().isEmpty()) {
                applyToolResults(payload.getToolResults());
                saveCheckpoint();
                persist();
                saveHot(false);
            }
        }
        if (cancelRequested) {
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
                String rendered = item.isOk()
                        ? renderResult(item.getResult())
                        : "{\"error\":\"" + escapeJson(item.getError()) + "\"}";
                checkpoint.getMessages().add(ChatMessage.builder()
                        .role("tool")
                        .toolCallId(item.getCallId())
                        .name(match.getTool())
                        .content(render(rendered))
                        .build());
            }
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(item.getCallId(), match.getTool(), item.isOk(),
                            item.getResult(), item.getError(), 0));
        }
        for (java.util.Map.Entry<String, List<ResumePayload.ToolResultItem>> entry : bySub.entrySet()) {
            delegator.resumeChild(entry.getKey(), entry.getValue());
        }
    }

    private boolean waitForBudgetGrant() throws InterruptedException {
        while (!cancelRequested) {
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

    private boolean hasSubPending() {
        for (PendingToolCall pendingCall : checkpoint.getPendingToolCalls()) {
            if (pendingCall.getSubRunId() != null) {
                return true;
            }
        }
        return false;
    }

    /** Spawn child runs for delegate tool calls (failures become tool messages). */
    private void spawnDelegations(List<ToolCallRequest> delegateCalls) {
        for (ToolCallRequest call : delegateCalls) {
            try {
                Delegation delegation = delegator.spawn(buildToolContext(), call);
                activeDelegations.put(delegation.getCallId(), delegation);
            } catch (Exception e) {
                checkpoint.getMessages().add(blockedMessage(call, "DELEGATE_FAILED: " + e.getMessage()));
                emit(RunEvents.TOOL_COMPLETED,
                        RunEvents.toolCompleted(call.getId(), "delegate", false, null, e.getMessage(), 0));
            }
        }
    }

    /** Rebuild delegations from the checkpoint after a crash. */
    private void rebuildDelegations() {
        java.util.Map<String, PendingToolCall> bySub = new java.util.LinkedHashMap<>();
        for (PendingToolCall pendingCall : checkpoint.getPendingToolCalls()) {
            if (pendingCall.getSubRunId() != null && pendingCall.getDelegateCallId() != null) {
                bySub.putIfAbsent(pendingCall.getSubRunId(), pendingCall);
            }
        }
        for (java.util.Map.Entry<String, PendingToolCall> entry : bySub.entrySet()) {
            String subRunId = entry.getKey();
            PendingToolCall pending = entry.getValue();
            Delegation delegation = delegator.attach(run.getRunId(), pending.getDelegateCallId(), subRunId);
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

    private RunEvent synthesizeTerminal(AgentRun child) {
        RunEvent event = new RunEvent();
        event.setSeq(child.getLastSeq());
        event.setCreateTime(System.currentTimeMillis());
        switch (child.statusEnum()) {
            case COMPLETED:
                event.setType(RunEvents.RUN_COMPLETED);
                event.setPayload(RunEvents.runCompleted(child.getFinishReason(),
                        child.getPromptTokens(), child.getCompletionTokens()));
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
     * Drive all live delegations to completion: drain child events, relay
     * their frontend tool calls to the client (pause the parent), route tool
     * results back, and collect child terminal states as delegate tool results.
     */
    private boolean delegationWait() throws InterruptedException {
        while (!cancelRequested && !activeDelegations.isEmpty()) {
            long now = System.currentTimeMillis();
            boolean newPending = false;
            List<String> finished = new ArrayList<>();
            for (Delegation delegation : activeDelegations.values()) {
                RunEvent event;
                while ((event = delegation.getSubscription().poll(0)) != null) {
                    if (RunEvents.TOOL_REQUESTED.equals(event.getType())) {
                        Map<String, Object> payload = event.getPayload();
                        String callId = str(payload.get("callId"));
                        String tool = str(payload.get("tool"));
                        String args = str(payload.get("args"));
                        checkpoint.getPendingToolCalls().add(PendingToolCall.ofSub(
                                callId, tool, args, now, delegation.getSubRunId(), delegation.getCallId()));
                        emit(RunEvents.TOOL_REQUESTED,
                                RunEvents.payload("callId", callId, "tool", tool, "args", args,
                                        "subRunId", delegation.getSubRunId()));
                        newPending = true;
                    } else if (event.isTerminal()) {
                        delegation.setTerminal(event);
                    }
                }
                if (delegation.getTerminal() != null) {
                    finishDelegation(delegation);
                    finished.add(delegation.getCallId());
                } else if (delegation.isExpired(now)) {
                    delegator.cancelChild(delegation.getSubRunId());
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
            if (newPending || hasSubPending()) {
                List<String> pendingIds = new ArrayList<>();
                for (PendingToolCall pendingCall : checkpoint.getPendingToolCalls()) {
                    pendingIds.add(pendingCall.getCallId());
                }
                pauseForPendingTools(pendingIds);
                if (!dispatchWaitForPending()) {
                    return false;
                }
            } else {
                // All children working with no pending tools — wait for new
                // child events, cancel delivery or the delegation timeout.
                ResumePayload payload = gate.await(500);
                if (payload != null && "cancel".equals(payload.getAction())) {
                    return false;
                }
            }
        }
        return true;
    }

    /** Collect a finished child into the parent conversation + event log. */
    private void finishDelegation(Delegation delegation) {
        RunEvent terminal = delegation.getTerminal();
        boolean ok = RunEvents.RUN_COMPLETED.equals(terminal.getType());
        AgentRun child = runStore.load(delegation.getSubRunId());
        Map<String, Object> result = RunEvents.payload("subRunId", delegation.getSubRunId(),
                "text", child != null ? child.getAssistantText() : null);
        if (ok) {
            emit(RunEvents.SUB_COMPLETED,
                    RunEvents.subCompleted(delegation.getCallId(), delegation.getSubRunId(), true, result));
            checkpoint.getMessages().add(delegateMessage(delegation, true, renderResult(result)));
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(delegation.getCallId(), "delegate", true, result, null, 0));
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
        delegation.getSubscription().close();
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
        while (!cancelRequested) {
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
        run.setStatus(RunStatus.SUSPENDED.name());
        run.setSuspendReason("budget");
        run.touch();
        emit(RunEvents.RUN_SUSPENDED, RunEvents.runSuspended("budget", null));
        saveCheckpoint();
        persist();
        saveHot(true);
    }

    private void complete(String finishReason) {
        if (run.statusEnum().isTerminal()) {
            return; // cancelled/failed raced us — supervisor owns the terminal state
        }
        run.setStatus(RunStatus.COMPLETED.name());
        run.setFinishReason(finishReason);
        run.touch();
        emit(RunEvents.RUN_COMPLETED, RunEvents.runCompleted(finishReason,
                checkpoint.getPromptTokens(), checkpoint.getCompletionTokens()));
        saveCheckpoint();
        persist();
        saveHot(true);
    }

    private void fail(String code, String message) {
        if (run.statusEnum().isTerminal()) {
            return;
        }
        run.setStatus(RunStatus.FAILED.name());
        run.setFinishReason(code);
        run.setErrorCode(code);
        run.setErrorMessage(message);
        run.touch();
        emit(RunEvents.RUN_FAILED, RunEvents.runFailed(code, message));
        saveCheckpoint();
        persist();
        saveHot(true);
    }

    // ==================== helpers ====================

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
        String content = outcome.isOk()
                ? renderResult(outcome.getResult())
                : "{\"error\":\"" + escapeJson(outcome.getError()) + "\"}";
        return ChatMessage.builder()
                .role("tool")
                .toolCallId(call.getId())
                .name(call.getName())
                .content(render(content))
                .build();
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
        ToolSpec spec = clientToolSpecs.get(toolName);
        return spec == null || !spec.isReadOnly();
    }

    private ToolContext buildToolContext() {
        ToolContext context = new ToolContext();
        context.setRunId(run.getRunId());
        context.setConversationId(run.getConversationId());
        context.setModel(run.getModel());
        context.setMode(run.getMode());
        context.setUserId(run.getUserId());
        context.setTenantId(run.getTenantId());
        context.setToken(checkpoint.getToken());
        context.setSpaceId(run.getSpaceId());
        context.setPageId(run.getPageId());
        context.setStep(checkpoint.getNextStep());
        context.setDelegateDepth(checkpoint.getDelegateDepth());
        context.setClientTools(new ArrayList<>(clientToolSpecs.values()));
        context.setScratchpad(scratchpad);
        return context;
    }

    private void saveCheckpoint() {
        checkpoint.setSeq(run.getLastSeq());
        checkpoint.setNextStep(checkpoint.getNextStep());
        checkpoint.setAssistantText(run.getAssistantText());
        checkpoint.setScratchpad(scratchpad.read());
        checkpoint.setPromptTokens(checkpoint.getPromptTokens());
        checkpoint.setCompletionTokens(checkpoint.getCompletionTokens());
        checkpoint.setDelegateDepth(checkpoint.getDelegateDepth());
        checkpoint.setPlanGateOpen(run.isPlanGateOpen());
        checkpoint.setToken(run.getToken());
        checkpoint.setSuspendReason(run.getSuspendReason());
        checkpointStore.save(checkpoint);
    }

    private void emit(String type, Map<String, Object> payload) {
        try {
            run.setLastSeq(eventLog.append(run.getRunId(), type, payload).getSeq());
        } catch (Exception e) {
            log.warn("Event emit failed for {} type {}: {}", run.getRunId(), type, e.getMessage());
        }
    }

    private void persist() {
        runStore.persist(run);
    }

    /** Hot-state flush with assistantText throttled to 1/s (O(n²) guard). */
    private void saveHot(boolean forceText) {
        long now = System.currentTimeMillis();
        boolean flushText = forceText || now - lastHotFlushMs > properties.getRun().getAssistantFlushIntervalMs();
        if (flushText) {
            runStore.saveHot(run);
            lastHotFlushMs = now;
        }
    }

    private String renderResult(Object result) {
        if (result == null) {
            return "null";
        }
        try {
            return objectMapper.writeValueAsString(result);
        } catch (Exception e) {
            return String.valueOf(result);
        }
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
