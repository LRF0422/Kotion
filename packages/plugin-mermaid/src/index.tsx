
import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common"
import { MermaidExtension, mermaidSkills, mermaidTools } from "./editor-extension/mermaid"

interface MermaidPluginConfig extends PluginConfig {



}
class MermaidPlugin extends KPlugin<MermaidPluginConfig> {
}

export const mermaid = new MermaidPlugin({
    status: '',
    name: 'Mermaid',
    editorExtension: [MermaidExtension],
    /**
     * Plugin agent (docs/plugin-agents.md): Mermaid 工具与技能归属该 agent，
     * 只在委派给它的子 run 里出现，不再进入内核 agent 的扁平工具目录。
     * scope 'page'：每个工具都需要当前编辑器实例。
     */
    agent: {
        agents: [
            {
                id: 'mermaid-ops',
                name: 'Mermaid 图表专家',
                description: '需要创建、查看、修改或删除当前页面里的 Mermaid 图表（流程图、时序图、类图、状态图、ER 图、甘特图、饼图、思维导图、时间线、Git 图等）时，委派给它：它会按需求生成 Mermaid 代码并把图表落到页面里，也能定位并更新或删除已有图表。',
                scope: 'page',
                systemPrompt: [
                    '你是当前页面的 Mermaid 图表操作员，只处理这一页里的 Mermaid 图表。',
                    '先调用 listMermaidDiagrams 或 getMermaidTemplates 了解现状，再用 insertMermaidDiagram / updateMermaidDiagram / deleteMermaidDiagram 落地，插入时优先用 nearText 定位。',
                    '不要改动与图表无关的正文，也不要越权操作其他页面或知识库。',
                    '完成后用简短中文汇报做了什么改动、图表类型和所在位置；失败则说明原因。',
                ].join('\n'),
                tools: liftLegacyTools(mermaidTools, { scope: 'page' }),
                skills: liftLegacySkills(mermaidSkills),
            },
        ],
    },
    locales: {
        en: {
            translation: {
                mermaid: {
                    title: 'Mermaid Diagram',
                    editDescription: 'Supports flowcharts, sequence diagrams, class diagrams and more\nStart typing on the left to preview',
                    viewDescription: 'Agent will generate Mermaid diagram for you',
                    learnSyntax: 'Learn Mermaid Syntax',
                },
            },
        },
        zh: {
            translation: {
                mermaid: {
                    title: 'Mermaid 图表',
                    editDescription: '支持流程图、时序图、类图等\n在左侧输入代码即可预览',
                    viewDescription: 'AI 将为你生成 Mermaid 图表',
                    learnSyntax: '学习 Mermaid 语法',
                },
            },
        },
    },
})