package com.knowledge.core.agent.annotation;

/**
 * Tier constants mirroring {@code SkillTier} in knowledge-agent-skills.
 * Used in {@link AgentSkill#tier()} to avoid a compile-time dependency on the service module.
 */
public enum SkillTierValue {

    /** Always active — included in every agent's tool set. */
    CORE,

    /** Activated when the domain context matches the skill's categories. */
    DOMAIN,

    /** Activated by LLM intent analysis for a specific sub-task. */
    ADVANCED,

    /** Activated only when explicitly requested by the user or agent. */
    CUSTOM
}
