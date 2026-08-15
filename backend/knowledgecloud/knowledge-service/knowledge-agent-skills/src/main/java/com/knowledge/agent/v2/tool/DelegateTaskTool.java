package com.knowledge.agent.v2.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.DelegationEvent;
import com.knowledge.agent.v2.event.StateEvent;
import com.knowledge.agent.v2.event.ThinkingEvent;
import com.knowledge.agent.v2.eventbus.AgentEventBus;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentMode;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

import reactor.core.Disposable;

/**
 * Backend tool: delegate a self-contained subtask to an isolated sub-agent.
 *
 * <p>
 * Context isolation is the point — the sub-agent runs with a fresh
 * {@link AgentSession} (own message history, own iteration budget), so
 * however many tokens it burns on retrieval/analysis, the parent's context
 * only grows by one concise report message.
 *
 * <p>
 * Safeguards:
 * <ul>
 * <li><b>Depth guard</b>: {@code __delegate_depth} in session metadata is
 * incremented per level; exceeding {@code agent.engine.max-delegate-depth}
 * is rejected.</li>
 * <li><b>No frontend tools</b>: the child session carries no frontend tool
 * definitions, so it can never suspend waiting for the client.</li>
 * <li><b>Own timeout</b>: overrides the global tool timeout with
 * {@code agent.engine.delegate-timeout-seconds}.</li>
 * </ul>
 *
 * <p>
 * Sub-agent lifecycle is surfaced to the frontend as
 * {@link DelegationEvent}s (agent.spawned / agent.progress / agent.completed)
 * published on the {@link AgentEventBus} under the <b>parent</b> session id;
 * the controller merges these into the parent's SSE stream.
 *
 * <p>
 * When {@code agent_name} is given, the sub-agent is assembled from the
 * tenant's custom agent definition via {@link CustomAgentResolver}
 * (system prompt / model / tool set / max iterations).
 */
@Slf4j
public class DelegateTaskTool implements Tool {

    public static final String ID = "delegate_task";

    /** Session metadata key tracking delegation depth (root = 0). */
    public static final String DELEGATE_DEPTH_KEY = "__delegate_depth";

    /**
     * Session metadata key holding the live child-agent subscriptions spawned
     * by this tool, so cancelling the parent task cascades to its children.
     */
    public static final String CHILD_SUBSCRIPTIONS_KEY = "__child_subscriptions";

    private static final String DEFAULT_SUB_AGENT_PROMPT = "你是一个子任务执行 agent。专注完成交给你的单个任务，直接使用可用的工具完成检索、分析或处理，"
            + "不要向用户提问。完成后用最后一条消息输出简洁、自包含的结果报告（含关键事实与引用），"
            + "它将原样返回给上级 agent。";

    private final ObjectProvider<AgentEngine> engineProvider;
    private final AgentEventBus eventBus;
    private final AgentProperties properties;
    private final ObjectProvider<CustomAgentResolver> resolverProvider;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public DelegateTaskTool(ObjectProvider<AgentEngine> engineProvider,
            AgentEventBus eventBus,
            AgentProperties properties,
            ObjectProvider<CustomAgentResolver> resolverProvider) {
        this.engineProvider = engineProvider;
        this.eventBus = eventBus;
        this.properties = properties;
        this.resolverProvider = resolverProvider;
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

    @Override
    public ToolResult execute(ToolContext context, String args) {
        AgentEngine engine = engineProvider.getIfAvailable();
        if (engine == null) {
            return ToolResult.error("Delegation is not available: agent engine not initialized.");
        }

        // Parse arguments
        String description;
        String expectedOutput;
        String agentName;
        try {
            JsonNode node = objectMapper.readTree(args != null ? args : "{}");
            description = node.path("description").asText(null);
            expectedOutput = node.path("expected_output").asText(null);
            agentName = node.path("agent_name").asText(null);
        } catch (Exception e) {
            return ToolResult.error("Invalid arguments: " + e.getMessage());
        }
        if (description == null || description.isBlank()) {
            return ToolResult.error("Missing required argument: description");
        }

        // Depth guard against runaway recursive delegation
        int parentDepth = readDepth(context);
        int maxDepth = properties.getEngine().getMaxDelegateDepth();
        if (parentDepth >= maxDepth) {
            return ToolResult.error("Delegation rejected: max delegate depth (" + maxDepth
                    + ") reached. Complete the task directly instead.");
        }

        // Optional custom agent assembly
        CustomAgentResolver.CustomAgentSpec spec = null;
        if (agentName != null && !agentName.isBlank()) {
            CustomAgentResolver resolver = resolverProvider.getIfAvailable();
            if (resolver == null) {
                return ToolResult.error("Custom agents are not available; call without agent_name.");
            }
            Optional<CustomAgentResolver.CustomAgentSpec> resolved = resolver.resolve(agentName.trim(),
                    context.getTenantId());
            if (!resolved.isPresent()) {
                String available = resolver.listAvailable(context.getTenantId()).stream()
                        .map(s -> s.getName() + (s.getDescription() != null
                                ? "（" + s.getDescription() + "）"
                                : ""))
                        .collect(Collectors.joining("; "));
                return ToolResult.error("Custom agent '" + agentName + "' not found. Available: "
                        + (available.isEmpty() ? "(none)" : available));
            }
            spec = resolved.get();
        }

        AgentSession child = buildChildSession(context, description, expectedOutput, spec, parentDepth);
        String parentSessionId = context.getSessionId();
        String childName = spec != null ? spec.getName() : "sub-agent";
        int childDepth = parentDepth + 1;

        eventBus.publish(new DelegationEvent.SubAgentSpawned(
                parentSessionId, child.getSessionId(),
                context.getAgentId() != null ? context.getAgentId() : parentSessionId,
                childDepth, childName, description));

        long startMs = System.currentTimeMillis();
        String parentAgentId = context.getAgentId() != null ? context.getAgentId() : parentSessionId;

        // Subscribe the child engine on the current (boundedElastic) thread and
        // wait via a latch instead of blockLast(), so the subscription can be
        // registered with the parent session for cooperative cancellation: when
        // the parent task is cancelled, AgentJobService disposes every child
        // subscription and this wait wakes up immediately.
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<Throwable> childError = new AtomicReference<>();
        AtomicBoolean cancelled = new AtomicBoolean(false);
        Disposable childSub = engine.run(child)
                .doOnNext(event -> {
                    if (event instanceof StateEvent.StateTransition) {
                        eventBus.publish(new DelegationEvent.SubAgentProgress(
                                parentSessionId, child.getSessionId(),
                                parentAgentId, childDepth,
                                child.getExecution().getIteration(), "running"));
                    } else if (event instanceof ThinkingEvent.ThinkDelta) {
                        // Republish the child's streamed tokens under the PARENT
                        // session id so the frontend sub-agent tree renders live
                        // per-node output (agent.output / agent.reasoning).
                        ThinkingEvent.ThinkDelta delta = (ThinkingEvent.ThinkDelta) event;
                        String content = delta.getContent();
                        if (content != null && !content.isEmpty()) {
                            if (delta.getDeltaType() == ThinkingEvent.ThinkDelta.DeltaType.TEXT) {
                                eventBus.publish(new DelegationEvent.SubAgentOutput(
                                        parentSessionId, child.getSessionId(), parentAgentId,
                                        childDepth, content));
                            } else if (delta.getDeltaType() == ThinkingEvent.ThinkDelta.DeltaType.REASONING) {
                                eventBus.publish(new DelegationEvent.SubAgentReasoning(
                                        parentSessionId, child.getSessionId(), parentAgentId,
                                        childDepth, content));
                            }
                        }
                    }
                })
                .doOnCancel(() -> cancelled.set(true))
                .doOnError(childError::set)
                .doFinally(sig -> latch.countDown())
                .subscribe();
        registerChildSubscription(context, childSub);

        try {
            boolean finished = latch.await(properties.getEngine().getDelegateTimeoutSeconds(),
                    TimeUnit.SECONDS);
            if (!finished) {
                childSub.dispose();
                long duration = System.currentTimeMillis() - startMs;
                log.warn("delegate_task: sub-agent {} timed out after {}ms",
                        child.getSessionId(), duration);
                eventBus.publish(new DelegationEvent.SubAgentCompleted(
                        parentSessionId, child.getSessionId(), parentAgentId,
                        childDepth, "timeout", duration, false));
                return ToolResult.error("Sub-agent timed out after "
                        + properties.getEngine().getDelegateTimeoutSeconds() + "s");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            childSub.dispose();
            return ToolResult.error("Sub-agent interrupted");
        } finally {
            unregisterChildSubscription(context, childSub);
        }

        if (cancelled.get()) {
            long duration = System.currentTimeMillis() - startMs;
            eventBus.publish(new DelegationEvent.SubAgentCompleted(
                    parentSessionId, child.getSessionId(), parentAgentId,
                    childDepth, "cancelled", duration, false));
            return ToolResult.error("Sub-agent cancelled (parent task stopped)");
        }

        Throwable err = childError.get();
        if (err != null) {
            long duration = System.currentTimeMillis() - startMs;
            log.warn("delegate_task: sub-agent {} failed after {}ms: {}",
                    child.getSessionId(), duration, err.getMessage());
            eventBus.publish(new DelegationEvent.SubAgentCompleted(
                    parentSessionId, child.getSessionId(), parentAgentId,
                    childDepth, err.getMessage(), duration, false));
            return ToolResult.error("Sub-agent failed: " + err.getMessage());
        }

        long duration = System.currentTimeMillis() - startMs;
        String result = extractResult(child);
        AgentState finalState = child.getCurrentState();
        boolean success = finalState == AgentState.DONE;

        eventBus.publish(new DelegationEvent.SubAgentCompleted(
                parentSessionId, child.getSessionId(), parentAgentId,
                childDepth, result, duration, success));

        log.info("delegate_task: sub-agent {} finished state={} iterations={} in {}ms",
                child.getSessionId(), finalState,
                child.getExecution().getIteration(), duration);

        if (result.isEmpty()) {
            return ToolResult.error("Sub-agent finished (state=" + finalState
                    + ") but produced no result message.");
        }
        String report = "[子 agent " + childName + " · " + child.getExecution().getIteration()
                + " 轮迭代" + (success ? "" : " · 状态 " + finalState) + "]\n" + result;
        return ToolResult.success(report);
    }

    /** Register a live child-engine subscription with the parent session. */
    @SuppressWarnings("unchecked")
    private void registerChildSubscription(ToolContext context, Disposable d) {
        Map<String, Object> meta = context.getSessionMetadata();
        if (meta == null) {
            return;
        }
        synchronized (meta) {
            List<Disposable> subs = (List<Disposable>) meta.computeIfAbsent(
                    CHILD_SUBSCRIPTIONS_KEY,
                    k -> Collections.synchronizedList(new ArrayList<Disposable>()));
            subs.add(d);
        }
    }

    private void unregisterChildSubscription(ToolContext context, Disposable d) {
        Map<String, Object> meta = context.getSessionMetadata();
        if (meta == null) {
            return;
        }
        Object subs = meta.get(CHILD_SUBSCRIPTIONS_KEY);
        if (subs instanceof List) {
            ((List<?>) subs).remove(d);
        }
    }

    // ---- Internals ----

    private int readDepth(ToolContext context) {
        Map<String, Object> metadata = context.getSessionMetadata();
        if (metadata == null) {
            return 0;
        }
        Object depth = metadata.get(DELEGATE_DEPTH_KEY);
        return depth instanceof Number ? ((Number) depth).intValue() : 0;
    }

    /**
     * Build the isolated child session. No frontend tools, own iteration
     * budget, incremented delegate depth. When a custom agent spec is given,
     * its prompt/model/tool set/budget take precedence.
     */
    private AgentSession buildChildSession(ToolContext context, String description,
            String expectedOutput,
            CustomAgentResolver.CustomAgentSpec spec,
            int parentDepth) {
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

        Map<String, Object> metadata = new HashMap<>();
        metadata.put(DELEGATE_DEPTH_KEY, parentDepth + 1);

        AgentSession child = AgentSession.builder()
                .sessionId(UUID.randomUUID().toString())
                .conversationId(context.getConversationId())
                .identity(identity)
                .mode(AgentMode.EXECUTE)
                .maxIterations(maxIterations)
                .modelName(modelName)
                .systemPrompt(systemPrompt)
                .toolIds(spec != null ? spec.getToolIds() : null)
                .metadata(metadata)
                .build();

        StringBuilder task = new StringBuilder(description.trim());
        if (expectedOutput != null && !expectedOutput.isBlank()) {
            task.append("\n\n期望产出：").append(expectedOutput.trim());
        }
        child.getExecution().addMessage(ConversationMessage.user(task.toString()));
        return child;
    }

    /**
     * Extract the sub-agent's final report (last assistant message content).
     */
    private String extractResult(AgentSession child) {
        List<ConversationMessage> messages = child.getExecution().getMessages();
        for (int i = messages.size() - 1; i >= 0; i--) {
            ConversationMessage msg = messages.get(i);
            if ("assistant".equals(msg.getRole())
                    && msg.getContent() != null && !msg.getContent().isBlank()) {
                return msg.getContent();
            }
        }
        return "";
    }
}
