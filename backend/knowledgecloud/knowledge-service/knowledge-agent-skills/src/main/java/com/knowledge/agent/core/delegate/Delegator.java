package com.knowledge.agent.core.delegate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.DelegationRecord;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentRunEntity;
import com.knowledge.agent.core.event.EventSubscription;
import com.knowledge.agent.core.mapper.AgentRunMapper;
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
import java.util.Locale;
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
    private final AgentRunMapper runMapper;

    public Delegator(ObjectProvider<DefaultRunSupervisor> supervisorProvider, RunEventLog eventLog,
                     ObjectMapper objectMapper, AgentCoreProperties properties,
                     AgentRunMapper runMapper) {
        this.supervisorProvider = supervisorProvider;
        this.eventLog = eventLog;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.runMapper = runMapper;
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
        int maxChildren = properties.getRun().getMaxChildrenPerRun();
        if (maxChildren > 0 && runMapper != null && ctx.getRunId() != null) {
            List<AgentRunEntity> existing = runMapper.selectByParentRunId(ctx.getRunId());
            long active = existing == null ? 0 : existing.stream().filter(child -> {
                try {
                    return com.knowledge.agent.core.run.RunStatus.valueOf(child.getStatus()).isActive();
                } catch (Exception e) {
                    return false;
                }
            }).count();
            if (active >= maxChildren) {
                throw new IllegalArgumentException("单个 run 的并发子 agent 数量已达上限 (" + maxChildren + ")");
            }
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
        cmd.setNoTools(ctx.isNoTools());
        // Freeze the parent's creation context onto the child so it does not
        // lose the editor rules / skill fragments / memory / sampling settings.
        cmd.setSystemPrompt(ctx.getSystemPrompt());
        cmd.setSkillFragments(ctx.getSkillFragments() != null
                ? new ArrayList<>(ctx.getSkillFragments()) : new ArrayList<>());
        cmd.setMemoryLines(ctx.getMemoryLines() != null
                ? new ArrayList<>(ctx.getMemoryLines()) : new ArrayList<>());
        cmd.setSavedSkillProvenance(ctx.getSavedSkillProvenance() != null
                ? new ArrayList<>(ctx.getSavedSkillProvenance()) : new ArrayList<>());
        cmd.setTemperature(ctx.getTemperature());
        cmd.setMaxTokens(ctx.getMaxTokens());
        cmd.setMaxSteps(args.get("maxSteps") != null ? intArg(args.get("maxSteps"), "maxSteps") : null);

        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.builder().role("user").content(task).build());
        cmd.setMessages(messages);
        cmd.setTools(selectTools(ctx.getClientTools(), args.get("tools")));
        // Deferred tools stay deferred in the child: same subsetting, same laziness.
        cmd.setSkillTools(selectTools(ctx.getDeferredTools(), args.get("tools")));

        RunView child = supervisor().createChild(cmd, ctx.getRunId(), ctx.getDelegateDepth() + 1);

        eventLog.append(ctx.getRunId(), RunEvents.SUB_SPAWNED,
                RunEvents.subSpawned(call.getId(), child.getRunId(), task));

        int timeoutSec = args.get("timeoutSec") != null
                ? intArg(args.get("timeoutSec"), "timeoutSec")
                : properties.getRun().getDelegateTimeoutSeconds();
        if (timeoutSec <= 0) {
            timeoutSec = properties.getRun().getDelegateTimeoutSeconds();
        }

        Delegation delegation = new Delegation();
        delegation.setCallId(call.getId());
        delegation.setSubRunId(child.getRunId());
        delegation.setTask(task);
        delegation.setSpawnedAt(System.currentTimeMillis());
        delegation.setTimeoutMs(timeoutSec * 1000L);
        delegation.setSubscription(eventLog.subscribe(child.getRunId()));
        return delegation;
    }

    /**
     * Rebuild a delegation after a crash (re-subscribe to the child log).
     * Preserves the original spawn time so recovery does not grant the child a
     * fresh timeout.
     */
    public Delegation attach(String parentRunId, DelegationRecord record) {
        Delegation delegation = new Delegation();
        delegation.setCallId(record.getCallId());
        delegation.setSubRunId(record.getSubRunId());
        delegation.setTask(record.getTask());
        delegation.setSpawnedAt(record.getSpawnedAt() > 0
                ? record.getSpawnedAt() : System.currentTimeMillis());
        delegation.setTimeoutMs(properties.getRun().getDelegateTimeoutSeconds() * 1000L);
        delegation.setSubscription(eventLog.subscribe(record.getSubRunId()));
        return delegation;
    }

    private int intArg(Object value, String name) {
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        if (value instanceof String) {
            try {
                return Integer.parseInt(((String) value).trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("delegate 的 " + name + " 必须是整数");
            }
        }
        throw new IllegalArgumentException("delegate 的 " + name + " 必须是整数");
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
        // Tool names are matched case-insensitively: a model that writes
        // "getGithubRepoTree" for the registered "getGitHubRepoTree" must not
        // silently strip the child's tools.
        Set<String> wanted = new HashSet<>();
        if (toolsArg instanceof List) {
            for (Object item : (List<?>) toolsArg) {
                String name = String.valueOf(item).trim();
                if (!name.isEmpty()) {
                    wanted.add(name.toLowerCase(Locale.ROOT));
                }
            }
        } else {
            String name = String.valueOf(toolsArg).trim();
            if (!name.isEmpty()) {
                wanted.add(name.toLowerCase());
            }
        }
        if (wanted.isEmpty()) {
            return new ArrayList<>(clientTools);
        }
        List<ToolSpec> selected = new ArrayList<>();
        for (ToolSpec spec : clientTools) {
            if (spec.getName() != null && wanted.contains(spec.getName().toLowerCase(Locale.ROOT))) {
                selected.add(spec);
            }
        }
        if (selected.isEmpty()) {
            // Nothing matched: honoring that literally would leave the child with
            // no client tools at all, so every call it makes fails as
            // TOOL_NOT_FOUND until the delegation times out. Keep the child
            // capable and make the mismatch visible instead.
            log.warn("delegate tools 选择未命中任何前端工具 {}，回退为全部前端工具", wanted);
            return new ArrayList<>(clientTools);
        }
        return selected;
    }
}
