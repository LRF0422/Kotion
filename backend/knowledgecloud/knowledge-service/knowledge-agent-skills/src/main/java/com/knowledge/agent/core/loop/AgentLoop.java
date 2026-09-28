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
import java.util.Set;
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
 *      frontend (editor) tools pause the run in WAITING_TOOLS until resume,
 *      delegate spawns background children and is acknowledged immediately
 *   6. observe results → next step (budget → SUSPENDED, wait for continue)
 *
 * <p>Sub-agents never block the parent: a delegated child runs on its own
 * executor, its result is folded into the parent conversation at the next step
 * boundary, and the parent only parks (SUSPENDED/children) when it actually
 * needs to wait — an explicit {@code wait_for_children} call, or a turn that
 * ended while children were still running.
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
         * Backend-internal persona override (a delegated child named by the model
         * via {@code delegate({systemPrompt})}). Never client-supplied.
         */
        default String systemPrompt() {
            return null;
        }

        /** Task instruction for a pure-text ({@code noTools}) run. */
        default String instruction() {
            return null;
        }

        /**
         * True when the supplied history already carries the persisted per-turn
         * context block (root runs), so the loop must not inject a second copy.
         */
        default boolean contextInHistory() {
            return false;
        }

        List<String> memoryLines();

        /** Derived low-sensitivity profile lines (optional; may be null). */
        default List<String> profileLines() {
            return null;
        }

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
    private final java.util.function.LongConsumer creditGuard;

    /** Throttle for the external-cancel Redis lookup. */
    private static final long EXTERNAL_CANCEL_POLL_MS = 2000L;

    /** Gate poll interval while parked on sub-agents (cancel/timeout latency). */
    private static final long CHILD_PARK_POLL_MS = 500L;

    /** Parent-side suspend reason while parked on delegated children. */
    private static final String SUSPEND_REASON_CHILDREN = "children";

    /**
     * Word splitter for tool-name recovery: camelCase boundaries, separators and
     * digit runs all start a new word ({@code insertAtBlockId},
     * {@code insert_at_block_id}, {@code insert-blocks} → insert/at/block/id).
     */
    private static final java.util.regex.Pattern TOOL_NAME_TOKEN_SPLIT =
            java.util.regex.Pattern.compile("(?<=[a-z0-9])(?=[A-Z])|[^A-Za-z0-9]+");

    /**
     * Namespace noise a model likes to prepend to a real tool name. Dropped from
     * the word-overlap comparison so {@code editor_insertBlocks} is scored on
     * "insert" + "blocks" rather than on "editor".
     */
    private static final java.util.Set<String> TOOL_NAME_STOPWORDS = new java.util.HashSet<>(
            java.util.Arrays.asList(
                    "editor", "plugin", "plugins", "tool", "tools", "page", "pages",
                    "document", "doc", "the", "and", "for"));

    /**
     * A single shared word is not enough to suggest a tool: {@code editor} alone
     * would otherwise drag in every editor-side tool. Two shared words, or one
     * word long enough to be specific ({@code insertAtBlockId} for
     * {@code insertBlocksAtPosition}), is evidence.
     */
    private static final int TOOL_NAME_MIN_MATCHED_WORDS = 2;
    private static final int TOOL_NAME_SPECIFIC_WORD_LENGTH = 6;

    private volatile long lastExternalCancelCheckMs;

    private volatile boolean externallyCancelled;

    private final Map<String, ToolSpec> clientToolSpecs = new java.util.LinkedHashMap<>();

    /**
     * Deferred client tools (skill-owned): routable and executable, but absent
     * from the tools JSON for the whole run. Keeping them out of {@code tools}
     * is what lets the provider prefix cache survive — {@code tools} renders
     * before the messages, so merging one mid-run would invalidate the cached
     * prefix of every earlier step. The model learns a deferred tool from the
     * injected directory (name + signature), and its full schema is returned
     * with the first result (see {@link #deferredSchemaNote}).
     *
     * <p><b>Overflow channel, not a discovery mechanism.</b> The client
     * advertises every callable tool in {@code tools} with its schema; only what
     * the provider's tool ceiling cannot fit arrives here (the client budget is
     * {@code buildAgentRunInputs}'s DEFAULT_TOOL_BUDGET). Nothing is deferred for
     * prompt economy — a model cannot reliably call a function it never saw
     * declared — so this pool is empty whenever the catalog fits.
     *
     * <p>If a provider rejects a historical {@code tool_calls} whose function is
     * not declared, {@code agent.context.freeze-deferred-tools=false} restores
     * promotion, at the cost of one prefix invalidation per newly used tool.
     */
    private final Map<String, ToolSpec> deferredToolSpecs = new java.util.LinkedHashMap<>();

    /** Deferred tools whose schema has already been returned this run. */
    private final java.util.Set<String> announcedDeferredTools = new java.util.HashSet<>();

    private boolean frozenDeferredTools() {
        return properties != null && properties.getContext().isFreezeDeferredTools();
    }

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
                     RunCancelFlag cancelFlag, java.util.function.LongConsumer creditGuard) {
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
        this.creditGuard = creditGuard;
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
            // Answer everything this run still owes BEFORE the next inference: a
            // crash can land anywhere inside a tool batch, and an unanswered tool
            // call would make the conversation invalid for the provider.
            // Client-owned calls come first, so a queued tool_results resume is
            // applied before any child park could swallow it.
            if (!checkpoint.getPendingToolCalls().isEmpty()) {
                run.setPendingToolCalls(new ArrayList<>(checkpoint.getPendingToolCalls()));
                if (!dispatchWaitForPending()) {
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
            boolean crashedInChildWait = !checkpoint.getPendingChildWaits().isEmpty();
            if (crashedInChildWait) {
                // The wait record is written BEFORE the park, so a crash mid-wait
                // leaves the call unanswered — answer it now.
                if (!serveChildWaits(new ArrayList<>(checkpoint.getPendingChildWaits()))) {
                    return;
                }
            }
            if (!crashedInChildWait && status == RunStatus.SUSPENDED
                    && SUSPEND_REASON_CHILDREN.equals(run.getSuspendReason())) {
                // Crashed while parked at the end of a turn, holding the answer
                // until the children report back: finish that park and hand the
                // results over before the rebuilt loop answers.
                if (!parkForChildren(null, 0L)) {
                    return;
                }
                deliverChildNotifications();
            }

            // Bounded auto-continue counter for turns truncated by the token limit.
            int truncationContinues = 0;
            while (!isCancelled() && !run.statusEnum().isTerminal()) {
                // Background children: settle and hand over whatever finished
                // while we were busy, before this step's inference sees it. The
                // parent never blocks on a spawn — only on an explicit wait.
                deliverChildResults();
                run.setStatus(RunStatus.RUNNING.name());
                run.touch();
                persist();

                saveCheckpoint(); // safe boundary BEFORE inference
                emit(RunEvents.STEP_STARTED, RunEvents.stepStarted(checkpoint.getNextStep()));

                List<ChatMessage> messages = contextManager.assemble(checkpoint.getMessages(),
                        checkpoint.getModel(), run.getConversationId());
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

                long stepPrompt = result.getPromptTokens();
                long stepCached = result.getCachedPromptTokens();
                log.info("Run {} step {}: prompt={} cached={} hit={}% (tools={}, msgs={})",
                        run.getRunId(), checkpoint.getNextStep(), stepPrompt, stepCached,
                        stepPrompt > 0 ? String.format(java.util.Locale.ROOT, "%.1f", 100.0 * stepCached / stepPrompt) : "n/a",
                        toolCount, messages.size());
                checkpoint.setPromptTokens(checkpoint.getPromptTokens() + result.getPromptTokens());
                checkpoint.setCompletionTokens(checkpoint.getCompletionTokens() + result.getCompletionTokens());
                checkpoint.setCachedPromptTokens(checkpoint.getCachedPromptTokens() + result.getCachedPromptTokens());
                run.setPromptTokens(checkpoint.getPromptTokens());
                run.setCompletionTokens(checkpoint.getCompletionTokens());
                run.setCachedPromptTokens(checkpoint.getCachedPromptTokens());

                // Mid-run cutoff: a single run can otherwise blow far past the
                // monthly credit budget. Throwing here lets run() fail the run
                // with a quota_exceeded terminal state.
                if (creditGuard != null && run.getUserId() != null) {
                    creditGuard.accept(run.getUserId());
                }

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
                    // The turn ended, but delegated children are still in flight
                    // (or their results not handed over yet): the main agent now
                    // genuinely has nothing to do but wait. Park until they
                    // report back, then let it answer WITH their results instead
                    // of completing an answer that cannot include them. This
                    // turn's text is deliberately dropped: the client renders the
                    // last step's text, so re-answering replaces it.
                    if (!activeDelegations.isEmpty()) {
                        if (!parkForChildren(null, 0L)) {
                            return; // cancelled while parked
                        }
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

                // Namespace-tolerant routing. Tools contributed by a plugin reach
                // the model under a wire name (`kn_plugin-main__searchPages`),
                // while the system prompt and the model's own habits use the bare
                // local name (`searchPages`). A dropped or invented prefix then
                // makes a perfectly valid tool unreachable (observed:
                // `editor_insertBlocks`, `searchPages`). Resolve the call to the
                // tool the run actually has before routing it.
                routeToolCallNames(result.getToolCalls(), knownToolSpecs(), checkpoint.getRunId());

                List<ToolCallRequest> backendCalls = new ArrayList<>();
                List<ToolCallRequest> frontendCalls = new ArrayList<>();
                List<ToolCallRequest> planCalls = new ArrayList<>();
                List<ToolCallRequest> delegateCalls = new ArrayList<>();
                List<ToolCallRequest> waitCalls = new ArrayList<>();
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
                    if ("wait_for_children".equals(call.getName())) {
                        // Loop intercepts: parks the run until the children it
                        // names (or all of them) settle. Read-only, so plan mode
                        // allows it.
                        waitCalls.add(call);
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
                            // Frozen (default): the tools array never changes, so
                            // the provider prefix cache stays valid. The schema
                            // rides back with the first result instead.
                            if (!frozenDeferredTools()) {
                                activateDeferred(call.getName());
                            }
                            frontendCalls.add(call);
                        }
                    } else {
                        rejectToolCall(call, unknownToolMessage(call.getName(), knownToolSpecs()));
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
                    // Fire-and-forget: children run in the background and the
                    // parent continues with this step's remaining work.
                    spawnDelegations(delegateCalls);
                }
                // Register every pause this batch needs, then persist ONCE before
                // blocking: a crash between two blocking steps must never leave
                // the conversation with an unanswered tool call.
                List<PendingToolCall> childWaits = prepareChildWaits(waitCalls);
                List<String> pendingToolIds = prepareFrontendCalls(frontendCalls);
                if (!delegateCalls.isEmpty() || !childWaits.isEmpty() || !pendingToolIds.isEmpty()) {
                    saveCheckpoint();
                    persist();
                }
                // Client-owned calls go first: their resume must never land while
                // the loop is parked on children (that park would swallow it).
                if (!pendingToolIds.isEmpty()) {
                    pauseForPendingTools(pendingToolIds);
                    if (!dispatchWaitForPending()) {
                        return;
                    }
                }
                if (!childWaits.isEmpty()) {
                    if (!serveChildWaits(childWaits)) {
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
                boolean quotaExceeded = e instanceof com.knowledge.core.entitlement.error.EntitlementException;
                fail(quotaExceeded ? "quota_exceeded" : llmTimeout ? "llm_timeout" : "loop_error",
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
        // The IMMUTABLE system prefix carries only what never changes inside a
        // conversation: the base persona plus the client's editor rules. Skill
        // fragments are retrieved per turn and long-term memory is re-scored
        // per turn, so both belong in the appended tail (see
        // attachVolatileContext below) — keeping them here invalidated the
        // provider prefix cache for the whole history on every turn.
        List<String> skillFragments = runInput != null && runInput.skillFragments() != null
                ? new ArrayList<>(runInput.skillFragments()) : new ArrayList<>();
        List<String> memoryLines = runInput != null && runInput.memoryLines() != null
                ? new ArrayList<>(runInput.memoryLines()) : new ArrayList<>();
        cp.setSkillFragments(skillFragments);
        cp.setMemoryLines(memoryLines);
        // Internal persona override only (delegated children); the wire carries none.
        cp.setSystemPrompt(runInput != null ? runInput.systemPrompt() : null);
        // Pure-text mode (inline translate / polish / summarize, the AI block,
        // ...): do NOT inject an agent persona, which names document and
        // web-search tools this run cannot call. With no tool schemas
        // offered, the model otherwise answered with a raw tool-call markup
        // (DeepSeek DSML tokens) as content — the exact inline-translation bug.
        // The caller's own instruction (hoisted into `instruction` by
        // streamKnowledgeChat) becomes the whole system message instead.
        if (runInput != null && runInput.noTools()) {
            cp.getMessages().add(ContextManager.buildPlainTextSystemMessage(
                    runInput.instruction()));
        } else {
            cp.getMessages().add(contextManager.buildSystemMessage(run));
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
        // Per-turn context (memory lines + rolling summary) goes BEHIND the
        // cacheable history, immediately before this turn's own user message.
        // Placed here, after every caller-supplied message, so the prefix that
        // was cached on a previous turn still matches byte-for-byte and only
        // the tail is billed in full.
        if (runInput == null || !runInput.contextInHistory()) {
            contextManager.attachVolatileContext(cp.getMessages(),
                    contextManager.buildVolatileContext(memoryLines,
                            runInput != null ? runInput.profileLines() : null,
                            skillFragments,
                            new ArrayList<>(deferredToolSpecs.values()),
                            runInput != null ? runInput.threadSummary() : null));
        }
        // Boundary between supplied history and messages this run produces.
        // Counted AFTER the volatile tail so the session projection treats it as
        // internal context, never as this run's output.
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
     * Rewrite invented or namespace-less tool names to the canonical name the run
     * can route. Pure bookkeeping: mutates each call's name in place and logs the
     * correction. Loop-intercepted names (`delegate`, `wait_for_children`,
     * `present_plan`) are never touched.
     */
    private void routeToolCallNames(List<ToolCallRequest> calls, List<ToolSpec> known, String runId) {
        if (calls == null || calls.isEmpty()) {
            return;
        }
        for (ToolCallRequest call : calls) {
            if (call == null || call.getName() == null) {
                continue;
            }
            String wanted = call.getName();
            String resolved = resolveToolName(wanted, known);
            if (resolved == null || resolved.equals(wanted)) {
                continue;
            }
            call.setName(resolved);
            log.info("run {}: tool call {} resolved to {} (namespace-less or mangled name)",
                    runId, wanted, resolved);
        }
    }

    /**
     * Map a model-supplied tool name onto the run's canonical tool name.
     *
     * <p>Motivation: a plugin's tools are namespaced on the wire
     * ({@code {pluginKey}__{localName}}, see the client's
     * {@code toAgentWireName}), but the system prompt and the model's own habits
     * refer to them bare ({@code searchPages}, {@code createPage}). When the model
     * drops the separator ({@code search_pages}), mangles it, or bolts on a
     * plausible namespace of its own ({@code editor_insertBlocks}), the exact-match
     * lookup misses and a perfectly callable tool becomes
     * {@code TOOL_NOT_FOUND}. This resolves such a name instead of rejecting it.
     *
     * <p>Resolution order, most literal first:
     * <ol>
     *   <li>exact name;</li>
     *   <li>a name that normalises to exactly one tool ({@code InsertAtBlockID});</li>
     *   <li>the longest trailing segment that normalises to exactly one tool, so a
     *       dropped namespace ({@code kn_plugin-main__searchPages} →
     *       {@code searchPages}) or an invented prefix
     *       ({@code editor_insertBlocks} → {@code insertAtBlockId}) still lands.</li>
     * </ol>
     * Ambiguity (two tools share the segment) never resolves — guessing between
     * two real tools is worse than failing.
     *
     * <p>Package-private and static so the ranking is unit-testable.
     */
    static String resolveToolName(String wanted, List<ToolSpec> known) {
        if (wanted == null || wanted.trim().isEmpty() || known == null || known.isEmpty()) {
            return null;
        }
        java.util.List<String> names = new ArrayList<>();
        java.util.Map<String, String> byKey = new java.util.LinkedHashMap<>();
        for (ToolSpec spec : known) {
            if (spec == null || spec.getName() == null || spec.getName().trim().isEmpty()) {
                continue;
            }
            String name = spec.getName();
            if (names.contains(name)) {
                continue;
            }
            names.add(name);
            String key = normalizeToolName(name);
            // Two tools sharing a normalised key make that key unusable.
            if (!key.isEmpty() && byKey.putIfAbsent(key, name) != null) {
                byKey.put(key, null);
            }
        }

        String trimmed = wanted.trim();
        for (String name : names) {
            if (name.equals(trimmed)) {
                return name; // literal match always wins
            }
        }
        String key = normalizeToolName(trimmed);
        if (key.isEmpty()) {
            return null;
        }
        String exact = byKey.get(key);
        if (exact != null) {
            return exact;
        }
        // The name carries a namespace of its own (real or invented). Compare the
        // remainder after dropping each leading segment: `searchPages` must reach
        // `kn_plugin-main__searchPages`, and `editor_insertBlocks` must reach
        // `insertAtBlockId`. A remainder that matches exactly one tool is safe to
        // route; two matches is a coin flip, so it fails instead.
        for (String remainder : toolNameRemainders(trimmed)) {
            String remainderKey = normalizeToolName(remainder);
            if (remainderKey.isEmpty()) {
                continue;
            }
            String unique = uniqueToolFor(remainderKey, byKey);
            if (unique != null) {
                return unique;
            }
        }
        // Last resort: the invented name's words must account for a real tool's
        // words (`editor_insertBlocks` is scored on insert + blocks, which are an
        // ordered subset of insert, at, block, id). Strict by design: it matches
        // one tool or nothing.
        return uniqueSubsequenceMatch(trimmed, names);
    }

    /**
     * The name with leading namespace segments stripped, longest first
     * ({@code plugin_editor_insertBlocks} → editor_insertBlocks →
     * insertBlocks).
     */
    private static List<String> toolNameRemainders(String name) {
        String[] segments = TOOL_NAME_TOKEN_SPLIT.split(name);
        List<String> remainders = new ArrayList<>();
        for (int start = 1; start < segments.length; start++) {
            StringBuilder remainder = new StringBuilder();
            for (int i = start; i < segments.length; i++) {
                remainder.append(segments[i]);
            }
            remainders.add(remainder.toString());
        }
        return remainders;
    }

    /**
     * The tool whose normalised name equals {@code key}. {@code null} covers both
     * "no such tool" and "two tools share that key" — neither is routable.
     */
    private static String uniqueToolFor(String key, java.util.Map<String, String> byKey) {
        return byKey.get(key);
    }

    /**
     * The single tool that best accounts for the wanted name's words.
     *
     * <p>Reached only after exact / normalised / namespace-strip lookups failed,
     * so the leading words here are namespace noise the model invented and are
     * dropped progressively: {@code editor_insertBlocks} is scored on
     * {@code insert} + {@code blocks} (an ordered subset of
     * {@code insert, at, block, id}) rather than on {@code editor}, which no tool
     * has. The winner must account for most of its own name; a tie means two
     * tools fit the words and nothing resolves.
     *
     * <p>Mirrors the client's {@code resolveToolName} in
     * {@code @kn/common/src/ai/agent/tool-name-recovery.ts}; the two must accept
     * the same shapes or a call resolves in one place and dies in the other.
     */
    private static String uniqueSubsequenceMatch(String wanted, List<String> names) {
        String[] wantedWords = toolNameTokens(wanted);
        if (wantedWords.length == 0) {
            return null;
        }
        String match = null;
        for (String name : names) {
            String[] candidateWords = toolNameTokens(name);
            if (candidateWords.length == 0) {
                continue;
            }
            double best = 0;
            for (int start = 1; start <= wantedWords.length; start++) {
                String[] tail = java.util.Arrays.copyOfRange(wantedWords, start - 1, wantedWords.length);
                if (!isOrderedSubset(tail, candidateWords)) {
                    continue;
                }
                int tailChars = 0;
                for (String word : tail) {
                    tailChars += word.length();
                }
                double coverage = (double) tailChars / normalizeToolName(name).length();
                // One shared word is not evidence: `web_search` shares `search`
                // with `searchPages` but needs two words (or one that is
                // essentially the whole name) to be the tool it meant.
                if (tail.length == 1 && coverage < 0.6) {
                    continue;
                }
                if (coverage > best) {
                    best = coverage;
                }
            }
            if (best < 0.5) {
                continue;
            }
            if (match != null) {
                return null; // ambiguous: two tools fit the words
            }
            match = name;
        }
        return match;
    }

    /**
     * Whether every word of {@code wanted} can be matched, in order, by the
     * candidate words, skipping candidates when needed — {@code blocks} skips
     * {@code at} to reach {@code block}.
     */
    private static boolean isOrderedSubset(String[] wanted, String[] candidates) {
        if (wanted.length == 0) {
            return true;
        }
        String head = wanted[0];
        String[] tail = java.util.Arrays.copyOfRange(wanted, 1, wanted.length);
        for (int index = 0; index < candidates.length; index++) {
            if (!strongWordMatch(head, candidates[index])) {
                continue;
            }
            if (isOrderedSubset(tail, java.util.Arrays.copyOfRange(candidates, index + 1, candidates.length))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Two words refer to the same thing: equal, one a prefix of the other, or a
     * shared stem. Deliberately strict — a loose "these letters appear in order"
     * rule made {@code blocks} match {@code near}, so the real match came back
     * ambiguous.
     */
    private static boolean strongWordMatch(String a, String b) {
        if (a == null || b == null || a.isEmpty() || b.isEmpty()) {
            return false;
        }
        if (a.equals(b)) {
            return true;
        }
        String shorter = a.length() <= b.length() ? a : b;
        String longer = a.length() <= b.length() ? b : a;
        if (shorter.length() < 3) {
            return false;
        }
        if (longer.startsWith(shorter)) {
            return true;
        }
        return 1.0 - (double) editDistance(shorter, longer.substring(0, shorter.length()))
                / shorter.length() >= 0.8;
    }

    /**
     * Error text for a tool name the run does not know.
     *
     * <p>The model invents plausible names — typically a made-up namespace prefix
     * plus a semantic suffix ({@code editor_insertBlocks} for
     * {@code insertAtBlockId}) — and a bare "not registered" makes it guess again
     * with a different prefix (three failed calls in a row before it gave up).
     * Naming the closest real tools turns that into a single actionable turn.
     *
     * <p>Package-private and static so the ranking is unit-testable.
     */
    static String unknownToolMessage(String wanted, List<ToolSpec> candidates) {
        StringBuilder message = new StringBuilder(
                "TOOL_NOT_FOUND: 工具未注册，请检查工具名或改用可用工具");
        List<String> nearest = nearestToolNames(wanted, candidates, 3);
        if (!nearest.isEmpty()) {
            message.append("\n最接近的可用工具：");
            for (int i = 0; i < nearest.size(); i++) {
                message.append(i == 0 ? "" : "、").append(nearest.get(i));
            }
            message.append("。请直接使用工具表里的确切名字与参数——不要臆造工具名或命名空间前缀。");
        }
        return message.toString();
    }

    /**
     * Closest tool names to {@code wanted}, best first (at most {@code limit}).
     *
     * <p>Ranking is deliberately simple: an exact-ish normalised match wins, then
     * containment (the candidate is a suffix of the invented name — the prefix is
     * what the model made up), then edit distance. Names are normalised
     * (lower-case, separators removed) so {@code insert_at_block_id} and
     * {@code InsertAtBlockID} both hit.
     */
    static List<String> nearestToolNames(String wanted, List<ToolSpec> candidates, int limit) {
        if (wanted == null || candidates == null || candidates.isEmpty() || limit <= 0) {
            return java.util.Collections.emptyList();
        }
        String target = normalizeToolName(wanted);
        if (target.isEmpty()) {
            return java.util.Collections.emptyList();
        }
        // A name that already matches a registered tool is not a typo: the call
        // was routed elsewhere (e.g. the client could not execute it), so
        // suggesting a replacement would be actively misleading.
        for (ToolSpec spec : candidates) {
            if (spec != null && spec.getName() != null && normalizeToolName(spec.getName()).equals(target)) {
                return java.util.Collections.emptyList();
            }
        }
        java.util.Map<String, Double> scores = new java.util.LinkedHashMap<>();
        for (ToolSpec spec : candidates) {
            if (spec == null || spec.getName() == null) {
                continue;
            }
            String candidate = normalizeToolName(spec.getName());
            if (candidate.isEmpty()) {
                continue;
            }
            double score = toolNameScore(target, toolNameTokens(wanted), candidate, toolNameTokens(spec.getName()));
            if (score < 0.4) {
                continue;
            }
            Double existing = scores.get(spec.getName());
            if (existing == null || score > existing) {
                scores.put(spec.getName(), score);
            }
        }
        if (scores.isEmpty()) {
            return java.util.Collections.emptyList();
        }
        List<Map.Entry<String, Double>> ranked = new ArrayList<>(scores.entrySet());
        ranked.sort((a, b) -> {
            int byScore = Double.compare(b.getValue(), a.getValue());
            return byScore != 0 ? byScore : a.getKey().compareTo(b.getKey());
        });
        List<String> names = new ArrayList<>();
        for (Map.Entry<String, Double> entry : ranked) {
            if (names.size() >= limit) {
                break;
            }
            names.add(entry.getKey());
        }
        return names;
    }

    private static double toolNameScore(String target, String[] targetTokens, String candidate, String[] candidateTokens) {
        if (candidate.contains(target) || target.contains(candidate)) {
            // Containment is the signature of an invented prefix/suffix.
            return 0.9;
        }
        // Word overlap is the strongest signal for a made-up name: the model
        // stacks real words from tool descriptions ("editor" + "insert" +
        // "blocks" -> insertAtBlockId), so compare the invented words against the
        // candidate's words with the same fuzzy matching.
        double overlap = Math.max(
                tokenOverlap(candidateTokens, targetTokens),
                tokenOverlap(targetTokens, candidateTokens));
        if (overlap >= 0.5) {
            return 0.75 + overlap * 0.2;
        }
        return Math.min(0.65, 1.0 - (double) editDistance(target, candidate) / Math.max(target.length(), candidate.length()));
    }

    /**
     * Fraction of {@code wantedTokens} matched by {@code candidateTokens},
     * position-weighted: the first word of a made-up name is the verb the model
     * wanted to perform ({@code insertAtBlockId}), later words are the object
     * ({@code deleteBlocks} also has "blocks"). Matching the verb is what makes
     * {@code editor_insertBlocks} land on the insert tool rather than on the
     * delete one.
     */
    private static double tokenOverlap(String[] wantedTokens, String[] candidateTokens) {
        List<String> wanted = filterToolNameTokens(wantedTokens);
        if (wanted.isEmpty()) {
            return 0;
        }
        List<String> candidates = filterToolNameTokens(candidateTokens);
        double matchedWeight = 0;
        double totalWeight = 0;
        int matched = 0;
        for (int i = 0; i < wanted.size(); i++) {
            double weight = i == 0 ? 2.0 : 1.0;
            totalWeight += weight;
            for (String candidate : candidates) {
                if (tokenMatches(wanted.get(i), candidate)) {
                    matchedWeight += weight;
                    matched++;
                    break;
                }
            }
        }
        boolean evidence = matched >= TOOL_NAME_MIN_MATCHED_WORDS
                || (matched == 1 && wanted.get(0).length() >= TOOL_NAME_SPECIFIC_WORD_LENGTH
                    && matchedLongestWord(wanted, candidates));
        return evidence ? matchedWeight / totalWeight : 0;
    }

    /** Whether the one matched word is long enough to be specific. */
    private static boolean matchedLongestWord(List<String> wanted, List<String> candidates) {
        for (String token : wanted) {
            if (token.length() < TOOL_NAME_SPECIFIC_WORD_LENGTH) {
                continue;
            }
            for (String candidate : candidates) {
                if (tokenMatches(token, candidate)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean tokenMatches(String a, String b) {
        if (a.length() < 3 || b.length() < 3) {
            return false;
        }
        if (a.startsWith(b) || b.startsWith(a)) {
            return true;
        }
        return 1.0 - (double) editDistance(a, b) / Math.max(a.length(), b.length()) >= 0.6;
    }

    /** Drop generic namespace words and one/two-letter glue. */
    private static List<String> filterToolNameTokens(String[] tokens) {
        List<String> kept = new ArrayList<>();
        for (String token : tokens) {
            if (token == null || token.length() < 3) {
                continue;
            }
            String lower = token.toLowerCase();
            if (TOOL_NAME_STOPWORDS.contains(lower)) {
                continue;
            }
            kept.add(lower);
        }
        return kept;
    }

    /**
     * Words of a tool name. Split BEFORE normalising: the camelCase boundary is
     * the only thing separating {@code insertAtBlockId} into insert/at/block/id.
     */
    private static String[] toolNameTokens(String name) {
        if (name == null) {
            return new String[0];
        }
        String[] raw = TOOL_NAME_TOKEN_SPLIT.split(name);
        String[] normalized = new String[raw.length];
        for (int i = 0; i < raw.length; i++) {
            normalized[i] = normalizeToolName(raw[i]);
        }
        return normalized;
    }

    /** Lower-case and drop every non-alphanumeric character. */
    private static String normalizeToolName(String name) {
        StringBuilder out = new StringBuilder(name.length());
        for (int i = 0; i < name.length(); i++) {
            char c = Character.toLowerCase(name.charAt(i));
            if (c >= 'a' && c <= 'z' || c >= '0' && c <= '9') {
                out.append(c);
            }
        }
        return out.toString();
    }

    private static int editDistance(String left, String right) {
        int[] previousRow = new int[right.length() + 1];
        int[] currentRow = new int[right.length() + 1];
        for (int j = 0; j <= right.length(); j++) {
            previousRow[j] = j;
        }
        for (int i = 1; i <= left.length(); i++) {
            currentRow[0] = i;
            for (int j = 1; j <= right.length(); j++) {
                int cost = left.charAt(i - 1) == right.charAt(j - 1) ? 0 : 1;
                currentRow[j] = Math.min(
                        Math.min(previousRow[j] + 1, currentRow[j - 1] + 1),
                        previousRow[j - 1] + cost);
            }
            int[] swap = previousRow;
            previousRow = currentRow;
            currentRow = swap;
        }
        return previousRow[right.length()];
    }

    /** Every tool name this run can resolve (backend, client and deferred). */
    List<ToolSpec> knownToolSpecs() {
        List<ToolSpec> specs = new ArrayList<>(toolGateway.backendSpecs());
        specs.addAll(clientToolSpecs.values());
        specs.addAll(deferredToolSpecs.values());
        return specs;
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

    /**
     * Register this step's frontend (editor) calls on the checkpoint, emitting
     * {@code tool.requested} — without persisting or pausing yet. The caller
     * persists the whole batch before any blocking step, so the conversation's
     * outstanding calls are durable before the pause.
     */
    private List<String> prepareFrontendCalls(List<ToolCallRequest> frontendCalls) {
        List<String> pendingIds = new ArrayList<>();
        if (frontendCalls.isEmpty()) {
            return pendingIds;
        }
        long now = System.currentTimeMillis();
        for (ToolCallRequest call : frontendCalls) {
            checkpoint.getPendingToolCalls().add(
                    PendingToolCall.of(call.getId(), call.getName(), call.getArguments(), now));
            pendingIds.add(call.getId());
            emit(RunEvents.TOOL_REQUESTED,
                    RunEvents.toolRequested(call.getId(), call.getName(), call.getArguments()));
        }
        run.setPendingToolCalls(new ArrayList<>(checkpoint.getPendingToolCalls()));
        return pendingIds;
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
                String toolContent = render(rendered);
                if (frozenDeferredTools()) {
                    String schemaNote = deferredSchemaNote(match.getTool());
                    if (schemaNote != null) {
                        toolContent = toolContent + schemaNote;
                    }
                }
                checkpoint.getMessages().add(ChatMessage.builder()
                        .role("tool")
                        .toolCallId(item.getCallId())
                        .name(match.getTool())
                        .content(toolContent)
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

    /**
     * Spawn child runs for delegate tool calls. Delegation is asynchronous: the
     * child starts on its own executor, the parent acknowledges the spawn
     * immediately and keeps working — nothing here waits for the child.
     * Failures become tool messages.
     */
    private void spawnDelegations(List<ToolCallRequest> delegateCalls) {
        for (ToolCallRequest call : delegateCalls) {
            emit(RunEvents.TOOL_REQUESTED,
                    RunEvents.toolRequested(call.getId(), call.getName(), call.getArguments()));
            try {
                Delegation delegation = delegator.spawn(buildToolContext(), call);
                // A child can finish before we subscribe to its log (subscribe
                // happens after createChild starts the loop). Synthesize its
                // terminal now so its result is delivered from the first poll
                // instead of sitting unnoticed until the delegation timeout.
                AgentRun spawnedChild = runStore.load(delegation.getSubRunId());
                if (spawnedChild != null && spawnedChild.statusEnum().isTerminal()) {
                    delegation.setTerminal(synthesizeTerminal(spawnedChild));
                }
                activeDelegations.put(delegation.getCallId(), delegation);
                checkpoint.getDelegations().add(new DelegationRecord(
                        delegation.getCallId(), delegation.getSubRunId(), delegation.getTask(),
                        delegation.getSpawnedAt()));
                // Every tool call of the batch needs a well-formed result before
                // the next inference. Answer the SPAWN (not the child's work) so
                // the parent can continue; the child's result arrives later as a
                // notification or as the result of wait_for_children.
                checkpoint.getMessages().add(ChatMessage.builder()
                        .role("tool")
                        .toolCallId(call.getId())
                        .name("delegate")
                        .content(render(renderResult(delegationAck(delegation))))
                        .build());
            } catch (Exception e) {
                checkpoint.getMessages().add(blockedMessage(call, "DELEGATE_FAILED: " + e.getMessage()));
                emit(RunEvents.TOOL_COMPLETED,
                        RunEvents.toolCompleted(call.getId(), "delegate", false, null, e.getMessage(), 0));
            }
        }
        // No save here: the caller persists the whole batch (child handles,
        // acknowledgements and every other outstanding call) in ONE write, so a
        // crash can never leave the conversation with an unanswered tool call.
    }

    /** Model-facing acknowledgement returned by a successful {@code delegate}. */
    private Map<String, Object> delegationAck(Delegation delegation) {
        return RunEvents.payload(
                "status", "running",
                "subRunId", delegation.getSubRunId(),
                "note", "子 agent 已在后台并行执行，完成后会自动通知你。"
                        + "请继续完成你自己的部分；确实需要它的结果才能继续时，调用 wait_for_children。");
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
     * Non-blocking sub-agent maintenance: drain each live child's event tail for
     * its terminal event and enforce the delegation timeout. Never delivers
     * results — delivery is explicit ({@link #deliverChildNotifications()} and
     * {@link #serveChildWaits}).
     *
     * <p>Children are autonomous: they pause on their own gate for their
     * frontend tools, the client drives them directly (stream + resume by child
     * run id), and the parent never parks on a child's tool call. That is what
     * lets several children work at the same time as the parent.
     */
    private void tickDelegations() throws InterruptedException {
        if (activeDelegations.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        for (Delegation delegation : new ArrayList<>(activeDelegations.values())) {
            if (delegation.isSettled()) {
                continue;
            }
            RunEvent event;
            while ((event = delegation.getSubscription().poll(0)) != null) {
                if (event.isTerminal()) {
                    delegation.setTerminal(event);
                }
            }
            if (delegation.isSettled() || !delegation.isExpired(now)) {
                continue;
            }
            // Timeout: cancel the child and synthesize its terminal event so the
            // delivery path reports it like any other failure. Legacy checkpoints
            // can still hold this child's pending calls (from before children
            // drove their own tools) — settle them so a rebuilt run never waits
            // for a dead child.
            long timeoutSec = delegation.getTimeoutMs() / 1000;
            log.warn("Run {}: delegation {} (child {}) timed out after {}s",
                    run.getRunId(), delegation.getCallId(), delegation.getSubRunId(), timeoutSec);
            delegator.cancelChild(delegation.getSubRunId());
            dropChildPendingTools(delegation.getSubRunId(), "委派超时");
            RunEvent terminal = new RunEvent();
            terminal.setSeq(0);
            terminal.setCreateTime(now);
            terminal.setType(RunEvents.RUN_CANCELLED);
            terminal.setPayload(RunEvents.payload("error", "委派超时（" + timeoutSec + "s）"));
            delegation.setTerminal(terminal);
        }
    }

    /** Settle background children, then hand their results to the model. */
    private void deliverChildResults() throws InterruptedException {
        tickDelegations();
        deliverChildNotifications();
    }

    /**
     * Fold every settled-but-undelivered child into the parent conversation as a
     * context-only notification (a user turn: {@code SessionTranscriptProjector}
     * never projects those, so the canonical session log stays clean) plus the
     * {@code sub.*} events the UI's sub-agent tree needs. No-op when nothing
     * settled; safe at any step boundary.
     *
     * <p>The notification and the dropped recovery record are written by ONE
     * checkpoint save, so a crash can neither lose a child's result nor deliver
     * it twice.
     */
    private void deliverChildNotifications() {
        List<Delegation> ready = new ArrayList<>();
        for (Delegation delegation : activeDelegations.values()) {
            if (delegation.isSettled() && !delegation.isDelivered()) {
                ready.add(delegation);
            }
        }
        if (ready.isEmpty()) {
            return;
        }
        for (Delegation delegation : ready) {
            Map<String, Object> result = delegationResult(delegation);
            checkpoint.getMessages().add(childNotification(delegation, result));
            retireDelegation(delegation, result);
        }
        saveCheckpoint();
    }

    /** One settled child's result payload (shared by notifications and waits). */
    private Map<String, Object> delegationResult(Delegation delegation) {
        RunEvent terminal = delegation.getTerminal();
        boolean ok = terminal != null && RunEvents.RUN_COMPLETED.equals(terminal.getType());
        AgentRun child = runStore.load(delegation.getSubRunId());
        String childText = child != null ? child.getAssistantText() : null;
        if (childText == null || childText.isEmpty()) {
            // Cold recovery/Redis eviction: AgentRun JDBC has no assistantText,
            // but the child's durable event log can rebuild it.
            childText = replayChildText(delegation.getSubRunId());
        }
        Map<String, Object> result = RunEvents.payload(
                "subRunId", delegation.getSubRunId(),
                "task", delegation.getTask(),
                "ok", ok,
                "text", ok ? childText : null);
        if (!ok) {
            String error = "";
            if (terminal != null && terminal.getPayload() != null) {
                error = str(terminal.getPayload().get("error"));
                if (error.isEmpty()) {
                    error = str(terminal.getPayload().get("code"));
                }
            }
            result.put("error", error.isEmpty() ? "子 agent 未正常完成" : error);
        }
        if (child != null) {
            result.put("usage", RunEvents.payload(
                    "promptTokens", child.getPromptTokens(),
                    "completionTokens", child.getCompletionTokens(),
                    "cachedPromptTokens", child.getCachedPromptTokens()));
        }
        return result;
    }

    /**
     * Close out one delivered child: emit {@code sub.completed}/{@code sub.failed}
     * and the delegate call's {@code tool.completed} (the parent-side step tape
     * keeps showing the delegation as running until here), drop the recovery
     * record and the live subscription. Idempotent per delegation.
     */
    private void retireDelegation(Delegation delegation, Map<String, Object> result) {
        if (delegation.isDelivered()) {
            return;
        }
        delegation.setDelivered(true);
        boolean ok = Boolean.TRUE.equals(result.get("ok"));
        Object bounded = boundResult(result);
        if (ok) {
            emit(RunEvents.SUB_COMPLETED,
                    RunEvents.subCompleted(delegation.getCallId(), delegation.getSubRunId(), true, bounded));
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(delegation.getCallId(), "delegate", true, bounded, null, 0));
        } else {
            String error = str(result.get("error"));
            emit(RunEvents.SUB_FAILED,
                    RunEvents.subFailed(delegation.getCallId(), delegation.getSubRunId(), error));
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(delegation.getCallId(), "delegate", false, null, error, 0));
        }
        // A child can reach a terminal state while one of its frontend tool calls
        // is still outstanding (cancel / failure mid-wait) — those calls never
        // live on the parent any more, so this only cleans up legacy checkpoints.
        dropChildPendingTools(delegation.getSubRunId(), "子 agent 已结束，工具调用未返回结果");
        forgetDelegation(delegation.getSubRunId());
        activeDelegations.remove(delegation.getCallId());
        try {
            delegation.getSubscription().close();
        } catch (Exception ignored) {
            // Closing an already-dead subscription must never mask the result.
        }
    }

    /** Context-only notification for a settled child. */
    private ChatMessage childNotification(Delegation delegation, Map<String, Object> result) {
        boolean ok = Boolean.TRUE.equals(result.get("ok"));
        StringBuilder content = new StringBuilder();
        content.append(ok ? "【子 agent 完成】" : "【子 agent 失败】")
                .append("subRunId=").append(delegation.getSubRunId());
        if (delegation.getTask() != null && !delegation.getTask().trim().isEmpty()) {
            content.append("\n任务：").append(delegation.getTask().trim());
        }
        if (ok) {
            // Bound like any other tool result: a child can legitimately produce
            // more text than the parent's context can afford.
            content.append("\n结果：\n").append(render(str(result.get("text"))));
        } else {
            content.append("\n原因：").append(str(result.get("error")));
        }
        content.append("\n（这是子 agent 的后台通知，不是新的用户指令；"
                + "请把它纳入你自己的工作，如已无其它待办就基于它给出完整答复。）");
        return ChatMessage.builder()
                .role("user")
                .content(content.toString())
                .build();
    }

    /**
     * Park the run until the watched children settle or the wait budget expires.
     * This is the ONLY place the parent stops for sub-agents — deliberately, with
     * a durable SUSPENDED/children state, rather than blocking every spawn.
     * Returns false when the run was cancelled while parked.
     *
     * @param subRunIds children to watch (child run id or delegate call id), or
     *                  {@code null} for every live child
     * @param timeoutMs explicit wait budget in millis; {@code <= 0} waits until
     *                  each child hits its own delegation timeout
     */
    private boolean parkForChildren(Set<String> subRunIds, long timeoutMs) throws InterruptedException {
        if (isCancelled()) {
            return false;
        }
        List<Delegation> watched = watchedDelegations(subRunIds);
        boolean outstanding = false;
        for (Delegation delegation : watched) {
            if (!delegation.isSettled()) {
                outstanding = true;
                break;
            }
        }
        if (!outstanding) {
            return true; // nothing to wait for: never emit a fake park
        }
        long deadline = timeoutMs > 0 ? System.currentTimeMillis() + timeoutMs : Long.MAX_VALUE;
        run.setStatus(RunStatus.SUSPENDED.name());
        run.setSuspendReason(SUSPEND_REASON_CHILDREN);
        run.touch();
        emit(RunEvents.RUN_SUSPENDED, RunEvents.runSuspended(SUSPEND_REASON_CHILDREN,
                subRunIds == null ? null : new ArrayList<>(subRunIds)));
        saveCheckpoint();
        persist();
        saveHot(true);
        try {
            while (!isCancelled()) {
                tickDelegations();
                boolean allSettled = true;
                for (Delegation delegation : watched) {
                    if (!delegation.isSettled()) {
                        allSettled = false;
                        break;
                    }
                }
                if (allSettled || System.currentTimeMillis() >= deadline) {
                    break;
                }
                // Nothing else can resume a parent that is only waiting for its
                // children: poll with a short interval for the next child event,
                // a cancel, or the wait budget.
                ResumePayload payload = gate.await(CHILD_PARK_POLL_MS);
                if (payload != null && "cancel".equals(payload.getAction())) {
                    return false;
                }
            }
        } finally {
            if (!isCancelled()) {
                run.setStatus(RunStatus.RUNNING.name());
                run.setSuspendReason(null);
                run.touch();
                persist();
            }
        }
        return !isCancelled();
    }

    /** The delegations a wait covers: the named ones, or every live child. */
    private List<Delegation> watchedDelegations(Set<String> subRunIds) {
        List<Delegation> watched = new ArrayList<>();
        for (Delegation delegation : activeDelegations.values()) {
            if (subRunIds == null || subRunIds.isEmpty()
                    || subRunIds.contains(delegation.getSubRunId())
                    || subRunIds.contains(delegation.getCallId())) {
                watched.add(delegation);
            }
        }
        return watched;
    }

    /**
     * Register this step's {@code wait_for_children} calls on the checkpoint
     * (emitting {@code tool.requested}) without persisting or parking yet — the
     * caller persists the whole batch first, so a crash resumes the same wait
     * instead of leaving an unanswered tool call in the conversation.
     */
    private List<PendingToolCall> prepareChildWaits(List<ToolCallRequest> waitCalls) {
        List<PendingToolCall> waits = new ArrayList<>();
        if (waitCalls.isEmpty()) {
            return waits;
        }
        long now = System.currentTimeMillis();
        for (ToolCallRequest call : waitCalls) {
            emit(RunEvents.TOOL_REQUESTED,
                    RunEvents.toolRequested(call.getId(), call.getName(), call.getArguments()));
            PendingToolCall pending = PendingToolCall.of(call.getId(), call.getName(),
                    call.getArguments(), now);
            waits.add(pending);
            checkpoint.getPendingChildWaits().add(pending);
        }
        return waits;
    }

    /**
     * Wait for the children each pending call asked for, then answer every call
     * with their results and drop it from the checkpoint (fresh wait or crash
     * recovery). One checkpoint write covers the tool messages and the cleared
     * waits.
     */
    private boolean serveChildWaits(List<PendingToolCall> waits) throws InterruptedException {
        List<ChildWait> parsed = new ArrayList<>();
        // Union of the requested children (an unfiltered call means "all live
        // children") plus the tightest explicit timeout across the calls.
        Set<String> requested = new java.util.LinkedHashSet<>();
        boolean anyUnfiltered = false;
        long timeoutMs = 0L;
        for (PendingToolCall wait : waits) {
            ChildWait childWait = new ChildWait(wait,
                    stringList(parseWaitArgs(wait.getArgsJson()).get("subRunIds")),
                    longArg(parseWaitArgs(wait.getArgsJson()).get("timeoutSec")));
            parsed.add(childWait);
            if (childWait.ids.isEmpty()) {
                anyUnfiltered = true;
            } else {
                requested.addAll(childWait.ids);
            }
            if (childWait.timeoutSec > 0
                    && (timeoutMs == 0L || childWait.timeoutSec * 1000L < timeoutMs)) {
                timeoutMs = childWait.timeoutSec * 1000L;
            }
        }
        if (!parkForChildren(anyUnfiltered ? null : requested, timeoutMs)) {
            return false; // cancelled while parked
        }

        for (ChildWait wait : parsed) {
            List<Map<String, Object>> results = new ArrayList<>();
            List<String> unmatched = new ArrayList<>();
            if (wait.ids.isEmpty()) {
                for (Delegation delegation : watchedDelegations(null)) {
                    results.add(waitResultFor(delegation));
                }
            } else {
                for (String id : wait.ids) {
                    Delegation delegation = findDelegation(id);
                    if (delegation == null) {
                        unmatched.add(id);
                    } else {
                        results.add(waitResultFor(delegation));
                    }
                }
            }
            Map<String, Object> payload = RunEvents.payload("results", results);
            if (!unmatched.isEmpty()) {
                payload.put("unmatched", unmatched);
                payload.put("note", "这些 subRunId 未匹配到正在运行或刚结束的子 agent");
            }
            Object bounded = boundResult(payload);
            checkpoint.getMessages().add(ChatMessage.builder()
                    .role("tool")
                    .toolCallId(wait.call.getCallId())
                    .name("wait_for_children")
                    .content(render(renderResult(bounded)))
                    .build());
            emit(RunEvents.TOOL_COMPLETED,
                    RunEvents.toolCompleted(wait.call.getCallId(), "wait_for_children",
                            true, bounded, null, 0));
            checkpoint.getPendingChildWaits().remove(wait.call);
        }
        // Children that settled outside every wait are still owed their
        // notification (this also emits their sub.* events).
        deliverChildNotifications();
        saveCheckpoint();
        return !isCancelled();
    }

    /** One parsed {@code wait_for_children} call: its durable record + arguments. */
    private static final class ChildWait {
        private final PendingToolCall call;
        private final List<String> ids;
        private final long timeoutSec;

        private ChildWait(PendingToolCall call, List<String> ids, long timeoutSec) {
            this.call = call;
            this.ids = ids;
            this.timeoutSec = timeoutSec;
        }
    }

    /**
     * One child's contribution to a wait result: its settled result (retiring the
     * delegation), or a marker when the wait budget ran out before it finished.
     */
    private Map<String, Object> waitResultFor(Delegation delegation) {
        if (!delegation.isSettled()) {
            return RunEvents.payload("subRunId", delegation.getSubRunId(),
                    "task", delegation.getTask(), "status", "running");
        }
        if (delegation.isDelivered()) {
            return RunEvents.payload("subRunId", delegation.getSubRunId(),
                    "status", "delivered",
                    "note", "该子 agent 的结果已在上文的后台通知中给出");
        }
        Map<String, Object> result = delegationResult(delegation);
        retireDelegation(delegation, result);
        return result;
    }

    /** Live delegation by child run id or parent-side delegate call id. */
    private Delegation findDelegation(String id) {
        for (Delegation delegation : activeDelegations.values()) {
            if (id.equals(delegation.getSubRunId()) || id.equals(delegation.getCallId())) {
                return delegation;
            }
        }
        return null;
    }

    private Map<String, Object> parseWaitArgs(String argsJson) {
        try {
            return toolGateway.parseArgs(argsJson);
        } catch (Exception e) {
            return new java.util.LinkedHashMap<>();
        }
    }

    private List<String> stringList(Object value) {
        List<String> out = new ArrayList<>();
        if (value instanceof List) {
            for (Object item : (List<?>) value) {
                if (item != null && !String.valueOf(item).trim().isEmpty()) {
                    out.add(String.valueOf(item).trim());
                }
            }
        } else if (value != null && !String.valueOf(value).trim().isEmpty()) {
            out.add(String.valueOf(value).trim());
        }
        return out;
    }

    private long longArg(Object value) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        if (value instanceof String) {
            try {
                return Long.parseLong(((String) value).trim());
            } catch (NumberFormatException ignored) {
                // fall through: treated as "no explicit budget"
            }
        }
        return 0L;
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
     * model sees its full parameter schema from the next step onwards AND the
     * provider has the function declared while its {@code tool_calls} entry is
     * in the conversation. No-op for tools that were never deferred (or are
     * already active).
     */
    /**
     * Full parameter schema for a deferred tool, appended to the result of its
     * FIRST call only (see {@code freezeDeferredTools}). The tools array stays
     * byte-stable, so the provider prefix cache survives; the model still
     * learns the exact arguments before retrying. Returns {@code null} for an
     * active or already-announced tool.
     */
    private String deferredSchemaNote(String toolName) {
        if (toolName == null || announcedDeferredTools.contains(toolName)) {
            return null;
        }
        ToolSpec spec = deferredToolSpecs.get(toolName);
        if (spec == null) {
            return null;
        }
        announcedDeferredTools.add(toolName);
        String schema;
        try {
            schema = objectMapper.writeValueAsString(spec.getInputSchema());
        } catch (Exception e) {
            schema = String.valueOf(spec.getInputSchema());
        }
        return "\n\n【工具 " + toolName + " 的参数结构（首次调用后返回，之后可直接按此传参）】\n" + schema;
    }

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
