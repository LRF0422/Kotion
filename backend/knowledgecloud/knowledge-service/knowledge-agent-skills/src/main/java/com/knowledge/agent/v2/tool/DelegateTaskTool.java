package com.knowledge.agent.v2.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.tool.AsyncTool;
import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.store.AgentStateStore;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import com.knowledge.agent.v2.job.AgentJob;
import com.knowledge.agent.v2.job.AgentJobService;
import com.knowledge.agent.v2.job.AgentJobStatus;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.state.SessionSnapshotCodec;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.DelegationEvent;
import com.knowledge.agent.v2.event.StateEvent;
import com.knowledge.agent.v2.event.ThinkingEvent;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.eventbus.AgentEventBus;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentMode;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

/**
 * Backend tool: delegate a self-contained subtask to an isolated sub-agent.
 *
 * <p>This is an {@link AsyncTool}: the child engine runs as a Flux and the
 * parent tool call does not block a bounded-elastic thread while waiting.
 * The parent task cancellation disposes the child subscription through the
 * same reactive chain.
 */
@Slf4j
public class DelegateTaskTool implements AsyncTool {

    public static final String ID = "delegate_task";
    public static final String DELEGATE_DEPTH_KEY = "__delegate_depth";

    /** Metadata key storing the last completed delegation for a tool-call id. */
    public static final String LAST_DELEGATION_KEY = "__last_delegation";

    /** Session metadata key holding the per-task delegation sink. */
    public static final String DELEGATION_SINK_KEY = "__delegation_sink";

    /** Session metadata key holding the owning durable task id. */
    public static final String TASK_ID_KEY = "__task_id";

    /** Session metadata key holding active child task ids for cancellation. */
    public static final String CHILD_TASK_IDS_KEY = "__child_task_ids";

    /** @deprecated retained for compatibility with AgentJobService cancellation. */
    @Deprecated
    public static final String CHILD_SUBSCRIPTIONS_KEY = "__child_subscriptions";

    private static final String DEFAULT_SUB_AGENT_PROMPT = "你是一个子任务执行 agent。专注完成交给你的单个任务，直接使用可用的工具完成检索、分析或处理，"
            + "不要向用户提问。完成后用最后一条消息输出简洁、自包含的结果报告（含关键事实与引用），"
            + "它将原样返回给上级 agent。";

    private final ObjectProvider<AgentEngine> engineProvider;
    private final AgentEventBus eventBus;
    private final AgentProperties properties;
    private final ObjectProvider<CustomAgentResolver> resolverProvider;
    private final ObjectProvider<AgentStateStore> stateStoreProvider;
    private final SessionSnapshotCodec snapshotCodec;
    private final ObjectProvider<AgentJobService> jobServiceProvider;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public DelegateTaskTool(ObjectProvider<AgentEngine> engineProvider,
            AgentEventBus eventBus,
            AgentProperties properties,
            ObjectProvider<CustomAgentResolver> resolverProvider) {
        this(engineProvider, eventBus, properties, resolverProvider, null, null);
    }

    public DelegateTaskTool(ObjectProvider<AgentEngine> engineProvider,
            AgentEventBus eventBus,
            AgentProperties properties,
            ObjectProvider<CustomAgentResolver> resolverProvider,
            ObjectProvider<AgentStateStore> stateStoreProvider,
            SessionSnapshotCodec snapshotCodec) {
        this(engineProvider, eventBus, properties, resolverProvider, stateStoreProvider,
                snapshotCodec, null);
    }

    public DelegateTaskTool(ObjectProvider<AgentEngine> engineProvider,
            AgentEventBus eventBus,
            AgentProperties properties,
            ObjectProvider<CustomAgentResolver> resolverProvider,
            ObjectProvider<AgentStateStore> stateStoreProvider,
            SessionSnapshotCodec snapshotCodec,
            ObjectProvider<AgentJobService> jobServiceProvider) {
        this.engineProvider = engineProvider;
        this.eventBus = eventBus;
        this.properties = properties;
        this.resolverProvider = resolverProvider;
        this.stateStoreProvider = stateStoreProvider;
        this.snapshotCodec = snapshotCodec;
        this.jobServiceProvider = jobServiceProvider;
    }

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDescription() {
        return "将一个自包含的子任务委派给独立的子 agent 执行（独立上下文与迭代预算），只把精简的结果报告"
                + "带回当前对话——适合检索、批量分析、长文档处理等会产生大量中间内容的任务。"
                + "子 agent 只能使用后端工具，无法与用户交互，因此任务描述必须自包含（包含全部必要背景与约束）。"
                + "可通过 agent_name 指定一个自定义 agent 作为执行者（使用其提示词/模型/工具集）；"
                + "不指定则使用默认执行者。";
    }

    @Override
    public String getJsonSchema() {
        return "{\"type\":\"object\",\"properties\":{"
                + "\"description\":{\"type\":\"string\",\"description\":\"子任务的完整描述，必须自包含：目标、必要背景、输入（ID/路径等）与约束\"},"
                + "\"expected_output\":{\"type\":\"string\",\"description\":\"期望的产出形式，如：要点列表、结论加引用、JSON 等\"},"
                + "\"agent_name\":{\"type\":\"string\",\"description\":\"可选。要委派的自定义 agent 名称\"}"
                + "},\"required\":[\"description\"]}";
    }

    @Override
    public Integer getTimeoutOverrideSeconds() {
        return properties.getEngine().getDelegateTimeoutSeconds();
    }

    /**
     * Synchronous compatibility adapter. The V2 executor uses
     * {@link #executeAsync(ToolContext, String)}; this method only exists for
     * direct/tool-test callers and blocks on the final stream event.
     */
    @Override
    public ToolResult execute(ToolContext context, String args) {
        try {
            StreamEvent terminal = executeAsync(context, args)
                    .filter(ev -> ev instanceof StreamEvent.ToolResultEvent
                            || ev instanceof StreamEvent.ErrorEvent)
                    .last()
                    .block(Duration.ofSeconds(properties.getEngine().getDelegateTimeoutSeconds() + 5));
            if (terminal instanceof StreamEvent.ErrorEvent) {
                return ToolResult.error(((StreamEvent.ErrorEvent) terminal).getError());
            }
            if (terminal instanceof StreamEvent.ToolResultEvent) {
                Object result = ((StreamEvent.ToolResultEvent) terminal).getResult();
                return ToolResult.success(result != null ? result.toString() : "");
            }
            return ToolResult.error("Sub-agent produced no terminal event");
        } catch (Exception e) {
            return ToolResult.error("Sub-agent execution failed: " + e.getMessage());
        }
    }

    @Override
    public Flux<StreamEvent> executeAsync(ToolContext context, String args) {
        return Flux.defer(() -> {
            AgentEngine engine = engineProvider.getIfAvailable();
            if (engine == null) {
                return Flux.just(errorEvent("Delegation is not available: agent engine not initialized."));
            }

            DelegationRequest request;
            try {
                request = parseRequest(context, args);
            } catch (IllegalArgumentException e) {
                return Flux.just(errorEvent(e.getMessage()));
            }

            // Idempotency: if this exact parent tool call already completed a
            // delegation (retry after a checkpoint restore), return the stored
            // outcome instead of spawning a second child and repeating side effects.
            if (request.toolCallId != null) {
                DelegationOutcome cached = readCachedOutcome(context, request.toolCallId);
                if (cached != null) {
                    publishCompletion(context, cached);
                    if (cached.success) {
                        return Flux.just(new StreamEvent.ToolResultEvent(null, cached.output));
                    }
                    return Flux.just(errorEvent(cached.error));
                }
            }

            CustomAgentResolver.CustomAgentSpec spec = request.spec;

            // Production path: the child is a first-class durable task with its
            // own event log, snapshots, status and cancellation. Direct
            // engine execution is kept only for tests/standalone contexts.
            if (jobServiceProvider != null) {
                AgentJobService jobService = jobServiceProvider.getIfAvailable();
                if (jobService != null && context.getTaskId() != null) {
                    return runAsChildTask(context, request, spec, jobService);
                }
            }

            RecoveredChild recovered = recoverOrCreateChild(context, request, spec);
            AgentSession child = recovered.session;
            boolean resumed = recovered.resumed;
            String parentSessionId = context.getSessionId();
            String childName = spec != null ? spec.getName() : "sub-agent";
            int childDepth = request.parentDepth + 1;
            String parentAgentId = context.getAgentId() != null ? context.getAgentId() : parentSessionId;

            if (!resumed) {
                storeInFlight(context, request.toolCallId, child.getSessionId());
                checkpointChild(child);
                checkpointParent(context);
            }
            // Publishing spawn again for a recovered child is harmless on the
            // frontend (nodes are keyed by agentId) and ensures a replay that
            // lost the original event still rebuilds the node identity.
            publishSpawn(context, child, childName, request.description, parentAgentId, childDepth);

            AtomicReference<Throwable> childError = new AtomicReference<>();
            AtomicBoolean cancelled = new AtomicBoolean(false);
            long startMs = System.currentTimeMillis();

            return (resumed ? engine.resume(child) : engine.run(child))
                    .doOnNext(event -> republishChildEvent(event, context, child, parentAgentId, childDepth))
                    .doOnCancel(() -> {
                        cancelled.set(true);
                        publishDelegation(context, new DelegationEvent.SubAgentCompleted(
                                parentSessionId, child.getSessionId(), parentAgentId, childDepth,
                                "", "Sub-agent cancelled (parent task stopped)",
                                System.currentTimeMillis() - startMs, false,
                                child.getExecution().getTotalPromptTokens(),
                                child.getExecution().getTotalCompletionTokens()));
                    })
                    .doOnError(childError::set)
                    .then(Mono.defer(() -> {
                        long durationMs = System.currentTimeMillis() - startMs;
                        DelegationOutcome outcome = evaluate(context.getToolCallId(), child,
                                childName, cancelled.get(), childError.get(), durationMs,
                                parentSessionId, parentAgentId, childDepth);
                        if (outcome.toolCallId != null) {
                            storeOutcome(context, outcome);
                        }
                        checkpointChild(child);
                        checkpointParent(context);
                        publishCompletion(context, outcome);
                        if (outcome.success) {
                            return Mono.just((StreamEvent) new StreamEvent.ToolResultEvent(
                                    context.getToolCallId(), outcome.output));
                        }
                        return Mono.just(errorEvent(outcome.error));
                    }))
                    .onErrorResume(err -> {
                        long durationMs = System.currentTimeMillis() - startMs;
                        DelegationOutcome outcome = DelegationOutcome.failure(
                                context.getToolCallId(), child.getSessionId(),
                                "Sub-agent failed: " + err.getMessage(), durationMs,
                                child.getExecution().getTotalPromptTokens(),
                                child.getExecution().getTotalCompletionTokens());
                        if (outcome.toolCallId != null) {
                            storeOutcome(context, outcome);
                        }
                        checkpointChild(child);
                        checkpointParent(context);
                        publishCompletion(context, outcome);
                        return Mono.just(errorEvent(outcome.error));
                    });
        });
    }

    @SuppressWarnings("unchecked")
    private void publishDelegation(ToolContext context, DelegationEvent event) {
        Object sink = context.getSessionMetadata() != null
                ? context.getSessionMetadata().get(DELEGATION_SINK_KEY)
                : null;
        if (sink instanceof Sinks.Many) {
            Sinks.EmitResult result = ((Sinks.Many<DelegationEvent>) sink).tryEmitNext(event);
            if (!result.isFailure()) {
                return;
            }
            log.warn("delegate_task: task delegation sink rejected event {}: {}",
                    event.type(), result);
        }
        if (eventBus != null) {
            eventBus.publish(event);
        }
    }

    // ---- Parsing / guards ----

    private DelegationRequest parseRequest(ToolContext context, String args) {
        String description;
        String expectedOutput;
        String agentName;
        try {
            JsonNode node = objectMapper.readTree(args != null ? args : "{}");
            description = node.path("description").asText(null);
            expectedOutput = node.path("expected_output").asText(null);
            agentName = node.path("agent_name").asText(null);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid arguments: " + e.getMessage());
        }
        if (description == null || description.trim().isEmpty()) {
            throw new IllegalArgumentException("Missing required argument: description");
        }

        int parentDepth = context.getDelegateDepth();
        Object metadataDepth = context.getSessionMetadata() != null
                ? context.getSessionMetadata().get(DELEGATE_DEPTH_KEY)
                : null;
        if (metadataDepth instanceof Number
                && ((Number) metadataDepth).intValue() > parentDepth) {
            parentDepth = ((Number) metadataDepth).intValue();
        }
        int maxDepth = properties.getEngine().getMaxDelegateDepth();
        if (parentDepth >= maxDepth) {
            throw new IllegalArgumentException("Delegation rejected: max delegate depth (" + maxDepth
                    + ") reached. Complete the task directly instead.");
        }

        CustomAgentResolver.CustomAgentSpec spec = null;
        if (agentName != null && !agentName.trim().isEmpty()) {
            CustomAgentResolver resolver = resolverProvider.getIfAvailable();
            if (resolver == null) {
                throw new IllegalArgumentException("Custom agents are not available; call without agent_name.");
            }
            Optional<CustomAgentResolver.CustomAgentSpec> resolved = resolver.resolve(agentName.trim(),
                    context.getTenantId());
            if (!resolved.isPresent()) {
                String available = resolver.listAvailable(context.getTenantId()).stream()
                        .map(s -> s.getName() + (s.getDescription() != null
                                ? "（" + s.getDescription() + "）"
                                : ""))
                        .collect(Collectors.joining("; "));
                throw new IllegalArgumentException("Custom agent '" + agentName + "' not found. Available: "
                        + (available.isEmpty() ? "(none)" : available));
            }
            spec = resolved.get();
        }

        return new DelegationRequest(context.getToolCallId(), description, expectedOutput,
                spec, parentDepth);
    }

    // ---- Recovery / checkpointing ----

    private RecoveredChild recoverOrCreateChild(ToolContext context, DelegationRequest request,
            CustomAgentResolver.CustomAgentSpec spec) {
        if (request.toolCallId != null) {
            Map<String, Object> entry = readDelegationEntry(context, request.toolCallId);
            if (entry != null && "running".equals(entry.get("status"))
                    && entry.get("childSessionId") != null) {
                AgentSession restored = loadChildSnapshot(
                        entry.get("childSessionId").toString(), context);
                if (restored != null) {
                    Object sink = context.getSessionMetadata() != null
                            ? context.getSessionMetadata().get(DELEGATION_SINK_KEY)
                            : null;
                    if (sink != null) {
                        restored.getMetadata().put(DELEGATION_SINK_KEY, sink);
                    }
                    return new RecoveredChild(restored, true);
                }
            }
        }
        return new RecoveredChild(buildChildSession(context, request, spec), false);
    }

    private AgentSession loadChildSnapshot(String childSessionId, ToolContext context) {
        if (stateStoreProvider == null || snapshotCodec == null) {
            return null;
        }
        AgentStateStore stateStore = stateStoreProvider.getIfAvailable();
        if (stateStore == null) {
            return null;
        }
        try {
            AgentStateSnapshot snapshot = stateStore.load(childSessionId);
            if (snapshot == null || snapshot.getV2SessionJson() == null) {
                return null;
            }
            AgentSession session = snapshotCodec.decode(snapshot, context.getToken());
            if (session == null) {
                return null;
            }
            // The checkpoint may have been written after THINK completed but
            // before ACT ran; resume at ACT so tools execute instead of
            // re-invoking the LLM.
            List<InferenceResponse.ToolCallData> pending =
                    session.getExecution().getPendingToolCalls();
            if (session.getCurrentState() == AgentState.THINK
                    && pending != null && !pending.isEmpty()) {
                session.getExecution().transitionTo(AgentState.ACT);
            }
            return session;
        } catch (Exception e) {
            log.warn("delegate_task: failed to restore child session {}: {}",
                    childSessionId, e.getMessage());
            return null;
        }
    }

    private void checkpointChild(AgentSession child) {
        if (stateStoreProvider == null || snapshotCodec == null) {
            return;
        }
        AgentStateStore stateStore = stateStoreProvider.getIfAvailable();
        if (stateStore == null) {
            return;
        }
        try {
            stateStore.saveNow(child.getSessionId(), snapshotCodec.encode(child));
        } catch (Exception e) {
            log.warn("delegate_task: failed to checkpoint child {}: {}",
                    child.getSessionId(), e.getMessage());
        }
    }

    private void checkpointParent(ToolContext context) {
        if (stateStoreProvider == null || snapshotCodec == null) {
            return;
        }
        AgentStateStore stateStore = stateStoreProvider.getIfAvailable();
        if (stateStore == null) {
            return;
        }
        Object owner = context.getOwnerSession();
        if (!(owner instanceof AgentSession)) {
            return;
        }
        AgentSession parent = (AgentSession) owner;
        try {
            stateStore.saveNow(parent.getSessionId(), snapshotCodec.encode(parent));
        } catch (Exception e) {
            log.warn("delegate_task: failed to checkpoint parent {}: {}",
                    parent.getSessionId(), e.getMessage());
        }
    }

    // ---- First-class child task execution ----

    private Flux<StreamEvent> runAsChildTask(ToolContext context, DelegationRequest request,
            CustomAgentResolver.CustomAgentSpec spec, AgentJobService jobService) {
        return Flux.defer(() -> {
            ChildTaskHandle handle = recoverOrCreateChildTask(context, request, spec, jobService);
            String childTaskId = handle.job.getTaskId();
            String childSessionId = handle.childSessionId;
            String childName = spec != null ? spec.getName() : "sub-agent";
            int childDepth = request.parentDepth + 1;
            String parentAgentId = context.getAgentId() != null
                    ? context.getAgentId()
                    : context.getSessionId();
            long startMs = System.currentTimeMillis();

            // Re-publishing spawn for a recovered child is idempotent on the
            // frontend (nodes are keyed by agentId) and preserves node identity
            // when the original event is no longer in the parent replay window.
            publishSpawn(context, childSessionId, childName, request.description,
                    parentAgentId, childDepth);

            if (handle.isNew) {
                registerChildTask(context, childTaskId);
                storeChildTaskInFlight(context, request.toolCallId, childTaskId,
                        childSessionId, 0L);
                checkpointParent(context);
            }

            AtomicBoolean cancelled = new AtomicBoolean(false);
            AtomicLong lastSeq = new AtomicLong(handle.lastSeq);
            AtomicInteger sinceCheckpoint = new AtomicInteger(0);

            return jobService.streamEvents(childTaskId, handle.lastSeq)
                    .doOnNext(te -> {
                        if (te.seq > lastSeq.get()) {
                            lastSeq.set(te.seq);
                        }
                        updateChildTaskProgress(context, request.toolCallId,
                                childTaskId, childSessionId, lastSeq.get());
                        republishChildTaskEvent(context, childSessionId, childName,
                                parentAgentId, childDepth, te);
                        if (sinceCheckpoint.incrementAndGet() >= 1024) {
                            sinceCheckpoint.set(0);
                            checkpointParent(context);
                        }
                    })
                    .doOnCancel(() -> {
                        cancelled.set(true);
                        jobService.cancel(childTaskId);
                        publishChildTaskCompleted(context, childSessionId, parentAgentId,
                                childDepth, "Sub-agent cancelled (parent task stopped)",
                                System.currentTimeMillis() - startMs, false, 0, 0);
                    })
                    .then(Mono.defer(() -> {
                        long durationMs = System.currentTimeMillis() - startMs;
                        DelegationOutcome outcome = evaluateChildTask(context, request.toolCallId,
                                childTaskId, childSessionId, childName, cancelled.get(), durationMs);
                        if (outcome.toolCallId != null) {
                            storeOutcome(context, outcome);
                        }
                        checkpointParent(context);
                        publishCompletion(context, outcome);
                        if (outcome.success) {
                            return Mono.just((StreamEvent) new StreamEvent.ToolResultEvent(
                                    context.getToolCallId(), outcome.output));
                        }
                        return Mono.just(errorEvent(outcome.error));
                    }))
                    .onErrorResume(err -> {
                        long durationMs = System.currentTimeMillis() - startMs;
                        DelegationOutcome outcome = DelegationOutcome.failure(
                                context.getToolCallId(), childSessionId,
                                "Sub-agent task failed: " + err.getMessage(), durationMs, 0, 0);
                        if (outcome.toolCallId != null) {
                            storeOutcome(context, outcome);
                        }
                        checkpointParent(context);
                        publishCompletion(context, outcome);
                        return Mono.just(errorEvent(outcome.error));
                    });
        });
    }

    private ChildTaskHandle recoverOrCreateChildTask(ToolContext context,
            DelegationRequest request, CustomAgentResolver.CustomAgentSpec spec,
            AgentJobService jobService) {
        if (request.toolCallId != null) {
            Map<String, Object> entry = readDelegationEntry(context, request.toolCallId);
            if (entry != null && "running".equals(entry.get("status"))
                    && entry.get("childTaskId") != null) {
                String childTaskId = entry.get("childTaskId").toString();
                AgentJob existing = jobService.status(childTaskId);
                if (existing != null) {
                    String childSessionId = entry.get("childSessionId") != null
                            ? entry.get("childSessionId").toString()
                            : existing.getSessionId();
                    long lastSeq = entry.get("lastSeq") instanceof Number
                            ? ((Number) entry.get("lastSeq")).longValue()
                            : 0L;
                    return new ChildTaskHandle(existing, childSessionId, lastSeq, false);
                }
            }
        }
        AgentSession child = buildChildSession(context, request, spec);
        AgentJob childJob = jobService.createChild(child, context.getTaskId());
        return new ChildTaskHandle(childJob, child.getSessionId(), 0L, true);
    }

    @SuppressWarnings("unchecked")
    private void registerChildTask(ToolContext context, String childTaskId) {
        Map<String, Object> meta = context.getSessionMetadata();
        if (meta == null) {
            return;
        }
        synchronized (meta) {
            List<String> taskIds = (List<String>) meta.computeIfAbsent(
                    CHILD_TASK_IDS_KEY, k -> Collections.synchronizedList(new ArrayList<String>()));
            if (!taskIds.contains(childTaskId)) {
                taskIds.add(childTaskId);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void storeChildTaskInFlight(ToolContext context, String toolCallId,
            String childTaskId, String childSessionId, long lastSeq) {
        if (toolCallId == null) {
            return;
        }
        Map<String, Object> meta = context.getSessionMetadata();
        if (meta == null) {
            return;
        }
        synchronized (meta) {
            Map<String, Object> cache = (Map<String, Object>) meta.computeIfAbsent(
                    LAST_DELEGATION_KEY, k -> new HashMap<>());
            Map<String, Object> value = new HashMap<>();
            value.put("status", "running");
            value.put("childTaskId", childTaskId);
            value.put("childSessionId", childSessionId);
            value.put("lastSeq", lastSeq);
            cache.put(toolCallId, value);
        }
    }

    @SuppressWarnings("unchecked")
    private void updateChildTaskProgress(ToolContext context, String toolCallId,
            String childTaskId, String childSessionId, long lastSeq) {
        if (toolCallId == null) {
            return;
        }
        Map<String, Object> meta = context.getSessionMetadata();
        if (meta == null) {
            return;
        }
        synchronized (meta) {
            Map<String, Object> cache = (Map<String, Object>) meta.computeIfAbsent(
                    LAST_DELEGATION_KEY, k -> new HashMap<>());
            Map<String, Object> value = new HashMap<>();
            value.put("status", "running");
            value.put("childTaskId", childTaskId);
            value.put("childSessionId", childSessionId);
            value.put("lastSeq", lastSeq);
            cache.put(toolCallId, value);
        }
    }

    private void republishChildTaskEvent(ToolContext context, String childSessionId,
            String childName, String parentAgentId, int childDepth,
            AgentJobService.TaskEvent te) {
        if (te.event != null) {
            republishDelegationOrEngineEvent(context, childSessionId, parentAgentId,
                    childDepth, te.event);
            return;
        }
        if (te.payloadJson == null) {
            return;
        }
        try {
            JsonNode p = objectMapper.readTree(te.payloadJson);
            String type = te.type;
            String parentSessionId = context.getSessionId();
            if ("think.delta".equals(type)) {
                String content = p.path("content").asText("");
                if ("reasoning".equals(p.path("type").asText(""))) {
                    publishDelegation(context, new DelegationEvent.SubAgentReasoning(
                            parentSessionId, childSessionId, parentAgentId, childDepth, content));
                } else {
                    publishDelegation(context, new DelegationEvent.SubAgentOutput(
                            parentSessionId, childSessionId, parentAgentId, childDepth, content));
                }
            } else if ("state.transition".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentProgress(
                        parentSessionId, childSessionId, parentAgentId, childDepth,
                        p.path("iteration").asInt(0), "running"));
            } else if ("tool.dispatched".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentToolCall(
                        parentSessionId, childSessionId, parentAgentId, childDepth,
                        p.path("toolCallId").asText(null), p.path("toolName").asText(null),
                        p.path("arguments").asText(null)));
            } else if ("tool.completed".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentToolResult(
                        parentSessionId, childSessionId, parentAgentId, childDepth,
                        p.path("toolCallId").asText(null), p.path("result").asText(null), null));
            } else if ("tool.failed".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentToolResult(
                        parentSessionId, childSessionId, parentAgentId, childDepth,
                        p.path("toolCallId").asText(null), null,
                        p.path("errorMessage").asText(p.path("errorCode").asText("TOOL_ERROR"))));
            } else if ("agent.spawned".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentSpawned(
                        parentSessionId, p.path("agentId").asText(childSessionId),
                        p.path("parentAgentId").asText(parentAgentId),
                        p.path("depth").asInt(childDepth),
                        p.path("agentName").asText(null),
                        p.path("taskDescription").asText(null)));
            } else if ("agent.output".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentOutput(
                        parentSessionId, p.path("agentId").asText(childSessionId),
                        p.path("parentAgentId").asText(parentAgentId),
                        p.path("depth").asInt(childDepth), p.path("content").asText("")));
            } else if ("agent.reasoning".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentReasoning(
                        parentSessionId, p.path("agentId").asText(childSessionId),
                        p.path("parentAgentId").asText(parentAgentId),
                        p.path("depth").asInt(childDepth), p.path("content").asText("")));
            } else if ("agent.progress".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentProgress(
                        parentSessionId, p.path("agentId").asText(childSessionId),
                        p.path("parentAgentId").asText(parentAgentId),
                        p.path("depth").asInt(childDepth),
                        p.path("iteration").asInt(0), "running"));
            } else if ("agent.tool_call".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentToolCall(
                        parentSessionId, p.path("agentId").asText(childSessionId),
                        p.path("parentAgentId").asText(parentAgentId),
                        p.path("depth").asInt(childDepth),
                        p.path("toolCallId").asText(null), p.path("toolName").asText(null),
                        p.path("arguments").asText(null)));
            } else if ("agent.tool_result".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentToolResult(
                        parentSessionId, p.path("agentId").asText(childSessionId),
                        p.path("parentAgentId").asText(parentAgentId),
                        p.path("depth").asInt(childDepth),
                        p.path("toolCallId").asText(null), p.path("result").asText(null),
                        p.path("error").asText(null)));
            } else if ("agent.completed".equals(type)) {
                publishDelegation(context, new DelegationEvent.SubAgentCompleted(
                        parentSessionId, p.path("agentId").asText(childSessionId),
                        p.path("parentAgentId").asText(parentAgentId),
                        p.path("depth").asInt(childDepth),
                        p.path("result").asText(null), p.path("error").asText(null),
                        p.path("durationMs").asLong(0L),
                        p.path("success").asBoolean(false),
                        p.path("usage").path("prompt").asInt(0),
                        p.path("usage").path("completion").asInt(0)));
            }
        } catch (Exception e) {
            log.warn("delegate_task: failed to republish replayed child event {} seq {}: {}",
                    te.type, te.seq, e.getMessage());
        }
    }

    private void republishDelegationOrEngineEvent(ToolContext context, String childSessionId,
            String parentAgentId, int childDepth, com.knowledge.agent.v2.event.AgentEvent event) {
        if (event instanceof DelegationEvent) {
            publishDelegation(context, (DelegationEvent) event);
            return;
        }
        String parentSessionId = context.getSessionId();
        if (event instanceof StateEvent.StateTransition) {
            publishDelegation(context, new DelegationEvent.SubAgentProgress(
                    parentSessionId, childSessionId, parentAgentId, childDepth,
                    ((StateEvent.StateTransition) event).getIteration(), "running"));
        } else if (event instanceof ThinkingEvent.ThinkDelta) {
            ThinkingEvent.ThinkDelta delta = (ThinkingEvent.ThinkDelta) event;
            String content = delta.getContent();
            if (content != null && !content.isEmpty()) {
                if (delta.getDeltaType() == ThinkingEvent.ThinkDelta.DeltaType.TEXT) {
                    publishDelegation(context, new DelegationEvent.SubAgentOutput(
                            parentSessionId, childSessionId, parentAgentId, childDepth, content));
                } else if (delta.getDeltaType() == ThinkingEvent.ThinkDelta.DeltaType.REASONING) {
                    publishDelegation(context, new DelegationEvent.SubAgentReasoning(
                            parentSessionId, childSessionId, parentAgentId, childDepth, content));
                }
            }
        } else if (event instanceof ToolEvent.ToolDispatched) {
            ToolEvent.ToolDispatched d = (ToolEvent.ToolDispatched) event;
            publishDelegation(context, new DelegationEvent.SubAgentToolCall(
                    parentSessionId, childSessionId, parentAgentId, childDepth,
                    d.getToolCallId(), d.getToolName(), d.getArguments()));
        } else if (event instanceof ToolEvent.ToolCompleted) {
            ToolEvent.ToolCompleted c = (ToolEvent.ToolCompleted) event;
            publishDelegation(context, new DelegationEvent.SubAgentToolResult(
                    parentSessionId, childSessionId, parentAgentId, childDepth,
                    c.getToolCallId(), c.getResult(), null));
        } else if (event instanceof ToolEvent.ToolFailed) {
            ToolEvent.ToolFailed f = (ToolEvent.ToolFailed) event;
            publishDelegation(context, new DelegationEvent.SubAgentToolResult(
                    parentSessionId, childSessionId, parentAgentId, childDepth,
                    f.getToolCallId(), null,
                    f.getErrorMessage() != null ? f.getErrorMessage() : f.getErrorCode()));
        }
    }

    private DelegationOutcome evaluateChildTask(ToolContext context, String toolCallId,
            String childTaskId, String childSessionId, String childName, boolean cancelled,
            long durationMs) {
        AgentJob job = jobServiceProvider == null ? null
                : jobServiceProvider.getIfAvailable() == null ? null
                : jobServiceProvider.getIfAvailable().status(childTaskId);
        int promptTokens = job != null ? job.getPromptTokens() : 0;
        int completionTokens = job != null ? job.getCompletionTokens() : 0;

        if (cancelled) {
            return DelegationOutcome.failure(toolCallId, childSessionId,
                    "Sub-agent cancelled (parent task stopped)", durationMs,
                    promptTokens, completionTokens);
        }
        if (job == null) {
            return DelegationOutcome.failure(toolCallId, childSessionId,
                    "Sub-agent task not found: " + childTaskId, durationMs,
                    promptTokens, completionTokens);
        }
        if (job.getStatus() == AgentJobStatus.FAILED) {
            return DelegationOutcome.failure(toolCallId, childSessionId,
                    job.getErrorMessage() != null ? job.getErrorMessage()
                            : "Sub-agent task failed", durationMs, promptTokens, completionTokens);
        }
        if (job.getStatus() == AgentJobStatus.CANCELLED) {
            return DelegationOutcome.failure(toolCallId, childSessionId,
                    "Sub-agent task cancelled", durationMs, promptTokens, completionTokens);
        }
        if (job.getStatus() == AgentJobStatus.SUSPENDED
                || job.getStatus() == AgentJobStatus.WAITING_TOOLS) {
            return DelegationOutcome.failure(toolCallId, childSessionId,
                    "Sub-agent paused in state " + job.getStatus()
                            + (job.getFinishReason() != null ? " (" + job.getFinishReason() + ")" : ""),
                    durationMs, promptTokens, completionTokens);
        }

        AgentSession child = loadChildSnapshot(childSessionId, context);
        if (child != null) {
            return evaluate(toolCallId, child, childName, false, null, durationMs,
                    context.getSessionId(), context.getAgentId(), context.getDelegateDepth());
        }

        // Fallback when the snapshot is unavailable but the job completed with text.
        String text = job.getAssistantText();
        if (job.getStatus() == AgentJobStatus.COMPLETED && text != null && !text.trim().isEmpty()) {
            return DelegationOutcome.success(toolCallId, childSessionId,
                    "[子 agent " + childName + "]\n" + text, durationMs,
                    promptTokens, completionTokens);
        }
        return DelegationOutcome.failure(toolCallId, childSessionId,
                "Sub-agent finished but no result snapshot was available", durationMs,
                promptTokens, completionTokens);
    }

    private void publishChildTaskCompleted(ToolContext context, String childSessionId,
            String parentAgentId, int childDepth, String error, long durationMs,
            boolean success, int promptTokens, int completionTokens) {
        publishDelegation(context, new DelegationEvent.SubAgentCompleted(
                context.getSessionId(), childSessionId, parentAgentId, childDepth,
                success ? "" : null, error, durationMs, success, promptTokens, completionTokens));
    }

    private void publishSpawn(ToolContext context, String childSessionId, String childName,
            String description, String parentAgentId, int childDepth) {
        publishDelegation(context, new DelegationEvent.SubAgentSpawned(
                context.getSessionId(), childSessionId, parentAgentId,
                childDepth, childName, description));
    }

    private static class ChildTaskHandle {
        final AgentJob job;
        final String childSessionId;
        final long lastSeq;
        final boolean isNew;

        ChildTaskHandle(AgentJob job, String childSessionId, long lastSeq, boolean isNew) {
            this.job = job;
            this.childSessionId = childSessionId;
            this.lastSeq = lastSeq;
            this.isNew = isNew;
        }
    }

    // ---- Child session ----

    private AgentSession buildChildSession(ToolContext context, DelegationRequest request,
            CustomAgentResolver.CustomAgentSpec spec) {
        AgentIdentity identity = AgentIdentity.builder()
                .userId(context.getUserId())
                .tenantId(context.getTenantId())
                .userName(context.getUserName())
                .account(context.getAccount())
                .roleName(context.getRoleName())
                .token(context.getToken())
                .build();

        String systemPrompt = spec != null && spec.getSystemPrompt() != null
                ? spec.getSystemPrompt()
                : DEFAULT_SUB_AGENT_PROMPT;
        String modelName = spec != null && spec.getModelName() != null
                ? spec.getModelName()
                : context.getModelName();
        int maxIterations = spec != null && spec.getMaxIterations() != null
                ? spec.getMaxIterations()
                : properties.getEngine().getMaxIterations();

        String childSessionId = UUID.randomUUID().toString();
        Map<String, Object> metadata = new HashMap<>();
        metadata.put(DELEGATE_DEPTH_KEY, request.parentDepth + 1);
        metadata.put("agentId", childSessionId);
        // Nested delegation must republish into the ROOT task sink, not the
        // child session (which is not a TaskRun and has no subscriber).
        Object parentSink = context.getSessionMetadata() != null
                ? context.getSessionMetadata().get(DELEGATION_SINK_KEY)
                : null;
        if (parentSink != null) {
            metadata.put(DELEGATION_SINK_KEY, parentSink);
        }

        AgentSession child = AgentSession.builder()
                .sessionId(childSessionId)
                .conversationId(context.getConversationId())
                .identity(identity)
                .mode(context.getMode() != null ? AgentMode.valueOf(context.getMode().name()) : AgentMode.EXECUTE)
                .maxIterations(maxIterations)
                .modelName(modelName)
                .systemPrompt(systemPrompt)
                .toolIds(spec != null ? spec.getToolIds() : null)
                .metadata(metadata)
                .build();

        StringBuilder task = new StringBuilder(request.description.trim());
        if (request.expectedOutput != null && !request.expectedOutput.trim().isEmpty()) {
            task.append("\n\n期望产出：").append(request.expectedOutput.trim());
        }
        child.getExecution().addMessage(ConversationMessage.user(task.toString()));
        return child;
    }

    // ---- Child event republishing ----

    private void republishChildEvent(com.knowledge.agent.v2.event.AgentEvent event,
            ToolContext context, AgentSession child, String parentAgentId, int childDepth) {
        String parentSessionId = context.getSessionId();
        if (event instanceof StateEvent.StateTransition) {
            publishDelegation(context, new DelegationEvent.SubAgentProgress(
                    parentSessionId, child.getSessionId(), parentAgentId, childDepth,
                    child.getExecution().getIteration(), "running"));
        } else if (event instanceof ThinkingEvent.ThinkDelta) {
            ThinkingEvent.ThinkDelta delta = (ThinkingEvent.ThinkDelta) event;
            String content = delta.getContent();
            if (content != null && !content.isEmpty()) {
                if (delta.getDeltaType() == ThinkingEvent.ThinkDelta.DeltaType.TEXT) {
                    publishDelegation(context, new DelegationEvent.SubAgentOutput(
                            parentSessionId, child.getSessionId(), parentAgentId,
                            childDepth, content));
                } else if (delta.getDeltaType() == ThinkingEvent.ThinkDelta.DeltaType.REASONING) {
                    publishDelegation(context, new DelegationEvent.SubAgentReasoning(
                            parentSessionId, child.getSessionId(), parentAgentId,
                            childDepth, content));
                }
            }
        } else if (event instanceof ToolEvent.ToolDispatched) {
            ToolEvent.ToolDispatched dispatched = (ToolEvent.ToolDispatched) event;
            publishDelegation(context, new DelegationEvent.SubAgentToolCall(
                    parentSessionId, child.getSessionId(), parentAgentId, childDepth,
                    dispatched.getToolCallId(), dispatched.getToolName(), dispatched.getArguments()));
        } else if (event instanceof ToolEvent.ToolCompleted) {
            ToolEvent.ToolCompleted completed = (ToolEvent.ToolCompleted) event;
            publishDelegation(context, new DelegationEvent.SubAgentToolResult(
                    parentSessionId, child.getSessionId(), parentAgentId, childDepth,
                    completed.getToolCallId(), completed.getResult(), null));
        } else if (event instanceof ToolEvent.ToolFailed) {
            ToolEvent.ToolFailed failed = (ToolEvent.ToolFailed) event;
            publishDelegation(context, new DelegationEvent.SubAgentToolResult(
                    parentSessionId, child.getSessionId(), parentAgentId, childDepth,
                    failed.getToolCallId(), null,
                    failed.getErrorMessage() != null ? failed.getErrorMessage() : failed.getErrorCode()));
        }
    }

    // ---- Outcome / persistence ----

    private DelegationOutcome evaluate(String toolCallId, AgentSession child, String childName,
            boolean cancelled, Throwable childError, long durationMs, String parentSessionId,
            String parentAgentId, int childDepth) {
        String childAgentId = child.getSessionId();
        if (cancelled) {
            return DelegationOutcome.failure(toolCallId, childAgentId,
                    "Sub-agent cancelled (parent task stopped)", durationMs,
                    child.getExecution().getTotalPromptTokens(),
                    child.getExecution().getTotalCompletionTokens());
        }
        if (childError != null) {
            return DelegationOutcome.failure(toolCallId, childAgentId,
                    "Sub-agent failed: " + childError.getMessage(), durationMs,
                    child.getExecution().getTotalPromptTokens(),
                    child.getExecution().getTotalCompletionTokens());
        }

        AgentState finalState = child.getCurrentState();
        String result = extractResult(child);
        if (finalState == AgentState.DONE) {
            if (result.isEmpty()) {
                return DelegationOutcome.failure(toolCallId, childAgentId,
                        "Sub-agent finished (DONE) but produced no result message",
                        durationMs, child.getExecution().getTotalPromptTokens(),
                        child.getExecution().getTotalCompletionTokens());
            }
            String report = "[子 agent " + childName + " · " + child.getExecution().getIteration()
                    + " 轮迭代]\n" + result;
            return DelegationOutcome.success(toolCallId, childAgentId, report, durationMs,
                    child.getExecution().getTotalPromptTokens(),
                    child.getExecution().getTotalCompletionTokens());
        }

        String error = result.isEmpty()
                ? "Sub-agent ended in state " + finalState + " without a result message"
                : "Sub-agent ended in state " + finalState + ": " + truncate(result, 1000);
        return DelegationOutcome.failure(toolCallId, childAgentId, error, durationMs,
                child.getExecution().getTotalPromptTokens(),
                child.getExecution().getTotalCompletionTokens());
    }

    @SuppressWarnings("unchecked")
    private void storeOutcome(ToolContext context, DelegationOutcome outcome) {
        if (outcome.toolCallId == null) {
            return;
        }
        Map<String, Object> meta = context.getSessionMetadata();
        if (meta == null) {
            return;
        }
        synchronized (meta) {
            Map<String, Object> cache = (Map<String, Object>) meta.computeIfAbsent(
                    LAST_DELEGATION_KEY, k -> new HashMap<>());
            Map<String, Object> value = outcome.toMap();
            value.put("status", "completed");
            cache.put(outcome.toolCallId, value);
        }
    }

    @SuppressWarnings("unchecked")
    private void storeInFlight(ToolContext context, String toolCallId, String childSessionId) {
        if (toolCallId == null) {
            return;
        }
        Map<String, Object> meta = context.getSessionMetadata();
        if (meta == null) {
            return;
        }
        synchronized (meta) {
            Map<String, Object> cache = (Map<String, Object>) meta.computeIfAbsent(
                    LAST_DELEGATION_KEY, k -> new HashMap<>());
            Map<String, Object> value = new HashMap<>();
            value.put("status", "running");
            value.put("childSessionId", childSessionId);
            cache.put(toolCallId, value);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readDelegationEntry(ToolContext context, String toolCallId) {
        Map<String, Object> meta = context.getSessionMetadata();
        if (meta == null) {
            return null;
        }
        Object cache = meta.get(LAST_DELEGATION_KEY);
        if (!(cache instanceof Map)) {
            return null;
        }
        Object value = ((Map<String, Object>) cache).get(toolCallId);
        return value instanceof Map ? (Map<String, Object>) value : null;
    }

    @SuppressWarnings("unchecked")
    private DelegationOutcome readCachedOutcome(ToolContext context, String toolCallId) {
        Map<String, Object> value = readDelegationEntry(context, toolCallId);
        if (value == null || !"completed".equals(value.get("status"))) {
            return null;
        }
        return DelegationOutcome.fromMap(value);
    }

    private void publishSpawn(ToolContext context, AgentSession child, String childName,
            String description, String parentAgentId, int childDepth) {
        publishDelegation(context, new DelegationEvent.SubAgentSpawned(
                context.getSessionId(), child.getSessionId(), parentAgentId,
                childDepth, childName, description));
    }

    private void publishCompletion(ToolContext context, DelegationOutcome outcome) {
        publishDelegation(context, new DelegationEvent.SubAgentCompleted(
                context.getSessionId(), outcome.childAgentId != null
                        ? outcome.childAgentId
                        : context.getSessionId(),
                context.getAgentId() != null ? context.getAgentId() : context.getSessionId(),
                context.getDelegateDepth() + 1,
                outcome.output != null ? outcome.output : "",
                outcome.error,
                outcome.durationMs,
                outcome.success,
                outcome.promptTokens,
                outcome.completionTokens));
    }

    private StreamEvent errorEvent(String message) {
        StreamEvent.ErrorEvent event = new StreamEvent.ErrorEvent();
        event.setError(message);
        event.setCode("SUBTASK_FAILED");
        event.setRetriable(false);
        return event;
    }

    private String extractResult(AgentSession child) {
        List<ConversationMessage> messages = child.getExecution().getMessages();
        for (int i = messages.size() - 1; i >= 0; i--) {
            ConversationMessage msg = messages.get(i);
            if ("assistant".equals(msg.getRole())
                    && msg.getContent() != null && !msg.getContent().trim().isEmpty()) {
                return msg.getContent();
            }
        }
        return "";
    }

    private String truncate(String text, int max) {
        if (text == null) {
            return "";
        }
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }

    // ---- Request / outcome DTOs ----

    private static class RecoveredChild {
        final AgentSession session;
        final boolean resumed;

        RecoveredChild(AgentSession session, boolean resumed) {
            this.session = session;
            this.resumed = resumed;
        }
    }

    private static class DelegationRequest {
        final String toolCallId;
        final String description;
        final String expectedOutput;
        final CustomAgentResolver.CustomAgentSpec spec;
        final int parentDepth;

        DelegationRequest(String toolCallId, String description, String expectedOutput,
                CustomAgentResolver.CustomAgentSpec spec, int parentDepth) {
            this.toolCallId = toolCallId;
            this.description = description;
            this.expectedOutput = expectedOutput;
            this.spec = spec;
            this.parentDepth = parentDepth;
        }
    }

    static class DelegationOutcome {
        final String toolCallId;
        final String childAgentId;
        final String output;
        final String error;
        final boolean success;
        final long durationMs;
        final int promptTokens;
        final int completionTokens;

        private DelegationOutcome(String toolCallId, String childAgentId, String output,
                String error, boolean success, long durationMs, int promptTokens,
                int completionTokens) {
            this.toolCallId = toolCallId;
            this.childAgentId = childAgentId;
            this.output = output;
            this.error = error;
            this.success = success;
            this.durationMs = durationMs;
            this.promptTokens = promptTokens;
            this.completionTokens = completionTokens;
        }

        static DelegationOutcome success(String toolCallId, String childAgentId, String output,
                long durationMs, int promptTokens, int completionTokens) {
            return new DelegationOutcome(toolCallId, childAgentId, output, null, true, durationMs,
                    promptTokens, completionTokens);
        }

        static DelegationOutcome failure(String toolCallId, String childAgentId, String error,
                long durationMs, int promptTokens, int completionTokens) {
            return new DelegationOutcome(toolCallId, childAgentId, null, error, false, durationMs,
                    promptTokens, completionTokens);
        }

        Map<String, Object> toMap() {
            Map<String, Object> map = new HashMap<>();
            map.put("childAgentId", childAgentId);
            map.put("output", output);
            map.put("error", error);
            map.put("success", success);
            map.put("durationMs", durationMs);
            map.put("promptTokens", promptTokens);
            map.put("completionTokens", completionTokens);
            return map;
        }

        static DelegationOutcome fromMap(Map<String, Object> map) {
            boolean success = Boolean.TRUE.equals(map.get("success"));
            String childAgentId = map.get("childAgentId") != null
                    ? map.get("childAgentId").toString() : null;
            String output = map.get("output") != null ? map.get("output").toString() : null;
            String error = map.get("error") != null ? map.get("error").toString() : null;
            long durationMs = map.get("durationMs") instanceof Number
                    ? ((Number) map.get("durationMs")).longValue() : 0L;
            int promptTokens = map.get("promptTokens") instanceof Number
                    ? ((Number) map.get("promptTokens")).intValue() : 0;
            int completionTokens = map.get("completionTokens") instanceof Number
                    ? ((Number) map.get("completionTokens")).intValue() : 0;
            return new DelegationOutcome(null, childAgentId, output, error, success, durationMs,
                    promptTokens, completionTokens);
        }
    }
}
