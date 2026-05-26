package com.knowledge.agent.tool.builtin.data;

import com.knowledge.agent.tool.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Tool for data processing tasks.
 */
@Slf4j
@Component
public class DataProcessTool implements Tool {

    @Override
    public String getId() {
        return "data_process";
    }

    @Override
    public String getDescription() {
        return "Process and transform data. Supports filtering, sorting, aggregation, and format conversion.";
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
        log.info("DataProcessTool called with args: {}", args);
        // TODO: Migrate actual data process logic from DataProcessSkill
        return ToolResult.success("[Data process not yet migrated — args: " + args + "]");
    }
}
