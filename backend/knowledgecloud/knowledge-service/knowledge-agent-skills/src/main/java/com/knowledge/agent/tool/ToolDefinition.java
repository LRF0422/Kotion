package com.knowledge.agent.tool;

/**
 * JSON schema definition for LLM tool-calling.
 * Utility class for building tool parameter schemas.
 */
public final class ToolDefinition {

    private ToolDefinition() {
    }

    /**
     * Build a simple object schema with properties.
     */
    public static String objectSchema(java.util.Map<String, PropertyDef> properties, java.util.List<String> required) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"type\":\"object\",\"properties\":{");
        boolean first = true;
        for (java.util.Map.Entry<String, PropertyDef> entry : properties.entrySet()) {
            if (!first)
                sb.append(",");
            first = false;
            sb.append("\"").append(entry.getKey()).append("\":");
            sb.append(entry.getValue().toJson());
        }
        sb.append("}");
        if (required != null && !required.isEmpty()) {
            sb.append(",\"required\":[");
            for (int i = 0; i < required.size(); i++) {
                if (i > 0)
                    sb.append(",");
                sb.append("\"").append(required.get(i)).append("\"");
            }
            sb.append("]");
        }
        sb.append("}");
        return sb.toString();
    }

    /**
     * Property definition in a tool schema.
     */
    public static class PropertyDef {
        private final String type;
        private final String description;
        private final String enumValues; // JSON array string or null

        private PropertyDef(String type, String description, String enumValues) {
            this.type = type;
            this.description = description;
            this.enumValues = enumValues;
        }

        public static PropertyDef string(String description) {
            return new PropertyDef("string", description, null);
        }

        public static PropertyDef string(String description, String... enumValues) {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < enumValues.length; i++) {
                if (i > 0)
                    sb.append(",");
                sb.append("\"").append(enumValues[i]).append("\"");
            }
            sb.append("]");
            return new PropertyDef("string", description, sb.toString());
        }

        public static PropertyDef number(String description) {
            return new PropertyDef("number", description, null);
        }

        public static PropertyDef bool(String description) {
            return new PropertyDef("boolean", description, null);
        }

        public static PropertyDef array(String description, String itemType) {
            return new PropertyDef("array", description, null);
        }

        public static PropertyDef object(String description) {
            return new PropertyDef("object", description, null);
        }

        public String toJson() {
            StringBuilder sb = new StringBuilder();
            sb.append("{\"type\":\"").append(type).append("\"");
            if (description != null) {
                sb.append(",\"description\":\"").append(escape(description)).append("\"");
            }
            if (enumValues != null) {
                sb.append(",\"enum\":").append(enumValues);
            }
            sb.append("}");
            return sb.toString();
        }

        private String escape(String s) {
            return s.replace("\\", "\\\\").replace("\"", "\\\"");
        }
    }
}
