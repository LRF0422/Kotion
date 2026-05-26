package com.knowledge.core.agent.sdk;

import lombok.Data;

import java.util.List;

/**
 * Lightweight DTO that carries all metadata needed to register a skill
 * in the remote {@code SkillRegistry} of {@code knowledge-agent-skills}.
 *
 * <p>This is the payload sent to {@code POST /api/v1/skills/register} by
 * {@link AgentSkillRegistrar} on application startup.
 */
@Data
public class SkillDefinition {

    /** Unique skill id (from {@code @AgentSkill#id()}). */
    private String id;

    /** Display name. */
    private String name;

    /** High-level skill description. */
    private String description;

    /** Semantic version. */
    private String version;

    /** Author / team. */
    private String author;

    /** Tier string: CORE | DOMAIN | ADVANCED | CUSTOM. */
    private String tier;

    /** Domain categories for progressive discovery. */
    private List<String> categories;

    /** Whether the skill is active on registration. */
    private boolean enabled;

    // ---------- Tool-level fields (one @SkillTool method per SkillDefinition) ----------

    /** Tool name inside the skill (defaults to method name). */
    private String toolName;

    /** Tool description shown to the LLM. */
    private String toolDescription;

    /** Parameter descriptors for the LLM function-calling schema. */
    private List<ParamDef> parameters;

    /** Pre-built JSON Schema for function-calling (generated from parameters). */
    private String jsonSchema;

    /**
     * HTTP endpoint where the tool can be invoked by the agent service.
     * Populated by {@link AgentSkillRegistrar} using the calling service's base URL.
     * Format: {@code http://service-host:port/api/v1/agent-sdk/invoke}
     */
    private String callbackUrl;

    /**
     * Name of the Spring Cloud service as registered in Nacos (e.g. "knowledge-wiki").
     * The agent service uses this to route load-balanced calls back to the skill.
     */
    private String serviceId;

    // -------------------------------------------------------------------------

    @Data
    public static class ParamDef {
        private String name;
        private String description;
        private String type;
        private boolean required;
    }
}
