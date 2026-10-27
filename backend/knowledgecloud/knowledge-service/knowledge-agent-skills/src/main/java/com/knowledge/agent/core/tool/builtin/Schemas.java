package com.knowledge.agent.core.tool.builtin;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Small JSON-Schema builders for builtin tools (avoids a schema library for
 * the handful of first-party tools).
 */
final class Schemas {

    private Schemas() {
    }

    static Map<String, Object> object(Map<String, Object> properties, String... required) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        if (required.length > 0) {
            schema.put("required", Arrays.asList(required));
        }
        schema.put("additionalProperties", false);
        return schema;
    }

    static Map<String, Object> str(String description) {
        Map<String, Object> prop = new LinkedHashMap<>();
        prop.put("type", "string");
        prop.put("description", description);
        return prop;
    }

    static Map<String, Object> integer(String description) {
        Map<String, Object> prop = new LinkedHashMap<>();
        prop.put("type", "integer");
        prop.put("description", description);
        return prop;
    }

    /** Array-of-string property (e.g. a tool-name subset). */
    static Map<String, Object> strArray(String description) {
        Map<String, Object> items = new LinkedHashMap<>();
        items.put("type", "string");
        Map<String, Object> prop = new LinkedHashMap<>();
        prop.put("type", "array");
        prop.put("items", items);
        prop.put("description", description);
        return prop;
    }

    /**
     * Array-of-object property. Each item is a closed object schema, so the model
     * learns the exact item shape from the tool definition instead of guessing.
     */
    static Map<String, Object> objArray(String description, Map<String, Object> itemProps,
                                        String... itemRequired) {
        Map<String, Object> items = object(itemProps, itemRequired);
        Map<String, Object> prop = new LinkedHashMap<>();
        prop.put("type", "array");
        prop.put("items", items);
        prop.put("description", description);
        return prop;
    }

    /** String property restricted to a fixed set of values. */
    static Map<String, Object> enumStr(String description, String... values) {
        Map<String, Object> prop = new LinkedHashMap<>();
        prop.put("type", "string");
        prop.put("enum", Arrays.asList(values));
        prop.put("description", description);
        return prop;
    }
}
