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
 * log) that start on their own executor. Delegation is asynchronous: the parent
 * acknowledges the spawn immediately, keeps working, and receives each child's
 * result later — as a notification or as the result of an explicit
 * {@code wait_for_children} call.
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
        // Plugin agent (hybrid delegation): it owns its persona, its tools and
        // its rules, so it must NOT inherit the KERNEL agent's system prompt or
        // skill fragments — those describe a different scope (see
        // docs/plugin-agents.md).
        //
        // Resolution order, most specific first:
        //   1. explicit systemPrompt / tools args (hand-written delegation),
        //   2. the plugin-agent directory shipped WITH the run, keyed by agentId,
        //   3. unchanged inheritance from the parent.
        //
        // (2) is the point of the directory: the model only names an agent, and
        // the plugin's own declaration supplies the prompt and the tool subset —
        // no long prompt copied into a tool argument, no tool list to mistype.
        String agentId = strArg(args.get("agentId"));
        String agentPrompt = strArg(args.get("systemPrompt"));
        Object toolsArg = args.get("tools");
        PluginAgentSpec spec = findPluginAgent(ctx.getPluginAgents(), agentId);
        if (agentId != null) {
            if (spec == null) {
                log.warn("delegate: agentId {} is not in this run's plugin-agent directory "
                        + "(run {}); falling back to caller-supplied tools/systemPrompt",
                        agentId, ctx.getRunId());
            } else {
                if (agentPrompt == null) {
                    agentPrompt = strArg(spec.getSystemPrompt());
                }
                if (!hasItems(toolsArg) && spec.getToolNames() != null && !spec.getToolNames().isEmpty()) {
                    toolsArg = spec.getToolNames();
                }
                String agentModel = strArg(spec.getModel());
                if (agentModel != null) {
                    cmd.setModel(agentModel);
                }
            }
        }
        if (agentPrompt != null) {
            cmd.setSystemPrompt(agentPrompt);
            cmd.setSkillFragments(new ArrayList<>());
        }
        if (agentId != null) {
            log.info("delegate -> plugin agent {} (parent run {}, resolved {}, tools {})",
                    agentId, ctx.getRunId(), spec != null,
                    spec == null ? "caller-supplied" : spec.getToolNames());
        }
        cmd.setMemoryLines(ctx.getMemoryLines() != null
                ? new ArrayList<>(ctx.getMemoryLines()) : new ArrayList<>());
        cmd.setSavedSkillProvenance(ctx.getSavedSkillProvenance() != null
                ? new ArrayList<>(ctx.getSavedSkillProvenance()) : new ArrayList<>());
        cmd.setTemperature(ctx.getTemperature());
        cmd.setMaxTokens(ctx.getMaxTokens());
        cmd.setMaxSteps(args.get("maxSteps") != null ? intArg(args.get("maxSteps"), "maxSteps") : null);

        // Frame the task explicitly: the child inherits the parent's editor
        // persona and tools, so the task message must read as a top-priority
        // instruction (see ContextManager#DELEGATED_SUB_AGENT_RULES) rather than
        // as just another user turn the inherited persona can reinterpret.
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.builder()
                .role("user")
                .content("【主 Agent 委派的任务】\n\n" + task)
                .build());
        cmd.setMessages(messages);
        cmd.setTools(selectTools(ctx.getClientTools(), toolsArg));
        // Deferred tools stay deferred in the child: same subsetting, same laziness.
        cmd.setSkillTools(selectTools(ctx.getDeferredTools(), toolsArg));

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

    /**
     * Look up a plugin agent by id. Matching is case-insensitive and the
     * namespace prefix is optional: a model that saw
     * `kn_plugin-main__page-ops` may reasonably write `page-ops`.
     */
    private PluginAgentSpec findPluginAgent(List<PluginAgentSpec> agents, String agentId) {
        if (agents == null || agents.isEmpty() || agentId == null) {
            return null;
        }
        String wanted = agentId.trim().toLowerCase(Locale.ROOT);
        for (PluginAgentSpec spec : agents) {
            if (spec == null || spec.getId() == null) {
                continue;
            }
            String id = spec.getId().trim().toLowerCase(Locale.ROOT);
            if (id.equals(wanted) || id.endsWith("__" + wanted)) {
                return spec;
            }
        }
        return null;
    }

    /** Whether the caller actually supplied a non-empty tools selection. */
    private boolean hasItems(Object toolsArg) {
        if (toolsArg == null) {
            return false;
        }
        if (toolsArg instanceof List) {
            for (Object item : (List<?>) toolsArg) {
                if (item != null && !String.valueOf(item).trim().isEmpty()) {
                    return true;
                }
            }
            return false;
        }
        return !String.valueOf(toolsArg).trim().isEmpty();
    }

    private String strArg(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
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
