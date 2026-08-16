package com.knowledge.agent.v3;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import cn.hutool.json.JSONObject;
import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.api.dto.ChatFunction;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.v2.event.AgentEventSerializer;
import com.knowledge.agent.v2.job.AgentJob;
import com.knowledge.agent.v2.job.AgentJobService;
import com.knowledge.agent.v2.session.AgentIdentity;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * P0/P1 V3 supervisor. Task lifecycle is owned here; the existing loop engine
 * is used underneath until AgentLoop V3 replaces it.
 */
@Component
@RequiredArgsConstructor
public class DefaultAgentTaskSupervisor implements AgentTaskSupervisor {

    private final AgentJobService jobService;
    private final ObjectMapper objectMapper;

    @Override
    public AgentTaskRecord create(CreateTaskCommand command) {
        // V3 invariant: one active task per conversation.
        jobService.cancelActiveByConversation(
                command.conversationId, command.userId, command.tenantId);

        AgentIdentity identity = AgentIdentity.builder()
                .userId(command.userId)
                .tenantId(command.tenantId)
                .token(command.token)
                .userName(command.userName)
                .account(command.account)
                .roleName(command.roleName)
                .build();

        ChatCompletionRequest request = ChatCompletionRequest.builder()
                .model(command.model)
                .messages(convert(command.messages, new TypeReference<List<ChatMessage>>() { }))
                .tools(convertTools(command.tools))
                .mode(command.mode)
                .conversationId(command.conversationId)
                .build();

        AgentJob job = jobService.create(request, identity);
        return toRecord(job);
    }

    @Override
    public AgentTaskRecord get(String taskId) {
        AgentJob job = jobService.status(taskId);
        return job == null ? null : toRecord(job);
    }

    @Override
    public TaskStateView state(String taskId) {
        AgentJobService.TaskState state = jobService.state(taskId);
        if (state == null) {
            return null;
        }
        TaskStateView view = new TaskStateView();
        view.taskId = state.taskId;
        view.sessionId = state.sessionId;
        view.conversationId = state.conversationId;
        view.status = AgentTaskStatus.valueOf(state.status);
        view.finishReason = state.finishReason;
        view.errorMessage = state.errorMessage;
        view.assistantText = state.assistantText;
        view.lastSeq = state.lastSeq;
        view.pendingTools = new ArrayList<>();
        for (AgentJobService.PendingTool pt : state.pendingTools) {
            Map<String, Object> tool = new LinkedHashMap<>();
            tool.put("toolCallId", pt.toolCallId);
            tool.put("toolName", pt.toolName);
            tool.put("arguments", pt.arguments);
            view.pendingTools.add(tool);
        }
        return view;
    }

    @Override
    public Flux<Map<String, Object>> events(String taskId, long afterSeq) {
        return jobService.streamEvents(taskId, afterSeq).map(te -> toEventMap(taskId, te));
    }

    @Override
    public Flux<Map<String, Object>> resume(String taskId, ResumeTaskCommand command) {
        List<AgentJobService.ToolResult> results = new ArrayList<>();
        if (command.toolResults != null) {
            for (Map<String, Object> tr : command.toolResults) {
                AgentJobService.ToolResult r = new AgentJobService.ToolResult();
                r.toolCallId = str(tr.get("toolCallId"));
                r.toolName = str(tr.get("toolName"));
                r.result = str(tr.get("result"));
                r.success = Boolean.TRUE.equals(tr.get("success"));
                results.add(r);
            }
        }
        com.knowledge.agent.v2.job.ResumeApplier.PlanDecision plan = null;
        if (command.decision != null || command.planId != null) {
            plan = new com.knowledge.agent.v2.job.ResumeApplier.PlanDecision();
            plan.planId = command.planId;
            plan.decision = command.decision;
            plan.planJson = command.planJson;
            plan.feedback = command.feedback;
        }
        return jobService.resume(taskId, results, command.action, plan)
                .map(te -> toEventMap(taskId, te));
    }

    @Override
    public boolean cancel(String taskId) {
        return jobService.cancel(taskId);
    }

    @Override
    public void reconcile() {
        jobService.reconcile();
    }

    private AgentTaskRecord toRecord(AgentJob job) {
        AgentTaskRecord r = new AgentTaskRecord();
        r.setTaskId(job.getTaskId());
        r.setConversationId(job.getConversationId());
        r.setSessionId(job.getSessionId());
        r.setUserId(job.getUserId());
        r.setTenantId(job.getTenantId());
        r.setStatus(AgentTaskStatus.valueOf(job.getStatus().name()));
        r.setFinishReason(job.getFinishReason());
        r.setErrorMessage(job.getErrorMessage());
        r.setLastSeq(job.getLastSeq());
        r.setAssistantText(job.getAssistantText());
        r.setCreatedAt(job.getCreatedAt());
        r.setUpdatedAt(job.getUpdatedAt());
        return r;
    }

    private Map<String, Object> toEventMap(String taskId, AgentJobService.TaskEvent te) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("seq", te.seq);
        map.put("taskId", taskId);
        map.put("type", te.event != null ? te.event.type() : te.type);
        if (te.event != null) {
            map.putAll(AgentEventSerializer.toPayload(te.event, taskId));
        } else if (te.payloadJson != null) {
            try {
                Map<String, Object> payload = objectMapper.readValue(
                        te.payloadJson, new TypeReference<Map<String, Object>>() { });
                map.putAll(payload);
            } catch (Exception e) {
                map.put("raw", te.payloadJson);
            }
        }
        return map;
    }

    @SuppressWarnings("unchecked")
    private List<ChatTool> convertTools(List<Map<String, Object>> rawTools) {
        if (rawTools == null || rawTools.isEmpty()) {
            return null;
        }
        List<ChatTool> tools = new ArrayList<>();
        for (Map<String, Object> raw : rawTools) {
            Object fnRaw = raw.get("function");
            if (!(fnRaw instanceof Map)) {
                continue;
            }
            Map<String, Object> fn = (Map<String, Object>) fnRaw;
            Object params = fn.get("parameters");
            JSONObject parameters = params instanceof Map
                    ? new JSONObject((Map<String, Object>) params)
                    : params instanceof JSONObject ? (JSONObject) params : new JSONObject();
            tools.add(ChatTool.builder()
                    .type(raw.get("type") != null ? raw.get("type").toString() : "function")
                    .function(ChatFunction.builder()
                            .name(fn.get("name") != null ? fn.get("name").toString() : null)
                            .description(fn.get("description") != null ? fn.get("description").toString() : null)
                            .parameters(parameters)
                            .build())
                    .readOnly(Boolean.TRUE.equals(raw.get("readOnly")))
                    .build());
        }
        return tools.isEmpty() ? null : tools;
    }

    private <T> T convert(Object value, TypeReference<T> type) {
        return value == null ? null : objectMapper.convertValue(value, type);
    }

    private String str(Object v) {
        return v == null ? null : v.toString();
    }
}
