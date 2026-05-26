package com.knowledge.agent.registry;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Persistence model for a remote tool registration.
 * Stored in Redis for HA across multiple agent-service instances.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RemoteToolRecord {

    /**
     * The service ID of the remote service (e.g., "knowledge-wiki").
     */
    private String serviceId;

    /**
     * The skill ID that this tool belongs to (e.g., "wiki-page").
     */
    private String skillId;

    /**
     * The tool/skill ID — used as the unique tool identifier in the ToolRegistry.
     * For Agent SDK tools, this matches the @SkillTool name (e.g.,
     * "summarize_page").
     */
    private String toolId;

    /**
     * Tool name for display.
     */
    private String name;

    /**
     * Tool description.
     */
    private String description;

    /**
     * JSON schema for tool parameters.
     */
    private String parameterSchema;

    /**
     * Timestamp of the last heartbeat from the remote service.
     */
    private long lastHeartbeat;

    /**
     * Registration status: ACTIVE, WARN, UNREGISTERED.
     */
    @Builder.Default
    private String status = "ACTIVE";

    /**
     * Redis key for this record: agent:tools:{serviceId}:{toolId}
     */
    public String getRedisKey() {
        return "agent:tools:" + serviceId + ":" + toolId;
    }

    /**
     * Redis key pattern for all tools of a service: agent:tools:{serviceId}:*
     */
    public static String getServiceKeyPattern(String serviceId) {
        return "agent:tools:" + serviceId + ":*";
    }
}
