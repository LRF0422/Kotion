package com.knowledge.agentcore.tool.builtin;

import com.knowledge.agentcore.tool.BackendTool;
import com.knowledge.agentcore.tool.ToolContext;
import com.knowledge.agentcore.tool.ToolKind;
import com.knowledge.agentcore.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Self-orientation tool: the agent can inspect its own run state (step, mode,
 * scratchpad) — useful in plan mode and for long multi-step tasks.
 */
@Component
public class GetRunStateTool implements BackendTool {

    @Override
    public ToolSpec spec() {
        return ToolSpec.of("get_run_state",
                "Get the current run state: run id, step number, mode and working-memory scratchpad.",
                Schemas.object(new LinkedHashMap<>()), ToolKind.BACKEND, true, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("runId", context.getRunId());
        result.put("step", context.getStep());
        result.put("mode", context.getMode());
        result.put("scratchpad", context.getScratchpad().read());
        return result;
    }
}
