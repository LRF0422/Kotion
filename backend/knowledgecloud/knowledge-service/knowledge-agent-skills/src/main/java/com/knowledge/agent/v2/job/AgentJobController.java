package com.knowledge.agent.v2.job;

import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.DelegationEvent;
import com.knowledge.agent.v2.event.LifecycleEvent;
import com.knowledge.agent.v2.event.ThinkingEvent;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Async long-running agent task API.
 *
 * <p>Replaces the "one request = one SSE stream" model with a job model:
 * <ul>
 *   <li>{@code POST /api/v2/agent/tasks} — create + start a job, returns its id</li>
 *   <li>{@code GET  /api/v2/agent/tasks/{id}} — poll status</li>
 *   <li>{@code GET  /api/v2/agent/tasks/{id}/state} — reconnect state (text + seq + pending tools)</li>
 *   <li>{@code GET  /api/v2/agent/tasks/{id}/events?afterSeq=N} — replay + live SSE (only seq > N)</li>
 *   <li>{@code POST /api/v2/agent/tasks/{id}/resume} — submit frontend tool results</li>
 *   <li>{@code POST /api/v2/agent/tasks/{id}/cancel} — cancel</li>
 * </ul>
 */
@Api(tags = "Agent V2 Tasks")
@Slf4j
@RestController
@RequestMapping("/api/v2/agent/tasks")
@RequiredArgsConstructor
public class AgentJobController {

    private final AgentJobService jobService;

    @ApiOperation("Create and start an async agent task")
    @PostMapping
    public R<JobView> create(@RequestBody ChatCompletionRequest request) {
        AgentIdentity identity = extractIdentity(request);
        AgentJob job = jobService.create(request, identity);
        return R.data(toView(job));
    }

    @ApiOperation("Get task status")
    @GetMapping("/{taskId}")
    public R<JobView> status(@PathVariable String taskId) {
        AgentJob job = jobService.status(taskId);
        if (job == null) {
            return R.fail("Task not found: " + taskId);
        }
        return R.data(toView(job));
    }

    @ApiOperation("Get task reconnect state (status + accumulated text + last seq + pending tools)")
    @GetMapping("/{taskId}/state")
    public R<StateView> state(@PathVariable String taskId) {
        AgentJobService.TaskState state = jobService.state(taskId);
        if (state == null) {
            return R.fail("Task not found: " + taskId);
        }
        return R.data(toStateView(state));
    }

    @ApiOperation("Stream task events (replay + live, optionally after a seq checkpoint)")
    @GetMapping(value = "/{taskId}/events")
    public SseEmitter events(@PathVariable String taskId,
            @RequestParam(defaultValue = "0") long afterSeq) {
        return streamToEmitter(taskId, jobService.streamEvents(taskId, afterSeq));
    }

    @ApiOperation("Resume a paused task with frontend tool results")
    @PostMapping(value = "/{taskId}/resume")
    public SseEmitter resume(@PathVariable String taskId, @RequestBody ResumeRequest request) {
        List<AgentJobService.ToolResult> results = new ArrayList<>();
        if (request.getToolResults() != null) {
            for (ToolResultPayload tr : request.getToolResults()) {
                AgentJobService.ToolResult r = new AgentJobService.ToolResult();
                r.toolCallId = tr.getToolCallId();
                r.toolName = tr.getToolName();
                r.result = tr.getResult();
                r.success = tr.isSuccess();
                results.add(r);
            }
        }
        return streamToEmitter(taskId, jobService.resume(taskId, results, request.getAction()));
    }

    @ApiOperation("Cancel a task")
    @PostMapping("/{taskId}/cancel")
    public R<Void> cancel(@PathVariable String taskId) {
        boolean cancelled = jobService.cancel(taskId);
        return cancelled ? R.data(null) : R.fail("Task not found or not cancellable: " + taskId);
    }

    // ---- SSE plumbing ----

    private SseEmitter streamToEmitter(String taskId,
            reactor.core.publisher.Flux<AgentJobService.TaskEvent> flux) {
        SseEmitter emitter = new SseEmitter(0L); // no timeout — long tasks
        AtomicReference<Disposable> ref = new AtomicReference<>();

        emitter.onCompletion(() -> dispose(ref));
        emitter.onTimeout(() -> dispose(ref));
        emitter.onError(e -> dispose(ref));

        Disposable sub = flux.subscribe(
                te -> sendEvent(emitter, te, taskId),
                error -> sendError(emitter, error, taskId),
                () -> complete(emitter));
        ref.set(sub);
        return emitter;
    }

    private void sendEvent(SseEmitter emitter, AgentJobService.TaskEvent te, String taskId) {
        try {
            AgentEvent event = te.event;
            Map<String, Object> payload = eventToPayload(event, taskId);
            payload.put("seq", te.seq);
            if (payload != null) {
                emitter.send(SseEmitter.event()
                        .id(String.valueOf(te.seq))
                        .name(event.type())
                        .data(payload, MediaType.APPLICATION_JSON));
            }
            if (event instanceof LifecycleEvent.SessionCompleted
                    || event instanceof LifecycleEvent.SessionFailed) {
                emitter.send(SseEmitter.event().data("[DONE]"));
                emitter.complete();
            }
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private void sendError(SseEmitter emitter, Throwable error, String taskId) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("taskId", taskId);
            payload.put("errorCode", "INTERNAL");
            payload.put("errorMessage", error.getMessage());
            emitter.send(SseEmitter.event()
                    .name("session.failed")
                    .data(payload, MediaType.APPLICATION_JSON));
            emitter.send(SseEmitter.event().data("[DONE]"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private void complete(SseEmitter emitter) {
        try {
            emitter.complete();
        } catch (Exception ignored) {
        }
    }

    private void dispose(AtomicReference<Disposable> ref) {
        Disposable sub = ref.get();
        if (sub != null && !sub.isDisposed()) {
            sub.dispose();
        }
    }

    // ---- Event serialization ----

    private Map<String, Object> eventToPayload(AgentEvent event, String taskId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", taskId);
        payload.put("sessionId", event.getSessionId());
        payload.put("timestamp", event.getTimestamp());

        if (event instanceof LifecycleEvent.SessionCreated) {
            LifecycleEvent.SessionCreated e = (LifecycleEvent.SessionCreated) event;
            payload.put("conversationId", e.getConversationId());
            payload.put("traceId", e.getTraceId());
        } else if (event instanceof LifecycleEvent.SessionCompleted) {
            LifecycleEvent.SessionCompleted e = (LifecycleEvent.SessionCompleted) event;
            payload.put("finishReason", e.getFinishReason());
            Map<String, Object> usage = new LinkedHashMap<>();
            usage.put("prompt", e.getPromptTokens());
            usage.put("completion", e.getCompletionTokens());
            payload.put("usage", usage);
            payload.put("durationMs", e.getDurationMs());
        } else if (event instanceof LifecycleEvent.SessionFailed) {
            LifecycleEvent.SessionFailed e = (LifecycleEvent.SessionFailed) event;
            payload.put("errorCode", e.getErrorCode());
            payload.put("errorMessage", e.getErrorMessage());
            payload.put("retriable", e.isRetriable());
        } else if (event instanceof ThinkingEvent.ThinkStart) {
            payload.put("iteration", ((ThinkingEvent.ThinkStart) event).getIteration());
        } else if (event instanceof ThinkingEvent.ThinkDelta) {
            ThinkingEvent.ThinkDelta e = (ThinkingEvent.ThinkDelta) event;
            payload.put("type", e.getDeltaType().name().toLowerCase());
            payload.put("content", e.getContent());
        } else if (event instanceof ThinkingEvent.ThinkEnd) {
            ThinkingEvent.ThinkEnd e = (ThinkingEvent.ThinkEnd) event;
            payload.put("iteration", e.getIteration());
            payload.put("finishReason", e.getFinishReason());
        } else if (event instanceof ToolEvent.ToolDispatched) {
            ToolEvent.ToolDispatched e = (ToolEvent.ToolDispatched) event;
            payload.put("toolCallId", e.getToolCallId());
            payload.put("toolName", e.getToolName());
            payload.put("arguments", e.getArguments());
            payload.put("location", e.getLocation().name());
        } else if (event instanceof ToolEvent.ToolCompleted) {
            ToolEvent.ToolCompleted e = (ToolEvent.ToolCompleted) event;
            payload.put("toolCallId", e.getToolCallId());
            payload.put("toolName", e.getToolName());
            payload.put("result", e.getResult());
            payload.put("durationMs", e.getDurationMs());
        } else if (event instanceof ToolEvent.ToolFailed) {
            ToolEvent.ToolFailed e = (ToolEvent.ToolFailed) event;
            payload.put("toolCallId", e.getToolCallId());
            payload.put("toolName", e.getToolName());
            payload.put("errorCode", e.getErrorCode());
            payload.put("errorMessage", e.getErrorMessage());
        } else if (event instanceof DelegationEvent) {
            DelegationEvent d = (DelegationEvent) event;
            payload.put("agentId", d.getAgentId());
            payload.put("parentAgentId", d.getParentAgentId());
            payload.put("depth", d.getDepth());
            if (event instanceof DelegationEvent.SubAgentSpawned) {
                DelegationEvent.SubAgentSpawned e = (DelegationEvent.SubAgentSpawned) event;
                payload.put("agentName", e.getAgentName());
                payload.put("taskDescription", e.getTaskDescription());
            } else if (event instanceof DelegationEvent.SubAgentProgress) {
                DelegationEvent.SubAgentProgress e = (DelegationEvent.SubAgentProgress) event;
                payload.put("iteration", e.getIteration());
                payload.put("status", e.getStatus());
            } else if (event instanceof DelegationEvent.SubAgentCompleted) {
                DelegationEvent.SubAgentCompleted e = (DelegationEvent.SubAgentCompleted) event;
                payload.put("result", e.getResult());
                payload.put("durationMs", e.getDurationMs());
                payload.put("success", e.isSuccess());
            }
        } else {
            payload.put("eventType", event.type());
        }
        return payload;
    }

    // ---- Identity ----

    private AgentIdentity extractIdentity(ChatCompletionRequest request) {
        Long userId = request.getUserId();
        if (userId == null || userId == -1L) {
            userId = SecurityContextUtil.getUserId();
        }
        return AgentIdentity.builder()
                .userId(userId)
                .tenantId(parseLong(SecurityContextUtil.getTenantId()))
                .userName(SecurityContextUtil.getUserName())
                .account(SecurityContextUtil.getUserAccount())
                .roleName(SecurityContextUtil.getUserRole())
                .token(SecurityContextUtil.getToken())
                .build();
    }

    private Long parseLong(String val) {
        if (val == null || val.isEmpty()) {
            return null;
        }
        try {
            return Long.parseLong(val);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ---- DTOs ----

    private JobView toView(AgentJob job) {
        JobView view = new JobView();
        view.setTaskId(job.getTaskId());
        view.setSessionId(job.getSessionId());
        view.setConversationId(job.getConversationId());
        view.setStatus(job.getStatus().name());
        view.setFinishReason(job.getFinishReason());
        view.setErrorMessage(job.getErrorMessage());
        view.setPromptTokens(job.getPromptTokens());
        view.setCompletionTokens(job.getCompletionTokens());
        view.setCreatedAt(job.getCreatedAt());
        view.setUpdatedAt(job.getUpdatedAt());
        return view;
    }

    private StateView toStateView(AgentJobService.TaskState state) {
        StateView view = new StateView();
        view.setTaskId(state.taskId);
        view.setSessionId(state.sessionId);
        view.setConversationId(state.conversationId);
        view.setStatus(state.status);
        view.setFinishReason(state.finishReason);
        view.setErrorMessage(state.errorMessage);
        view.setPromptTokens(state.promptTokens);
        view.setCompletionTokens(state.completionTokens);
        view.setAssistantText(state.assistantText);
        view.setLastSeq(state.lastSeq);
        List<PendingToolView> tools = new ArrayList<>();
        for (AgentJobService.PendingTool pt : state.pendingTools) {
            PendingToolView v = new PendingToolView();
            v.setToolCallId(pt.toolCallId);
            v.setToolName(pt.toolName);
            v.setArguments(pt.arguments);
            tools.add(v);
        }
        view.setPendingTools(tools);
        return view;
    }

    @Data
    public static class JobView {
        private String taskId;
        private String sessionId;
        private String conversationId;
        private String status;
        private String finishReason;
        private String errorMessage;
        private int promptTokens;
        private int completionTokens;
        private long createdAt;
        private long updatedAt;
    }

    @Data
    public static class StateView {
        private String taskId;
        private String sessionId;
        private String conversationId;
        private String status;
        private String finishReason;
        private String errorMessage;
        private int promptTokens;
        private int completionTokens;
        private String assistantText;
        private long lastSeq;
        private List<PendingToolView> pendingTools;
    }

    @Data
    public static class PendingToolView {
        private String toolCallId;
        private String toolName;
        private String arguments;
    }

    @Data
    public static class ResumeRequest {
        private List<ToolResultPayload> toolResults;
        private String action;
    }

    @Data
    public static class ToolResultPayload {
        private String toolCallId;
        private String toolName;
        private String result;
        private boolean success;
    }
}
