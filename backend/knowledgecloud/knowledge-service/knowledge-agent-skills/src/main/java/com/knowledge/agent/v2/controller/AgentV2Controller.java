package com.knowledge.agent.v2.controller;

import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.AgentEventSerializer;
import com.knowledge.agent.v2.event.LifecycleEvent;
import com.knowledge.agent.v2.job.AgentJob;
import com.knowledge.agent.v2.job.AgentJobService;
import com.knowledge.agent.v2.job.ResumeApplier;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Legacy synchronous chat endpoints, now delegated to the durable task model.
 *
 * <p>{@code POST /api/v2/agent/chat} creates an async task and streams its
 * event log (replay + live); {@code POST /api/v2/agent/chat/resume} resolves
 * the task by sessionId and resumes it. Both now inherit everything the task
 * API provides — durable event log, checkpoints, reconnect, quotas, ownership
 * checks and keepalive — instead of the old request-scoped SSE implementation.
 */
@Api(tags = "Agent V2 (Legacy Sync)")
@Slf4j
@RestController
@RequestMapping("/api/v2/agent")
@RequiredArgsConstructor
public class AgentV2Controller {

    private final AgentJobService jobService;

    /** Transport keepalive cadence (seconds). */
    private static final long KEEPALIVE_SECONDS = 15;

    @ApiOperation("V2 Agent Chat (delegated to the task model)")
    @PostMapping("/chat")
    public SseEmitter chat(@RequestBody ChatCompletionRequest request) {
        AgentIdentity identity = extractIdentity(request);
        AgentJob job;
        try {
            job = jobService.create(request, identity);
        } catch (IllegalArgumentException e) {
            return errorEmitter("INVALID_REQUEST", e.getMessage());
        }
        log.info("V2 chat (task): taskId={}, sessionId={}, model={}, messages={}",
                job.getTaskId(), job.getSessionId(), job.getConversationId(),
                request.getMessages() != null ? request.getMessages().size() : 0);
        return streamToEmitter(job.getTaskId(), jobService.streamEvents(job.getTaskId(), 0));
    }

    @ApiOperation("Resume suspended session with tool results (delegated to the task model)")
    @PostMapping("/chat/resume")
    public SseEmitter resume(@RequestBody ResumeRequest request) {
        String taskId = jobService.findTaskIdBySession(request.getSessionId());
        if (taskId == null) {
            return errorEmitter("SESSION_NOT_FOUND",
                    "Session " + request.getSessionId() + " not found or not suspended");
        }
        AgentJob job = jobService.status(taskId);
        if (job == null || !ownedByCurrentUser(job)) {
            return errorEmitter("FORBIDDEN", "Session not accessible");
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
        log.info("V2 resume (task): taskId={}, action={}, toolResults={}, decision={}",
                taskId, request.getAction(),
                request.getToolResults() != null ? request.getToolResults().size() : 0,
                request.getDecision());
        ResumeApplier.PlanDecision planDecision = null;
        if (request.getDecision() != null || request.getPlanId() != null) {
            planDecision = new ResumeApplier.PlanDecision();
            planDecision.planId = request.getPlanId();
            planDecision.decision = request.getDecision();
            planDecision.planJson = request.getPlanJson();
            planDecision.feedback = request.getFeedback();
        }
        return streamToEmitter(taskId, jobService.resume(taskId, results, request.getAction(),
                planDecision));
    }

    // ---- SSE plumbing (keepalive + shared serializer) ----

    private SseEmitter streamToEmitter(String taskId,
            reactor.core.publisher.Flux<AgentJobService.TaskEvent> flux) {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicReference<Disposable> ref = new AtomicReference<>();
        AtomicReference<Disposable> keepaliveRef = new AtomicReference<>();

        Runnable cleanup = () -> {
            dispose(ref);
            dispose(keepaliveRef);
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());

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
                error -> {
                    try {
                        Map<String, Object> payload = new LinkedHashMap<>();
                        payload.put("sessionId", taskId);
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
                },
                () -> {
                    try {
                        emitter.complete();
                    } catch (Exception ignored) {
                    }
                });
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

    private SseEmitter errorEmitter(String code, String message) {
        SseEmitter emitter = new SseEmitter(0L);
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("errorCode", code);
            payload.put("errorMessage", message);
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

    private void dispose(AtomicReference<Disposable> ref) {
        Disposable sub = ref.get();
        if (sub != null && !sub.isDisposed()) {
            sub.dispose();
        }
    }

    // ---- Identity / ownership ----

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

    private boolean ownedByCurrentUser(AgentJob job) {
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseLong(SecurityContextUtil.getTenantId());
        if (tenantId != null && job.getTenantId() != null && !tenantId.equals(job.getTenantId())) {
            return false;
        }
        return userId == null || job.getUserId() == null || userId.equals(job.getUserId());
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

    /** Request body for the /chat/resume endpoint. */
    @Data
    public static class ResumeRequest {
        private String sessionId;
        private List<ToolResultPayload> toolResults;
        /** "continue" = budget-exhaustion resume (no tool results). */
        private String action;
        /** Plan-approval decision fields (plan mode resume). */
        private String planId;
        private String decision;
        private String planJson;
        private String feedback;
    }

    /** A single tool execution result from the frontend. */
    @Data
    public static class ToolResultPayload {
        private String toolCallId;
        private String toolName;
        private String result;
        private boolean success;
    }
}
