package com.knowledge.agent.tool.builtin.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Tool for data processing tasks: filter / sort / aggregate over a JSON array
 * payload (list of objects), plus JSON⇄pretty conversion.
 *
 * <p>Previously an empty shell that declared capability it did not have —
 * the LLM could call it and silently receive a "not migrated" placeholder.
 * The implementation keeps the contract conservative: it only accepts data
 * passed inline (no side effects), so it is also PLAN-mode safe.
 */
@Slf4j
@Component
public class DataProcessTool implements Tool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String getId() {
        return "data_process";
    }

    @Override
    public String getDescription() {
        return "Process and transform inline data. Supports filtering, sorting, aggregation, and format conversion.";
    }

    @Override
    public boolean isReadOnly() {
        return true;
    }

    @Override
    public String getJsonSchema() {
        return ToolDefinition.objectSchema(
                new LinkedHashMap<String, ToolDefinition.PropertyDef>() {
                    {
                        put("operation", ToolDefinition.PropertyDef.string("Operation to perform", "filter", "sort",
                                "aggregate", "convert"));
                        put("data", ToolDefinition.PropertyDef.string("Input data or data reference"));
                        put("params", ToolDefinition.PropertyDef.string("Operation parameters as JSON"));
                    }
                },
                Arrays.asList("operation", "data"));
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        try {
            Map<String, Object> parsed = MAPPER.readValue(args == null ? "{}" : args, Map.class);
            String operation = String.valueOf(parsed.getOrDefault("operation", ""));
            Object dataObj = parsed.get("data");
            Map<String, Object> params = parseParams(parsed.get("params"));

            // "convert": JSON string → pretty-printed JSON
            if ("convert".equals(operation)) {
                if (dataObj instanceof String) {
                    Object converted = MAPPER.readValue((String) dataObj, Object.class);
                    return ToolResult.success(MAPPER.writerWithDefaultPrettyPrinter()
                            .writeValueAsString(converted));
                }
                return ToolResult.success(MAPPER.writerWithDefaultPrettyPrinter()
                        .writeValueAsString(dataObj));
            }

            List<Map<String, Object>> rows = toRows(dataObj);
            if (rows == null) {
                return ToolResult.error("data_process: data must be a JSON array of objects for '"
                        + operation + "'");
            }

            switch (operation) {
                case "filter": {
                    String field = String.valueOf(params.getOrDefault("field", ""));
                    String value = String.valueOf(params.getOrDefault("value", ""));
                    String op = String.valueOf(params.getOrDefault("operator", "equals"));
                    List<Map<String, Object>> out = rows.stream()
                            .filter(r -> match(r.get(field), value, op))
                            .collect(Collectors.toList());
                    return ToolResult.success(MAPPER.writeValueAsString(out));
                }
                case "sort": {
                    String field = String.valueOf(params.getOrDefault("field", ""));
                    boolean desc = "desc".equalsIgnoreCase(
                            String.valueOf(params.getOrDefault("order", "asc")));
                    Comparator<Map<String, Object>> cmp = Comparator.comparing(
                            r -> String.valueOf(r.getOrDefault(field, "")),
                            Comparator.nullsLast(Comparator.naturalOrder()));
                    List<Map<String, Object>> out = rows.stream()
                            .sorted(desc ? cmp.reversed() : cmp)
                            .collect(Collectors.toList());
                    return ToolResult.success(MAPPER.writeValueAsString(out));
                }
                case "aggregate": {
                    String field = String.valueOf(params.getOrDefault("field", ""));
                    String method = String.valueOf(params.getOrDefault("method", "count"));
                    if ("count".equals(method)) {
                        return ToolResult.success(String.valueOf(rows.size()));
                    }
                    double sum = 0;
                    double min = Double.MAX_VALUE;
                    double max = -Double.MAX_VALUE;
                    int n = 0;
                    for (Map<String, Object> r : rows) {
                        Object v = r.get(field);
                        if (v instanceof Number) {
                            double d = ((Number) v).doubleValue();
                            sum += d;
                            min = Math.min(min, d);
                            max = Math.max(max, d);
                            n++;
                        }
                    }
                    if (n == 0) {
                        return ToolResult.error("data_process: field '" + field
                                + "' has no numeric values");
                    }
                    switch (method) {
                        case "sum":
                            return ToolResult.success(String.valueOf(sum));
                        case "avg":
                            return ToolResult.success(String.valueOf(sum / n));
                        case "min":
                            return ToolResult.success(String.valueOf(min));
                        case "max":
                            return ToolResult.success(String.valueOf(max));
                        default:
                            return ToolResult.error("data_process: unknown aggregate method " + method);
                    }
                }
                default:
                    return ToolResult.error("data_process: unknown operation " + operation);
            }
        } catch (Exception e) {
            log.warn("data_process failed: {}", e.getMessage());
            return ToolResult.error("data_process failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseParams(Object paramsObj) throws Exception {
        if (paramsObj == null) {
            return Collections.emptyMap();
        }
        if (paramsObj instanceof Map) {
            return (Map<String, Object>) paramsObj;
        }
        return MAPPER.readValue(String.valueOf(paramsObj), new TypeReference<Map<String, Object>>() {
        });
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> toRows(Object dataObj) throws Exception {
        if (dataObj instanceof List) {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (Object o : (List<Object>) dataObj) {
                if (!(o instanceof Map)) {
                    return null;
                }
                rows.add((Map<String, Object>) o);
            }
            return rows;
        }
        if (dataObj instanceof String) {
            Object parsed = MAPPER.readValue((String) dataObj, Object.class);
            return toRows(parsed);
        }
        return null;
    }

    private boolean match(Object actual, String expected, String op) {
        String a = actual != null ? String.valueOf(actual) : "";
        switch (op) {
            case "contains":
                return a.contains(expected);
            case "not_equals":
                return !a.equals(expected);
            case "gt":
                return Double.parseDouble(a) > Double.parseDouble(expected);
            case "lt":
                return Double.parseDouble(a) < Double.parseDouble(expected);
            default:
                return a.equals(expected);
        }
    }
}
