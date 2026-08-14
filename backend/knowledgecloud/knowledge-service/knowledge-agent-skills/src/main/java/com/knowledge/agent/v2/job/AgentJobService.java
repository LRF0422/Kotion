package com.knowledge.agent.v2.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.store.AgentStateStore;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.context.ContextCompactor;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.AgentEventSerializer;
import com.knowledge.agent.v2.event.LifecycleEvent;
import com.knowledge.agent.v2.event.ThinkingEvent;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.profile.ProfileRecorder;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.AgentSessionFactory;
import com.knowledge.agent.v2.session.ConversationMessage;
import com.knowledge.agent.v2.state.SessionSnapshotCodec;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;
import reactor.core.scheduler.Schedulers;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
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

    private final AgentEngine engine;
    private final AgentSessionFactory sessionFactory;
    private final AgentJobStore jobStore;
    private final AgentTaskEventStore eventStore;
    private final AgentProperties properties;
    private final ProfileRecorder profileRecorder;
    private final SessionSnapshotCodec snapshotCodec;
    private final ObjectProvider<AgentStateStore> stateStoreProvider;
    private final ObjectMapper objectMapper;

    private final ConcurrentHashMap<String, TaskRun> runs = new ConcurrentHashMap<>();

    public AgentJobService(AgentEngine engine,
            AgentSessionFactory sessionFactory,
            AgentJobStore jobStore,
            AgentTaskEventStore eventStore,
            AgentProperties properties,
            ProfileRecorder profileRecorder,
            SessionSnapshotCodec snapshotCodec,
            ObjectProvider<AgentStateStore> stateStoreProvider,
            ObjectMapper objectMapper) {
        this.engine = engine;
        this.sessionFactory = sessionFactory;
        this.jobStore = jobStore;
        this.eventStore = eventStore;
        this.properties = properties;
        this.profileRecorder = profileRecorder;
        this.snapshotCodec = snapshotCodec;
        this.stateStoreProvider = stateStoreProvider;
        this.objectMapper = objectMapper;
    }

    // ---- Lifecycle ----

    /** Build the session, persist the job, and start the engine in the background. */
    public AgentJob create(ChatCompletionRequest request, AgentIdentity identity) {
        AgentSession session = sessionFactory.build(request, identity);
        AgentJob job = new AgentJob(
                UUID.randomUUID().toString(),
                session.getSessionId(),
                session.getConversationId(),
                identity.getUserId(),
                identity.getTenantId());
        jobStore.save(job);

        TaskRun run = new TaskRun(job, session);
        runs.put(job.getTaskId(), run);
        startFresh(run);
        return job;
    }

    public AgentJob status(String taskId) {
        TaskRun run = runs.get(taskId);
        if (run != null) {
            return run.job;
        }
        return jobStore.load(taskId);
    }

    /**
     * Full reconnect state: status, accumulated assistant text, last durable
     * seq, and the frontend tool calls currently awaiting execution. Derived
     * from the live run when present; otherwise from the persisted job +
     * event log checkpoint.
     */
    public TaskState state(String taskId) {
        TaskRun run = ensureLive(taskId);
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

        List<AgentTaskEventStore.TaskEventRecord> records =
                eventStore.replay(taskId, afterSeq, REPLAY_BATCH);
        long replayMax = afterSeq;
        List<TaskEvent> replayed = new ArrayList<>(records.size());
        for (AgentTaskEventStore.TaskEventRecord record : records) {
            replayed.add(TaskEvent.replayed(record.seq, record.type, record.payloadJson));
            replayMax = record.seq;
        }

        final long watermark = replayMax;
        Flux<TaskEvent> live = run != null
                ? run.live.asFlux().filter(te -> te.seq > watermark)
                : Flux.empty();

        return Flux.concat(Flux.fromIterable(replayed), live);
    }

    /**
     * Resume a paused job with frontend tool results and/or a fresh iteration
     * budget. Returns the live continuation events (NOT the replay history).
     */
    public Flux<TaskEvent> resume(String taskId, List<ToolResult> toolResults, String action) {
        TaskRun run = runs.get(taskId);
        if (run == null) {
            run = restorePaused(taskId);
        }
        if (run == null) {
            return Flux.error(new IllegalStateException("Job not found: " + taskId));
        }

        applyResults(run.session, toolResults, action);
        synchronized (run.pendingTools) {
            run.pendingTools.clear();
        }
        run.job.setStatus(AgentJobStatus.RUNNING);
        run.job.setFinishReason(null);
        jobStore.save(run.job);

        return subscribe(engine.resume(run.session), run);
    }

    /** Cancel a running/paused job by disposing its engine subscription. */
    public boolean cancel(String taskId) {
        TaskRun run = runs.get(taskId);
        if (run == null) {
            // Survived a restart — cancel the persisted job directly.
            AgentJob job = jobStore.load(taskId);
            if (job == null || job.isTerminal()) {
                return false;
            }
            job.setStatus(AgentJobStatus.CANCELLED);
            job.setFinishReason("cancelled");
            jobStore.save(job);
            log.info("AgentJobService: cancelled persisted job {}", taskId);
            return true;
        }
        dispose(run);
        run.job.setStatus(AgentJobStatus.CANCELLED);
        run.job.setFinishReason("cancelled");
        jobStore.save(run.job);
        run.live.tryEmitComplete();
        log.info("AgentJobService: cancelled job {}", taskId);
        return true;
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
            Disposable sub = run.subscription.get();
            boolean claimsRunning = run.job.getStatus() == AgentJobStatus.RUNNING
                    || run.job.getStatus() == AgentJobStatus.QUEUED;
            if (claimsRunning && (sub == null || sub.isDisposed())) {
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

        AgentSession session = restoreSession(job);
        if (session == null) {
            log.warn("AgentJobService: cannot revive {} — snapshot unavailable", taskId);
            job.setStatus(AgentJobStatus.FAILED);
            job.setFinishReason("error:snapshot_unavailable");
            job.setErrorMessage("Session snapshot unavailable for revival");
            jobStore.save(job);
            return null;
        }

        TaskRun revived = new TaskRun(job, session);
        revived.seq.set(eventStore.maxSeq(taskId));
        if (job.getAssistantText() != null) {
            revived.assistantText.append(job.getAssistantText());
        }
        runs.put(taskId, revived);
        log.info("AgentJobService: revived job {} from snapshot (seq={}, state={})",
                taskId, revived.seq.get(), session.getCurrentState());
        revive(revived);
        return revived;
    }

    /** Rebuild a paused job (WAITING_TOOLS / SUSPENDED) from its snapshot. */
    private TaskRun restorePaused(String taskId) {
        AgentJob job = jobStore.load(taskId);
        if (job == null) {
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
        runs.put(taskId, run);
        log.info("AgentJobService: restored paused job {} from snapshot", taskId);
        return run;
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

        Disposable sub = source
                .subscribeOn(Schedulers.boundedElastic())
                .subscribe(
                        ev -> onEvent(run, continuation, ev),
                        err -> onError(run, continuation, err),
                        () -> onComplete(run, continuation));
        run.subscription.set(sub);

        return continuation.asFlux();
    }

    private void onEvent(TaskRun run, Sinks.Many<TaskEvent> continuation, AgentEvent ev) {
        run.touch();

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

        // 3. Hot checkpoint (Redis) — cheap enough per event.
        run.job.setLastSeq(seq);
        run.job.setAssistantText(run.assistantText.toString());
        jobStore.saveHot(run.job);

        // 4. Live sinks.
        TaskEvent te = TaskEvent.live(seq, ev);
        run.live.tryEmitNext(te);
        continuation.tryEmitNext(te);

        // 5. Status transitions.
        if (ev instanceof ToolEvent.ToolDispatched) {
            ToolEvent.ToolDispatched dispatched = (ToolEvent.ToolDispatched) ev;
            if (dispatched.getLocation() == ToolEvent.ToolLocation.FRONTEND) {
                PendingTool pt = new PendingTool();
                pt.toolCallId = dispatched.getToolCallId();
                pt.toolName = dispatched.getToolName();
                pt.arguments = dispatched.getArguments();
                synchronized (run.pendingTools) {
                    run.pendingTools.add(pt);
                }
            }
        }

        if (ev instanceof LifecycleEvent.SessionCompleted) {
            LifecycleEvent.SessionCompleted completed = (LifecycleEvent.SessionCompleted) ev;
            String finishReason = completed.getFinishReason();
            run.job.addUsage(completed.getPromptTokens(), completed.getCompletionTokens());
            run.job.setFinishReason(finishReason);
            run.job.setStatus(statusFromFinishReason(finishReason));
            jobStore.save(run.job);
            profileRecorder.record(run.session, finishReason);
            checkpoint(run);
            if (run.job.getStatus() == AgentJobStatus.COMPLETED) {
                synchronized (run.pendingTools) {
                    run.pendingTools.clear();
                }
            }
        } else if (ev instanceof LifecycleEvent.SessionFailed) {
            LifecycleEvent.SessionFailed failed = (LifecycleEvent.SessionFailed) ev;
            run.job.setErrorMessage(failed.getErrorMessage());
            run.job.setFinishReason("error:" + failed.getErrorCode());
            run.job.setStatus(AgentJobStatus.FAILED);
            jobStore.save(run.job);
            checkpoint(run);
        }
    }

    private void onError(TaskRun run, Sinks.Many<TaskEvent> continuation, Throwable err) {
        log.error("AgentJobService: job {} failed: {}", run.job.getTaskId(), err.getMessage(), err);
        run.job.setErrorMessage(err.getMessage());
        run.job.setFinishReason("error");
        run.job.setStatus(AgentJobStatus.FAILED);
        jobStore.save(run.job);
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

    /**
     * Apply tool results (deduplicated by toolCallId so a retried resume is a
     * no-op for already-applied results) and/or grant a fresh iteration budget.
     */
    private void applyResults(AgentSession session, List<ToolResult> toolResults, String action) {
        if (toolResults != null && !toolResults.isEmpty()) {
            Set<String> applied = new HashSet<>();
            for (ConversationMessage msg : session.getExecution().getMessages()) {
                if ("tool".equals(msg.getRole()) && msg.getToolCallId() != null) {
                    applied.add(msg.getToolCallId());
                }
            }
            int maxChars = properties.getContext().getToolResultMaxChars();
            for (ToolResult tr : toolResults) {
                if (tr == null || tr.toolCallId == null || !applied.add(tr.toolCallId)) {
                    continue; // already applied by a previous (retried) resume
                }
                ConversationMessage toolMsg = ConversationMessage.toolResult(
                        tr.toolCallId, tr.toolName,
                        ContextCompactor.truncateToolResult(tr.result, maxChars));
                session.getExecution().addMessage(toolMsg);
            }
        }
        if ("continue".equalsIgnoreCase(action)) {
            session.getExecution().setIteration(0);
        }
        session.getExecution().setSuspendReason(null);
        session.getExecution().transitionTo(AgentState.THINK);
    }

    /** Snapshot the session now (synchronous encode; store write is async). */
    private void checkpoint(TaskRun run) {
        AgentStateStore stateStore = stateStoreProvider.getIfAvailable();
        if (stateStore == null) {
            return;
        }
        try {
            AgentStateSnapshot snapshot = snapshotCodec.encode(run.session);
            stateStore.save(run.session.getSessionId(), snapshot);
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

    /** Evict terminal jobs whose replay window elapsed; revive stalled runs. */
    @Scheduled(fixedDelayString = "15000", initialDelayString = "15000")
    public void reconcile() {
        long cutoff = System.currentTimeMillis() - COMPLETED_TTL_MS;
        runs.entrySet().removeIf(e -> {
            TaskRun run = e.getValue();
            return run.job.isTerminal() && run.lastActivity.get() < cutoff;
        });
        for (TaskRun run : runs.values()) {
            boolean claimsRunning = run.job.getStatus() == AgentJobStatus.RUNNING
                    || run.job.getStatus() == AgentJobStatus.QUEUED;
            if (!claimsRunning) {
                continue;
            }
            Disposable sub = run.subscription.get();
            if (sub == null || sub.isDisposed()) {
                log.warn("AgentJobService: revive stalled job {}", run.job.getTaskId());
                revive(run);
            }
        }
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
    }

    private static class TaskRun {
        final AgentJob job;
        final AgentSession session;
        /** Replay sink — late subscribers get buffered history; seq filters dedupe. */
        final Sinks.Many<TaskEvent> live = Sinks.many().replay().limit(10_000);
        final AtomicReference<Disposable> subscription = new AtomicReference<>();
        final AtomicLong seq = new AtomicLong(0);
        final StringBuffer assistantText = new StringBuffer();
        final List<PendingTool> pendingTools = Collections.synchronizedList(new ArrayList<>());
        final AtomicLong lastActivity = new AtomicLong(System.currentTimeMillis());

        TaskRun(AgentJob job, AgentSession session) {
            this.job = job;
            this.session = session;
        }

        void touch() {
            lastActivity.set(System.currentTimeMillis());
        }
    }
}
