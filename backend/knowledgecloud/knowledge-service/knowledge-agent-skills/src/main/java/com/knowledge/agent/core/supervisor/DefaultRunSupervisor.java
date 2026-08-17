package com.knowledge.agentcore.supervisor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agentcore.checkpoint.Checkpoint;
import com.knowledge.agentcore.checkpoint.CheckpointStore;
import com.knowledge.agentcore.config.AgentCoreProperties;
import com.knowledge.agentcore.context.ContextManager;
import com.knowledge.agentcore.delegate.Delegator;
import com.knowledge.agentcore.event.RunEventLog;
import com.knowledge.agentcore.event.RunEvents;
import com.knowledge.agentcore.llm.LlmGateway;
import com.knowledge.agentcore.loop.AgentLoop;
import com.knowledge.agentcore.loop.LoopHandle;
import com.knowledge.agentcore.loop.ResumeGate;
import com.knowledge.agentcore.loop.ResumePayload;
import com.knowledge.agentcore.mapper.AgentRunMapper;
import com.knowledge.agentcore.memory.MemoryInjector;
import com.knowledge.agentcore.memory.ThreadSummarizer;
import com.knowledge.agentcore.entity.AgentRunEntity;
import com.knowledge.agentcore.run.AgentRun;
import com.knowledge.agentcore.run.RunStatus;
import com.knowledge.agentcore.run.RunStore;
import com.knowledge.agentcore.run.RunView;
import com.knowledge.agentcore.tool.ToolGateway;
import com.knowledge.agentcore.tool.ToolSpec;
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
    private final Delegator delegator;
    private final ThreadSummarizer threadSummarizer;
    private final ObjectMapper objectMapper;
    private final AgentCoreProperties properties;
    private final ExecutorService loopExecutor;
    private final ExecutorService toolExecutor;

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
                                Delegator delegator,
                                ThreadSummarizer threadSummarizer,
                                ObjectMapper objectMapper,
                                AgentCoreProperties properties,
                                @Qualifier("agentLoopExecutor") ExecutorService loopExecutor,
                                @Qualifier("agentToolExecutor") ExecutorService toolExecutor) {
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
        this.delegator = delegator;
        this.threadSummarizer = threadSummarizer;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.loopExecutor = loopExecutor;
        this.toolExecutor = toolExecutor;
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
        quota.checkCreateAllowed(cmd.getTenantId());
        cancelActiveByConversation(cmd.getConversationId(), cmd.getUserId(), cmd.getTenantId());
        // Inject long-term memory lines (page → space → user scopes) for the
        // system prompt built by the loop.
        cmd.setMemoryLines(memoryInjector.buildLines(cmd.getUserId(), cmd.getSpaceId(), cmd.getPageId()));

        AgentRun run = AgentRun.create(UUID.randomUUID().toString(), cmd.getConversationId(),
                cmd.getUserId(), cmd.getTenantId(), cmd.getModel(), cmd.getMode(), System.currentTimeMillis());
        run.setNextStep(1);
        run.setSpaceId(cmd.getSpaceId());
        run.setPageId(cmd.getPageId());
        run.setToken(cmd.getToken());
        runStore.persist(run);
        runStore.saveHot(run);

        run.setLastSeq(eventLog.append(run.getRunId(), RunEvents.RUN_CREATED,
                RunEvents.runCreated(run.getRunId(), run.getConversationId(), run.getModel(), run.getMode()))
                .getSeq());
        threadStore.upsertActive(run.getConversationId(), run.getUserId(), run.getTenantId(), run.getRunId());
        String title = ThreadSummarizer.titleFrom(cmd.getMessages());
        if (title != null) {
            threadStore.updateMeta(run.getConversationId(), title, null);
        }

        LoopHandle handle = startLoop(run, null, new CommandRunInput(cmd));
        if (handle == null) {
            markFailed(run, "lease_unavailable", "无法获取执行租约");
        }
        return RunView.of(run);
    }

    /** Create a child run (sub-agent) — M3 delegate support. */
    public RunView createChild(CreateRunCommand cmd, String parentRunId, int delegateDepth) {
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
        checkpoint.getMessages().add(contextManager.buildSystemMessage(run,
                cmd.getSkillFragments(), cmd.getMemoryLines()));
        if (cmd.getMessages() != null) {
            for (ChatMessage message : cmd.getMessages()) {
                if (message != null && !"system".equalsIgnoreCase(message.getRole())) {
                    checkpoint.getMessages().add(message);
                }
            }
        }
        if (cmd.getTools() != null) {
            checkpoint.setClientTools(new ArrayList<>(cmd.getTools()));
        }
        checkpoint.setTemperature(cmd.getTemperature());
        checkpoint.setMaxTokens(cmd.getMaxTokens());
        checkpoint.setMaxSteps(cmd.getMaxSteps() != null
                ? cmd.getMaxSteps() : properties.getRun().getMaxSteps());
        checkpointStore.save(checkpoint);

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
        if (run.statusEnum().isActive()) {
            long seq = eventLog.lastSeq(runId);
            if (seq > run.getLastSeq()) {
                run.setLastSeq(seq);
            }
        }
        return RunView.of(run);
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
        if (userId != null && run.getUserId() != null && !userId.equals(run.getUserId())) {
            throw new IllegalArgumentException("RUN_NOT_FOUND");
        }
        if (tenantId != null && run.getTenantId() != null && !tenantId.equals(run.getTenantId())) {
            throw new IllegalArgumentException("RUN_NOT_FOUND");
        }
        return run;
    }

    /**
     * Deliver a resume payload to the run's loop, rebuilding the loop from its
     * checkpoint when it is not alive locally (crash recovery on demand).
     *
     * @return false when the run is owned by another live instance.
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
            handle.gate.offer(payload);
        }
        return true;
    }

    /** Idempotent cancel — authoritative terminal marking happens here. */
    public void cancel(String runId) {
        AgentRun run = runStore.load(runId);
        if (run == null || run.statusEnum().isTerminal()) {
            return;
        }
        LoopHandle handle = handles.get(runId);

        run.setStatus(RunStatus.CANCELLED.name());
        run.setFinishReason("cancelled");
        run.setErrorCode(null);
        run.setErrorMessage(null);
        run.touch();
        run.setLastSeq(eventLog.append(run.getRunId(), RunEvents.RUN_CANCELLED, RunEvents.runCancelled())
                .getSeq());
        runStore.persist(run);
        runStore.saveHot(run);
        threadStore.clearActive(run.getConversationId(), runId);
        if (handle != null) {
            handle.loop.requestCancel();
        }
        // Cascade-cancel child runs (sub-agent tree).
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
        if (run != null) {
            threadStore.clearActive(run.getConversationId(), runId);
            // Session memory: summarize the completed conversation async.
            if (RunStatus.COMPLETED.name().equals(run.getStatus()) && run.getParentRunId() == null) {
                threadSummarizer.summarizeAsync(runId, run.getConversationId(), run.getModel());
            }
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
                lease.renew(handle.run.getRunId(), ttl);
            }
        }
    }

    // ==================== internals ====================

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
                this::onLoopExit, gate);
        Future<?> future = loopExecutor.submit(loop);
        LoopHandle handle = new LoopHandle(run, loop, gate, future);
        handles.put(run.getRunId(), handle);
        return handle;
    }

    private void markFailed(AgentRun run, String code, String message) {
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
    }

    /** {@link AgentLoop.RunInput} adapter over a create command. */
    private static final class CommandRunInput implements AgentLoop.RunInput {
        private final CreateRunCommand cmd;

        CommandRunInput(CreateRunCommand cmd) {
            this.cmd = cmd;
        }

        @Override
        public List<ChatMessage> messages() {
            return cmd.getMessages();
        }

        @Override
        public List<ToolSpec> clientTools() {
            return cmd.getTools();
        }

        @Override
        public List<String> skillFragments() {
            return cmd.getSkillFragments();
        }

        @Override
        public List<String> memoryLines() {
            return cmd.getMemoryLines();
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
