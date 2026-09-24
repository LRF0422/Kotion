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
        props.put("task", Schemas.str("委派给子 agent 的完整任务描述（独立、自包含，可含具体要求与验收标准）。"
                + "这是子 agent 唯一的目标：请写明范围与边界，并明确是否可以修改文档"
                + "（例如“只检索并返回结果，不要修改任何页面”），避免子 agent 擅自改动文档。"));
        props.put("tools", Schemas.strArray("子 agent 可用的客户端工具名列表（可选；名字必须与工具目录完全一致，"
                + "大小写不敏感。缺省或全部不匹配时继承全部客户端工具）。"));
        props.put("maxSteps", Schemas.integer("子 agent 的最大步数（可选，默认继承配置）。"));
        props.put("timeoutSec", Schemas.integer("子 agent 超时秒数（可选，默认 600）。"));
        props.put("agentId", Schemas.str("插件 agent 的 id（可选）。用于日志与审计；可用工具仍由 tools 指定，"
                + "系统提示由 systemPrompt 指定。"));
        props.put("systemPrompt", Schemas.str("该子 agent 自己的系统提示（可选）。插件 agent 的人格与规则；"
                + "提供时子 agent 改用这段提示，并且【不继承】内核 agent 的技能片段与系统提示。"
                + "不提供时保持既有行为：继承父的人格/技能/记忆。"));
        props.put("skills", Schemas.strArray("保留给插件 agent 的技能名（可选，当前仅记录用途）。"));
        return ToolSpec.of("delegate",
                "把独立、可并行的子任务委派给一个子 agent 在后台并行执行，立即返回受理回执（含 subRunId）。"
                        + "派发后请继续完成你自己的部分，不要空等；子 agent 完成后会自动通知你，"
                        + "确实需要它的结果才能继续时再调用 wait_for_children。",
                Schemas.object(props, "task"), ToolKind.BACKEND, false, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        // The loop intercepts delegate calls before normal execution. Reaching
        // here means the interception was bypassed; fail loudly rather than
        // reporting a fake success.
        throw new IllegalStateException("delegate 必须由 AgentLoop 拦截执行，不应作为普通后端工具执行");
    }
}
