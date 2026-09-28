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

/** Prompt-only skill framing a workspace-scoped run (kernel home, no document). */
export const workspaceHomeSkill: AgentSkillInput = {
    name: 'workspace-home',
    systemPromptFragment: [
        '# 工作台助手',
        '',
        '你在知识库的**工作台首页**中工作，当前没有打开的文档。',
        '',
        '- 你的能力来自**当前已安装的插件**：只用工具列表里真实存在的工具，不要假设拥有某个能力。',
        '- 需要外部资料时用检索类工具；需要在知识库里找内容时用已提供的页面/内容工具。',
        '- 需要落地成果时，把结果写进一个新的或已有的页面，而不是只在对话里回答。',
        '- 涉及创建、修改、删除内容时，先说明你打算做什么，再调用工具。',
    ].join('\n'),
}
