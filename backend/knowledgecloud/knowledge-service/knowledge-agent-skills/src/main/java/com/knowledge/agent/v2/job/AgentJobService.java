package com.knowledge.agent.v2.job;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.store.AgentStateStore;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.AgentEventSerializer;
import com.knowledge.agent.v2.event.LifecycleEvent;
import com.knowledge.agent.v2.event.ThinkingEvent;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.observability.AgentJobMetrics;
import com.knowledge.agent.v2.profile.ProfileRecorder;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.AgentSessionFactory;
import com.knowledge.agent.v2.state.SessionSnapshotCodec;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Durable, event-sourced async agent executor.
 *
 * <p>Architectural guarantees that make interruption recovery ("断点续传")
 * a first-class property rather than a process-local convenience:
 * <ol>
 *   <li><b>Durable event log first</b>: every event (with a monotonic seq) is
 *       appended to {@link AgentTaskEventStore} (Redis ZSET + MySQL mirror)
 *       BEFORE it is streamed. Replay is therefore independent of process
 *       memory — {@link #streamEvents} serves {@code seq > afterSeq} from the
 *       store and dedupes against the live tail by seq.</li>
 *   <li><b>Full session checkpoints</b>: the session (messages, iteration,
 *       <b>pending tool calls</b>) is snapshotted on every suspension, so a
 *       paused task can be resumed after a restart without losing what it was
 *       waiting for.</li>
 *   <li><b>Rebuildable executor</b>: {@link #ensureLive} reconstructs a
 *       RUNNING task from {@code AgentJobStore} + snapshot + event log and
 *       re-subscribes the engine, mapping a checkpointed {@code THINK +
 *       pending tools} state to {@code ACT} so the LLM call is not re-run.</li>
 *   <li><b>Idempotent resume</b>: tool results already present in the session
 *       are skipped, so a retried resume never corrupts message pairing.</li>
 * </ol>
 *
 * <p>Jobs stay in memory for a bounded window; the durable tiers are the source
 * of truth for anything that outlives the process.
 */
@Slf4j
@Component
public class AgentJobService {

    private static final int REPLAY_BATCH = 2_000;
    private static final long COMPLETED_TTL_MS = 30 * 60_000L;
    private static final String LEASE_KEY_PREFIX = "agent:job:lease:";
    private static final long LEASE_CHECK_INTERVAL_MS = 2_000L;
    private static final String INSTANCE_ID = UUID.randomUUID().toString();
    /** assistantText hot-save throttle: persist at most once per interval (per task). */
    private static final long HOT_SAVE_INTERVAL_MS = 1_000L;

    private final AgentEngine engine;
    private final com.knowledge.agent.v2.eventbus.AgentEventBus eventBus;
    /** Optional Redis lease used for multi-instance fencing. Null in tests. */
    @Autowired(required = false)
    private StringRedisTemplate leaseRedis;
    private final AgentSessionFactory sessionFactory;
    private final AgentJobStore jobStore;
    private final AgentTaskEventStore eventStore;
    private final AgentProperties properties;
    private final ProfileRecorder profileRecorder;
    private final AgentJobMetrics metrics;
    private final SessionSnapshotCodec snapshotCodec;
    private final ObjectProvider<AgentStateStore> stateStoreProvider;
    private final ObjectMapper objectMapper;

    private final ConcurrentHashMap<String, TaskRun> runs = new ConcurrentHashMap<>();
    /** Per-tenant task-creation rate counters. */
    private final ConcurrentHashMap<String, WindowCounter> createCounters = new ConcurrentHashMap<>();

    public AgentJobService(AgentEngine engine,
            com.knowledge.agent.v2.eventbus.AgentEventBus eventBus,
            AgentSessionFactory sessionFactory,
            AgentJobStore jobStore,
            AgentTaskEventStore eventStore,
            AgentProperties properties,
            ProfileRecorder profileRecorder,
            AgentJobMetrics metrics,
            SessionSnapshotCodec snapshotCodec,
            ObjectProvider<AgentStateStore> stateStoreProvider,
            ObjectMapper objectMapper) {
        this.engine = engine;
        this.eventBus = eventBus;
        this.sessionFactory = sessionFactory;
        this.jobStore = jobStore;
        this.eventStore = eventStore;
        this.properties = properties;
        this.profileRecorder = profileRecorder;
        this.metrics = metrics;
        this.snapshotCodec = snapshotCodec;
        this.stateStoreProvider = stateStoreProvider;
        this.objectMapper = objectMapper;
    }

    // ---- Distributed lease / fencing ----

    private String leaseKey(String taskId) {
        return LEASE_KEY_PREFIX + taskId;
    }

    private long leaseTtlSeconds() {
        int ttl = properties.getEngine().getLeaseTtlSeconds();
        return Math.max(5, ttl);
    }

    /** Acquire the task lease. Fail-safe true when Redis is unavailable. */
    private boolean tryAcquireLease(String taskId) {
        if (leaseRedis == null) {
            return true;
        }
        try {
            Boolean ok = leaseRedis.opsForValue().setIfAbsent(
                    leaseKey(taskId), INSTANCE_ID, Duration.ofSeconds(leaseTtlSeconds()));
            return Boolean.TRUE.equals(ok);
        } catch (Exception e) {
            log.warn("AgentJobService: Redis lease acquire failed for {}: {}", taskId, e.getMessage());
            return true;
        }
    }

    /** Renew the lease only if this instance still owns it. */
    private boolean renewLease(String taskId) {
        if (leaseRedis == null) {
            return true;
        }
        try {
            Boolean ok = leaseRedis.opsForValue().setIfPresent(
                    leaseKey(taskId), INSTANCE_ID, Duration.ofSeconds(leaseTtlSeconds()));
            return Boolean.TRUE.equals(ok);
        } catch (Exception e) {
            log.warn("AgentJobService: Redis lease renew failed for {}: {}", taskId, e.getMessage());
            return true;
        }
    }

    private boolean isLeaseOwner(String taskId) {
        if (leaseRedis == null) {
            return true;
        }
        try {
            return INSTANCE_ID.equals(leaseRedis.opsForValue().get(leaseKey(taskId)));
        } catch (Exception e) {
            log.warn("AgentJobService: Redis lease check failed for {}: {}", taskId, e.getMessage());
            return true;
        }
    }

    private void releaseLease(String taskId) {
        if (leaseRedis == null) {
            return;
        }
        try {
            DefaultRedisScript<Long> script = new DefaultRedisScript<>(
                    "if redis.call('get', KEYS[1]) == ARGV[1] then "
                            + "return redis.call('del', KEYS[1]) else return 0 end",
                    Long.class);
            leaseRedis.execute(script, java.util.Collections.singletonList(leaseKey(taskId)),
                    INSTANCE_ID);
        } catch (Exception e) {
            log.warn("AgentJobService: Redis lease release failed for {}: {}", taskId, e.getMessage());
        }
    }

    // ---- Lifecycle ----

    /**
     * Build the session, persist the job, and start the engine in the background.
     *
     * <p>Quota guards run first: per-tenant creation rate limit and concurrent
     * task cap (counted from the live runs plus the JDBC-backed store, so the
     * cap survives a restart).
     */
    public AgentJob create(ChatCompletionRequest request, AgentIdentity identity) {
        Long tenantId = identity != null ? identity.getTenantId() : null;
        enforceCreateQuota(tenantId);

        AgentSession session = sessionFactory.build(request, identity);
        AgentJob job = new AgentJob(
                UUID.randomUUID().toString(),
                session.getSessionId(),
                session.getConversationId(),
                identity.getUserId(),
                identity.getTenantId());
        if (!tryAcquireLease(job.getTaskId())) {
            throw new IllegalArgumentException("Task lease unavailable; another instance owns this task");
        }
        jobStore.save(job);

        TaskRun run = new TaskRun(job, session);
        runs.put(job.getTaskId(), run);
        metrics.taskCreated();
        startFresh(run);
        return job;
    }

    /**
     * Start a first-class child task for a {@code delegate_task} run. The child
     * gets its own job/event-log/snapshot/live-sink, exactly like a root task,
     * and is linked back to the parent via {@code parentTaskId}.
     */
    public AgentJob createChild(AgentSession session, String parentTaskId) {
        Long tenantId = session.getIdentity() != null ? session.getIdentity().getTenantId() : null;
        enforceCreateQuota(tenantId);

        AgentJob job = new AgentJob(
                UUID.randomUUID().toString(),
                session.getSessionId(),
                session.getConversationId(),
                session.getIdentity() != null ? session.getIdentity().getUserId() : null,
                tenantId,
                parentTaskId);
        if (!tryAcquireLease(job.getTaskId())) {
            throw new IllegalArgumentException("Child task lease unavailable; another instance owns this task");
        }
        jobStore.save(job);

        TaskRun run = new TaskRun(job, session);
        runs.put(job.getTaskId(), run);
        metrics.taskCreated();
        startFresh(run);
        return job;
    }

    private void enforceCreateQuota(Long tenantId) {
        AgentProperties.RateLimitConfig rateLimit = properties.getRateLimit();
        if (!rateLimit.isEnabled()) {
            return;
        }

        String key = "tenant:" + (tenantId != null ? tenantId : 0L);
        WindowCounter counter = createCounters.computeIfAbsent(key,
                k -> new WindowCounter(Math.max(1, rateLimit.getTaskCreatePerMinute())));
        if (!counter.tryAcquire()) {
            throw new IllegalArgumentException("Task creation rate limit exceeded");
        }

        int maxConcurrent = rateLimit.getMaxConcurrentSessions();
        if (maxConcurrent > 0 && countActiveByTenant(tenantId) >= maxConcurrent) {
            throw new IllegalArgumentException(
                    "Concurrent task limit reached (max " + maxConcurrent + ")");
        }
    }

    /** Active (non-terminal) tasks for a tenant: live runs + JDBC-backed count. */
    long countActiveByTenant(Long tenantId) {
        long inMemory = runs.values().stream()
                .filter(r -> r.job.getTenantId() != null && r.job.getTenantId().equals(tenantId)
                        && !r.job.isTerminal())
                .count();
        long stored = jobStore.countActive(tenantId);
        return Math.max(inMemory, stored);
    }

    public AgentJob status(String taskId) {
        TaskRun run = runs.get(taskId);
        if (run != null) {
            if (!isLeaseOwner(taskId)) {
                if (run.executionActive.get()) {
                    dispose(run);
                    cancelChildWork(run);
                    run.executionActive.set(false);
                }
                runs.remove(taskId, run);
                run = null;
            } else {
                return run.job;
            }
        }
        return jobStore.load(taskId);
    }

    /** Diagnostic/test visibility: is an engine execution currently subscribed? */
    boolean isExecutionActive(String taskId) {
        TaskRun run = runs.get(taskId);
        return run != null && run.executionActive.get();
    }

    /**
     * Full reconnect state: status, accumulated assistant text, last durable
     * seq, and the frontend tool calls currently awaiting execution. Derived
     * from the live run when present; otherwise from the persisted job +
     * event log checkpoint.
     */
    public TaskState state(String taskId) {
        TaskRun run = ensureLive(taskId);
        if (run != null && !isLeaseOwner(taskId)) {
            runs.remove(taskId, run);
            run = null;
        }
        if (run == null) {
            AgentJob job = jobStore.load(taskId);
            if (job != null && (job.getStatus() == AgentJobStatus.WAITING_TOOLS
                    || job.getStatus() == AgentJobStatus.SUSPENDED)) {
                // Paused after a restart — rebuild from the snapshot so the
                // pending frontend tools are surfaced for the reconnect.
                run = restorePaused(taskId);
            }
        }
        AgentJob job = run != null ? run.job : jobStore.load(taskId);
        if (job == null) {
            return null;
        }

        TaskState st = new TaskState();
        st.taskId = job.getTaskId();
        st.sessionId = job.getSessionId();
        st.conversationId = job.getConversationId();
        st.status = job.getStatus().name();
        st.finishReason = job.getFinishReason();
        st.errorMessage = job.getErrorMessage();
        st.promptTokens = job.getPromptTokens();
        st.completionTokens = job.getCompletionTokens();

        if (run != null) {
            synchronized (run) {
                st.assistantText = run.assistantText.toString();
                st.lastSeq = run.seq.get();
            }
            synchronized (run.pendingTools) {
                st.pendingTools = new ArrayList<>(run.pendingTools);
            }
            st.subAgents = new ArrayList<>(run.subAgents.values());
        } else {
            st.assistantText = job.getAssistantText();
            st.lastSeq = job.getLastSeq() > 0 ? job.getLastSeq() : eventStore.maxSeq(taskId);
            st.pendingTools = Collections.emptyList();
        }
        return st;
    }

    /**
     * Durable replay + live tail, deduplicated by seq. Replay comes from the
     * event store (survives restarts); the live tail starts strictly after the
     * replayed watermark so no event is delivered twice or lost.
     */
    public Flux<TaskEvent> streamEvents(String taskId, long afterSeq) {
        TaskRun run = ensureLive(taskId);

        // Page through the durable log until exhausted — a single replay call
        // was capped at REPLAY_BATCH, which truncated history for long tasks
        // whose live run had already been evicted.
        List<TaskEvent> replayed = new ArrayList<>();
        long cursor = afterSeq;
        while (true) {
            List<AgentTaskEventStore.TaskEventRecord> records =
                    eventStore.replay(taskId, cursor, REPLAY_BATCH);
            if (records == null || records.isEmpty()) {
                break;
            }
            for (AgentTaskEventStore.TaskEventRecord record : records) {
                if (record.seq <= cursor) {
                    continue; // dedup against the watermark
                }
                replayed.add(TaskEvent.replayed(record.seq, record.type, record.payloadJson));
                cursor = record.seq;
            }
            if (records.size() < REPLAY_BATCH) {
                break; // store exhausted
            }
        }

        final long watermark = cursor;
        Flux<TaskEvent> live = run != null
                ? run.live.asFlux().filter(te -> te.seq > watermark)
                : Flux.empty();

        return Flux.concat(Flux.fromIterable(replayed), live);
    }

    /**
     * Resume a paused job with frontend tool results and/or a fresh iteration
     * budget. Returns the live continuation events (NOT the replay history).
     *
     * <p>Re-entrancy guard: only one engine execution per task. A retried
     * resume (double click, lost response retry) re-streams the live tail
     * instead of double-subscribing the engine.
     */
    public Flux<TaskEvent> resume(String taskId, List<ToolResult> toolResults, String action) {
        return resume(taskId, toolResults, action, null);
    }

    /**
     * Resume a paused job with frontend tool results, a fresh iteration budget
     * (action=continue) and/or a plan-approval decision.
     */
    public Flux<TaskEvent> resume(String taskId, List<ToolResult> toolResults, String action,
            ResumeApplier.PlanDecision planDecision) {
        TaskRun run = runs.get(taskId);
        if (run == null) {
            run = restorePaused(taskId);
        }
        if (run == null) {
            return Flux.error(new IllegalStateException("Job not found: " + taskId));
        }
        if (!isLeaseOwner(taskId) && !tryAcquireLease(taskId)) {
            return Flux.error(new IllegalStateException(
                    "Task is fenced by another instance: " + taskId));
        }

        synchronized (run) {
            if (run.executionActive.get()) {
                log.warn("AgentJobService: resume re-entrant for {} — returning live continuation", taskId);
                // Return the ACTIVE continuation, never the full live replay:
                // re-delivering history re-accumulated pending frontend tools on
                // the client and produced a re-execute→resume loop.
                Sinks.Many<TaskEvent> active = run.continuation.get();
                return active != null ? active.asFlux() : Flux.empty();
            }

            AgentJobStatus current = run.job.getStatus();
            boolean hasToolResults = toolResults != null && !toolResults.isEmpty();
            boolean hasPlanDecision = planDecision != null && planDecision.decision != null;
            boolean hasContinue = "continue".equalsIgnoreCase(action);
            if (!current.isPaused()) {
                return Flux.error(new IllegalStateException(
                        "Task is not resumable (status=" + current + ")"));
            }
            // A retried resume may legitimately carry no NEW results because
            // every pending frontend tool was already answered in the session.
            boolean allPendingAnswered = current == AgentJobStatus.WAITING_TOOLS
                    && allPendingToolsAnswered(run.session);
            if (current == AgentJobStatus.WAITING_TOOLS
                    && !hasToolResults && !hasPlanDecision && !allPendingAnswered) {
                return Flux.error(new IllegalStateException(
                        "Task is waiting for frontend tool results"));
            }
            if (current == AgentJobStatus.SUSPENDED && !hasContinue && !hasPlanDecision) {
                return Flux.error(new IllegalStateException(
                        "Suspended task requires action=continue or a plan decision"));
            }

            applyResults(run.session, toolResults, action, planDecision);
            synchronized (run.pendingTools) {
                run.pendingTools.clear();
            }
            run.job.setStatus(AgentJobStatus.RUNNING);
            run.job.setFinishReason(null);
            jobStore.save(run.job);
            // Persist the resume mutation BEFORE starting the engine. The store
            // write is asynchronous, but encoding happens synchronously here;
            // this closes the previous window where a crash immediately after
            // resume replayed a stale suspension checkpoint.
            checkpoint(run);

            // Emit the plan resolution before the engine continuation so the
            // client can close the pending-plan card deterministically.
            Flux<com.knowledge.agent.v2.event.AgentEvent> source = engine.resume(run.session);
            if (planDecision != null && planDecision.decision != null && planDecision.planId != null) {
                source = Flux.concat(
                        Flux.just((com.knowledge.agent.v2.event.AgentEvent)
                                new com.knowledge.agent.v2.event.PlanEvent.PlanResolved(
                                        run.session.getSessionId(), planDecision.planId,
                                        planDecision.planJson,
                                        planDecision.decision, planDecision.feedback)),
                        source);
            }
            return subscribe(source, run);
        }
    }

    /** Cancel a running/paused job by disposing its engine subscription. */
    public boolean cancel(String taskId) {
        TaskRun run = runs.get(taskId);
        if (run == null) {
            // Another instance owns the active lease: it must cancel the task.
            if (!isLeaseOwner(taskId)) {
                log.info("AgentJobService: cancel {} refused — fenced by another instance", taskId);
                return false;
            }
            // Survived a restart — cancel the persisted job directly.
            AgentJob job = jobStore.load(taskId);
            if (job == null || job.isTerminal()) {
                releaseLease(taskId);
                return false;
            }
            job.setStatus(AgentJobStatus.CANCELLED);
            job.setFinishReason("cancelled");
            jobStore.save(job);
            releaseLease(taskId);
            metrics.taskCancelled();
            log.info("AgentJobService: cancelled persisted job {}", taskId);
            return true;
        }
        dispose(run);
        // Cascade the cancellation into any delegated child agents still running.
        cancelChildWork(run);
        run.executionActive.set(false);
        run.job.setStatus(AgentJobStatus.CANCELLED);
        run.job.setFinishReason("cancelled");
        jobStore.save(run.job);
        releaseLease(taskId);
        metrics.taskCancelled();
        run.live.tryEmitComplete();
        log.info("AgentJobService: cancelled job {}", taskId);
        return true;
    }

    /** Non-terminal task count (live gauge for the admin metrics endpoint). */
    public long activeCount() {
        return runs.values().stream().filter(r -> !r.job.isTerminal()).count();
    }

    /** Tasks currently held in memory (runs map size). */
    public long runCount() {
        return runs.size();
    }

    /**
     * Resolve a taskId by its agent sessionId — the legacy {@code /chat/resume}
     * protocol resumes by session. Prefers the live runs; falls back to the
     * persisted store (most recent task for the session wins).
     */
    public String findTaskIdBySession(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) {
            return null;
        }
        for (TaskRun run : runs.values()) {
            if (sessionId.equals(run.job.getSessionId())) {
                return run.job.getTaskId();
            }
        }
        AgentJob job = jobStore.loadBySessionId(sessionId);
        return job != null ? job.getTaskId() : null;
    }

    // ---- Rebuild / revive ----

    /**
     * Make sure the job has a live execution when it should:
     * <ul>
     *   <li>live run present & healthy → return it;</li>
     *   <li>RUNNING/QUEUED job with a dead subscription (process restarted or
     *       subscription lost) → rebuild the session from the snapshot + event
     *       log and re-subscribe the engine;</li>
     *   <li>paused/terminal jobs → left alone (resume/cancel handle them).</li>
     * </ul>
     */
    private TaskRun ensureLive(String taskId) {
        TaskRun run = runs.get(taskId);
        if (run != null) {
            boolean claimsRunning = run.job.getStatus() == AgentJobStatus.RUNNING
                    || run.job.getStatus() == AgentJobStatus.QUEUED;
            if (!isLeaseOwner(taskId)) {
                // Lost the fencing lease (partition / another instance revived).
                if (run.executionActive.get()) {
                    dispose(run);
                    cancelChildWork(run);
                    run.executionActive.set(false);
                }
                runs.remove(taskId, run);
                run = null;
            } else if (claimsRunning && !run.executionActive.get()) {
                runs.remove(taskId, run);
                run = null;
            } else {
                return run;
            }
        }

        AgentJob job = jobStore.load(taskId);
        if (job == null || job.isTerminal()) {
            return null;
        }
        if (job.getStatus() == AgentJobStatus.WAITING_TOOLS
                || job.getStatus() == AgentJobStatus.SUSPENDED) {
            return null; // paused jobs wait for an explicit resume()
        }
        // Only the lease owner may revive a RUNNING/QUEUED job.
        if (!isLeaseOwner(taskId) && !tryAcquireLease(taskId)) {
            log.info("AgentJobService: task {} is fenced by another instance", taskId);
            return null;
        }

        AgentSession session = restoreSession(job);
        if (session == null) {
            log.warn("AgentJobService: cannot revive {} — snapshot unavailable", taskId);
            job.setStatus(AgentJobStatus.FAILED);
            job.setFinishReason("error:snapshot_unavailable");
            job.setErrorMessage("Session snapshot unavailable for revival");
            jobStore.save(job);
            releaseLease(taskId);
            return null;
        }

        TaskRun revived = new TaskRun(job, session);
        revived.seq.set(eventStore.maxSeq(taskId));
        if (job.getAssistantText() != null) {
            revived.assistantText.append(job.getAssistantText());
        }
        // Recover text deltas emitted after the last throttled hot-save from
        // the durable event log so reconnect text is complete.
        backfillAssistantText(revived, job.getLastSeq());
        rebuildSubAgents(revived);
        // Concurrent revives race to rebuild the same task: only the winner
        // keeps its run and starts the engine.
        TaskRun existing = runs.putIfAbsent(taskId, revived);
        if (existing != null) {
            return existing;
        }
        log.info("AgentJobService: revived job {} from snapshot (seq={}, state={})",
                taskId, revived.seq.get(), session.getCurrentState());
        metrics.taskRevived();
        revive(revived);
        return revived;
    }

    /** Rebuild a paused job (WAITING_TOOLS / SUSPENDED) from its snapshot. */
    private TaskRun restorePaused(String taskId) {
        if (!isLeaseOwner(taskId) && !tryAcquireLease(taskId)) {
            log.info("AgentJobService: paused task {} is fenced by another instance", taskId);
            return null;
        }
        AgentJob job = jobStore.load(taskId);
        if (job == null) {
            releaseLease(taskId);
            return null;
        }
        AgentSession session = restoreSession(job);
        if (session == null) {
            log.warn("AgentJobService: cannot restore paused job {} — snapshot unavailable", taskId);
            return null;
        }
        TaskRun run = new TaskRun(job, session);
        run.seq.set(eventStore.maxSeq(taskId));
        if (job.getAssistantText() != null) {
            run.assistantText.append(job.getAssistantText());
        }
        backfillAssistantText(run, job.getLastSeq());
        rebuildSubAgents(run);
        // Surface the frontend tools this paused task is waiting for.
        List<InferenceResponse.ToolCallData> pending =
                session.getExecution().getPendingToolCalls();
        if (pending != null) {
            for (InferenceResponse.ToolCallData tc : pending) {
                PendingTool pt = new PendingTool();
                pt.toolCallId = tc.getId();
                pt.toolName = tc.getName();
                pt.arguments = tc.getArguments();
                run.pendingTools.add(pt);
            }
        }
        runs.putIfAbsent(taskId, run);
        log.info("AgentJobService: restored paused job {} from snapshot", taskId);
        return runs.get(taskId);
    }

    /**
     * Decode the session snapshot. A checkpointed {@code THINK} state that
     * still carries pending tool calls means the LLM call already completed —
     * resume at {@code ACT} so the tools run instead of re-thinking.
     */
    private AgentSession restoreSession(AgentJob job) {
        AgentStateStore stateStore = stateStoreProvider.getIfAvailable();
        if (stateStore == null) {
            return null;
        }
        try {
            AgentStateSnapshot snapshot = stateStore.load(job.getSessionId());
            if (snapshot == null || snapshot.getV2SessionJson() == null) {
                return null;
            }
            AgentSession session = snapshotCodec.decode(snapshot, SecurityContextUtil.getToken());
            if (session == null) {
                return null;
            }
            List<InferenceResponse.ToolCallData> pending =
                    session.getExecution().getPendingToolCalls();
            if (session.getCurrentState() == AgentState.THINK
                    && pending != null && !pending.isEmpty()) {
                session.getExecution().transitionTo(AgentState.ACT);
            }
            return session;
        } catch (Exception e) {
            log.warn("AgentJobService: failed to restore session for job {}: {}",
                    job.getTaskId(), e.getMessage());
            return null;
        }
    }

    // ---- Engine wiring ----

    private void startFresh(TaskRun run) {
        run.job.setStatus(AgentJobStatus.RUNNING);
        jobStore.save(run.job);
        subscribe(engine.run(run.session), run);
    }

    private void revive(TaskRun run) {
        run.job.setStatus(AgentJobStatus.RUNNING);
        jobStore.save(run.job);
        subscribe(engine.resume(run.session), run);
    }

    /**
     * Subscribe the engine (run or resume) and tee events into the durable log,
     * the live sink, and a continuation sink returned to the caller.
     * Both sinks are REPLAY sinks so a subscriber that attaches after events
     * already fired still receives them (dedup is handled by seq filters).
     */
    private Flux<TaskEvent> subscribe(Flux<AgentEvent> source, TaskRun run) {
        Sinks.Many<TaskEvent> continuation = Sinks.many().replay().limit(4096);
        run.continuation.set(continuation);

        // Merge ONLY sub-agent lifecycle events (agent.spawned/output/
        // reasoning/progress/completed) published by DelegateTaskTool on the
        // event bus under this session id. CRITICAL: the engine ALSO publishes
        // every one of its own events to the bus — merging the unfiltered bus
        // delivered each engine event TWICE (once from the engine flux, once
        // from the bus), which duplicated every token/tool event on the wire
        // and made the client re-execute frontend tools in a resume loop.
        // takeUntilOther completes the merged flux when the engine finishes.
        Flux<AgentEvent> shared = source.share();
        // Sub-agent events are published to the task-private unicast sink by
        // DelegateTaskTool. This keeps delegation traffic out of the global
        // multicast EventBus, where a slow unrelated subscriber could drop
        // child output events.
        Flux<AgentEvent> delegation = run.delegationSink.asFlux()
                .filter(ev -> ev instanceof com.knowledge.agent.v2.event.DelegationEvent);
        Flux<AgentEvent> merged = Flux.merge(shared, delegation)
                .takeUntilOther(shared.ignoreElements());

        run.executionActive.set(true);
        Disposable sub = merged
                .subscribeOn(Schedulers.boundedElastic())
                .subscribe(
                        ev -> {
                            // MDC visibility for logs emitted on this worker thread.
                            org.slf4j.MDC.put("traceId", run.session.getTraceId());
                            try {
                                onEvent(run, continuation, ev);
                            } finally {
                                org.slf4j.MDC.remove("traceId");
                            }
                        },
                        err -> {
                            run.executionActive.set(false);
                            cancelChildWork(run);
                            onError(run, continuation, err);
                        },
                        () -> {
                            run.executionActive.set(false);
                            onComplete(run, continuation);
                        });
        run.subscription.set(sub);

        return continuation.asFlux();
    }

    private void onEvent(TaskRun run, Sinks.Many<TaskEvent> continuation, AgentEvent ev) {
        run.touch();

        // Fencing: stop processing immediately when another instance has taken
        // over the task lease (network partition / missed renewal).
        long leaseNow = System.currentTimeMillis();
        if (leaseNow - run.lastLeaseCheckAt >= LEASE_CHECK_INTERVAL_MS) {
            run.lastLeaseCheckAt = leaseNow;
            if (!isLeaseOwner(run.job.getTaskId())) {
                log.warn("AgentJobService: lease lost for task {} — stopping local execution",
                        run.job.getTaskId());
                Disposable sub = run.subscription.get();
                if (sub != null && !sub.isDisposed()) {
                    sub.dispose();
                }
                return;
            }
        }

        // 1. Assign seq + accumulate streaming text under the snapshot lock.
        long seq;
        synchronized (run) {
            seq = run.seq.incrementAndGet();
            if (ev instanceof ThinkingEvent.ThinkDelta) {
                ThinkingEvent.ThinkDelta delta = (ThinkingEvent.ThinkDelta) ev;
                if (delta.getDeltaType() == ThinkingEvent.ThinkDelta.DeltaType.TEXT
                        && delta.getContent() != null) {
                    run.assistantText.append(delta.getContent());
                }
            }
        }

        // 2. Durable log FIRST — replay is only as complete as this write.
        try {
            Map<String, Object> payload = AgentEventSerializer.toPayload(ev, run.job.getTaskId());
            payload.put("seq", seq);
            eventStore.append(run.job.getTaskId(), seq, ev.type(),
                    objectMapper.writeValueAsString(payload));
        } catch (Exception e) {
            log.warn("AgentJobService: failed to log event {} seq {} for {}: {}",
                    ev.type(), seq, run.job.getTaskId(), e.getMessage());
        }

        // 3. Hot checkpoint (Redis), throttled: serializing the WHOLE
        // accumulated text on every token is O(n²). Persist at most once per
        // interval, but always on status-relevant (non-delta) events so state
        // changes never wait for the throttle.
        run.job.setLastSeq(seq);
        boolean statusRelevant = !(ev instanceof ThinkingEvent.ThinkDelta);
        long now = System.currentTimeMillis();
        if (statusRelevant || now - run.lastHotSaveAt >= HOT_SAVE_INTERVAL_MS) {
            run.lastHotSaveAt = now;
            run.job.setAssistantText(run.assistantText.toString());
            jobStore.saveHot(run.job);
        }

        // 4. Live sinks.
        TaskEvent te = TaskEvent.live(seq, ev);
        run.live.tryEmitNext(te);
        continuation.tryEmitNext(te);

        // 5. Sub-agent tree summary (used by /state to restore the UI after a refresh).
        if (ev instanceof com.knowledge.agent.v2.event.DelegationEvent) {
            updateSubAgent(run, (com.knowledge.agent.v2.event.DelegationEvent) ev);
        }

        // 6. Status transitions.
        if (ev instanceof ToolEvent.ToolDispatched) {
            ToolEvent.ToolDispatched dispatched = (ToolEvent.ToolDispatched) ev;
            if (dispatched.getLocation() == ToolEvent.ToolLocation.FRONTEND) {
                PendingTool pt = new PendingTool();
                pt.toolCallId = dispatched.getToolCallId();
                pt.toolName = dispatched.getToolName();
                pt.arguments = dispatched.getArguments();
                synchronized (run.pendingTools) {
                    // Dedup by toolCallId: a duplicated dispatch event must not
                    // surface the same tool twice on reconnect/resume.
                    boolean exists = false;
                    for (PendingTool p : run.pendingTools) {
                        if (p.toolCallId != null && p.toolCallId.equals(pt.toolCallId)) {
                            exists = true;
                            break;
                        }
                    }
                    if (!exists) {
                        run.pendingTools.add(pt);
                    }
                }
            }
        }

        if (ev instanceof LifecycleEvent.SessionCompleted) {
            LifecycleEvent.SessionCompleted completed = (LifecycleEvent.SessionCompleted) ev;
            String finishReason = completed.getFinishReason();
            run.job.setUsage(completed.getPromptTokens(), completed.getCompletionTokens());
            run.job.setFinishReason(finishReason);
            run.job.setStatus(statusFromFinishReason(finishReason));
            jobStore.save(run.job);
            if (run.job.getStatus() == AgentJobStatus.COMPLETED) {
                // Profile signals are recorded once per session, at terminal
                // completion. Recording on every SUSPENDED resume would add the
                // session's cumulative totals multiple times.
                profileRecorder.record(run.session, finishReason);
            }
            checkpoint(run);
            if (run.job.isTerminal()) {
                releaseLease(run.job.getTaskId());
            }
            if (run.job.getStatus() == AgentJobStatus.COMPLETED) {
                metrics.taskCompleted();
                synchronized (run.pendingTools) {
                    run.pendingTools.clear();
                }
            } else {
                metrics.taskSuspended();
            }
        } else if (ev instanceof LifecycleEvent.SessionFailed) {
            LifecycleEvent.SessionFailed failed = (LifecycleEvent.SessionFailed) ev;
            run.job.setErrorMessage(failed.getErrorMessage());
            run.job.setFinishReason("error:" + failed.getErrorCode());
            run.job.setStatus(AgentJobStatus.FAILED);
            jobStore.save(run.job);
            metrics.taskFailed();
            checkpoint(run);
            releaseLease(run.job.getTaskId());
        }
    }

    private void onError(TaskRun run, Sinks.Many<TaskEvent> continuation, Throwable err) {
        log.error("AgentJobService: job {} failed: {}", run.job.getTaskId(), err.getMessage(), err);
        run.job.setErrorMessage(err.getMessage());
        run.job.setFinishReason("error");
        run.job.setStatus(AgentJobStatus.FAILED);
        jobStore.save(run.job);
        metrics.taskFailed();
        releaseLease(run.job.getTaskId());
        continuation.tryEmitError(err);
        run.live.tryEmitComplete();
    }

    private void onComplete(TaskRun run, Sinks.Many<TaskEvent> continuation) {
        run.touch();
        run.live.tryEmitComplete();
        continuation.tryEmitComplete();
        log.info("AgentJobService: job {} finished status={} finishReason={}",
                run.job.getTaskId(), run.job.getStatus(), run.job.getFinishReason());
    }

    // ---- Resume helpers ----

    /** True when every pending frontend tool call already has a tool message. */
    private boolean allPendingToolsAnswered(AgentSession session) {
        List<InferenceResponse.ToolCallData> pending = session.getExecution().getPendingToolCalls();
        if (pending == null || pending.isEmpty()) {
            return false;
        }
        java.util.Set<String> answered = new java.util.HashSet<>();
        for (com.knowledge.agent.v2.session.ConversationMessage msg
                : session.getExecution().getMessages()) {
            if ("tool".equals(msg.getRole()) && msg.getToolCallId() != null) {
                answered.add(msg.getToolCallId());
            }
        }
        for (InferenceResponse.ToolCallData tool : pending) {
            if (tool.getId() == null || !answered.contains(tool.getId())) {
                return false;
            }
        }
        return true;
    }

    // ---- Resume helpers ----

    /**
     * Apply tool results (deduplicated by toolCallId so a retried resume is a
     * no-op for already-applied results), a fresh iteration budget and/or a
     * plan-approval decision. Delegates to {@link ResumeApplier} for testability.
     */
    private void applyResults(AgentSession session, List<ToolResult> toolResults, String action,
            ResumeApplier.PlanDecision planDecision) {
        ResumeApplier.apply(session, toolResults, action,
                properties.getContext().getToolResultMaxChars(), planDecision);
    }

    /**
     * Recover text deltas emitted after the last throttled hot-save checkpoint
     * by replaying them from the durable event log — keeps reconnect text
     * complete even though {@code assistantText} is persisted at most once per
     * second.
     */
    private void backfillAssistantText(TaskRun run, long fromSeq) {
        if (fromSeq <= 0) {
            return;
        }
        try {
            List<AgentTaskEventStore.TaskEventRecord> records =
                    eventStore.replay(run.job.getTaskId(), fromSeq, REPLAY_BATCH);
            for (AgentTaskEventStore.TaskEventRecord record : records) {
                if (!"think.delta".equals(record.type)) {
                    continue;
                }
                JsonNode node = objectMapper.readTree(record.payloadJson);
                if ("text".equals(node.path("type").asText(null))) {
                    String content = node.path("content").asText(null);
                    if (content != null) {
                        run.assistantText.append(content);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("AgentJobService: assistantText backfill failed for {}: {}",
                    run.job.getTaskId(), e.getMessage());
        }
    }

    /** Snapshot the session now (synchronous encode; store write is async). */
    private void checkpoint(TaskRun run) {
        AgentStateStore stateStore = stateStoreProvider.getIfAvailable();
        if (stateStore == null) {
            return;
        }
        try {
            AgentStateSnapshot snapshot = snapshotCodec.encode(run.session);
            stateStore.saveNow(run.session.getSessionId(), snapshot);
        } catch (Exception e) {
            log.warn("AgentJobService: failed to checkpoint session {}: {}",
                    run.session.getSessionId(), e.getMessage());
        }
    }

    private AgentJobStatus statusFromFinishReason(String finishReason) {
        if (finishReason == null) {
            return AgentJobStatus.COMPLETED;
        }
        if (finishReason.startsWith("suspended:frontend_tool_calls")) {
            return AgentJobStatus.WAITING_TOOLS;
        }
        if (finishReason.startsWith("suspended")) {
            return AgentJobStatus.SUSPENDED;
        }
        return AgentJobStatus.COMPLETED;
    }

    private void dispose(TaskRun run) {
        Disposable sub = run.subscription.get();
        if (sub != null && !sub.isDisposed()) {
            sub.dispose();
        }
    }

    /**
     * Cooperative cancellation of delegated work: disposes child-engine
     * subscriptions tracked by the engine (ExecutionState) and by
     * {@code DelegateTaskTool} (session metadata).
     */
    private void cancelChildWork(TaskRun run) {
        run.session.getExecution().cancelChildSubscriptions();
        Object childTaskIds = run.session.getMetadata().get(
                com.knowledge.agent.v2.tool.DelegateTaskTool.CHILD_TASK_IDS_KEY);
        if (childTaskIds instanceof List) {
            synchronized (childTaskIds) {
                for (Object o : new ArrayList<>((List<?>) childTaskIds)) {
                    if (o != null) {
                        try {
                            cancel(o.toString());
                        } catch (Exception e) {
                            log.warn("AgentJobService: failed to cancel child task {}: {}",
                                    o, e.getMessage());
                        }
                    }
                }
            }
        }
        Object subs = run.session.getMetadata().get(
                com.knowledge.agent.v2.tool.DelegateTaskTool.CHILD_SUBSCRIPTIONS_KEY);
        if (subs instanceof List) {
            synchronized (subs) {
                for (Object o : (List<?>) subs) {
                    if (o instanceof Disposable) {
                        try {
                            ((Disposable) o).dispose();
                        } catch (Exception ignored) {
                            // best-effort cascade
                        }
                    }
                }
                ((List<?>) subs).clear();
            }
        }
    }

    /** Evict terminal jobs whose replay window elapsed; revive stalled runs. */
    @Scheduled(fixedDelayString = "15000", initialDelayString = "15000")
    public void reconcile() {
        long cutoff = System.currentTimeMillis() - COMPLETED_TTL_MS;
        runs.entrySet().removeIf(e -> {
            TaskRun run = e.getValue();
            if (run.job.isTerminal() && run.lastActivity.get() < cutoff) {
                releaseLease(run.job.getTaskId());
                return true;
            }
            return false;
        });
        for (TaskRun run : new ArrayList<>(runs.values())) {
            if (run.job.isTerminal()) {
                continue;
            }
            String taskId = run.job.getTaskId();
            if (!isLeaseOwner(taskId)) {
                log.warn("AgentJobService: fencing lease lost for {} — disposing local run", taskId);
                dispose(run);
                cancelChildWork(run);
                run.executionActive.set(false);
                runs.remove(taskId, run);
                continue;
            }
            if (!renewLease(taskId)) {
                log.warn("AgentJobService: failed to renew lease for {} — stopping local run", taskId);
                dispose(run);
                cancelChildWork(run);
                run.executionActive.set(false);
                runs.remove(taskId, run);
                continue;
            }
            boolean claimsRunning = run.job.getStatus() == AgentJobStatus.RUNNING
                    || run.job.getStatus() == AgentJobStatus.QUEUED;
            if (claimsRunning && !run.executionActive.get()) {
                log.warn("AgentJobService: revive stalled job {}", taskId);
                revive(run);
            }
        }
    }

    // ---- Sub-agent tree summary (reconnect restore) ----

    /** Rebuild the in-memory sub-agent summary from the durable delegation events. */
    private void rebuildSubAgents(TaskRun run) {
        long cursor = 0L;
        while (true) {
            List<AgentTaskEventStore.TaskEventRecord> records =
                    eventStore.replay(run.job.getTaskId(), cursor, REPLAY_BATCH);
            if (records == null || records.isEmpty()) {
                break;
            }
            for (AgentTaskEventStore.TaskEventRecord record : records) {
                if (record.seq <= cursor) {
                    continue;
                }
                cursor = record.seq;
                try {
                    JsonNode payload = objectMapper.readTree(record.payloadJson);
                    applySubAgentRecord(run, record.type, payload);
                } catch (Exception e) {
                    log.warn("AgentJobService: failed to rebuild sub-agent record seq={} for {}: {}",
                            record.seq, run.job.getTaskId(), e.getMessage());
                }
            }
            if (records.size() < REPLAY_BATCH) {
                break;
            }
        }
    }

    private void applySubAgentRecord(TaskRun run, String type, JsonNode p) {
        if (!"agent.spawned".equals(type) && !"agent.progress".equals(type)
                && !"agent.output".equals(type) && !"agent.reasoning".equals(type)
                && !"agent.tool_call".equals(type) && !"agent.tool_result".equals(type)
                && !"agent.completed".equals(type)) {
            return;
        }
        String agentId = p.path("agentId").asText(null);
        if (agentId == null || agentId.isEmpty()) {
            return;
        }
        synchronized (run.subAgents) {
            SubAgentState st = run.subAgents.computeIfAbsent(agentId, id -> {
                SubAgentState n = new SubAgentState();
                n.agentId = id;
                n.parentAgentId = p.path("parentAgentId").asText(null);
                n.depth = p.path("depth").asInt(1);
                n.status = "spawned";
                n.steps = new ArrayList<>();
                return n;
            });
            if (st.parentAgentId == null && p.hasNonNull("parentAgentId")) {
                st.parentAgentId = p.path("parentAgentId").asText(null);
            }
            if (st.depth <= 0 && p.hasNonNull("depth")) {
                st.depth = p.path("depth").asInt(1);
            }
            switch (type) {
                case "agent.spawned":
                    st.agentName = p.path("agentName").asText(null);
                    st.task = p.path("taskDescription").asText(st.task);
                    st.status = "spawned";
                    break;
                case "agent.progress":
                    st.status = "running";
                    break;
                case "agent.output":
                    st.streamingContent = st.streamingContent == null
                            ? p.path("content").asText("")
                            : st.streamingContent + p.path("content").asText("");
                    if ("spawned".equals(st.status)) {
                        st.status = "running";
                    }
                    break;
                case "agent.reasoning":
                    st.reasoningContent = st.reasoningContent == null
                            ? p.path("content").asText("")
                            : st.reasoningContent + p.path("content").asText("");
                    if ("spawned".equals(st.status)) {
                        st.status = "running";
                    }
                    break;
                case "agent.tool_call": {
                    SubAgentToolStep step = new SubAgentToolStep();
                    step.id = p.path("toolCallId").asText(null);
                    step.toolName = p.path("toolName").asText(null);
                    step.args = p.path("arguments").asText(null);
                    step.status = "running";
                    if (step.id != null) {
                        st.steps.add(step);
                    }
                    st.status = "running";
                    break;
                }
                case "agent.tool_result": {
                    String callId = p.path("toolCallId").asText(null);
                    if (callId != null) {
                        for (SubAgentToolStep step : st.steps) {
                            if (callId.equals(step.id)) {
                                step.result = p.path("result").asText(null);
                                step.error = p.path("error").asText(null);
                                step.status = step.error != null ? "error" : "success";
                            }
                        }
                    }
                    break;
                }
                case "agent.completed":
                    st.status = p.path("success").asBoolean(false) ? "completed" : "error";
                    st.error = p.path("error").asText(null);
                    if (st.error == null && "error".equals(st.status)) {
                        st.error = p.path("result").asText("Sub-agent failed");
                    }
                    st.durationMs = p.path("durationMs").asLong(0L);
                    st.promptTokens = p.path("usage").path("prompt").asInt(0);
                    st.completionTokens = p.path("usage").path("completion").asInt(0);
                    break;
                default:
                    break;
            }
        }
    }

    /** Fold live delegation events into the same summary shape as /state. */
    private void updateSubAgent(TaskRun run, com.knowledge.agent.v2.event.DelegationEvent ev) {
        Map<String, Object> payload = com.knowledge.agent.v2.event.AgentEventSerializer.toPayload(
                ev, run.job.getTaskId());
        try {
            applySubAgentRecord(run, ev.type(), objectMapper.valueToTree(payload));
        } catch (Exception e) {
            log.warn("AgentJobService: failed to fold delegation event {} for {}: {}",
                    ev.type(), run.job.getTaskId(), e.getMessage());
        }
    }

    /** One sub-agent node as returned by {@code GET /tasks/{id}/state}. */
    public static class SubAgentState {
        public String agentId;
        public String parentAgentId;
        public int depth;
        public String agentName;
        public String task;
        public String status;
        public String error;
        public String streamingContent;
        public String reasoningContent;
        public int promptTokens;
        public int completionTokens;
        public long durationMs;
        public List<SubAgentToolStep> steps = new ArrayList<>();
    }

    /** One tool execution inside a sub-agent. */
    public static class SubAgentToolStep {
        public String id;
        public String toolName;
        public String args;
        public String status;
        public String result;
        public String error;
    }

    // ---- Types ----

    /** A frontend tool execution result (resume payload element). */
    public static class ToolResult {
        public String toolCallId;
        public String toolName;
        public String result;
        public boolean success;
    }

    /** An event within a task's stream: live (has event) or replayed (has payload). */
    public static class TaskEvent {
        public final long seq;
        public final AgentEvent event;
        public final String type;
        public final String payloadJson;

        private TaskEvent(long seq, AgentEvent event, String type, String payloadJson) {
            this.seq = seq;
            this.event = event;
            this.type = type;
            this.payloadJson = payloadJson;
        }

        public static TaskEvent live(long seq, AgentEvent event) {
            return new TaskEvent(seq, event, null, null);
        }

        public static TaskEvent replayed(long seq, String type, String payloadJson) {
            return new TaskEvent(seq, null, type, payloadJson);
        }
    }

    /** A frontend tool call awaiting client execution. */
    public static class PendingTool {
        public String toolCallId;
        public String toolName;
        public String arguments;
    }

    /** Full reconnect state for a task. */
    public static class TaskState {
        public String taskId;
        public String sessionId;
        public String conversationId;
        public String status;
        public String finishReason;
        public String errorMessage;
        public int promptTokens;
        public int completionTokens;
        public String assistantText;
        public long lastSeq;
        public List<PendingTool> pendingTools = Collections.emptyList();
        /** Restored sub-agent tree summary (for refresh/attach). */
        public List<SubAgentState> subAgents = Collections.emptyList();
    }

    private static class TaskRun {
        final AgentJob job;
        final AgentSession session;
        /** Replay sink — late subscribers get buffered history; seq filters dedupe. */
        final Sinks.Many<TaskEvent> live = Sinks.many().replay().limit(10_000);
        /**
         * The ACTIVE engine continuation (per subscription). A re-entrant
         * resume (client retry while the engine is running) must return THIS
         * stream — replaying {@code live} re-delivered the whole task history
         * and drove the client into a re-execute→resume loop.
         */
        final AtomicReference<Sinks.Many<TaskEvent>> continuation = new AtomicReference<>();
        final AtomicReference<Disposable> subscription = new AtomicReference<>();
        /**
         * Whether an engine execution is currently subscribed for this task.
         * Distinct from subscription disposal: a COMPLETED flux is not
         * "disposed" but is no longer active, and this flag is what guards
         * against double subscription.
         */
        final AtomicBoolean executionActive = new AtomicBoolean(false);
        final AtomicLong seq = new AtomicLong(0);
        final StringBuffer assistantText = new StringBuffer();
        final List<PendingTool> pendingTools = Collections.synchronizedList(new ArrayList<>());
        final Map<String, SubAgentState> subAgents = new ConcurrentHashMap<>();
        /** Per-task delegation sink; avoids contending with the global event bus. */
        final Sinks.Many<com.knowledge.agent.v2.event.AgentEvent> delegationSink =
                Sinks.many().multicast().onBackpressureBuffer(65_536, false);
        final AtomicLong lastActivity = new AtomicLong(System.currentTimeMillis());
        /** Epoch millis of the last throttled hot-save (text checkpoint cadence). */
        volatile long lastHotSaveAt;
        /** Epoch millis of the last Redis fencing-lease check. */
        volatile long lastLeaseCheckAt;

        TaskRun(AgentJob job, AgentSession session) {
            this.job = job;
            this.session = session;
            session.getMetadata().put(
                    com.knowledge.agent.v2.tool.DelegateTaskTool.DELEGATION_SINK_KEY,
                    delegationSink);
            session.getMetadata().put(
                    com.knowledge.agent.v2.tool.DelegateTaskTool.TASK_ID_KEY,
                    job.getTaskId());
        }

        void touch() {
            lastActivity.set(System.currentTimeMillis());
        }
    }

    /** Sliding-window per-minute counter (same semantics as the THINK limiter). */
    private static class WindowCounter {
        private final int maxPerMinute;
        private final AtomicInteger count = new AtomicInteger(0);
        private volatile long windowStartMs = System.currentTimeMillis();

        WindowCounter(int maxPerMinute) {
            this.maxPerMinute = maxPerMinute;
        }

        boolean tryAcquire() {
            long now = System.currentTimeMillis();
            if (now - windowStartMs > 60_000) {
                synchronized (this) {
                    if (now - windowStartMs > 60_000) {
                        count.set(0);
                        windowStartMs = now;
                    }
                }
            }
            return count.incrementAndGet() <= maxPerMinute;
        }
    }
}
