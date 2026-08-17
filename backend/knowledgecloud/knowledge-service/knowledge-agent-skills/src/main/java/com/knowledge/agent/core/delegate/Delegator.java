package com.knowledge.agent.core.delegate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.event.EventSubscription;
import com.knowledge.agent.core.event.RunEvent;
import com.knowledge.agent.core.event.RunEventLog;
import com.knowledge.agent.core.event.RunEvents;
import com.knowledge.agent.core.llm.ToolCallRequest;
import com.knowledge.agent.core.loop.ResumePayload;
import com.knowledge.agent.core.run.RunView;
import com.knowledge.agent.core.supervisor.CreateRunCommand;
import com.knowledge.agent.core.supervisor.DefaultRunSupervisor;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolSpec;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Sub-agent delegator — creates child runs through the supervisor, streams
 * their lifecycle into the PARENT event log (sub.spawned / sub.completed /
 * sub.failed) and routes frontend tool results back to the right child.
 *
 * <p>Children are ordinary runs (parent linkage, own checkpoint/budget/event
 * log); the parent loop drives them to completion inside its step.
 */
@Slf4j
@Component
public class Delegator {

    /** Lazy supervisor access — breaks the Delegator ↔ Supervisor cycle. */
    private final ObjectProvider<DefaultRunSupervisor> supervisorProvider;
    private final RunEventLog eventLog;
    private final ObjectMapper objectMapper;
    private final AgentCoreProperties properties;

    public Delegator(ObjectProvider<DefaultRunSupervisor> supervisorProvider, RunEventLog eventLog,
                     ObjectMapper objectMapper, AgentCoreProperties properties) {
        this.supervisorProvider = supervisorProvider;
        this.eventLog = eventLog;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    private DefaultRunSupervisor supervisor() {
        return supervisorProvider.getObject();
    }

    /**
     * Spawn a child run for one delegate tool call; emits sub.spawned on the
     * parent log and returns the live delegation (subscribed to child events).
     */
    public Delegation spawn(ToolContext ctx, ToolCallRequest call) {
        Map<String, Object> args = parseArgs(call.getArguments());
        String task = args.get("task") == null ? "" : String.valueOf(args.get("task"));
        if (task.trim().isEmpty()) {
            throw new IllegalArgumentException("delegate 的 task 不能为空");
        }
        int maxDepth = properties.getRun().getMaxDelegateDepth();
        if (ctx.getDelegateDepth() >= maxDepth) {
            throw new IllegalArgumentException("委派深度已达上限 (" + maxDepth + ")");
        }

        CreateRunCommand cmd = new CreateRunCommand();
        cmd.setConversationId(ctx.getConversationId());
        cmd.setUserId(ctx.getUserId());
        cmd.setTenantId(ctx.getTenantId());
        cmd.setToken(ctx.getToken());
        cmd.setSpaceId(ctx.getSpaceId());
        cmd.setPageId(ctx.getPageId());
        cmd.setModel(ctx.getModel());
        cmd.setMode("execute");
        cmd.setMaxSteps(args.get("maxSteps") != null
                ? ((Number) args.get("maxSteps")).intValue() : null);

        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.builder().role("user").content(task).build());
        cmd.setMessages(messages);
        cmd.setTools(selectTools(ctx.getClientTools(), args.get("tools")));

        RunView child = supervisor().createChild(cmd, ctx.getRunId(), ctx.getDelegateDepth() + 1);

        eventLog.append(ctx.getRunId(), RunEvents.SUB_SPAWNED,
                RunEvents.subSpawned(call.getId(), child.getRunId(), task));

        int timeoutSec = args.get("timeoutSec") != null
                ? ((Number) args.get("timeoutSec")).intValue()
                : properties.getRun().getDelegateTimeoutSeconds();

        Delegation delegation = new Delegation();
        delegation.setCallId(call.getId());
        delegation.setSubRunId(child.getRunId());
        delegation.setTask(task);
        delegation.setSpawnedAt(System.currentTimeMillis());
        delegation.setTimeoutMs(timeoutSec * 1000L);
        delegation.setSubscription(eventLog.subscribe(child.getRunId()));
        return delegation;
    }

    /** Rebuild a delegation after a crash (re-subscribe to the child log). */
    public Delegation attach(String parentRunId, String callId, String subRunId) {
        Delegation delegation = new Delegation();
        delegation.setCallId(callId);
        delegation.setSubRunId(subRunId);
        delegation.setTask(null);
        delegation.setSpawnedAt(System.currentTimeMillis());
        delegation.setTimeoutMs(properties.getRun().getDelegateTimeoutSeconds() * 1000L);
        delegation.setSubscription(eventLog.subscribe(subRunId));
        return delegation;
    }

    /** Route frontend tool results to a child run. */
    public void resumeChild(String subRunId, List<ResumePayload.ToolResultItem> results) {
        ResumePayload payload = new ResumePayload();
        payload.setAction("tool_results");
        payload.setToolResults(results);
        boolean accepted = supervisor().resume(subRunId, payload);
        if (!accepted) {
            log.warn("Child resume rejected for {} (owned elsewhere or recovered)", subRunId);
        }
    }

    /** Cancel one child run (delegation timeout path). */
    public void cancelChild(String subRunId) {
        supervisor().cancel(subRunId);
    }

    // ---- internals ----

    private Map<String, Object> parseArgs(String argsJson) {
        if (argsJson == null || argsJson.isEmpty()) {
            return new LinkedHashMap<>();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> args = objectMapper.readValue(argsJson, Map.class);
            return args;
        } catch (Exception e) {
            throw new IllegalArgumentException("delegate 参数解析失败: " + e.getMessage(), e);
        }
    }

    private List<ToolSpec> selectTools(List<ToolSpec> clientTools, Object toolsArg) {
        if (clientTools == null) {
            return new ArrayList<>();
        }
        if (toolsArg == null) {
            return new ArrayList<>(clientTools);
        }
        Set<String> wanted = new HashSet<>();
        if (toolsArg instanceof List) {
            for (Object item : (List<?>) toolsArg) {
                wanted.add(String.valueOf(item));
            }
        } else {
            wanted.add(String.valueOf(toolsArg));
        }
        List<ToolSpec> selected = new ArrayList<>();
        for (ToolSpec spec : clientTools) {
            if (wanted.contains(spec.getName())) {
                selected.add(spec);
            }
        }
        return selected;
    }
}
