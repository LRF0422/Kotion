package com.knowledge.core.agent.sdk;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * DTO for heartbeat requests sent by microservices to the agent service.
 *
 * <p>
 * Used by {@link ISkillRegistrationClient#heartbeat(HeartbeatRequest)} to
 * indicate
 * that a remote service is still alive and its skills should remain available.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class HeartbeatRequest {

    /**
     * Nacos service ID of the registering service.
     */
    private String serviceId;

    /**
     * List of skill IDs registered by this service.
     */
    private List<String> skillIds;
}
