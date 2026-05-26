package com.knowledge.core.agent.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotates a method parameter inside a {@link SkillTool}-annotated method.
 * <p>
 * Provides the JSON Schema metadata required for LLM function-calling.
 *
 * <p><b>Usage example:</b>
 * <pre>{@code
 * @SkillTool(description = "Calculate the sum of two numbers")
 * public String add(
 *     @ToolParam(name = "a", description = "First operand", type = "number", required = true) double a,
 *     @ToolParam(name = "b", description = "Second operand", type = "number", required = true) double b
 * ) {
 *     return String.valueOf(a + b);
 * }
 * }</pre>
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ToolParam {

    /**
     * Parameter name exposed to the LLM.
     */
    String name();

    /**
     * Description of what this parameter represents.
     */
    String description();

    /**
     * JSON Schema type: {@code string}, {@code number}, {@code boolean}, {@code array}, {@code object}.
     * Inferred from the Java type if left empty.
     */
    String type() default "";

    /**
     * Whether this parameter is required by the LLM.
     */
    boolean required() default true;
}
