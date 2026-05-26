package com.knowledge.core.agent.sdk;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration properties for the Agent SDK.
 *
 * <p>
 * Add to the host service's {@code application.yml}:
 * 
 * <pre>
 * agent:
 *   sdk:
 *     enabled: true
 *     service-id: ${spring.application.name}
 *     callback-base-url: http://my-service:8100   # optional
 * </pre>
 *
 * <p>
 * Note: Service discovery is handled automatically by Feign + Nacos,
 * so no explicit agent-service-url configuration is needed.
 */
@Data
@ConfigurationProperties(prefix = "agent.sdk")
public class AgentSdkProperties {

    /** Enable / disable the Agent SDK (default: true). */
    private boolean enabled = true;

    /**
     * This service's Nacos application name.
     * Defaults to {@code ${spring.application.name}} if not set.
     */
    private String serviceId;

    /**
     * Optional explicit callback base URL.
     * If set, the agent service will call
     * {@code {callbackBaseUrl}/api/v1/agent-sdk/invoke}
     * to execute skill tools on this service.
     * If not set, {@code http://localhost:{server.port}} is used.
     */
    private String callbackBaseUrl;

    /**
     * Heartbeat interval in seconds.
     * The SDK sends heartbeat to agent service at this interval.
     * Default: 30 seconds.
     */
    private int heartbeatInterval = 30;

    /**
     * Maximum number of registration retry attempts.
     * Uses exponential backoff (1s, 2s, 4s, 8s, 16s).
     * Default: 5 attempts.
     */
    private int registrationRetryMax = 5;
}
