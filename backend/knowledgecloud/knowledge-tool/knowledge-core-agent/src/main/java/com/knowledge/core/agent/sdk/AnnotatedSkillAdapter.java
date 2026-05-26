package com.knowledge.core.agent.sdk;

import com.knowledge.core.agent.annotation.AgentSkill;
import com.knowledge.core.agent.annotation.SkillTool;
import com.knowledge.core.agent.annotation.ToolParam;
import lombok.extern.slf4j.Slf4j;

import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Adapts a POJO annotated with {@link AgentSkill} into a
 * {@link SkillDefinition}
 * and handles reflective dispatch when the agent service invokes the tool.
 *
 * <p>
 * One {@code AnnotatedSkillAdapter} is created per {@code @SkillTool} method.
 * If a class has multiple {@code @SkillTool} methods, the registrar creates one
 * adapter per method and registers each as its own skill tool function.
 */
@Slf4j
public class AnnotatedSkillAdapter {

    private final Object bean;
    private final AgentSkill skillAnnotation;
    private final Method toolMethod;
    private final SkillTool toolAnnotation;

    public AnnotatedSkillAdapter(Object bean, AgentSkill skillAnnotation,
            Method toolMethod, SkillTool toolAnnotation) {
        this.bean = bean;
        this.skillAnnotation = skillAnnotation;
        this.toolMethod = toolMethod;
        this.toolAnnotation = toolAnnotation;
        toolMethod.setAccessible(true);
    }

    // -------------------------------------------------------------------------
    // Metadata
    // -------------------------------------------------------------------------

    /**
     * Derives the tool name: annotation value → method name.
     */
    public String getToolName() {
        String name = toolAnnotation.name();
        return (name == null || name.isEmpty()) ? toolMethod.getName() : name;
    }

    /**
     * Builds the full {@link SkillDefinition} for this skill+tool combination.
     */
    public SkillDefinition buildDefinition() {
        SkillDefinition def = new SkillDefinition();
        def.setId(skillAnnotation.id());
        def.setName(skillAnnotation.name());
        def.setDescription(skillAnnotation.description());
        def.setVersion(skillAnnotation.version());
        def.setAuthor(skillAnnotation.author());
        def.setTier(skillAnnotation.tier().name());
        def.setCategories(Arrays.asList(skillAnnotation.categories()));
        def.setEnabled(skillAnnotation.enabled());
        def.setToolName(getToolName());
        def.setToolDescription(toolAnnotation.description());
        def.setParameters(buildParameters());
        def.setJsonSchema(buildJsonSchema(def.getParameters()));
        return def;
    }

    // -------------------------------------------------------------------------
    // Parameter introspection
    // -------------------------------------------------------------------------

    private List<SkillDefinition.ParamDef> buildParameters() {
        List<SkillDefinition.ParamDef> params = new ArrayList<>();
        Parameter[] methodParams = toolMethod.getParameters();
        for (Parameter p : methodParams) {
            ToolParam tp = p.getAnnotation(ToolParam.class);
            if (tp == null) {
                continue; // un-annotated params (e.g. SkillContext) are skipped in schema
            }
            SkillDefinition.ParamDef pd = new SkillDefinition.ParamDef();
            pd.setName(tp.name());
            pd.setDescription(tp.description());
            pd.setRequired(tp.required());
            pd.setType(resolveType(tp.type(), p.getType()));
            params.add(pd);
        }
        return params;
    }

    /**
     * Infers JSON Schema type from Java type when {@link ToolParam#type()} is
     * empty.
     */
    private String resolveType(String declared, Class<?> javaType) {
        if (declared != null && !declared.isEmpty()) {
            return declared;
        }
        if (javaType == String.class) {
            return "string";
        } else if (javaType == boolean.class || javaType == Boolean.class) {
            return "boolean";
        } else if (javaType == int.class || javaType == long.class
                || javaType == double.class || javaType == float.class
                || Number.class.isAssignableFrom(javaType)) {
            return "number";
        } else if (javaType.isArray() || List.class.isAssignableFrom(javaType)) {
            return "array";
        } else {
            return "object";
        }
    }

    private String buildJsonSchema(List<SkillDefinition.ParamDef> params) {
        StringBuilder sb = new StringBuilder("{\"type\":\"object\",\"properties\":{");
        boolean first = true;
        for (SkillDefinition.ParamDef p : params) {
            if (!first) {
                sb.append(",");
            }
            sb.append("\"").append(p.getName()).append("\":{")
                    .append("\"type\":\"").append(p.getType()).append("\",")
                    .append("\"description\":\"").append(escape(p.getDescription())).append("\"}");
            first = false;
        }
        sb.append("},\"required\":[");
        boolean firstReq = true;
        for (SkillDefinition.ParamDef p : params) {
            if (p.isRequired()) {
                if (!firstReq) {
                    sb.append(",");
                }
                sb.append("\"").append(p.getName()).append("\"");
                firstReq = false;
            }
        }
        sb.append("]}");
        return sb.toString();
    }

    private String escape(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    // -------------------------------------------------------------------------
    // Execution
    // -------------------------------------------------------------------------

    /**
     * Invokes the underlying {@code @SkillTool} method with the given named
     * parameters.
     * Parameters are matched positionally via their {@link ToolParam#name()}
     * annotation.
     *
     * @param params named parameter map from the LLM tool call
     * @return String result (or the result's {@code toString()} for non-String
     *         return types)
     */
    public String invoke(Map<String, Object> params) {
        try {
            Map<String, Object> safeParams = params != null ? params : Collections.emptyMap();
            Parameter[] methodParams = toolMethod.getParameters();
            Object[] args = new Object[methodParams.length];
            for (int i = 0; i < methodParams.length; i++) {
                Parameter p = methodParams[i];
                ToolParam tp = p.getAnnotation(ToolParam.class);
                if (tp == null) {
                    // non-annotated param — pass null (e.g. SkillContext injected elsewhere)
                    args[i] = null;
                } else {
                    Object raw = safeParams.get(tp.name());
                    args[i] = coerce(raw, p.getType());
                }
            }
            Object result = toolMethod.invoke(bean, args);
            return result == null ? "" : result.toString();
        } catch (Exception e) {
            log.error("Error invoking @SkillTool method {}.{}: {}",
                    bean.getClass().getSimpleName(), toolMethod.getName(), e.getMessage(), e);
            return "Error: " + e.getMessage();
        }
    }

    /**
     * Basic type coercion for common JSON→Java mappings.
     */
    private Object coerce(Object value, Class<?> targetType) {
        if (value == null) {
            return null;
        }
        if (targetType.isAssignableFrom(value.getClass())) {
            return value;
        }
        String str = value.toString();
        if (targetType == int.class || targetType == Integer.class) {
            return Integer.parseInt(str);
        } else if (targetType == long.class || targetType == Long.class) {
            return Long.parseLong(str);
        } else if (targetType == double.class || targetType == Double.class) {
            return Double.parseDouble(str);
        } else if (targetType == float.class || targetType == Float.class) {
            return Float.parseFloat(str);
        } else if (targetType == boolean.class || targetType == Boolean.class) {
            return Boolean.parseBoolean(str);
        } else {
            return str;
        }
    }
}
