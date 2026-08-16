package com.knowledge.agent.v3;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import lombok.Data;
import lombok.RequiredArgsConstructor;
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

@RestController
@RequestMapping("/api/v3/agent/tasks")
@RequiredArgsConstructor
public class AgentTaskController {

    private final AgentTaskSupervisor supervisor;
    private final ObjectMapper objectMapper;

    @PostMapping
    public R<AgentTaskRecord> create(@RequestBody CreateTaskRequest request) {
        if (request.getConversationId() == null || request.getConversationId().trim().isEmpty()) {
            return R.fail("conversationId is required");
        }
        CreateTaskCommand cmd = new CreateTaskCommand();
        cmd.conversationId = request.getConversationId().trim();
        cmd.model = request.getModel();
        cmd.messages = request.getMessages();
        cmd.tools = request.getTools();
        cmd.mode = request.getMode();
        cmd.userId = SecurityContextUtil.getUserId();
        cmd.tenantId = parseLong(SecurityContextUtil.getTenantId());
        cmd.token = SecurityContextUtil.getToken();
        cmd.userName = SecurityContextUtil.getUserName();
        cmd.account = SecurityContextUtil.getUserAccount();
        cmd.roleName = SecurityContextUtil.getUserRole();
        try {
            return R.data(supervisor.create(cmd));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{taskId}")
    public R<AgentTaskRecord> get(@PathVariable String taskId) {
        AgentTaskRecord record = supervisor.get(taskId);
        if (record == null || !owned(record)) {
            return R.fail("Task not found: " + taskId);
        }
        return R.data(record);
    }

    @GetMapping("/{taskId}/state")
    public R<TaskStateView> state(@PathVariable String taskId) {
        if (!owned(supervisor.get(taskId))) {
            return R.fail("Task not found: " + taskId);
        }
        TaskStateView state = supervisor.state(taskId);
        return state == null ? R.fail("Task not found: " + taskId) : R.data(state);
    }

    @GetMapping(value = "/{taskId}/events")
    public SseEmitter events(@PathVariable String taskId,
            @RequestParam(defaultValue = "0") long afterSeq) {
        if (!owned(supervisor.get(taskId))) {
            return denied(taskId);
        }
        return stream(taskId, supervisor.events(taskId, afterSeq));
    }

    @PostMapping(value = "/{taskId}/resume")
    public SseEmitter resume(@PathVariable String taskId, @RequestBody ResumeTaskCommand command) {
        if (!owned(supervisor.get(taskId))) {
            return denied(taskId);
        }
        return stream(taskId, supervisor.resume(taskId, command));
    }

    @PostMapping("/{taskId}/cancel")
    public R<Void> cancel(@PathVariable String taskId) {
        if (!owned(supervisor.get(taskId))) {
            return R.fail("Task not found: " + taskId);
        }
        return supervisor.cancel(taskId) ? R.data(null) : R.fail("Task not cancellable: " + taskId);
    }

    private boolean owned(AgentTaskRecord record) {
        if (record == null) {
            return false;
        }
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseLong(SecurityContextUtil.getTenantId());
        return (tenantId == null || record.getTenantId() == null || tenantId.equals(record.getTenantId()))
                && (userId == null || record.getUserId() == null || userId.equals(record.getUserId()));
    }

    private SseEmitter denied(String taskId) {
        SseEmitter emitter = new SseEmitter(0L);
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("taskId", taskId);
            payload.put("errorCode", "FORBIDDEN");
            payload.put("errorMessage", "Task not found or not accessible");
            emitter.send(SseEmitter.event().name("session.failed")
                    .data(payload, MediaType.APPLICATION_JSON));
            emitter.send(SseEmitter.event().data("[DONE]"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
        return emitter;
    }

    private SseEmitter stream(String taskId, reactor.core.publisher.Flux<Map<String, Object>> flux) {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicReference<Disposable> ref = new AtomicReference<>();
        AtomicReference<Disposable> keepalive = new AtomicReference<>();
        Runnable cleanup = () -> {
            dispose(ref);
            dispose(keepalive);
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());

        keepalive.set(reactor.core.publisher.Flux
                .interval(java.time.Duration.ofSeconds(15))
                .subscribe(tick -> {
                    try {
                        emitter.send(SseEmitter.event().comment("keepalive"));
                    } catch (Exception ignored) {
                    }
                }));

        Disposable sub = flux.subscribe(
                payload -> {
                    try {
                        String type = String.valueOf(payload.getOrDefault("type", "event"));
                        emitter.send(SseEmitter.event()
                                .id(String.valueOf(payload.get("seq")))
                                .name(type)
                                .data(objectMapper.writeValueAsString(payload), MediaType.APPLICATION_JSON));
                        if ("session.completed".equals(type) || "session.failed".equals(type)) {
                            emitter.send(SseEmitter.event().data("[DONE]"));
                            emitter.complete();
                        }
                    } catch (Exception e) {
                        emitter.completeWithError(e);
                    }
                },
                error -> {
                    try {
                        Map<String, Object> payload = new LinkedHashMap<>();
                        payload.put("taskId", taskId);
                        payload.put("errorCode", "INTERNAL");
                        payload.put("errorMessage", error.getMessage());
                        emitter.send(SseEmitter.event().name("session.failed")
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

    private void dispose(AtomicReference<Disposable> ref) {
        Disposable d = ref.get();
        if (d != null && !d.isDisposed()) {
            d.dispose();
        }
    }

    private Long parseLong(String v) {
        if (v == null || v.isEmpty()) {
            return null;
        }
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @Data
    public static class CreateTaskRequest {
        private String conversationId;
        private String model;
        private List<Map<String, Object>> messages;
        private List<Map<String, Object>> tools;
        private String mode;
    }
}
