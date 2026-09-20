package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Explicit wait on delegated children. The LOOP intercepts this name (parking
 * the run until the requested children settle, then answering with their
 * results) — this bean only declares the catalog entry so the LLM can see and
 * call it.
 *
 * <p>Delegation is asynchronous: {@code delegate} returns an acknowledgement
 * immediately and the parent keeps working. This tool is how the main agent
 * says "I have nothing left to do until these results arrive" and parks itself
 * on purpose, instead of being blocked the moment it spawns a child.
 */
@Component
public class WaitForChildrenTool implements BackendTool {

    @Override
    public ToolSpec spec() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("subRunIds", Schemas.strArray("要等待的子 agent run id 列表（可选）。"
                + "缺省表示等待当前所有仍在运行的子 agent。id 取自 delegate 的回执或后台完成通知。"));
        props.put("timeoutSec", Schemas.integer("本次等待的最长秒数（可选）。"
                + "到点仍未完成的子 agent 以 running 状态返回，不会被取消；缺省等待到子 agent 自身的超时。"));
        return ToolSpec.of("wait_for_children",
                "等待子 agent 完成并返回它们的结果（阻塞当前主 agent，直到结果返回）。"
                        + "只有在确实需要子 agent 结果才能继续时才调用；否则应继续做自己的工作 —— "
                        + "子 agent 完成后会自动以通知形式把结果发给你。",
                Schemas.object(props), ToolKind.BACKEND, true, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        // The loop intercepts wait_for_children calls before normal execution.
        // Reaching here means the interception was bypassed; fail loudly rather
        // than reporting a fake success.
        throw new IllegalStateException("wait_for_children 必须由 AgentLoop 拦截执行，不应作为普通后端工具执行");
    }
}
