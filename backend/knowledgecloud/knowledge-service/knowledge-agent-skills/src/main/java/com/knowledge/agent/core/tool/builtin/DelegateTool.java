package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Sub-agent delegation tool. The LOOP intercepts the {@code delegate} name
 * (spawning child runs through the Delegator) — this bean only declares the
 * catalog entry so the LLM can see and call it.
 */
@Component
public class DelegateTool implements BackendTool {

    @Override
    public ToolSpec spec() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("task", Schemas.str("委派给子 agent 的完整任务描述（独立、自包含，可含具体要求与验收标准）。"));
        props.put("tools", Schemas.str("子 agent 可用的编辑器工具名列表（JSON 数组，可选；缺省继承全部客户端工具）。"));
        props.put("maxSteps", Schemas.integer("子 agent 的最大步数（可选，默认继承配置）。"));
        props.put("timeoutSec", Schemas.integer("子 agent 超时秒数（可选，默认 600）。"));
        return ToolSpec.of("delegate",
                "把独立、可并行的子任务委派给一个子 agent 执行，完成后返回子 agent 的结果文本。"
                        + "适合并行调研、分块起草、事实核查等。",
                Schemas.object(props, "task"), ToolKind.BACKEND, false, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        // The loop intercepts delegate calls before normal execution.
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("note", "delegation handled by the loop");
        return result;
    }
}
