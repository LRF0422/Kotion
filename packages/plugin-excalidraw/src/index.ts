
import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common"
import { ExcalidrawExtension, excalidrawSkills, excalidrawTools } from "./excalidraw"
import "@kn/ui/globals.css"


interface ExcalidrawPluginConfig extends PluginConfig {



}
class ExcalidrawPlugin extends KPlugin<ExcalidrawPluginConfig> {
}

export const excalidraw = new ExcalidrawPlugin({
    status: '',
    name: 'Excalidraw',
    editorExtension: [ExcalidrawExtension],
    /**
     * Plugin agent (docs/plugin-agents.md): Excalidraw 工具与技能归属该 agent，
     * 只在委派给它的子 run 里出现，不再进入内核 agent 的扁平工具目录。
     * scope 'page'：每个工具都需要当前编辑器实例。
     */
    agent: {
        agents: [
            {
                id: 'excalidraw-ops',
                name: 'Excalidraw 手绘图专家',
                description: '需要向当前页面添加或管理 Excalidraw 手绘风格图（流程图、架构图、思维导图、时序图、自定义图形）时委派给它：优先用 createExcalidrawFromGraph 由「节点+边」自动布局，也支持模板、查询、更新和删除页面内的手绘图。',
                scope: 'page',
                systemPrompt: [
                    '你是当前页面的 Excalidraw 绘图操作员，只处理这一页里的手绘图。',
                    '优先把需求描述成「节点 + 边」并调用 createExcalidrawFromGraph 自动布局，确有需要才用 insertExcalidrawDiagram 指定 elements 或模板。',
                    '更新或删除前先用 listExcalidrawDiagrams 查位置，插入优先用 nearText 定位。',
                    '不要改动正文其他内容，也不要越权操作其他页面；完成后用简短中文汇报节点/元素数量、图表类型和插入位置，失败则说明原因。',
                ].join('\n'),
                tools: liftLegacyTools(excalidrawTools, { scope: 'page' }),
                skills: liftLegacySkills(excalidrawSkills),
            },
        ],
    },
})