package com.knowledge.agent.v2.job;

import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.store.AgentStateStore;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.context.ContextCompactor;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.LifecycleEvent;
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
 * immediately. Clients then poll {@link #status}, stream {@link #streamEvents}
 * (replay + live), submit frontend tool results via {@link #resume}, or
 * {@link #cancel} the job — all independent of any single connection.
 *
 * <p>Each running job owns a {@link Sinks.Many} replay sink so a client that
 * (re)connects after events already fired can still receive the full event
 * history. Jobs are kept in memory for a bounded window and mirrored to
 * {@link AgentJobStore} (Redis + JDBC) on every status change.
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

    /** Replay + live event stream for a job (durable across reconnects). */
    public Flux<AgentEvent> streamEvents(String taskId) {
        TaskRun run = runs.get(taskId);
        if (run != null) {
            return run.events.asFlux();
        }
        // Job already evicted from memory: emit a synthetic failure event so the
        // client knows it can no longer be streamed.
        return Flux.error(new IllegalStateException("Job not found: " + taskId));
    }

    /**
     * Resume a paused job with frontend tool results and/or a fresh iteration
     * budget. Returns the live continuation events (NOT the replay history).
     */
    public Flux<AgentEvent> resume(String taskId, List<ToolResult> toolResults, String action) {
        TaskRun run = runs.get(taskId);
        if (run == null) {
            run = restoreFromSnapshot(taskId);
        }
        if (run == null) {
            return Flux.error(new IllegalStateException("Job not found: " + taskId));
        }

        applyResults(run.session, toolResults, action);
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
    private Flux<AgentEvent> subscribe(Flux<AgentEvent> source, TaskRun run) {
        Sinks.Many<AgentEvent> continuation = Sinks.many().multicast()
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

    private void onEvent(TaskRun run, Sinks.Many<AgentEvent> continuation, AgentEvent ev) {
        run.touch();
        run.events.tryEmitNext(ev);
        continuation.tryEmitNext(ev);

        if (ev instanceof LifecycleEvent.SessionCompleted) {
            LifecycleEvent.SessionCompleted completed = (LifecycleEvent.SessionCompleted) ev;
            String finishReason = completed.getFinishReason();
            run.job.addUsage(completed.getPromptTokens(), completed.getCompletionTokens());
            run.job.setFinishReason(finishReason);
            run.job.setStatus(statusFromFinishReason(finishReason));
            jobStore.save(run.job);
            profileRecorder.record(run.session, finishReason);
        } else if (ev instanceof LifecycleEvent.SessionFailed) {
            LifecycleEvent.SessionFailed failed = (LifecycleEvent.SessionFailed) ev;
            run.job.setErrorMessage(failed.getErrorMessage());
            run.job.setFinishReason("error:" + failed.getErrorCode());
            run.job.setStatus(AgentJobStatus.FAILED);
            jobStore.save(run.job);
        }
    }

    private void onError(TaskRun run, Sinks.Many<AgentEvent> continuation, Throwable err) {
        log.error("AgentJobService: job {} failed: {}", run.job.getTaskId(), err.getMessage(), err);
        run.job.setErrorMessage(err.getMessage());
        run.job.setFinishReason("error");
        run.job.setStatus(AgentJobStatus.FAILED);
        jobStore.save(run.job);
        continuation.tryEmitError(err);
        run.events.tryEmitComplete();
    }

    private void onComplete(TaskRun run, Sinks.Many<AgentEvent> continuation) {
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

    private static class TaskRun {
        final AgentJob job;
        final AgentSession session;
        final Sinks.Many<AgentEvent> events = Sinks.many().replay().limit(REPLAY_LIMIT);
        final AtomicReference<Disposable> subscription = new AtomicReference<>();
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
