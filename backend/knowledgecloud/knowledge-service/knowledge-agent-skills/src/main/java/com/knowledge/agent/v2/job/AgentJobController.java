package com.knowledge.agent.v2.job;

import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.AgentEventSerializer;
import com.knowledge.agent.v2.event.LifecycleEvent;
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
        try {
            AgentJob job = jobService.create(request, identity);
            return R.data(toView(job));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @ApiOperation("Get task status")
    @GetMapping("/{taskId}")
    public R<JobView> status(@PathVariable String taskId) {
        AgentJob job = requireOwnedJob(taskId);
        if (job == null) {
            return R.fail("Task not found: " + taskId);
        }
        return R.data(toView(job));
    }

    @ApiOperation("Get task reconnect state (status + accumulated text + last seq + pending tools)")
    @GetMapping("/{taskId}/state")
    public R<StateView> state(@PathVariable String taskId) {
        if (requireOwnedJob(taskId) == null) {
            return R.fail("Task not found: " + taskId);
        }
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
        if (requireOwnedJob(taskId) == null) {
            return deniedEmitter(taskId);
        }
        return streamToEmitter(taskId, jobService.streamEvents(taskId, afterSeq));
    }

    @ApiOperation("Resume a paused task with frontend tool results")
    @PostMapping(value = "/{taskId}/resume")
    public SseEmitter resume(@PathVariable String taskId, @RequestBody ResumeRequest request) {
        if (requireOwnedJob(taskId) == null) {
            return deniedEmitter(taskId);
        }
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
        return streamToEmitter(taskId, jobService.resume(taskId, results, request.getAction(),
                toPlanDecision(request)));
    }

    /** Map the plan-approval fields of the resume payload (may be null). */
    private static ResumeApplier.PlanDecision toPlanDecision(ResumeRequest request) {
        if (request.getDecision() == null && request.getPlanId() == null) {
            return null;
        }
        ResumeApplier.PlanDecision d = new ResumeApplier.PlanDecision();
        d.planId = request.getPlanId();
        d.decision = request.getDecision();
        d.planJson = request.getPlanJson();
        d.feedback = request.getFeedback();
        return d;
    }

    @ApiOperation("Cancel a task")
    @PostMapping("/{taskId}/cancel")
    public R<Void> cancel(@PathVariable String taskId) {
        if (requireOwnedJob(taskId) == null) {
            return R.fail("Task not found: " + taskId);
        }
        boolean cancelled = jobService.cancel(taskId);
        return cancelled ? R.data(null) : R.fail("Task not found or not cancellable: " + taskId);
    }

    // ---- Authorization ----

    /**
     * Load a task and verify the caller owns it. Both tenant and user must be
     * present and match — a missing security context fails closed. Returns
     * {@code null} (indistinguishable from "not found") on any mismatch so
     * task existence is not leaked across tenants/users.
     */
    private AgentJob requireOwnedJob(String taskId) {
        AgentJob job = jobService.status(taskId);
        if (job == null) {
            return null;
        }
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseLong(SecurityContextUtil.getTenantId());
        if (tenantId == null || job.getTenantId() == null
                || !tenantId.equals(job.getTenantId())) {
            log.warn("AgentJobController: tenant mismatch/missing on task {} by user {} tenant {}",
                    taskId, userId, tenantId);
            return null;
        }
        if (userId == null || job.getUserId() == null
                || !userId.equals(job.getUserId())) {
            log.warn("AgentJobController: user mismatch/missing on task {} by user {}", taskId, userId);
            return null;
        }
        return job;
    }

    /** SSE-shaped denial (session.failed + [DONE]) for unauthorized streaming. */
    private SseEmitter deniedEmitter(String taskId) {
        SseEmitter emitter = new SseEmitter(0L);
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("taskId", taskId);
            payload.put("errorCode", "FORBIDDEN");
            payload.put("errorMessage", "Task not found or not accessible: " + taskId);
            emitter.send(SseEmitter.event()
                    .name("session.failed")
                    .data(payload, MediaType.APPLICATION_JSON));
            emitter.send(SseEmitter.event().data("[DONE]"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
        return emitter;
    }

    // ---- SSE plumbing ----

    /** Transport keepalive cadence (seconds). */
    private static final long KEEPALIVE_SECONDS = 15;

    private SseEmitter streamToEmitter(String taskId,
            reactor.core.publisher.Flux<AgentJobService.TaskEvent> flux) {
        SseEmitter emitter = new SseEmitter(0L); // no timeout — long tasks
        AtomicReference<Disposable> ref = new AtomicReference<>();
        AtomicReference<Disposable> keepaliveRef = new AtomicReference<>();

        Runnable cleanup = () -> {
            dispose(ref);
            dispose(keepaliveRef);
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());

        // Heartbeat: long backend tool executions emit no events for minutes,
        // which can trip proxy/gateway idle timeouts. SSE comment frames count
        // as wire traffic and are ignored by the client parser.
        keepaliveRef.set(reactor.core.publisher.Flux
                .interval(java.time.Duration.ofSeconds(KEEPALIVE_SECONDS))
                .subscribe(tick -> {
                    try {
                        emitter.send(SseEmitter.event().comment("keepalive"));
                    } catch (Exception ignored) {
                        // emitter closed — cleanup disposes this subscription
                    }
                }));

        Disposable sub = flux.subscribe(
                te -> sendEvent(emitter, te, taskId),
                error -> sendError(emitter, error, taskId),
                () -> complete(emitter));
        ref.set(sub);
        return emitter;
    }

    private void sendEvent(SseEmitter emitter, AgentJobService.TaskEvent te, String taskId) {
        try {
            boolean terminal = false;
            if (te.event != null) {
                AgentEvent event = te.event;
                Map<String, Object> payload = AgentEventSerializer.toPayload(event, taskId);
                payload.put("seq", te.seq);
                emitter.send(SseEmitter.event()
                        .id(String.valueOf(te.seq))
                        .name(event.type())
                        .data(payload, MediaType.APPLICATION_JSON));
                terminal = event instanceof LifecycleEvent.SessionCompleted
                        || event instanceof LifecycleEvent.SessionFailed;
            } else if (te.payloadJson != null) {
                // Replayed record — the durable payload already embeds seq.
                emitter.send(SseEmitter.event()
                        .id(String.valueOf(te.seq))
                        .name(te.type)
                        .data(te.payloadJson, MediaType.APPLICATION_JSON));
                terminal = "session.completed".equals(te.type)
                        || "session.failed".equals(te.type);
            }
            if (terminal) {
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


    // ---- Identity ----

    private AgentIdentity extractIdentity(ChatCompletionRequest request) {
        // Identity is ALWAYS derived from the authenticated security context.
        // A client-supplied userId must never be able to attribute a task to
        // another user or trigger that user's profile/memory injection.
        return AgentIdentity.builder()
                .userId(SecurityContextUtil.getUserId())
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
        /** "continue" = budget-exhaustion resume (no tool results). */
        private String action;
        /** Plan-approval decision fields (plan mode resume). */
        private String planId;
        private String decision;
        private String planJson;
        private String feedback;
    }

    @Data
    public static class ToolResultPayload {
        private String toolCallId;
        private String toolName;
        private String result;
        private boolean success;
    }
}
