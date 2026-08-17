package com.knowledge.agent.core.skill;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One registered remote skill tool (persisted in Redis, rebuilt at startup).
 * Registered by microservices through the knowledge-core-agent SDK
 * ({@code POST /api/v1/skills/register-remote}).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RemoteSkillRecord {

    /** Nacos service id, e.g. knowledge-wiki. */
    private String serviceId;

    /** Skill id from @AgentSkill#id(), e.g. wiki-page. */
    private String skillId;

    /** Tool name inside the skill. */
    private String toolName;

    /** Display name. */
    private String name;

    /** Tool description shown to the LLM. */
    private String description;

    /** Pre-built JSON Schema for function calling (JSON string). */
    private String parameterSchema;

    /** HTTP callback endpoint (defaults to http://{serviceId}/api/v1/agent-sdk/invoke). */
    private String callbackUrl;

    private long lastHeartbeat;

    @Builder.Default
    private String status = "ACTIVE";

    public String redisKey() {
        return "agentcore:skill:" + serviceId + ":" + toolName;
    }

    public String effectiveCallbackUrl() {
        if (callbackUrl != null && !callbackUrl.isEmpty()) {
            return callbackUrl;
        }
        return "http://" + serviceId + "/api/v1/agent-sdk/invoke";
    }
}
