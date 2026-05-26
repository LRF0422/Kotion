package com.knowledge.core.agent.annotation;

import org.springframework.stereotype.Component;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a Spring bean as an Agent Skill.
 * <p>
 * The SDK will automatically detect all beans annotated with {@code @AgentSkill}
 * at startup and register them in the {@code SkillRegistry} of the
 * {@code knowledge-agent-skills} service.
 *
 * <p><b>Usage example:</b>
 * <pre>{@code
 * @AgentSkill(
 *     id = "web-search",
 *     name = "Web Search",
 *     description = "Searches the web and returns relevant results",
 *     tier = SkillTierValue.DOMAIN,
 *     categories = {"research", "information-retrieval"}
 * )
 * @Service
 * public class WebSearchSkill {
 *
 *     @SkillTool(description = "Search the web with a query string")
 *     public String search(@ToolParam(name = "query", description = "Search query") String query) {
 *         // ...
 *     }
 * }
 * }</pre>
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Component
public @interface AgentSkill {

    /**
     * Unique skill identifier (e.g. "web-search").
     * Must be globally unique across all registered skills.
     */
    String id();

    /**
     * Human-readable skill name.
     */
    String name();

    /**
     * Short description shown to the LLM (affects tool selection).
     */
    String description();

    /**
     * Semantic version (default "1.0.0").
     */
    String version() default "1.0.0";

    /**
     * Author / owning team.
     */
    String author() default "";

    /**
     * Tier controlling progressive discovery.
     * Corresponds to {@code SkillTier} enum values.
     * Use {@link SkillTierValue} constants.
     */
    SkillTierValue tier() default SkillTierValue.DOMAIN;

    /**
     * Domain categories for intent-based discovery (e.g. "coding", "research").
     */
    String[] categories() default {};

    /**
     * Whether this skill is enabled immediately after registration.
     */
    boolean enabled() default true;
}
