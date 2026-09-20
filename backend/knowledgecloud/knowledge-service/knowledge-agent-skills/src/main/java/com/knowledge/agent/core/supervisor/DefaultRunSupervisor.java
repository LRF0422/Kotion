package com.knowledge.agent.core.supervisor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.context.ContextManager;
import com.knowledge.agent.core.delegate.Delegator;
import com.knowledge.agent.core.event.RunEventLog;
import com.knowledge.agent.core.event.RunEvents;
import com.knowledge.agent.core.llm.LlmGateway;
import com.knowledge.agent.core.loop.AgentLoop;
import com.knowledge.agent.core.loop.LoopHandle;
import com.knowledge.agent.core.loop.ResumeGate;
import com.knowledge.agent.core.loop.ResumePayload;
import com.knowledge.agent.core.mapper.AgentRunMapper;
import com.knowledge.agent.core.memory.MemoryInjector;
import com.knowledge.agent.core.memory.ThreadSummarizer;
import com.knowledge.agent.core.session.SessionTranscriptProjector;
import com.knowledge.agent.core.entity.AgentRunEntity;
import com.knowledge.agent.core.entity.AgentThreadEntity;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.PendingToolCall;
import com.knowledge.agent.core.run.RunCancelFlag;
import com.knowledge.agent.core.run.RunStatus;
import com.knowledge.agent.core.run.RunStore;
import com.knowledge.agent.core.run.RunView;
import com.knowledge.agent.core.savedskill.SavedSkillInjector;
import com.knowledge.agent.core.savedskill.SavedSkillProvenance;
import com.knowledge.agent.core.tool.ToolGateway;
import com.knowledge.agent.core.tool.ToolSpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;

/**
 * AgentCore run supervisor — the single lifecycle authority for runs:
 * create / get / resume / cancel / reconcile.
 *
 * <p>Responsibilities kept deliberately narrow: the loop executes, the event
 * log records, this class owns status transitions triggered from outside the
 * loop (create, cancel, resume delivery, crash recovery).
 */
@Slf4j
@Component
public class DefaultRunSupervisor {

    private final RunStore runStore;
    private final CheckpointStore checkpointStore;
    private final RunEventLog eventLog;
    private final RunLease lease;
    private final RunQuota quota;
    private final AgentRunMapper runMapper;
    private final ThreadStore threadStore;
    private final LlmGateway llmGateway;
    private final ToolGateway toolGateway;
    private final ContextManager contextManager;
    private final MemoryInjector memoryInjector;
    private final SavedSkillInjector savedSkillInjector;
    private final Delegator delegator;
    private final ThreadSummarizer threadSummarizer;
    private final SessionTranscriptProjector transcriptProjector;
    private final ObjectMapper objectMapper;
    private final AgentCoreProperties properties;
    private final ExecutorService loopExecutor;
    private final ExecutorService childLoopExecutor;
    private final ExecutorService toolExecutor;
    private final RunCancelFlag cancelFlag;

    /** Live loops on THIS instance (reconcile and resume consult it). */
    private final Map<String, LoopHandle> handles = new ConcurrentHashMap<>();

    public DefaultRunSupervisor(RunStore runStore,
                                CheckpointStore checkpointStore,
                                RunEventLog eventLog,
                                RunLease lease,
                                RunQuota quota,
                                AgentRunMapper runMapper,
                                ThreadStore threadStore,
                                LlmGateway llmGateway,
                                ToolGateway toolGateway,
                                ContextManager contextManager,
                                MemoryInjector memoryInjector,
                                SavedSkillInjector savedSkillInjector,
                                Delegator delegator,
                                ThreadSummarizer threadSummarizer,
                                SessionTranscriptProjector transcriptProjector,
                                ObjectMapper objectMapper,
                                AgentCoreProperties properties,
                                @Qualifier("agentLoopExecutor") ExecutorService loopExecutor,
                                @Qualifier("agentChildLoopExecutor") ExecutorService childLoopExecutor,
                                @Qualifier("agentToolExecutor") ExecutorService toolExecutor,
                                RunCancelFlag cancelFlag) {
        this.runStore = runStore;
        this.checkpointStore = checkpointStore;
        this.eventLog = eventLog;
        this.lease = lease;
        this.quota = quota;
        this.runMapper = runMapper;
        this.threadStore = threadStore;
        this.llmGateway = llmGateway;
        this.toolGateway = toolGateway;
        this.contextManager = contextManager;
        this.memoryInjector = memoryInjector;
        this.savedSkillInjector = savedSkillInjector;
        this.delegator = delegator;
        this.threadSummarizer = threadSummarizer;
        this.transcriptProjector = transcriptProjector;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.loopExecutor = loopExecutor;
        this.childLoopExecutor = childLoopExecutor;
        this.toolExecutor = toolExecutor;
        this.cancelFlag = cancelFlag;
    }

    // ==================== create ====================

    /**
     * Create and start a run. Invariants enforced here:
     * <ul>
     *   <li>single active run per conversation (old runs are cancelled first);</li>
     *   <li>tenant quotas;</li>
     *   <li>{@code run.created} is durably logged before the loop starts.</li>
     * </ul>
     */
    public RunView create(CreateRunCommand cmd) {
        if (cmd.getConversationId() == null || cmd.getConversationId().trim().isEmpty()) {
            throw new IllegalArgumentException("conversationId is required");
        }
        quota.checkCreateAllowed(cmd.getUserId(), cmd.getTenantId());
        cancelActiveByConversation(cmd.getConversationId(), cmd.getUserId(), cmd.getTenantId());
        // Inject long-term memory and relevant owner-scoped skills before the
        // loop freezes the initial checkpoint. Retrieval failures fail open.
        cmd.setMemoryLines(memoryInjector.buildLines(cmd.getUserId(), cmd.getSpaceId(), cmd.getPageId()));
        savedSkillInjector.inject(cmd);

        AgentRun run = AgentRun.create(UUID.randomUUID().toString(), cmd.getConversationId(),
                cmd.getUserId(), cmd.getTenantId(), cmd.getModel(), cmd.getMode(), System.currentTimeMillis());
        run.setNextStep(1);
        run.setSpaceId(cmd.getSpaceId());
        run.setPageId(cmd.getPageId());
        run.setToken(cmd.getToken());
        cancelFlag.clear(run.getRunId());
        runStore.persist(run);
        runStore.saveHot(run);

        run.setLastSeq(eventLog.append(run.getRunId(), RunEvents.RUN_CREATED,
                RunEvents.runCreated(run.getRunId(), run.getConversationId(), run.getModel(), run.getMode()))
                .getSeq());
        threadStore.upsertActive(run.getConversationId(), run.getUserId(), run.getTenantId(), run.getRunId());
        // Session memory: carry the rolling thread summary into this fresh run
        // (the upsert no longer erases it) and keep the first-message title
        // stable — only set it when the conversation has none yet.
        AgentThreadEntity thread = threadStore.get(run.getConversationId());
        if (thread != null && thread.getSummary() != null && !thread.getSummary().trim().isEmpty()) {
            cmd.setThreadSummary(thread.getSummary().trim());
        }
        String title = ThreadSummarizer.titleFrom(cmd.getMessages());
        if (title != null && (thread == null || isBlank(thread.getTitle()))) {
            threadStore.updateMeta(run.getConversationId(), title, null);
        }

        // Root runs rebuild their conversation from the engine-owned session log;
        // the caller only supplies the new turn (prepareHistory appends it).
        List<ChatMessage> history = transcriptProjector.prepareHistory(run, cmd.getMessages());
        LoopHandle handle = startLoop(run, null, new CommandRunInput(cmd, history));
        if (handle == null) {
            markFailed(run, "lease_unavailable", "无法获取执行租约");
        }
        return RunView.of(run);
    }

    /** Create a child run (sub-agent) — M3 delegate support. */
    public RunView createChild(CreateRunCommand cmd, String parentRunId, int delegateDepth) {
        // Children are real runs: they must obey the same tenant quota as roots,
        // otherwise one parent can fan out without bound.
        quota.checkCreateAllowed(cmd.getUserId(), cmd.getTenantId());
        AgentRun run = AgentRun.create(UUID.randomUUID().toString(), cmd.getConversationId(),
                cmd.getUserId(), cmd.getTenantId(), cmd.getModel(), cmd.getMode(), System.currentTimeMillis());
        run.setParentRunId(parentRunId);
        run.setNextStep(1);
        run.setSpaceId(cmd.getSpaceId());
        run.setPageId(cmd.getPageId());
        run.setToken(cmd.getToken());
        runStore.persist(run);
        runStore.saveHot(run);
        run.setLastSeq(eventLog.append(run.getRunId(), RunEvents.RUN_CREATED,
                RunEvents.runCreated(run.getRunId(), run.getConversationId(), run.getModel(), run.getMode()))
                .getSeq());

        // Children get their own checkpoint with the delegation depth pre-set.
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId(run.getRunId());
        checkpoint.setMode(run.getMode());
        checkpoint.setModel(run.getModel());
        checkpoint.setNextStep(1);
        checkpoint.setPlanGateOpen(run.isPlanGateOpen());
        checkpoint.setDelegateDepth(delegateDepth);
        // Client editor rules ride in the system message — they are invariant
        // for the whole session, so they stay prefix-cacheable. Skill fragments
        // are retrieved per turn and therefore ride in the volatile tail.
        List<String> systemFragments = new ArrayList<>();
        if (cmd.getSystemPrompt() != null && !cmd.getSystemPrompt().trim().isEmpty()) {
            systemFragments.add(cmd.getSystemPrompt().trim());
        }
        // A pure-text child (noTools) must not inherit the tool-advertising
        // editor persona either — see AgentLoop#initFreshCheckpoint.
        checkpoint.getMessages().add(cmd.isNoTools()
                ? ContextManager.buildPlainTextSystemMessage(cmd.getSystemPrompt())
                : contextManager.buildSystemMessage(run, systemFragments, true));
        if (cmd.getMessages() != null) {
            for (ChatMessage message : cmd.getMessages()) {
                if (message == null || "system".equalsIgnoreCase(message.getRole())) {
                    continue;
                }
                if (isBlank(message.getRole())) {
                    log.warn("Child run {}: blank message role from caller — treating as 'user'",
                            run.getRunId());
                    message.setRole("user");
                }
                checkpoint.getMessages().add(message);
            }
        }
        // Per-turn context last: memory and skill fragments always sit behind
        // the (frozen) system prefix so they cannot break the provider cache.
        contextManager.attachVolatileContext(checkpoint.getMessages(),
                contextManager.buildVolatileContext(cmd.getMemoryLines(),
                        cmd.getSkillFragments(), cmd.getSkillTools(), null));
        if (cmd.getTools() != null) {
            checkpoint.setClientTools(new ArrayList<>(cmd.getTools()));
        }
        if (cmd.getSkillTools() != null) {
            checkpoint.setDeferredTools(new ArrayList<>(cmd.getSkillTools()));
        }
        checkpoint.setTemperature(cmd.getTemperature());
        checkpoint.setMaxTokens(cmd.getMaxTokens());
        checkpoint.setNoTools(cmd.isNoTools());
        checkpoint.setPlanGateOpen(run.isPlanGateOpen());
        checkpoint.setSkillFragments(new ArrayList<>(systemFragments));
        checkpoint.setSystemPrompt(cmd.getSystemPrompt());
        checkpoint.setMemoryLines(cmd.getMemoryLines() != null
                ? new ArrayList<>(cmd.getMemoryLines()) : new ArrayList<>());
        if (cmd.getSavedSkillProvenance() != null) {
            checkpoint.setSavedSkillProvenance(new ArrayList<>(cmd.getSavedSkillProvenance()));
        }
        checkpoint.setMaxSteps(cmd.getMaxSteps() != null
                ? cmd.getMaxSteps() : properties.getRun().getMaxSteps());
        // Record the boundary between caller-supplied history and messages the
        // run itself produces, so the projection appends only the new turns.
        checkpoint.setInputMessageCount(checkpoint.getMessages().size());
        cancelFlag.clear(run.getRunId());
        checkpointStore.save(checkpoint);

        // Child runs are stateless and never projected into a session.
        LoopHandle handle = startLoop(run, checkpoint, new CommandRunInput(cmd));
        if (handle == null) {
            markFailed(run, "lease_unavailable", "无法获取执行租约");
        }
        return RunView.of(run);
    }

    // ==================== query / resume / cancel ====================

    public RunView get(String runId) {
        AgentRun run = runStore.load(runId);
        if (run == null) {
            return null;
        }
        // Keep the cursor from the same persisted snapshot as status, pending
        // calls and assistantText. Advancing only lastSeq can skip durable events
        // that are required to reconcile a stale WAITING_TOOLS snapshot.
        RunView view = RunView.of(run);
        view.setReplayThroughSeq(eventLog.lastSeq(runId));
        // JDBC cold state carries no pendingTools/assistantText, so merge the
        // checkpoint; otherwise a cold-loaded WAITING_TOOLS run cannot be
        // reconnected (the client restore path needs pendingTools).
        Checkpoint checkpoint = checkpointStore.load(runId);
        if (checkpoint != null) {
            if ((view.getAssistantText() == null || view.getAssistantText().isEmpty())
                    && checkpoint.getAssistantText() != null) {
                view.setAssistantText(checkpoint.getAssistantText());
            }
            if (view.getPendingTools().isEmpty()
                    && checkpoint.getPendingToolCalls() != null
                    && !checkpoint.getPendingToolCalls().isEmpty()) {
                view.getPendingTools().addAll(checkpoint.getPendingToolCalls());
            }
            if (RunStatus.SUSPENDED.name().equals(run.getStatus())
                    && "plan_approval".equals(run.getSuspendReason())
                    && checkpoint.getPendingPlanCalls() != null
                    && !checkpoint.getPendingPlanCalls().isEmpty()) {
                PendingToolCall pendingPlan = checkpoint.getPendingPlanCalls().get(0);
                view.setPendingPlanCallId(pendingPlan.getCallId());
                view.setPendingPlan(pendingPlan.getArgsJson());
            }
        }
        return view;
    }

    /**
     * Delegated child runs of a parent — audit drill-down. Owner-scoped via the
     * parent run, and the children inherit the parent's identity.
     */
    public List<RunView> children(String parentRunId, Long userId, Long tenantId) {
        requireOwned(parentRunId, userId, tenantId);
        List<RunView> views = new java.util.ArrayList<>();
        List<AgentRunEntity> rows = runMapper.selectByParentRunId(parentRunId);
        if (rows != null) {
            for (AgentRunEntity row : rows) {
                AgentRun child = runStore.load(row.getRunId());
                if (child != null) {
                    views.add(RunView.of(child));
                }
            }
        }
        return views;
    }

    /**
     * Ownership check — "not found" and "not yours" are indistinguishable to
     * callers (no run-existence leak).
     */
    public AgentRun requireOwned(String runId, Long userId, Long tenantId) {
        AgentRun run = runStore.load(runId);
        if (run == null) {
            throw new IllegalArgumentException("RUN_NOT_FOUND");
        }
        // Fail closed on missing identity: a run with a null owner (possible in
        // the schema) must not be readable/cancellable by any authenticated
        // caller.
        if (userId == null || run.getUserId() == null || !userId.equals(run.getUserId())) {
            throw new IllegalArgumentException("RUN_NOT_FOUND");
        }
        if (tenantId == null || run.getTenantId() == null || !tenantId.equals(run.getTenantId())) {
            throw new IllegalArgumentException("RUN_NOT_FOUND");
        }
        return run;
    }

    /**
     * Deliver a resume payload to the run's loop, rebuilding the loop from its
     * checkpoint when it is not alive locally (crash recovery on demand).
     *
     * @return false when the run is owned by another live instance or a waiting
     *         loop could not enqueue the resume payload
     */
    public boolean resume(String runId, ResumePayload payload) {
        AgentRun run = runStore.load(runId);
        if (run == null) {
            throw new IllegalArgumentException("RUN_NOT_FOUND");
        }
        if (run.statusEnum().isTerminal()) {
            return true; // no-op: the caller re-syncs from the event log
        }
        boolean waiting = RunStatus.WAITING_TOOLS.name().equals(run.getStatus())
                || RunStatus.SUSPENDED.name().equals(run.getStatus());

        LoopHandle handle = handles.get(runId);
        if (handle == null) {
            if (lease.isHeld(runId)) {
                return false; // alive on another instance
            }
            Checkpoint checkpoint = checkpointStore.load(runId);
            if (checkpoint == null) {
                markFailed(run, "unrecoverable", "无法恢复：缺少断点快照");
                return false;
            }
            handle = startLoop(run, checkpoint, null);
            if (handle == null) {
                return false;
            }
        }
        if (waiting) {
            return handle.gate.offer(payload);
        }
        return true;
    }

    /** Idempotent cancel — authoritative terminal marking happens here. */
    public void cancel(String runId) {
        AgentRun run = runStore.load(runId);
        if (run == null) {
            return;
        }
        if (!run.statusEnum().isTerminal()) {
            LoopHandle handle = handles.get(runId);
            // Signal FIRST, then persist: the owning loop must stop persisting
            // before CANCELLED is written, otherwise a late
            // WAITING_TOOLS/SUSPENDED/RUNNING write could resurrect the run.
            // The Redis marker also reaches an owner on another instance.
            cancelFlag.mark(runId);
            if (handle != null) {
                handle.loop.requestCancel();
            }
            run.setStatus(RunStatus.CANCELLED.name());
            run.setFinishReason("cancelled");
            run.setErrorCode(null);
            run.setErrorMessage(null);
            run.touch();
            run.setLastSeq(eventLog.append(run.getRunId(), RunEvents.RUN_CANCELLED,
                    RunEvents.runCancelled(run.getPromptTokens(), run.getCompletionTokens(),
                            run.getCachedPromptTokens())).getSeq());
            runStore.persist(run);
            runStore.saveHot(run);
            threadStore.clearActive(run.getConversationId(), runId);
            // No live loop will call onLoopExit for a run owned by another
            // instance (or already gone), so project the transcript here. When a
            // local handle exists its exit projects instead; onRunTerminal is
            // idempotent, so a remote owner projecting too cannot double-insert.
            if (handle == null) {
                transcriptProjector.onRunTerminal(run);
            }
        }
        // Cascade-cancel child runs even when the parent was already terminal
        // (a root can complete while a delegated child is still running).
        try {
            List<AgentRunEntity> children = runMapper.selectByParentRunId(runId);
            for (AgentRunEntity child : children) {
                cancel(child.getRunId());
            }
        } catch (Exception e) {
            log.warn("Child cascade failed for {}: {}", runId, e.getMessage());
        }
    }

    public void cancelActiveByConversation(String conversationId, Long userId, Long tenantId) {
        try {
            List<AgentRunEntity> active = runMapper.selectActiveByConversation(conversationId, userId, tenantId, 10);
            for (AgentRunEntity entity : active) {
                cancel(entity.getRunId());
            }
        } catch (Exception e) {
            log.warn("cancelActiveByConversation failed for {}: {}", conversationId, e.getMessage());
        }
    }

    // ==================== crash recovery ====================

    /** Called by the loop exactly once when it reaches a terminal state. */
    public void onLoopExit(String runId) {
        handles.remove(runId);
        lease.release(runId);
        AgentRun run = runStore.load(runId);
        // A cross-instance cancel may have marked the flag after the loop
        // already decided to exit; make sure the durable status ends terminal
        // so reconcile does not keep rebuilding a cancelled run.
        boolean externallyCancelled = cancelFlag.isMarked(runId);
        cancelFlag.clear(runId);
        if (run != null) {
            if (externallyCancelled && !run.statusEnum().isTerminal()) {
                run.setStatus(RunStatus.CANCELLED.name());
                run.setFinishReason("cancelled");
                run.touch();
                run.setLastSeq(eventLog.append(runId, RunEvents.RUN_CANCELLED,
                        RunEvents.runCancelled(run.getPromptTokens(), run.getCompletionTokens(),
                                run.getCachedPromptTokens())).getSeq());
                runStore.persist(run);
                runStore.saveHot(run);
            }
            threadStore.clearActive(run.getConversationId(), runId);
            // Session memory: summarize the completed conversation async.
            if (RunStatus.COMPLETED.name().equals(run.getStatus()) && run.getParentRunId() == null) {
                threadSummarizer.summarizeAsync(runId, run.getConversationId(), run.getModel());
            }
            // Engine-owned transcript projection for every terminal state (root
            // runs only). Synchronous: a reload right after the run settles must
            // not race the projection.
            transcriptProjector.onRunTerminal(run);
        }
        // Deregister the live-tail fan-out; existing SSE subscribers drain.
        eventLog.release(runId);
    }

    /**
     * Periodic stale sweep: runs whose lease expired (owner crashed or is
     * partitioned away) are rebuilt from their checkpoint and resumed.
     */
    @Scheduled(fixedDelayString = "15000")
    public void reconcile() {
        try {
            long cutoff = System.currentTimeMillis() - properties.getLease().getTtlSeconds() * 2000L;
            List<AgentRunEntity> stale = runMapper.selectStaleActive(cutoff, 50);
            for (AgentRunEntity entity : stale) {
                String runId = entity.getRunId();
                if (handles.containsKey(runId) || lease.isHeld(runId)) {
                    continue; // alive somewhere
                }
                AgentRun run = runStore.load(runId);
                if (run == null || run.statusEnum().isTerminal()) {
                    continue;
                }
                Checkpoint checkpoint = checkpointStore.load(runId);
                if (checkpoint == null) {
                    markFailed(run, "unrecoverable", "无法恢复：缺少断点快照");
                    continue;
                }
                log.info("Reconciling stale run {} (status {}, seq {})",
                        runId, run.getStatus(), checkpoint.getSeq());
                startLoop(run, checkpoint, null);
            }
        } catch (Exception e) {
            log.warn("reconcile sweep failed: {}", e.getMessage());
        }
    }

    /** Renew leases of live local loops (owner fencing). */
    @Scheduled(fixedDelayString = "10000")
    public void renewLeases() {
        int ttl = properties.getLease().getTtlSeconds();
        for (LoopHandle handle : handles.values()) {
            if (!handle.future.isDone()) {
                if (!lease.renew(handle.run.getRunId(), ttl)) {
                    // Ownership is gone: another instance may already be driving
                    // this run. Stop this loop instead of risking split-brain
                    // duplicate seqs/side effects.
                    log.warn("Lease lost for {} — stopping local loop to avoid split-brain",
                            handle.run.getRunId());
                    handle.loop.requestCancel();
                }
            }
        }
    }

    // ==================== internals ====================

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private LoopHandle startLoop(AgentRun run, Checkpoint checkpoint, AgentLoop.RunInput input) {
        if (!lease.acquire(run.getRunId(), properties.getLease().getTtlSeconds())) {
            log.warn("Lease unavailable for {} — another instance drives it", run.getRunId());
            return null;
        }
        ResumeGate gate = new ResumeGate();
        AgentLoop loop = new AgentLoop(run, checkpoint, input,
                runStore, checkpointStore, eventLog,
                llmGateway, toolGateway, contextManager,
                delegator, objectMapper, properties, toolExecutor,
                this::onLoopExit, gate, cancelFlag, quota::checkUserCreditBudget);
        // Children run on a SEPARATE pool. A parent blocks its own thread while
        // waiting for children; if children shared the parent pool they would
        // queue behind blocked parents and starve (a deadlock with core=4).
        ExecutorService executor = run.getParentRunId() != null ? childLoopExecutor : loopExecutor;
        Future<?> future;
        try {
            future = executor.submit(loop);
        } catch (java.util.concurrent.RejectedExecutionException e) {
            log.warn("Loop submission rejected for {} (pool saturated)", run.getRunId());
            lease.release(run.getRunId());
            return null;
        }
        LoopHandle handle = new LoopHandle(run, loop, gate, future);
        handles.put(run.getRunId(), handle);
        return handle;
    }

    private void markFailed(AgentRun run, String code, String message) {
        cancelFlag.clear(run.getRunId());
        run.setStatus(RunStatus.FAILED.name());
        run.setFinishReason(code);
        run.setErrorCode(code);
        run.setErrorMessage(message);
        run.touch();
        run.setLastSeq(eventLog.append(run.getRunId(), RunEvents.RUN_FAILED,
                RunEvents.runFailed(code, message)).getSeq());
        runStore.persist(run);
        runStore.saveHot(run);
        threadStore.clearActive(run.getConversationId(), run.getRunId());
        eventLog.release(run.getRunId());
        // Project even when no loop ever exited (lease unavailable, missing
        // checkpoint, reconcile failure). onRunTerminal is idempotent per run.
        transcriptProjector.onRunTerminal(run);
    }

    /** {@link AgentLoop.RunInput} adapter over a create command. */
    private static final class CommandRunInput implements AgentLoop.RunInput {
        private final CreateRunCommand cmd;
        private final List<ChatMessage> history;

        CommandRunInput(CreateRunCommand cmd) {
            this(cmd, cmd.getMessages());
        }

        CommandRunInput(CreateRunCommand cmd, List<ChatMessage> history) {
            this.cmd = cmd;
            this.history = history;
        }

        @Override
        public List<ChatMessage> messages() {
            return history;
        }

        @Override
        public List<ToolSpec> clientTools() {
            return cmd.getTools();
        }

        @Override
        public List<ToolSpec> skillTools() {
            return cmd.getSkillTools();
        }

        @Override
        public List<String> skillFragments() {
            return cmd.getSkillFragments();
        }

        @Override
        public String systemPrompt() {
            return cmd.getSystemPrompt();
        }

        @Override
        public List<String> memoryLines() {
            return cmd.getMemoryLines();
        }

        @Override
        public String threadSummary() {
            return cmd.getThreadSummary();
        }

        @Override
        public List<SavedSkillProvenance> savedSkillProvenance() {
            return cmd.getSavedSkillProvenance();
        }

        @Override
        public String model() {
            return cmd.getModel();
        }

        @Override
        public String mode() {
            return cmd.getMode();
        }

        @Override
        public Double temperature() {
            return cmd.getTemperature();
        }

        @Override
        public Integer maxTokens() {
            return cmd.getMaxTokens();
        }

        @Override
        public Integer maxSteps() {
            return cmd.getMaxSteps();
        }

        @Override
        public boolean noTools() {
            return cmd.isNoTools();
        }
    }
}
