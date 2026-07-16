package com.knowledge.agent.v2.controller;

import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.SkillPayload;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.LifecycleEvent;
import com.knowledge.agent.v2.event.ThinkingEvent;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentMode;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import com.knowledge.agent.v2.session.ExecutionState;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

/**
 * V2 Agent chat endpoint — semantic SSE protocol.
 *
 * <p>POST /api/v2/agent/chat
 *
 * <p>This replaces the V1 {@code /api/v1/chat/completions} endpoint with:
 * <ul>
 *   <li>Semantic event types ({@code think.start}, {@code tool.completed}, etc.)</li>
 *   <li>Clean session lifecycle events</li>
 *   <li>Structured event payloads (no OpenAI format wrapping)</li>
 * </ul>
 *
 * <p>The V1 endpoint remains available for backward compatibility (deprecated).
 */
@Api(tags = "Agent V2")
@Slf4j
@RestController
@RequestMapping("/api/v2/agent")
@RequiredArgsConstructor
public class AgentV2Controller {

    private final AgentEngine agentEngine;
    private final AgentProperties properties;

    /** Suspended sessions waiting for frontend tool results. */
    private final ConcurrentHashMap<String, AgentSession> suspendedSessions = new ConcurrentHashMap<>();

    /** SSE timeout: 5 minutes */
    private static final long SSE_TIMEOUT_MS = 300_000L;

    /**
     * Main V2 streaming chat endpoint.
     *
     * <p>Accepts the same request format as V1 for ease of migration, but
     * the response stream uses the V2 semantic event protocol.
     */
    @ApiOperation("V2 Agent Chat (Semantic SSE)")
    @PostMapping(value = "/chat")
    public SseEmitter chat(@RequestBody ChatCompletionRequest request) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        // Build the agent session from the request
        AgentSession session = buildSession(request);

        log.info("V2 chat: sessionId={}, traceId={}, model={}, mode={}, messages={}",
                session.getSessionId(), session.getTraceId(),
                session.getModelName(), session.getMode(),
                session.getExecution().getMessageCount());

        // Sequence counter for SSE id field
        AtomicLong seq = new AtomicLong(0);
        AtomicReference<Disposable> subscriptionRef = new AtomicReference<>();

        // Emitter lifecycle callbacks
        emitter.onCompletion(() -> disposeIfActive(subscriptionRef));
        emitter.onTimeout(() -> {
            log.warn("V2 SSE timeout: sessionId={}", session.getSessionId());
            disposeIfActive(subscriptionRef);
        });
        emitter.onError(e -> {
            log.error("V2 SSE error: sessionId={}: {}", session.getSessionId(), e.getMessage());
            disposeIfActive(subscriptionRef);
        });

        // Run the engine and stream events to SSE
        Disposable subscription = agentEngine.run(session)
                .subscribeOn(Schedulers.boundedElastic())
                .subscribe(
                        event -> {
                            sendEvent(emitter, event, seq);
                            // If engine suspended, stash session for resume
                            if (event instanceof com.knowledge.agent.v2.event.StateEvent.StateTransition) {
                                com.knowledge.agent.v2.event.StateEvent.StateTransition st =
                                        (com.knowledge.agent.v2.event.StateEvent.StateTransition) event;
                                if (st.getToState() == com.knowledge.agent.v2.engine.AgentState.SUSPENDED) {
                                    suspendedSessions.put(session.getSessionId(), session);
                                }
                            }
                        },
                        error -> sendError(emitter, error, session.getSessionId(), seq),
                        () -> completeEmitter(emitter)
                );

        subscriptionRef.set(subscription);
        return emitter;
    }

    // ---- Resume endpoint for FRONTEND tool results ----

    /**
     * Resume a suspended session after frontend tool execution.
     *
     * <p>When the engine dispatches FRONTEND tools, it enters SUSPENDED state.
     * The frontend executes those tools locally and POSTs results here to
     * continue execution. Returns a new SSE stream for the resumed session.
     */
    @ApiOperation("Resume suspended session with tool results")
    @PostMapping(value = "/chat/resume")
    public SseEmitter resume(@RequestBody ResumeRequest request) {
        String sessionId = request.getSessionId();
        AgentSession session = suspendedSessions.remove(sessionId);

        if (session == null) {
            SseEmitter errorEmitter = new SseEmitter(0L);
            try {
                Map<String, Object> errorPayload = new LinkedHashMap<>();
                errorPayload.put("errorCode", "SESSION_NOT_FOUND");
                errorPayload.put("errorMessage", "Session " + sessionId + " not found or not suspended");
                errorEmitter.send(SseEmitter.event()
                        .name("session.failed")
                        .data(errorPayload, MediaType.APPLICATION_JSON));
                errorEmitter.send(SseEmitter.event().data("[DONE]"));
                errorEmitter.complete();
            } catch (Exception e) {
                errorEmitter.completeWithError(e);
            }
            return errorEmitter;
        }

        log.info("V2 resume: sessionId={}, toolResults={}", sessionId,
                request.getToolResults() != null ? request.getToolResults().size() : 0);

        // Apply tool results to the session
        if (request.getToolResults() != null) {
            for (ToolResultPayload tr : request.getToolResults()) {
                ConversationMessage toolMsg = ConversationMessage.toolResult(
                        tr.getToolCallId(), tr.getToolName(), tr.getResult());
                session.getExecution().addMessage(toolMsg);
            }
        }

        // Transition from SUSPENDED → THINK (tool results applied, continue reasoning)
        session.getExecution().transitionTo(com.knowledge.agent.v2.engine.AgentState.THINK);

        // Continue the engine execution (resume, not restart)
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        AtomicLong seq = new AtomicLong(0);
        AtomicReference<Disposable> subscriptionRef = new AtomicReference<>();

        emitter.onCompletion(() -> disposeIfActive(subscriptionRef));
        emitter.onTimeout(() -> disposeIfActive(subscriptionRef));
        emitter.onError(e -> disposeIfActive(subscriptionRef));

        Disposable subscription = agentEngine.resume(session)
                .subscribeOn(Schedulers.boundedElastic())
                .subscribe(
                        event -> {
                            sendEvent(emitter, event, seq);
                            if (event instanceof com.knowledge.agent.v2.event.StateEvent.StateTransition) {
                                com.knowledge.agent.v2.event.StateEvent.StateTransition st =
                                        (com.knowledge.agent.v2.event.StateEvent.StateTransition) event;
                                if (st.getToState() == com.knowledge.agent.v2.engine.AgentState.SUSPENDED) {
                                    suspendedSessions.put(session.getSessionId(), session);
                                }
                            }
                        },
                        error -> sendError(emitter, error, sessionId, seq),
                        () -> completeEmitter(emitter)
                );

        subscriptionRef.set(subscription);
        return emitter;
    }

    // ---- Session building ----

    private AgentSession buildSession(ChatCompletionRequest request) {
        String conversationId = request.getConversationId() != null
                ? request.getConversationId()
                : UUID.randomUUID().toString();

        // Extract security context
        String token = SecurityContextUtil.getToken();
        String userName = SecurityContextUtil.getUserName();
        String account = SecurityContextUtil.getUserAccount();
        String tenantIdStr = SecurityContextUtil.getTenantId();
        String roleName = SecurityContextUtil.getUserRole();
        Long userId = request.getUserId();
        if (userId == null || userId == -1L) {
            userId = SecurityContextUtil.getUserId();
        }

        AgentIdentity identity = AgentIdentity.builder()
                .userId(userId)
                .tenantId(parseLong(tenantIdStr))
                .userName(userName)
                .account(account)
                .roleName(roleName)
                .token(token)
                .build();

        // Convert messages
        List<ConversationMessage> messages = request.getMessages() != null
                ? request.getMessages().stream().map(this::toV2Message).collect(Collectors.toList())
                : Collections.emptyList();

        ExecutionState execution = new ExecutionState();
        execution.setMessages(messages);

        // Determine mode
        AgentMode mode = "plan".equalsIgnoreCase(request.getMode())
                ? AgentMode.PLAN : AgentMode.EXECUTE;

        // Extract frontend tools from skills + top-level tools.
        // The frontend ships tool definitions inside each skill's .tools[] array
        // and/or the top-level request.tools[] — merge them all so the LLM can
        // see every callable tool.
        List<ChatTool> frontendTools = extractFrontendTools(request);

        return AgentSession.builder()
                .sessionId(request.getSessionId() != null
                        ? request.getSessionId() : UUID.randomUUID().toString())
                .conversationId(conversationId)
                .traceId(UUID.randomUUID().toString().substring(0, 8))
                .identity(identity)
                .mode(mode)
                .maxIterations(properties.getEngine().getMaxIterations())
                .modelName(request.getModel())
                .frontendTools(frontendTools)
                .execution(execution)
                .build();
    }

    /**
     * Merge tool definitions from the request's skills and top-level tools array.
     * This provides the LLM with full tool schemas so it can make tool calls.
     */
    private List<ChatTool> extractFrontendTools(ChatCompletionRequest request) {
        List<ChatTool> merged = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        // 1. Top-level tools[] (legacy path — frontend may still send these)
        if (request.getTools() != null) {
            for (ChatTool tool : request.getTools()) {
                if (tool.getFunction() != null && tool.getFunction().getName() != null) {
                    if (seen.add(tool.getFunction().getName())) {
                        merged.add(tool);
                    }
                }
            }
        }

        // 2. Tools embedded in each skill's tools[] array
        if (request.getSkills() != null) {
            for (SkillPayload skill : request.getSkills()) {
                if (skill.getTools() != null) {
                    for (ChatTool tool : skill.getTools()) {
                        if (tool.getFunction() != null && tool.getFunction().getName() != null) {
                            if (seen.add(tool.getFunction().getName())) {
                                merged.add(tool);
                            }
                        }
                    }
                }
            }
        }

        return merged;
    }

    private ConversationMessage toV2Message(ChatMessage msg) {
        ConversationMessage.Builder builder = ConversationMessage.builder()
                .role(msg.getRole())
                .content(msg.getContent())
                .toolCallId(msg.getToolCallId())
                .name(msg.getName())
                .reasoningContent(msg.getReasoningContent());

        if (msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
            List<ConversationMessage.ToolCallInfo> toolCalls = msg.getToolCalls().stream()
                    .map(tc -> new ConversationMessage.ToolCallInfo(
                            tc.getId(), tc.getType(),
                            tc.getFunction() != null ? tc.getFunction().getName() : null,
                            tc.getFunction() != null ? tc.getFunction().getArguments() : null))
                    .collect(Collectors.toList());
            builder.toolCalls(toolCalls);
        }

        return builder.build();
    }

    // ---- SSE event writing ----

    private void sendEvent(SseEmitter emitter, AgentEvent event, AtomicLong seq) {
        try {
            long id = seq.incrementAndGet();
            Map<String, Object> payload = eventToPayload(event);
            if (payload != null) {
                emitter.send(SseEmitter.event()
                        .id(String.valueOf(id))
                        .name(event.type())
                        .data(payload, MediaType.APPLICATION_JSON));
            }

            // If session completed or failed, send DONE and complete
            if (event instanceof LifecycleEvent.SessionCompleted
                    || event instanceof LifecycleEvent.SessionFailed) {
                emitter.send(SseEmitter.event().data("[DONE]"));
                emitter.complete();
            }
        } catch (Exception e) {
            log.error("V2 SSE send error: {}", e.getMessage());
            emitter.completeWithError(e);
        }
    }

    private void sendError(SseEmitter emitter, Throwable error,
                           String sessionId, AtomicLong seq) {
        try {
            long id = seq.incrementAndGet();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sessionId", sessionId);
            payload.put("errorCode", "INTERNAL");
            payload.put("errorMessage", error.getMessage());
            emitter.send(SseEmitter.event()
                    .id(String.valueOf(id))
                    .name("session.failed")
                    .data(payload, MediaType.APPLICATION_JSON));
            emitter.send(SseEmitter.event().data("[DONE]"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private void completeEmitter(SseEmitter emitter) {
        try {
            emitter.complete();
        } catch (Exception ignored) {}
    }

    /**
     * Convert an AgentEvent to a JSON-serializable payload map.
     */
    private Map<String, Object> eventToPayload(AgentEvent event) {
        Map<String, Object> payload = new LinkedHashMap<>();
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
            ThinkingEvent.ThinkStart e = (ThinkingEvent.ThinkStart) event;
            payload.put("iteration", e.getIteration());
        } else if (event instanceof ThinkingEvent.ThinkDelta) {
            ThinkingEvent.ThinkDelta e = (ThinkingEvent.ThinkDelta) event;
            payload.put("type", e.getDeltaType().name().toLowerCase());
            payload.put("content", e.getContent());
        } else if (event instanceof ThinkingEvent.ThinkEnd) {
            ThinkingEvent.ThinkEnd e = (ThinkingEvent.ThinkEnd) event;
            payload.put("iteration", e.getIteration());
            payload.put("finishReason", e.getFinishReason());
            payload.put("latencyMs", e.getLatencyMs());
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
            payload.put("durationMs", e.getDurationMs());
        } else {
            // Generic: just type and sessionId
            payload.put("eventType", event.type());
        }

        return payload;
    }

    // ---- Helpers ----

    private void disposeIfActive(AtomicReference<Disposable> ref) {
        Disposable sub = ref.get();
        if (sub != null && !sub.isDisposed()) {
            sub.dispose();
        }
    }

    private static Long parseLong(String val) {
        if (val == null || val.isEmpty()) return null;
        try { return Long.parseLong(val); }
        catch (NumberFormatException e) { return null; }
    }

    // ---- Request DTOs ----

    /** Request body for the /chat/resume endpoint. */
    @lombok.Data
    public static class ResumeRequest {
        private String sessionId;
        private List<ToolResultPayload> toolResults;
    }

    /** A single tool execution result from the frontend. */
    @lombok.Data
    public static class ToolResultPayload {
        private String toolCallId;
        private String toolName;
        private String result;
        private boolean success;
    }
}
