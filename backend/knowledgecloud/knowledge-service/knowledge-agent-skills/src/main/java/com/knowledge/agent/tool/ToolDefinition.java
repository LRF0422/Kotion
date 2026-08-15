package com.knowledge.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * JSON schema definition for LLM tool-calling.
 *
 * <p>Built with Jackson typed nodes: the previous hand-concatenated JSON only
 * escaped quotes/backslashes (breaking on newlines, control characters and
 * non-ASCII sequences) and silently dropped the {@code items} type of array
 * properties. Jackson guarantees well-formed, properly escaped output.
 */
public final class ToolDefinition {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ToolDefinition() {
    }

    /**
     * Build a simple object schema with properties.
     */
    public static String objectSchema(Map<String, PropertyDef> properties, List<String> required) {
        ObjectNode root = MAPPER.createObjectNode();
        root.put("type", "object");
        ObjectNode props = root.putObject("properties");
        if (properties != null) {
            for (Map.Entry<String, PropertyDef> entry : properties.entrySet()) {
                props.set(entry.getKey(), entry.getValue().toNode());
            }
        }
        if (required != null && !required.isEmpty()) {
            ArrayNode req = root.putArray("required");
            for (String r : required) {
                req.add(r);
            }
        }
        return root.toString();
    }

    /**
     * Property definition in a tool schema.
     */
    public static class PropertyDef {
        private final String type;
        private final String description;
        private final List<String> enumValues;
        private final String itemType;

        private PropertyDef(String type, String description, List<String> enumValues, String itemType) {
            this.type = type;
            this.description = description;
            this.enumValues = enumValues;
            this.itemType = itemType;
        }

        public static PropertyDef string(String description) {
            return new PropertyDef("string", description, null, null);
        }

        public static PropertyDef string(String description, String... enumValues) {
            return new PropertyDef("string", description,
                    enumValues != null ? Arrays.asList(enumValues) : null, null);
        }

        public static PropertyDef number(String description) {
            return new PropertyDef("number", description, null, null);
        }

        public static PropertyDef bool(String description) {
            return new PropertyDef("boolean", description, null, null);
        }

        public static PropertyDef array(String description, String itemType) {
            return new PropertyDef("array", description, null, itemType);
        }

        public static PropertyDef object(String description) {
            return new PropertyDef("object", description, null, null);
        }

        ObjectNode toNode() {
            ObjectNode node = MAPPER.createObjectNode();
            node.put("type", type);
            if (description != null) {
                node.put("description", description);
            }
            if (enumValues != null) {
                ArrayNode arr = node.putArray("enum");
                for (String v : enumValues) {
                    arr.add(v);
                }
            }
            if ("array".equals(type) && itemType != null) {
                ObjectNode items = node.putObject("items");
                items.put("type", itemType);
            }
            return node;
        }
    }
}
