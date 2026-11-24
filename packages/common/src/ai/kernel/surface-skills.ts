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
 * The workbench STARTS without a document, and that is the one thing the model
 * cannot infer: document tools are advertised up front (a run's tool list is
 * frozen at creation), but each call needs a target page. The model must know
 * that writing anything — text, a chart, a bitable — starts with `createPage`
 * or `editPage` (retarget to an existing page), and that a missing target is an
 * actionable error rather than a missing capability. Without this, a run
 * honestly reports "createPage 未注册、调不通" and the user's request to build a
 * report dies at step one.
 */
export const workspaceHomeSkill: AgentSkillInput = {
    name: 'workspace-home',
    systemPromptFragment: [
        '# 工作台助手',
        '',
        '你在知识库的**工作台首页**里工作。这里可以直接动手：搜索资料、创建页面、把成果写进页面。',
        '',
        '## 关于文档能力',
        '',
        '工作台**一开始可能没有打开任何文档**。文档工具仍然在工具列表里，但**每次调用都会校验"这一轮写哪个页面"**：',
        '没有编辑目标时会返回明确错误（先 createPage / editPage），不会把内容写到用户当前正在看的别的页面。',
        '',
        '要写内容（正文、图表、多维表格、图示……）：',
        '1. 先确认目标：新建用 `createPage`；**编辑已有页面用 `editPage(pageId)`**',
        '   （pageId 先用 `searchPages` / `getSpacePageTree` 查到），两者都不离开用户当前界面；',
        '   不确定"现在操作的是什么"时，先调 `getCurrentTarget` —— 它可能是页面，也可能是文件/表格/图表等插件对象，',
        '   不要假设一定是页面，也不要直接套用页面工具；',
        '2. 页面确定后，这个会话就获得了完整的文档编辑能力：正文读写/格式/表格等内置工具**在同一条 run 里立刻可用**，',
        '   插件能力（图表、多维表格、图示等）再按需用 `load_skill` 取它的说明和参数格式；',
        '   已经加载过的技能在本会话里保持可调用，不用再加载；',
        '3. 同一个会话里继续往下写即可，不需要让用户先手动打开页面。',
        '',
        '## 通用要求',
        '',
        '- 只用工具列表里**真实存在**的工具（或 `load_skill` 能取到的）；不要臆造工具名。',
        '- 需要落地成果时，写进页面，而不是只在对话里回答。',
        '- 涉及创建、修改、删除内容时，先说明你打算做什么，再调用工具。',
        '- 如果确实缺少某个能力（例如某个插件没装），直接说明缺什么，不要含糊地说"调不通"。',
    ].join('\n'),
}
