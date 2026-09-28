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
 * cannot infer: it must know that the way to write anything — text, a chart, a
 * bitable — is to first `createPage` or `editPage` (retarget to an existing page),
 * because acquiring that page's editor is what brings the document and page-scoped
 * plugin tools into the run. Without this, a run honestly reports
 * "createPage 未注册、调不通" and the user's request to build a report dies at
 * step one.
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
        '工作台**一开始没有打开任何文档**，所以文档类工具（读写块、插入图表/多维表格等）此时不在你的工具列表里 ——',
        '这不是"没有这个能力"，而是"还没有确定要写哪个页面"。',
        '',
        '要写内容（正文、图表、多维表格、图示……）：',
        '1. 先确定目标页面：新建用 `createPage`；**编辑已有页面用 `editPage(pageId)`**',
        '   （pageId 先用 `searchPages` / `getSpacePageTree` 查到），两者都不离开用户当前界面；',
        '2. 页面确定后，这个会话就获得了完整的文档编辑能力：正文读写/格式/表格等内置工具**立刻可用**，',
        '   插件能力（图表、多维表格、图示等）再按需用 `load_skill` 取参数格式；',
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
