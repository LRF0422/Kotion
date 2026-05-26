package com.knowledge.core.agent.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a method inside an {@link AgentSkill}-annotated class as an executable tool.
 * <p>
 * Each {@code @SkillTool} method is exposed to the LLM as a callable function.
 * Method parameters should be annotated with {@link ToolParam} to describe their
 * JSON Schema type and purpose.
 *
 * <p><b>Rules:</b>
 * <ul>
 *   <li>A skill class may have multiple {@code @SkillTool} methods.</li>
 *   <li>If a class has exactly one {@code @SkillTool} method, it becomes the default executor
 *       for {@code execute()} calls that carry the parent skill's id.</li>
 *   <li>The method name is used as the tool id within the skill unless {@link #name()} is set.</li>
 *   <li>Return type must be {@code String} or {@code SkillResult}.</li>
 * </ul>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface SkillTool {

    /**
     * Tool name exposed to the LLM (defaults to the method name if empty).
     */
    String name() default "";

    /**
     * Short description of what this tool does (shown in the function-calling schema).
     */
    String description();
}
