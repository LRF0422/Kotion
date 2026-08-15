package com.knowledge.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tool registry for managing and discovering tools.
 * Supports progressive discovery and tracks frontend vs backend tools.
 */
@Slf4j
@Component
public class ToolRegistry {

    private final Map<String, Tool> tools = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Bounded cache of rendered tool-schema JSON, keyed by (capabilities
     * version, tool-id set). The frontend sends a stable hash of its catalog,
     * so identical catalogs across turns render once.
     */
    private final ConcurrentHashMap<String, String> schemaCache = new ConcurrentHashMap<>();
    private static final int SCHEMA_CACHE_MAX = 128;

    /**
     * Register a tool.
     */
    public void register(Tool tool) {
        tools.put(tool.getId(), tool);
        log.debug("Registered tool: {} (frontend={})", tool.getId(), tool.isFrontend());
    }

    /**
     * Unregister a tool by ID.
     */
    public void unregister(String toolId) {
        tools.remove(toolId);
    }

    /**
     * Get a tool by ID.
     */
    public Tool get(String toolId) {
        return tools.get(toolId);
    }

    /**
     * Get all registered tools.
     */
    public Collection<Tool> getAll() {
        return Collections.unmodifiableCollection(tools.values());
    }

    /**
     * Get tool IDs for all registered tools.
     */
    public Set<String> getToolIds() {
        return Collections.unmodifiableSet(tools.keySet());
    }

    /**
     * Check if a tool is a frontend tool.
     */
    public boolean isFrontendTool(String toolId) {
        Tool tool = tools.get(toolId);
        return tool != null && tool.isFrontend();
    }

    /**
     * Whether a registered tool is read-only (safe in PLAN mode).
     */
    public boolean isReadOnlyTool(String toolId) {
        Tool tool = tools.get(toolId);
        return tool != null && tool.isReadOnly();
    }

    /**
     * IDs of all registered read-only backend tools — the PLAN-mode catalog.
     */
    public Set<String> getReadOnlyToolIds() {
        Set<String> result = new LinkedHashSet<>();
        for (Map.Entry<String, Tool> entry : tools.entrySet()) {
            if (entry.getValue().isReadOnly()) {
                result.add(entry.getKey());
            }
        }
        return result;
    }

    /**
     * Get all frontend tool IDs.
     */
    public Set<String> getFrontendToolIds() {
        Set<String> result = new LinkedHashSet<>();
        for (Map.Entry<String, Tool> entry : tools.entrySet()) {
            if (entry.getValue().isFrontend()) {
                result.add(entry.getKey());
            }
        }
        return result;
    }

    /**
     * Get tools by their IDs (for SubAgent assignment).
     */
    public List<Tool> getToolsByIds(Collection<String> toolIds) {
        List<Tool> result = new ArrayList<>();
        if (toolIds == null) {
            return result;
        }
        for (String id : toolIds) {
            Tool tool = tools.get(id);
            if (tool != null) {
                result.add(tool);
            }
        }
        return result;
    }

    /**
     * Build the tools JSON array for OpenAI function-calling.
     * Filters out frontend tools (those are handled client-side).
     */
    public String buildToolsJson() {
        return buildToolsJson(null, null);
    }

    /**
     * Build the tools JSON array, including frontend tools from the request.
     *
     * @param toolIds       tool IDs to include (null = all backend tools)
     * @param frontendTools frontend tools from the client request (merged into the
     *                      list)
     * @return JSON array string for the OpenAI tools parameter
     */
    public String buildToolsJson(Collection<String> toolIds, List<ChatTool> frontendTools) {
        try {
            List<Map<String, Object>> toolsList = new ArrayList<>();

            // 1. Add registered backend tools
            for (Map.Entry<String, Tool> entry : tools.entrySet()) {
                if (entry.getValue().isFrontend()) {
                    continue; // Skip frontend-registered tools — they go via frontendTools
                }
                if (toolIds != null && !toolIds.contains(entry.getKey())) {
                    continue;
                }
                Tool tool = entry.getValue();
                Map<String, Object> toolDef = new LinkedHashMap<>();
                toolDef.put("type", "function");

                Map<String, Object> function = new LinkedHashMap<>();
                function.put("name", tool.getId());
                function.put("description", tool.getDescription());
                Object schema = parseSchema(tool.getJsonSchema());
                if (schema != null) {
                    function.put("parameters", schema);
                }
                toolDef.put("function", function);
                toolsList.add(toolDef);
            }

            // 2. Add frontend tools from the request
            if (frontendTools != null) {
                for (ChatTool ft : frontendTools) {
                    if (ft.getFunction() == null) {
                        continue;
                    }
                    // Skip if already included as a registered backend tool
                    if (tools.containsKey(ft.getFunction().getName())
                            && !tools.get(ft.getFunction().getName()).isFrontend()) {
                        continue;
                    }
                    Map<String, Object> toolDef = new LinkedHashMap<>();
                    toolDef.put("type", "function");

                    Map<String, Object> function = new LinkedHashMap<>();
                    function.put("name", ft.getFunction().getName());
                    function.put("description", ft.getFunction().getDescription());
                    Object schema = parseSchema(ft.getFunction().getParameters() != null
                            ? ft.getFunction().getParameters().toString()
                            : null);
                    if (schema != null) {
                        function.put("parameters", schema);
                    }
                    toolDef.put("function", function);
                    toolsList.add(toolDef);
                }
            }

            return objectMapper.writeValueAsString(toolsList);
        } catch (Exception e) {
            log.error("Failed to build tools JSON", e);
            return "[]";
        }
    }

    /**
     * Build the tools JSON array for OpenAI function-calling.
     * Only includes backend tools with the given IDs. Frontend tools are excluded.
     *
     * @deprecated Use {@link #buildToolsJson(Collection, List)} to include frontend
     *             tools.
     */
    @Deprecated
    public String buildToolsJson(Collection<String> toolIds) {
        return buildToolsJson(toolIds, null);
    }

    /**
     * Build the tools JSON array, caching by the frontend's
     * {@code capabilitiesVersion} + tool-id set. A blank version bypasses the
     * cache (computed per call).
     */
    public String buildToolsJsonCached(String capabilitiesVersion,
            Collection<String> toolIds, List<ChatTool> frontendTools) {
        if (capabilitiesVersion == null || capabilitiesVersion.isEmpty()) {
            return buildToolsJson(toolIds, frontendTools);
        }
        String key = capabilitiesVersion + "|"
                + (toolIds == null ? "*" : new TreeSet<>(toolIds).toString());
        String cached = schemaCache.get(key);
        if (cached != null) {
            return cached;
        }
        String json = buildToolsJson(toolIds, frontendTools);
        if (schemaCache.size() >= SCHEMA_CACHE_MAX) {
            schemaCache.clear(); // simple bounded eviction
        }
        schemaCache.put(key, json);
        return json;
    }

    // ---- Schema normalization ----

    /**
     * Valid empty-object JSON Schema: {"type":"object","properties":{}}.
     * DeepSeek (and OpenAI) reject bare {} as an invalid JSON Schema.
     */
    private static final Map<String, Object> EMPTY_OBJECT_SCHEMA;
    static {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "object");
        m.put("properties", Collections.emptyMap());
        EMPTY_OBJECT_SCHEMA = Collections.unmodifiableMap(m);
    }

    /**
     * Parse a JSON schema string and normalize it.
     * <ul>
     * <li>null / empty → null (omit parameters field)</li>
     * <li>"{}" → {"type":"object","properties":{}} (valid empty schema)</li>
     * <li>valid schema → return as-is</li>
     * </ul>
     *
     * @param schemaStr JSON schema string, may be null
     * @return parsed schema object, or null to omit the field
     */
    private Object parseSchema(String schemaStr) {
        if (schemaStr == null || schemaStr.trim().isEmpty()) {
            return null;
        }
        try {
            Object schema = objectMapper.readValue(schemaStr, Object.class);
            if (schema instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) schema;
                if (map.isEmpty()) {
                    // {} → valid empty-object schema
                    return EMPTY_OBJECT_SCHEMA;
                }
                // If missing "type" key, wrap as object schema
                if (!map.containsKey("type")) {
                    Map<String, Object> wrapped = new LinkedHashMap<>();
                    wrapped.put("type", "object");
                    wrapped.putAll(map);
                    return wrapped;
                }
            }
            return schema;
        } catch (Exception e) {
            log.warn("Invalid JSON schema, omitting: {}", e.getMessage());
            return null;
        }
    }
}
