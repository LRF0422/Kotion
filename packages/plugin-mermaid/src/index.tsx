
import { KPlugin, PluginConfig } from "@kn/common"
import { MermaidExtension } from "./editor-extension/mermaid"

interface MermaidPluginConfig extends PluginConfig {



}
class MermaidPlugin extends KPlugin<MermaidPluginConfig> {
}

export const mermaid = new MermaidPlugin({
    status: '',
    name: 'Mermaid',
    editorExtension: [MermaidExtension],
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