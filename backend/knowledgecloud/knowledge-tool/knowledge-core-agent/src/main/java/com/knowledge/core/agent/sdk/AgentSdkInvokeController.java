package com.knowledge.core.agent.sdk;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.HashMap;
import java.util.Map;

/**
 * Callback controller that receives tool invocation requests from the agent
 * service.
 *
 * <p>
 * When the agent service determines it needs to execute a skill tool that lives
 * in this microservice, it sends a {@code POST /api/v1/agent-sdk/invoke}
 * request with a {@link SkillInvokeRequest} body.
 *
 * <p>
 * The caller (RemoteSkill) forwards the original user's JWT token in the
 * {@code Authorization} header, so this service's JwtAuthenticationFilter
 * naturally sets up the correct SecurityContext — including tenantId —
 * before this controller is reached.
 *
 * <p>
 * This controller is auto-registered by {@link AgentSdkAutoConfiguration}
 * whenever {@code agent.sdk.enabled=true}. It is NOT a {@code @Component} to
 * avoid duplicate bean registration when component scanning overlaps with
 * auto-configuration.
 */
@Slf4j
@ResponseBody
@RequestMapping("/api/v1/agent-sdk")
@RequiredArgsConstructor
public class AgentSdkInvokeController {

    private final AgentSkillRegistrar registrar;

    /**
     * Executes the requested skill tool and returns the result as JSON.
     *
     * <p>
     * The caller forwards the user's original JWT token in the Authorization
     * header. The JwtAuthenticationFilter already parsed it and set up the
     * correct SecurityContext (including tenantId) before this method runs.
     *
     * <p>
     * Response body: {@code { "result": "..." }}
     */
    @PostMapping("/invoke")
    public ResponseEntity<Map<String, Object>> invoke(@RequestBody SkillInvokeRequest request) {
        log.debug("[AgentSDK] Invoke request: skillId={}, toolName={}, tenantId={}",
                request.getSkillId(), request.getToolName(), request.getTenantId());
        try {
            String result = registrar.dispatch(request);
            Map<String, Object> body = new HashMap<>();
            body.put("result", result);
            body.put("skillId", request.getSkillId());
            body.put("toolName", request.getToolName());
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            log.warn("[AgentSDK] Dispatch failed: {}", e.getMessage());
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            log.error("[AgentSDK] Unexpected error during invocation: {}", e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Internal error: " + e.getMessage());
            return ResponseEntity.status(500).body(error);
        }
    }
}
