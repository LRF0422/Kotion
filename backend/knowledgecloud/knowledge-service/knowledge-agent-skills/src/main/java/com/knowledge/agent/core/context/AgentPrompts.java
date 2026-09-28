package com.knowledge.agent.core.context;

/**
 * The agent's own prompt — owned by the backend and deliberately DOMAIN-BLIND.
 *
 * <p><b>The rule.</b> The backend is an agent. It knows how to use tools, when to
 * ask, when to remember and when to delegate. It does NOT know what the tools
 * are for: no document model, no block ids, no columns, no pages, no
 * product-surface concepts. Whatever the client's domain is reaches the model as
 * <em>data</em>:
 * <ul>
 *   <li>the tool catalog, whose descriptions say what each tool does and how to
 *       call it;</li>
 *   <li>the skills the client ships, whose fragments carry the domain policy
 *       ("read before you write", "address blocks by id", the workflow for this
 *       editor) and whose tool names the loop renders under each fragment.</li>
 * </ul>
 *
 * <p><b>Why.</b> Every time domain knowledge leaked into this prompt it drifted
 * from the side that actually owned it. The persona once advertised an
 * {@code editor.*} tool family long after the client had removed tool
 * namespacing, so the model invented {@code editor_insertBlocks}, the backend
 * answered {@code TOOL_NOT_FOUND}, and the turn was spent guessing names. Moving
 * the client's editor rules in here instead only inverts the mistake: the agent
 * would then describe documents, pages and columns that other clients — or no
 * client — may not have.
 *
 * <p>Two properties to preserve when editing this file:
 * <ul>
 *   <li>Only the backend's OWN tools may be named ({@code web_search},
 *       {@code delegate}, {@code remember}, …). A client tool name here is a
 *       coupling bug.</li>
 *   <li>This text sits at message index 0, so a change invalidates the provider
 *       prefix cache for every conversation in flight. Per-turn material belongs
 *       in the injected {@code <context>} block, not here.</li>
 * </ul>
 */
final class AgentPrompts {

    private AgentPrompts() {
    }

    /** System prompt for every agent run. */
    static final String AGENT_SYSTEM_PROMPT =
            "你是一个能调用工具完成任务的 Agent。\n"
            + "\n"
            + "# 能力来源\n"
            + "- 你的能力来自本次运行提供的**工具**（function 定义）与**技能**（skill）说明。\n"
            + "- 技能说明描述当前场景的领域知识与工作方式：按它执行。\n"
            + "- 工具名就是函数名，没有命名空间前缀；不要自己拼前缀或编造工具名。"
            + "没有把握就先读/查，不要猜。\n"
            + "- 只使用本次运行真实提供的工具；需要的能力如果没有对应工具，如实说明。\n"
            + "\n"
            + "# 工作方式\n"
            + "1. 先了解现状再动手：修改前先用只读工具确认目标与现有内容。\n"
            + "2. 相关改动尽量合并到一次调用里，避免大量细小往返。\n"
            + "3. 破坏性操作前先确认；任务有歧义时先问用户。\n"
            + "4. 长任务先用工作记忆（scratchpad）记录计划与进度，分步执行。\n"
            + "5. 不要用“我先…/接下来…”这类只描述计划的句子结束回复：要么立刻调用工具把事情做完，"
            + "要么在真正完成后才汇报；只有任务确实完成、或必须等待用户确认/输入时才结束回合。\n"
            + "6. 完成后用简洁的语言说明做了什么。\n"
            + "\n"
            + "# 你的内置工具\n"
            + "- 检索：web_search / web_fetch\n"
            + "- 长期记忆：remember / recall_memory / forget_memory\n"
            + "- 工作记忆：get_scratchpad / update_scratchpad\n"
            + "- 委派：delegate（子 agent 后台并行执行），需要结果时用 wait_for_children 等待\n"
            + "- 计划：present_plan（plan 模式下提交计划等待批准）\n"
            + "- 其他：get_run_state；save_conversation_as_skill（仅当用户明确要求把当前会话保存为 Skill）\n"
            + "\n"
            + "# LANGUAGE\n"
            + "用用户使用的语言回答。";
}
