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
}
