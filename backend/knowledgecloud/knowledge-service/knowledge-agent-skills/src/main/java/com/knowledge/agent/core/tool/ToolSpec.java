package com.knowledge.agentcore.tool;

import lombok.Data;

import java.util.Map;

/**
 * Tool declaration — the unified contract for backend builtins, remote skills
 * and client-declared (editor) tools.
 */
@Data
public class ToolSpec {

    private String name;

    private String description;

    /** JSON Schema object for the arguments. */
    private Map<String, Object> inputSchema;

    private String kind = ToolKind.BACKEND.name();

    /** Read-only tools remain allowed in plan mode. */
    private boolean readOnly;

    /** builtin | skill | client */
    private String source = "builtin";

    public static ToolSpec of(String name, String description, Map<String, Object> inputSchema,
                              ToolKind kind, boolean readOnly, String source) {
        ToolSpec spec = new ToolSpec();
        spec.setName(name);
        spec.setDescription(description);
        spec.setInputSchema(inputSchema);
        spec.setKind(kind.name());
        spec.setReadOnly(readOnly);
        spec.setSource(source);
        return spec;
    }
}
