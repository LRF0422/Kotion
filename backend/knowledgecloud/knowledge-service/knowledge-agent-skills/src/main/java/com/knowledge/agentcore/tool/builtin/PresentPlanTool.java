package com.knowledge.agentcore.tool.builtin;

import com.knowledge.agentcore.tool.BackendTool;
import com.knowledge.agentcore.tool.ToolContext;
import com.knowledge.agentcore.tool.ToolKind;
import com.knowledge.agentcore.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Plan-mode tool: the model proposes a plan for approval. The LOOP intercepts
 * this tool name (never executes it as a normal backend tool) and suspends the
 * run in plan_approval; the resume carries the user decision.
 */
@Component
public class PresentPlanTool implements BackendTool {

    @Override
    public ToolSpec spec() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("plan", Schemas.str("计划内容：目标、步骤（编号）、每一步会用到的工具、预期结果与风险。"));
        props.put("summary", Schemas.str("一句话计划摘要（展示给用户）。"));
        return ToolSpec.of("present_plan",
                "向用户提交执行计划并等待批准（仅 plan 模式）。批准前不要执行任何写操作。",
                Schemas.object(props, "plan"), ToolKind.BACKEND, true, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        // The loop intercepts present_plan before normal execution — reaching
        // here means it slipped through (should not happen).
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("note", "plan delivered to the loop");
        return result;
    }
}
