/**
 * Surface-declared skills.
 *
 * A surface may need to frame the work it offers — "you are on the workbench, no
 * document is open, your capabilities are the installed plugins". That framing is
 * the surface's own knowledge, so it travels as a skill, exactly like the
 * editor's domain policy does: the backend agent is domain-blind and renders
 * whatever the run ships.
 *
 * These deliberately do NOT live in the shared built-in catalog: the catalog is
 * shipped to every surface, and a skill registered there would describe the
 * workbench to a document-scoped run as well.
 */

import type { AgentSkillInput } from '../agent/types'

/**
 * Prompt-only skill framing a workspace-scoped run (kernel home).
 *
 * The workbench is a GENERAL assistant surface. Starting without a document is
 * the normal state, not a missing capability, and writing into a page is one
 * possible outcome rather than the default way to "land" an answer.
 *
 * The document capability used to be described here as "always write into a
 * page", which made every task start with `createPage` and turned the workbench
 * into a document editor with a chat box. The rule now mirrors the built-in
 * `general-assistant` identity: answer directly when the request is a question,
 * and when content really needs a page ask WHERE before creating one. The
 * document policy itself is a capability pack (`capability:document`) loaded on
 * demand, so this surface does not carry it unless a target exists.
 */
export const workspaceHomeSkill: AgentSkillInput = {
    name: 'workspace-home',
    systemPromptFragment: [
        '# 工作台助手',
        '',
        '你在知识库的**工作台首页**里工作。这里没有默认打开的文档，这是正常的起始状态，不是缺少能力。',
        '',
        '## 先判断要不要动文档',
        '',
        '- 用户提问、查资料、讨论、总结 → 直接回答（需要时用检索工具）。**不要为了“落地”而建页。**',
        '- 用户要产出一份内容：先确认位置，再动手。用 `askUserChoice` 给出三个选项：',
        '  1. 新建一个页面 2. 写进已有页面（让用户选/给出页面） 3. 只在对话里给出内容',
        '  不要默认选“新建页面”，也不要让用户先手动打开页面。',
        '- 用户确认后：新建用 `createPage`，已有页面用 `editPage(pageId)`（pageId 先用 `searchPages` / `getSpacePageTree` 查）。',
        '',
        '## 当前操作对象',
        '',
        '不确定“现在操作的是什么”时，先调 `getCurrentTarget` —— 它可能是页面，也可能是文件/表格/图表等插件对象。',
        '不要假设一定是页面，也不要直接套用页面工具；按对象类型选择工具。',
        '',
        '## 文档能力',
        '',
        '文档编辑是按需能力，不是你的默认身份。需要读写正文规则时先 `load_skill(\'document-editing\')`，',
        '它会返回文档模型、按 blockId 安全编辑的规则和工具参数；已经加载过的技能在本会话里保持可调用。',
        '',
        '## 通用要求',
        '',
        '- 只用工具列表里**真实存在**的工具（或 `load_skill` 能取到的）；不要臆造工具名。',
        '- 涉及创建、修改、删除内容时，先说明你打算做什么，再调用工具。',
        '- 如果确实缺少某个能力（例如某个插件没装），直接说明缺什么，不要含糊地说"调不通"。',
        '- 不要用“我先…/接下来…”这类只描述计划的句子结束回复：要么立刻调用工具，要么在真正完成后才汇报。',
    ].join('\n'),
}