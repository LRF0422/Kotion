package com.knowledge.agent.controller;

import com.knowledge.agent.api.dto.ChatCompletionRequest;
import com.knowledge.agent.core.engine.DataStreamEncoder;
import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.harness.AgentHarness;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.session.Session;
import com.knowledge.agent.session.SessionManager;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Unified chat completions endpoint — OpenAI-compatible, ai-sdk ready.
 *
 * POST /api/v1/chat/completions
 *
 * Uses {@link SseEmitter} for proper SSE streaming in Spring MVC.
 * Avoids the double-encoding issue that occurs when returning
 * {@code Flux<String>} from a Servlet-based application.
 *
 * The agent autonomously decides whether to work solo or spawn sub-agents.
 */
@Api(tags = "Chat Completions")
@Slf4j
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ChatController {

    private final AgentHarness agentHarness;
    private final LlmClientFactory llmClientFactory;
    private final DataStreamEncoder dataStreamEncoder;
    private final SessionManager sessionManager;

    /** SSE timeout: 5 minutes */
    private static final long SSE_TIMEOUT_MS = 300_000L;

    /**
     * Main streaming chat completions endpoint.
     */
    @ApiOperation("Chat completions (OpenAI-compatible, SSE/Data Stream)")
    @PostMapping(value = "/chat/completions")
    public SseEmitter chatCompletions(
            @RequestBody ChatCompletionRequest request) {

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        String conversationId = request.getConversationId() != null
                ? request.getConversationId()
                : UUID.randomUUID().toString();

        // Session management
        Session session = sessionManager.get(request.getSessionId());
        if (session == null) {
            session = sessionManager.create(conversationId, request.getUserId());
        }

        // Build tool context — include JWT token so remote skill
        // callbacks can forward it for authentication
        String token = SecurityContextUtil.getToken();

        // Enrich context with user information from SecurityContext so that
        // the system prompt can reference the current user and the LLM does
        // not produce outdated / generic responses.
        String userName = SecurityContextUtil.getUserName();
        String account = SecurityContextUtil.getUserAccount();
        String tenantIdStr = SecurityContextUtil.getTenantId();
        String roleName = SecurityContextUtil.getUserRole();
        Long userId = request.getUserId();
        if (userId == null || userId == -1L) {
            userId = SecurityContextUtil.getUserId();
        }

        ToolContext context = ToolContext.builder()
                .userId(userId)
                .tenantId(parseLong(tenantIdStr))
                .token(token)
                .sessionId(session.getSessionId())
                .conversationId(conversationId)
                .userName(userName)
                .account(account)
                .tenantIdStr(tenantIdStr)
                .roleName(roleName)
                .build();

        // Log request
        log.info("Chat request: conversationId={}, model={}, tools={}, skills={}, sessionId={}",
                conversationId, request.getModel(),
                request.getTools() != null ? request.getTools().size() + " tool(s)" : "null",
                request.getSkills() != null ? request.getSkills().size() + " skill(s)" : "null",
                session.getSessionId());

        // Run the agent harness
        Flux<StreamEvent> eventStream = agentHarness.run(
                request.getMessages(),
                request.getModel(),
                request.getUserId(),
                request.getTools(),
                context,
                request.getSkills());

        // Emit sessionId as first data event so frontend can cache it
        final String sessionId = session.getSessionId();
        Map<String, Object> sessionData = new LinkedHashMap<>();
        sessionData.put("sessionId", sessionId);
        List<Object> dataList = new ArrayList<>();
        dataList.add(sessionData);
        StreamEvent sessionEvent = StreamEvent.DataEvent.builder().data(dataList).build();

        // Track subscription for cleanup
        AtomicReference<Disposable> subscriptionRef = new AtomicReference<>();

        // Register emitter callbacks for cleanup
        emitter.onCompletion(() -> {
            Disposable sub = subscriptionRef.get();
            if (sub != null && !sub.isDisposed()) {
                sub.dispose();
            }
        });
        emitter.onTimeout(() -> {
            log.warn("SSE emitter timeout for conversationId={}", conversationId);
            Disposable sub = subscriptionRef.get();
            if (sub != null && !sub.isDisposed()) {
                sub.dispose();
            }
        });
        emitter.onError(e -> {
            log.error("SSE emitter error for conversationId={}: {}", conversationId, e.getMessage());
            Disposable sub = subscriptionRef.get();
            if (sub != null && !sub.isDisposed()) {
                sub.dispose();
            }
        });

        // Subscribe to the event stream on a bounded-elastic scheduler
        // (avoids blocking the Servlet thread)
        Disposable subscription = Flux.just(sessionEvent)
                .concatWith(eventStream)
                .subscribeOn(Schedulers.boundedElastic())
                .subscribe(
                        event -> {
                            try {
                                // Use toSseData() to avoid double-encoding:
                                // SseEmitter.send() adds "data: ...\n\n" framing,
                                // so we only provide the JSON-serializable Map payload.
                                Object payload = dataStreamEncoder.toSseData(event);
                                if (payload != null) {
                                    emitter.send(SseEmitter.event()
                                            .data(payload, MediaType.APPLICATION_JSON));
                                }

                                // After finish or error, send [DONE] and complete
                                if (dataStreamEncoder.isFinishEvent(event)
                                        || dataStreamEncoder.isErrorEvent(event)) {
                                    emitter.send(SseEmitter.event()
                                            .data("[DONE]"));
                                    emitter.complete();
                                }
                            } catch (Exception e) {
                                log.error("Error sending SSE event: {}", e.getMessage());
                                emitter.completeWithError(e);
                            }
                        },
                        error -> {
                            log.error("Chat stream error: {}", error.getMessage(), error);
                            try {
                                Object errorPayload = dataStreamEncoder.toSseData(
                                        StreamEvent.ErrorEvent.builder()
                                                .error(error.getMessage())
                                                .build());
                                if (errorPayload != null) {
                                    emitter.send(SseEmitter.event()
                                            .data(errorPayload, MediaType.APPLICATION_JSON));
                                }
                                emitter.send(SseEmitter.event().data("[DONE]"));
                                emitter.complete();
                            } catch (Exception e) {
                                emitter.completeWithError(e);
                            }
                        },
                        () -> {
                            // Stream completed normally (should already have been
                            // closed by the finish/error handler, but as a safety net)
                            try {
                                emitter.complete();
                            } catch (Exception ignored) {
                            }
                        });

        subscriptionRef.set(subscription);
        return emitter;
    }

    /**
     * Models list endpoint — for ai-sdk provider discovery.
     */
    @ApiOperation("List available models")
    @GetMapping("/models")
    public ResponseEntity<Map<String, Object>> listModels() {
        List<Map<String, Object>> data = new ArrayList<>();
        Map<String, List<String>> allModels = llmClientFactory.getAllModels();
        for (Map.Entry<String, List<String>> entry : allModels.entrySet()) {
            String provider = entry.getKey();
            for (String model : entry.getValue()) {
                Map<String, Object> modelInfo = new LinkedHashMap<>();
                modelInfo.put("id", model);
                modelInfo.put("object", "model");
                modelInfo.put("owned_by", provider);
                modelInfo.put("provider", provider);
                data.add(modelInfo);
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("object", "list");
        body.put("data", data);

        return ResponseEntity.ok(body);
    }

    /**
     * List available providers.
     */
    @ApiOperation("List available model providers")
    @GetMapping("/providers")
    public ResponseEntity<Map<String, Object>> listProviders() {
        List<String> providers = llmClientFactory.getAvailableProviders();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("object", "list");
        body.put("data", providers);
        return ResponseEntity.ok(body);
    }

    /**
     * Get provider capabilities and configuration.
     */
    @ApiOperation("Get provider capabilities")
    @GetMapping("/chat/config")
    public ResponseEntity<Map<String, Object>> getConfig() {
        Map<String, Object> config = new LinkedHashMap<>();

        Map<String, Object> features = new LinkedHashMap<>();
        features.put("streaming", true);
        features.put("toolStreaming", true);
        features.put("multiStep", true);
        features.put("multiAgent", true);
        config.put("features", features);

        config.put("models", llmClientFactory.getAllModels());
        config.put("providers", llmClientFactory.getAvailableProviders());

        List<String> protocols = new ArrayList<>();
        protocols.add("sse");
        protocols.add("data");
        config.put("streamProtocols", protocols);

        return ResponseEntity.ok(config);
    }

    /**
     * Parse a tenant ID string to Long, returning null if blank or unparseable.
     */
    private static Long parseLong(String val) {
        if (val == null || val.isEmpty()) {
            return null;
        }
        try {
            return Long.parseLong(val);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
