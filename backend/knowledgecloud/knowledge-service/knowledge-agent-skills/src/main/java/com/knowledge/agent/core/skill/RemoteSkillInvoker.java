package com.knowledge.agent.core.skill;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.core.launch.constant.TokenConstant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * HTTP transport for remote (microservice-registered) skills.
 *
 * <p>Calls the owning service's {@code /api/v1/agent-sdk/invoke} endpoint with
 * the caller's JWT forwarded in the {@code knowledge-auth} header, so the target
 * service's security filter restores the original identity/tenant context.
 *
 * <p>Resolution order, so a deployment never depends on the raw Nacos service
 * name being DNS-resolvable:
 * <ol>
 *   <li>the callback URL reported by the SDK (honours an explicit
 *       {@code agent.sdk.callback-base-url} override);</li>
 *   <li>if that fails and discovery can resolve the service id, the resolved
 *       instance's {@code /api/v1/agent-sdk/invoke}.</li>
 * </ol>
 *
 * <p>Encapsulated here (rather than inside {@link RemoteSkillTool}) so the
 * transport can be unit-tested and swapped without touching the registry.
 */
@Slf4j
@Component
public class RemoteSkillInvoker {

    private static final String INVOKE_PATH = "/api/v1/agent-sdk/invoke";
    private static final int DEFAULT_TIMEOUT_SECONDS = 30;

    /**
     * The platform's JwtAuthenticationFilter strips this prefix off the
     * incoming header, so {@code SecurityContextUtil.getToken()} returns the
     * bare JWT and it must be re-prefixed before forwarding.
     */
    private static final String BEARER_PREFIX = "Bearer ";

    private final ObjectMapper objectMapper;
    private final AgentCoreProperties properties;
    private final DiscoveryClient discoveryClient;
    private final WebClient webClient;

    public RemoteSkillInvoker(ObjectMapper objectMapper,
                              AgentCoreProperties properties,
                              ObjectProvider<DiscoveryClient> discoveryClientProvider) {
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.discoveryClient = discoveryClientProvider != null
                ? discoveryClientProvider.getIfAvailable() : null;
        this.webClient = WebClient.builder().build();
    }

    /**
     * Invoke one remote skill tool.
     *
     * @return the decoded JSON result, or the raw response body when it is not
     *         JSON-parsable
     * @throws IllegalStateException when every resolution path fails
     */
    public Object invoke(RemoteSkillRecord record, Map<String, Object> args, ToolContext context) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("skillId", record.getSkillId());
        body.put("toolName", record.getToolName());
        body.put("params", args == null ? new LinkedHashMap<>() : args);
        String tenantId = context != null && context.getTenantId() != null
                ? String.valueOf(context.getTenantId()) : null;
        body.put("tenantId", tenantId);
        body.put("userId", context != null ? context.getUserId() : null);

        String callbackUrl = record.effectiveCallbackUrl();
        Exception failure = null;
        if (callbackUrl != null && !callbackUrl.isEmpty()) {
            try {
                return post(callbackUrl, body, context);
            } catch (Exception e) {
                failure = e;
                log.warn("Remote skill {} callback {} failed: {}",
                        record.getToolName(), callbackUrl, e.getMessage());
            }
        }

        String resolved = resolveServiceUrl(record.getServiceId());
        if (resolved != null && !resolved.equals(callbackUrl)) {
            try {
                return post(resolved, body, context);
            } catch (Exception e) {
                failure = e;
            }
        }

        String message = failure == null ? "no reachable callback URL" : failure.getMessage();
        throw new IllegalStateException(
                "远程技能调用失败 (" + record.getToolName() + "): " + message, failure);
    }

    private Object post(String url, Map<String, Object> body, ToolContext context) {
        String json = webClient.post()
                .uri(URI.create(url))
                .contentType(MediaType.APPLICATION_JSON)
                .header(TokenConstant.HEADER,
                        bearerToken(context == null ? null : context.getToken()))
                .bodyValue(body)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(timeoutSeconds()))
                .block();
        if (json == null || json.isEmpty()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            // Plain-text (non-JSON) tool results are legal — pass them through.
            return json;
        }
    }

    /**
     * Normalises a token to the {@code Bearer <jwt>} form the platform's JWT
     * filter expects. Idempotent: an already-prefixed token is returned as-is.
     * Package-private for testing.
     */
    static String bearerToken(String token) {
        if (token == null || token.trim().isEmpty()) {
            return "";
        }
        String trimmed = token.trim();
        if (trimmed.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            return trimmed;
        }
        return BEARER_PREFIX + trimmed;
    }

    private String resolveServiceUrl(String serviceId) {
        if (discoveryClient == null || serviceId == null || serviceId.trim().isEmpty()) {
            return null;
        }
        try {
            List<ServiceInstance> instances = discoveryClient.getInstances(serviceId);
            if (instances == null || instances.isEmpty()) {
                log.warn("Remote skill service {} has no live discovery instance", serviceId);
                return null;
            }
            ServiceInstance instance = instances.get(0);
            String scheme = instance.getScheme() == null ? "http" : instance.getScheme();
            return scheme + "://" + instance.getHost() + ":" + instance.getPort() + INVOKE_PATH;
        } catch (Exception e) {
            log.warn("Remote skill discovery failed for {}: {}", serviceId, e.getMessage());
            return null;
        }
    }

    private int timeoutSeconds() {
        if (properties == null || properties.getRemoteSkill() == null) {
            return DEFAULT_TIMEOUT_SECONDS;
        }
        int configured = properties.getRemoteSkill().getCallTimeoutSeconds();
        return configured > 0 ? configured : DEFAULT_TIMEOUT_SECONDS;
    }
}
