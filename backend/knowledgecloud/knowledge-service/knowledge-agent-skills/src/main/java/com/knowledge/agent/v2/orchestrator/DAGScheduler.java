package com.knowledge.agent.v2.orchestrator;

import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.DelegationEvent;
import com.knowledge.agent.v2.event.LifecycleEvent;
import com.knowledge.agent.v2.session.AgentMode;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * DAG-based scheduler for multi-agent orchestration.
 *
 * <p>
 * Implements topological-order scheduling: tasks with no unresolved
 * dependencies are launched in parallel. As each task completes, newly
 * ready tasks are discovered and dispatched.
 *
 * <p>
 * Key features:
 * <ul>
 * <li><b>Parallel execution</b>: Independent tasks run concurrently</li>
 * <li><b>Topological ordering</b>: Dependent tasks wait until predecessors
 * complete</li>
 * <li><b>Session isolation</b>: Each task gets its own child
 * {@link AgentSession}</li>
 * <li><b>Event forwarding</b>: Sub-agent events are prefixed and forwarded to
 * parent stream</li>
 * <li><b>Failure handling</b>: A failed task fails the entire plan
 * (fail-fast)</li>
 * </ul>
 *
 * <p>
 * Thread model: Fully reactive using Project Reactor. No threads are blocked.
 */
@Slf4j
public class DAGScheduler {

    private final AgentEngine engine;

    public DAGScheduler(AgentEngine engine) {
        this.engine = engine;
    }

    /**
     * Execute an {@link ExecutionPlan} within the context of a parent session.
     *
     * <p>
     * Returns a Flux that emits:
     * <ul>
     * <li>{@link DelegationEvent.SubAgentSpawned} for each started task</li>
     * <li>{@link DelegationEvent.SubAgentProgress} as tasks iterate</li>
     * <li>{@link DelegationEvent.SubAgentCompleted} when tasks finish</li>
     * </ul>
     *
     * <p>
     * The Flux completes when ALL tasks in the plan have finished successfully.
     * It errors immediately if any task fails (fail-fast).
     *
     * @param plan          the execution plan (DAG)
     * @param parentSession the parent agent session (provides identity/config
     *                      context)
     * @return Flux of delegation events, completing when the entire plan is done
     */
    public Flux<AgentEvent> execute(ExecutionPlan plan, AgentSession parentSession) {
        log.info("DAGScheduler: starting plan {} with {} tasks",
                plan.getPlanId(), plan.getTasks().size());

        // Validate the DAG has no cycles
        if (!validateAcyclic(plan)) {
            return Flux.error(new IllegalArgumentException(
                    "Execution plan contains cycles: " + plan.getPlanId()));
        }

        return Flux.create(sink -> {
            SchedulerState state = new SchedulerState(plan, parentSession, sink);
            // Kick off root tasks (those with no dependencies)
            dispatchReadyTasks(state);
        });
    }

    /**
     * Get the results from all completed tasks.
     * Useful for synthesis after the plan completes.
     */
    public Map<String, TaskResult> getResults(ExecutionPlan plan, AgentSession parentSession) {
        // Results are stored in the parent session metadata during execution
        @SuppressWarnings("unchecked")
        Map<String, TaskResult> results = (Map<String, TaskResult>) parentSession.getMetadata()
                .get("__dag_results_" + plan.getPlanId());
        return results != null ? results : Collections.emptyMap();
    }

    // ---- Internal scheduling logic ----

    private void dispatchReadyTasks(SchedulerState state) {
        List<AgentTask> readyTasks = findReadyTasks(state);

        if (readyTasks.isEmpty() && state.activeTasks.isEmpty()) {
            // No ready tasks and no active tasks — plan is complete
            log.info("DAGScheduler: plan {} completed. {} tasks finished.",
                    state.plan.getPlanId(), state.completedTasks.size());
            state.sink.complete();
            return;
        }

        for (AgentTask task : readyTasks) {
            if (state.activeTasks.contains(task.getTaskId())) {
                continue; // Already running
            }
            state.activeTasks.add(task.getTaskId());
            launchTask(task, state);
        }
    }

    private List<AgentTask> findReadyTasks(SchedulerState state) {
        return state.plan.getTasks().stream()
                .filter(task -> !state.completedTasks.contains(task.getTaskId()))
                .filter(task -> !state.failedTasks.contains(task.getTaskId()))
                .filter(task -> !state.activeTasks.contains(task.getTaskId()))
                .filter(task -> state.plan.isReady(task.getTaskId(), state.completedTasks))
                .collect(Collectors.toList());
    }

    private void launchTask(AgentTask task, SchedulerState state) {
        String sessionId = state.parentSession.getSessionId();

        log.debug("DAGScheduler: launching task {} (agent: {})",
                task.getTaskId(), task.getAgentName());

        // Emit spawned event
        DelegationEvent.SubAgentSpawned spawnedEvent = new DelegationEvent.SubAgentSpawned(
                sessionId, task.getTaskId(), sessionId, 1,
                task.getAgentName(), task.getDescription());
        state.sink.next(spawnedEvent);

        // Build child session (isolated)
        AgentSession childSession = buildChildSession(task, state.parentSession);
        long startTime = System.currentTimeMillis();

        // Run the child agent engine
        engine.run(childSession)
                .doOnNext(event -> {
                    // Forward progress events
                    if (event instanceof LifecycleEvent.SessionCompleted
                            || event instanceof LifecycleEvent.SessionFailed) {
                        // Handled in doOnComplete / doOnError
                    } else {
                        // Emit progress for each iteration boundary
                        if (event instanceof com.knowledge.agent.v2.event.StateEvent.StateTransition) {
                            DelegationEvent.SubAgentProgress progress = new DelegationEvent.SubAgentProgress(
                                    sessionId, task.getTaskId(), sessionId, 1,
                                    childSession.getExecution().getIteration(), "running");
                            state.sink.next(progress);
                        }
                    }
                })
                .collectList()
                .subscribe(
                        events -> onTaskCompleted(task, childSession, startTime, state),
                        error -> onTaskFailed(task, error, startTime, state));
    }

    private void onTaskCompleted(AgentTask task, AgentSession childSession,
            long startTime, SchedulerState state) {
        long duration = System.currentTimeMillis() - startTime;
        String sessionId = state.parentSession.getSessionId();

        // Extract result from child session's last assistant message
        String result = extractResult(childSession);

        // Store result
        state.results.put(task.getTaskId(), new TaskResult(task.getTaskId(), result, duration, true));

        log.debug("DAGScheduler: task {} completed in {}ms", task.getTaskId(), duration);

        // Emit completed event
        DelegationEvent.SubAgentCompleted completedEvent = new DelegationEvent.SubAgentCompleted(
                sessionId, task.getTaskId(), sessionId, 1, result, duration, true);
        state.sink.next(completedEvent);

        // Move to completed set
        state.activeTasks.remove(task.getTaskId());
        state.completedTasks.add(task.getTaskId());

        // Check for newly ready tasks
        dispatchReadyTasks(state);
    }

    private void onTaskFailed(AgentTask task, Throwable error,
            long startTime, SchedulerState state) {
        long duration = System.currentTimeMillis() - startTime;
        String sessionId = state.parentSession.getSessionId();

        log.error("DAGScheduler: task {} failed after {}ms: {}",
                task.getTaskId(), duration, error.getMessage());

        state.results.put(task.getTaskId(),
                new TaskResult(task.getTaskId(), error.getMessage(), duration, false));

        // Emit completed event with failure
        DelegationEvent.SubAgentCompleted failedEvent = new DelegationEvent.SubAgentCompleted(
                sessionId, task.getTaskId(), sessionId, 1,
                error.getMessage(), duration, false);
        state.sink.next(failedEvent);

        // Fail-fast: error the entire plan
        state.activeTasks.remove(task.getTaskId());
        state.failedTasks.add(task.getTaskId());
        state.sink.error(new DAGExecutionException(
                "Task '" + task.getTaskId() + "' failed: " + error.getMessage(), error));
    }

    /**
     * Build an isolated child session for a sub-agent task.
     */
    private AgentSession buildChildSession(AgentTask task, AgentSession parent) {
        // Determine tool set: task-specific or inherit parent's
        Set<String> tools = task.hasCustomToolSet() ? task.getToolIds() : parent.getToolIds();

        AgentSession.Builder builder = AgentSession.builder()
                .conversationId(parent.getConversationId())
                .identity(parent.getIdentity())
                .mode(AgentMode.EXECUTE)
                .maxIterations(task.getMaxIterations())
                .modelName(task.getModelName() != null ? task.getModelName() : parent.getModelName())
                // Explicitly no frontend tools: a sub-agent has no SSE channel of
                // its own, so a frontend tool call would suspend it forever.
                .frontendTools(Collections.emptyList())
                .toolIds(tools);

        if (task.getSystemPrompt() != null) {
            builder.systemPrompt(task.getSystemPrompt());
        } else {
            builder.systemPrompt(parent.getSystemPrompt());
        }

        AgentSession childSession = builder.build();

        // Seed the conversation with the task description plus a short parent
        // context block — a bare description loses the overall goal.
        childSession.getExecution().addMessage(
                ConversationMessage.user(buildTaskMessage(task, parent)));

        return childSession;
    }

    /**
     * Compose the child's seed message: parent request context + task description.
     */
    private String buildTaskMessage(AgentTask task, AgentSession parent) {
        String parentRequest = null;
        for (ConversationMessage msg : parent.getExecution().getMessages()) {
            if ("user".equals(msg.getRole()) && msg.getContent() != null) {
                parentRequest = msg.getContent();
                break;
            }
        }
        if (parentRequest == null || parentRequest.isBlank()) {
            return task.getDescription();
        }
        if (parentRequest.length() > 1000) {
            parentRequest = parentRequest.substring(0, 1000) + "…";
        }
        return "【父任务背景】" + parentRequest + "\n\n【你的子任务】" + task.getDescription();
    }

    /**
     * Extract the final result from a child session (last assistant message
     * content).
     */
    private String extractResult(AgentSession childSession) {
        List<ConversationMessage> messages = childSession.getExecution().getMessages();
        for (int i = messages.size() - 1; i >= 0; i--) {
            ConversationMessage msg = messages.get(i);
            if ("assistant".equals(msg.getRole()) && msg.getContent() != null) {
                return msg.getContent();
            }
        }
        return "";
    }

    /**
     * Validate that the execution plan's dependency graph is acyclic (DAG
     * property).
     * Uses Kahn's algorithm for topological sort.
     */
    private boolean validateAcyclic(ExecutionPlan plan) {
        Map<String, Set<String>> deps = plan.getDependencies();
        Map<String, Integer> inDegree = new HashMap<>();

        // Initialize in-degree for all tasks
        for (AgentTask task : plan.getTasks()) {
            inDegree.put(task.getTaskId(), 0);
        }

        // Count in-degrees
        for (Map.Entry<String, Set<String>> entry : deps.entrySet()) {
            if (entry.getValue() != null) {
                inDegree.merge(entry.getKey(), entry.getValue().size(), Integer::sum);
            }
        }

        // BFS: start with zero-degree nodes
        Queue<String> queue = new LinkedList<>();
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) {
                queue.add(entry.getKey());
            }
        }

        int processed = 0;
        while (!queue.isEmpty()) {
            String taskId = queue.poll();
            processed++;

            // Find tasks that depend on this one
            for (AgentTask task : plan.getDependentsOf(taskId)) {
                int remaining = inDegree.merge(task.getTaskId(), -1, Integer::sum);
                if (remaining == 0) {
                    queue.add(task.getTaskId());
                }
            }
        }

        return processed == plan.getTasks().size();
    }

    // ---- Internal state ----

    /**
     * Mutable scheduler state for one plan execution.
     */
    private static class SchedulerState {
        final ExecutionPlan plan;
        final AgentSession parentSession;
        final reactor.core.publisher.FluxSink<AgentEvent> sink;
        final Set<String> completedTasks = ConcurrentHashMap.newKeySet();
        final Set<String> failedTasks = ConcurrentHashMap.newKeySet();
        final Set<String> activeTasks = ConcurrentHashMap.newKeySet();
        final Map<String, TaskResult> results = new ConcurrentHashMap<>();

        SchedulerState(ExecutionPlan plan, AgentSession parentSession,
                reactor.core.publisher.FluxSink<AgentEvent> sink) {
            this.plan = plan;
            this.parentSession = parentSession;
            this.sink = sink;
        }
    }

    // ---- Result DTO ----

    /**
     * Result of a single task execution within the DAG.
     */
    public static class TaskResult {
        private final String taskId;
        private final String content;
        private final long durationMs;
        private final boolean success;

        public TaskResult(String taskId, String content, long durationMs, boolean success) {
            this.taskId = taskId;
            this.content = content;
            this.durationMs = durationMs;
            this.success = success;
        }

        public String getTaskId() {
            return taskId;
        }

        public String getContent() {
            return content;
        }

        public long getDurationMs() {
            return durationMs;
        }

        public boolean isSuccess() {
            return success;
        }
    }

    // ---- Exception ----

    /**
     * Exception thrown when a DAG execution plan fails.
     */
    public static class DAGExecutionException extends RuntimeException {
        public DAGExecutionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
