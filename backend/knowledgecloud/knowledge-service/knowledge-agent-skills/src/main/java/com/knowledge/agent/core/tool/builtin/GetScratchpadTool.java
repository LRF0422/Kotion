package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Working-memory tool: read the current scratchpad.
 */
@Component
public class GetScratchpadTool implements BackendTool {

    @Override
    public ToolSpec spec() {
        return ToolSpec.of("get_scratchpad",
                "Read the run's current working-memory scratchpad.",
                Schemas.object(new LinkedHashMap<>()), ToolKind.BACKEND, true, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scratchpad", context.getScratchpad().read());
        return result;
    }
}
