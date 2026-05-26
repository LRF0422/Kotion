package com.knowledge.core.agent.sdk;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for unregister requests sent by microservices during graceful shutdown.
 *
 * <p>
 * Used by
 * {@link ISkillRegistrationClient#unregisterRemoteSkills(UnregisterRequest)}
 * to notify the agent service that all skills from this service should be
 * removed.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UnregisterRequest {

    /**
     * Nacos service ID of the service being unregistered.
     */
    private String serviceId;
}
