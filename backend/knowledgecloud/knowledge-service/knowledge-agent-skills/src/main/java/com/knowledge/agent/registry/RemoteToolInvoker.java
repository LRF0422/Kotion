package com.knowledge.agent.registry;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.ToolResult;
import com.knowledge.core.launch.constant.TokenConstant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.*;

/**
 * Invokes remote tools via Feign with load-balanced failover.
 * Uses the serviceId for Nacos service discovery and load-balancing.
 */
@Slf4j
@Component
public class RemoteToolInvoker {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    /** Per-call connect/read timeouts (ms) — a hung remote service must never
     *  stall the parent agent turn beyond its tool timeout. */
    private static final int CONNECT_TIMEOUT_MS = 5_000;
    private static final int READ_TIMEOUT_MS = 30_000;

    public RemoteToolInvoker(RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        // Apply timeouts to the shared template's request factory. The
        // factory only exposes setters, so defaults are applied only when the
        // request factory is the plain JDK one (bean-level custom factories
        // are left untouched).
        if (restTemplate.getRequestFactory() instanceof org.springframework.http.client.SimpleClientHttpRequestFactory) {
            org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                    (org.springframework.http.client.SimpleClientHttpRequestFactory) restTemplate.getRequestFactory();
            factory.setConnectTimeout(CONNECT_TIMEOUT_MS);
            factory.setReadTimeout(READ_TIMEOUT_MS);
        }
    }

    /**
     * Invoke a remote tool via HTTP callback.
     *
     * @param serviceId the Nacos service ID
     * @param skillId   the skill ID (e.g., "wiki-page")
     * @param toolName  the tool name within the skill (e.g., "summarize_page")
     * @param args      JSON string of arguments
     * @param token     the caller's JWT token (forwarded for authentication)
     * @return the tool result
     */
    public ToolResult invoke(String serviceId, String skillId, String toolName, String args, String token) {
        try {
            // Build the callback URL using Nacos service discovery
            // Format: http://{serviceId}/api/v1/agent-sdk/invoke
            String url = "http://" + serviceId + "/api/v1/agent-sdk/invoke";

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("skillId", skillId);
            body.put("toolName", toolName);

            // Parse the JSON args string into a Map so the remote SkillInvokeRequest
            // can deserialize it into its "params" field (Map<String, Object>).
            // Previously sent as raw string under key "arguments" which caused
            // a key-mismatch NPE on the receiving end.
            Map<String, Object> paramsMap = Collections.emptyMap();
            if (args != null && !args.isEmpty()) {
                try {
                    paramsMap = objectMapper.readValue(args,
                            new TypeReference<Map<String, Object>>() {
                            });
                } catch (Exception parseEx) {
                    log.warn("Failed to parse tool args as JSON map, sending as empty params: {}",
                            parseEx.getMessage());
                }
            }
            body.put("params", paramsMap);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            // Forward the JWT token so the remote service can authenticate the request
            if (token != null && !token.isEmpty()) {
                headers.set(TokenConstant.HEADER, TokenConstant.BEARER + " " + token);
                headers.set("Authorization", "Bearer " + token);
            }

            @SuppressWarnings("unchecked")
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
            Map<String, Object> response = restTemplate.postForObject(url, request, Map.class);

            if (response != null) {
                Object result = response.get("result");
                if (response.containsKey("error")) {
                    String error = response.get("error") != null ? response.get("error").toString()
                            : "Unknown remote error";
                    return ToolResult.error(error);
                }
                String output = result != null ? result.toString() : "";
                return ToolResult.success(output);
            }
            return ToolResult.error("Empty response from remote service");
        } catch (Exception e) {
            // Full exception goes to the log only — raw provider errors must
            // never leak into the LLM context (they may contain host names,
            // stack traces or internal configuration).
            log.error("Remote tool invocation failed for {}/{}::{}: {}", serviceId, skillId, toolName, e.getMessage());
            return ToolResult.error("远程服务调用失败（" + serviceId + "）");
        }
    }
}
