package com.knowledge.agent.v2.job;

import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.store.AgentStateStore;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.context.ContextCompactor;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.LifecycleEvent;
import com.knowledge.agent.v2.event.ThinkingEvent;
import com.knowledge.agent.v2.event.ToolEvent;
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
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Async long-running agent job runner.
 *
 * <p>Decouples execution from the HTTP request: {@link #create} builds the
 * session and starts the engine in the background, returning a job handle
 * immediately. Clients poll {@link #status}/{@link #state}, stream
 * {@link #streamEvents} (replay + live, filtered by {@code afterSeq}), submit
 * frontend tool results via {@link #resume}, or {@link #cancel} — all
 * independent of any single connection.
 *
 * <p>Each job owns a monotonic event sequence ({@code seq}) plus the
 * accumulated assistant text, so a reconnecting client can fetch
 * {@link #state} (current text + last seq + pending frontend tools) and resume
 * streaming from exactly where it left off — this is what lets the agent
 * "续上" after a page refresh or dropped connection.
 */
@Slf4j
@Component
public class AgentJobService {

    private static final int REPLAY_LIMIT = 10_000;
    private static final long COMPLETED_TTL_MS = 30 * 60_000L;

    private final AgentEngine engine;
    private final AgentSessionFactory sessionFactory;
    private final AgentJobStore jobStore;
    private final AgentProperties properties;
    private final ProfileRecorder profileRecorder;
    private final SessionSnapshotCodec snapshotCodec;
    private final ObjectProvider<AgentStateStore> stateStoreProvider;

    private final ConcurrentHashMap<String, TaskRun> runs = new ConcurrentHashMap<>();

    public AgentJobService(AgentEngine engine,
            AgentSessionFactory sessionFactory,
            AgentJobStore jobStore,
            AgentProperties properties,
            ProfileRecorder profileRecorder,
            SessionSnapshotCodec snapshotCodec,
            ObjectProvider<AgentStateStore> stateStoreProvider) {
        this.engine = engine;
        this.sessionFactory = sessionFactory;
        this.jobStore = jobStore;
        this.properties = properties;
        this.profileRecorder = profileRecorder;
        this.snapshotCodec = snapshotCodec;
        this.stateStoreProvider = stateStoreProvider;
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
        start(run);
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
     * Full reconnect state: status, accumulated assistant text, last emitted
     * seq, and the frontend tool calls currently awaiting execution.
     */
    public TaskState state(String taskId) {
        TaskRun run = runs.get(taskId);
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
            // Consistent snapshot: seq and accumulated text are read under the
            // same lock as the emit path so a reconnect never sees a torn view.
            synchronized (run) {
                st.assistantText = run.assistantText.toString();
                st.lastSeq = run.seq.get();
            }
            synchronized (run.pendingTools) {
                st.pendingTools = new ArrayList<>(run.pendingTools);
            }
        }
        return st;
    }

    /** Replay + live event stream for a job, filtered to events with seq > afterSeq. */
    public Flux<TaskEvent> streamEvents(String taskId, long afterSeq) {
        TaskRun run = runs.get(taskId);
        if (run != null) {
            return run.events.asFlux().filter(te -> te.seq > afterSeq);
        }
        return Flux.error(new IllegalStateException("Job not found: " + taskId));
    }

    /**
     * Resume a paused job with frontend tool results and/or a fresh iteration
     * budget. Returns the live continuation events (NOT the replay history).
     */
    public Flux<TaskEvent> resume(String taskId, List<ToolResult> toolResults, String action) {
        TaskRun run = runs.get(taskId);
        if (run == null) {
            run = restoreFromSnapshot(taskId);
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
            return false;
        }
        dispose(run);
        run.job.setStatus(AgentJobStatus.CANCELLED);
        run.job.setFinishReason("cancelled");
        jobStore.save(run.job);
        run.events.tryEmitComplete();
        log.info("AgentJobService: cancelled job {}", taskId);
        return true;
    }

    // ---- Engine wiring ----

    private void start(TaskRun run) {
        run.job.setStatus(AgentJobStatus.RUNNING);
        jobStore.save(run.job);
        subscribe(engine.run(run.session), run);
    }

    /**
     * Subscribe the engine (run or resume) and tee events into the durable
     * replay sink plus a live continuation sink returned to the caller.
     */
    private Flux<TaskEvent> subscribe(Flux<AgentEvent> source, TaskRun run) {
        Sinks.Many<TaskEvent> continuation = Sinks.many().multicast()
                .onBackpressureBuffer(1024, false);

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
        long seq;
        synchronized (run) {
            seq = run.seq.incrementAndGet();
            // Accumulate the assistant's streaming text for reconnect reconstruction.
            if (ev instanceof ThinkingEvent.ThinkDelta) {
                ThinkingEvent.ThinkDelta delta = (ThinkingEvent.ThinkDelta) ev;
                if (delta.getDeltaType() == ThinkingEvent.ThinkDelta.DeltaType.TEXT
                        && delta.getContent() != null) {
                    run.assistantText.append(delta.getContent());
                }
            }
        }
        TaskEvent te = new TaskEvent(seq, ev);
        run.events.tryEmitNext(te);
        continuation.tryEmitNext(te);

        // Track frontend tool calls that are dispatched to the client.
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
        }
    }

    private void onError(TaskRun run, Sinks.Many<TaskEvent> continuation, Throwable err) {
        log.error("AgentJobService: job {} failed: {}", run.job.getTaskId(), err.getMessage(), err);
        run.job.setErrorMessage(err.getMessage());
        run.job.setFinishReason("error");
        run.job.setStatus(AgentJobStatus.FAILED);
        jobStore.save(run.job);
        continuation.tryEmitError(err);
        run.events.tryEmitComplete();
    }

    private void onComplete(TaskRun run, Sinks.Many<TaskEvent> continuation) {
        run.touch();
        run.events.tryEmitComplete();
        continuation.tryEmitComplete();
        log.info("AgentJobService: job {} finished status={} finishReason={}",
                run.job.getTaskId(), run.job.getStatus(), run.job.getFinishReason());
    }

    // ---- Resume helpers ----

    private void applyResults(AgentSession session, List<ToolResult> toolResults, String action) {
        if (toolResults != null) {
            int maxChars = properties.getContext().getToolResultMaxChars();
            for (ToolResult tr : toolResults) {
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
        session.getExecution().transitionTo(
                com.knowledge.agent.v2.engine.AgentState.THINK);
    }

    private TaskRun restoreFromSnapshot(String taskId) {
        AgentJob job = jobStore.load(taskId);
        AgentStateStore stateStore = stateStoreProvider.getIfAvailable();
        if (job == null || stateStore == null) {
            return null;
        }
        try {
            AgentStateSnapshot snapshot = stateStore.load(job.getSessionId());
            AgentSession session = snapshotCodec.decode(snapshot, SecurityContextUtil.getToken());
            if (session == null) {
                return null;
            }
            TaskRun run = new TaskRun(job, session);
            runs.put(taskId, run);
            log.info("AgentJobService: restored job {} from snapshot", taskId);
            return run;
        } catch (Exception e) {
            log.warn("AgentJobService: failed to restore job {}: {}", taskId, e.getMessage());
            return null;
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

    /** Evict terminal jobs whose replay window has elapsed. */
    @Scheduled(fixedDelayString = "600000", initialDelayString = "600000")
    public void evictCompleted() {
        long cutoff = System.currentTimeMillis() - COMPLETED_TTL_MS;
        runs.entrySet().removeIf(e -> {
            TaskRun run = e.getValue();
            return run.job.isTerminal() && run.lastActivity.get() < cutoff;
        });
    }

    // ---- Types ----

    /** A frontend tool execution result (resume payload element). */
    public static class ToolResult {
        public String toolCallId;
        public String toolName;
        public String result;
        public boolean success;
    }

    /** A monotonic event within a task's stream (seq + the agent event). */
    public static class TaskEvent {
        public final long seq;
        public final AgentEvent event;

        public TaskEvent(long seq, AgentEvent event) {
            this.seq = seq;
            this.event = event;
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
        final Sinks.Many<TaskEvent> events = Sinks.many().replay().limit(REPLAY_LIMIT);
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
