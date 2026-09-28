
import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common"
import { ChartExtension, chartSkills, chartTools } from "./editor-extension/chart"

interface ChartPluginConfig extends PluginConfig {

}

class ChartPlugin extends KPlugin<ChartPluginConfig> {
}

export const chart = new ChartPlugin({
    status: '',
    name: 'Chart',
    editorExtension: [ChartExtension],
    /**
     * Plugin agent (docs/plugin-agents.md): Chart 工具与技能归属该 agent，
     * 只在委派给它的子 run 里出现，不再进入内核 agent 的扁平工具目录。
     * scope 'page'：每个工具都需要当前编辑器实例。
     */
    agent: {
        agents: [
            {
                id: 'chart-ops',
                name: '数据图表专家',
                description: '需要把数据做成可视化图表并放进当前页面时委派给它：支持柱状、折线、面积、饼图、雷达、径向柱、散点/气泡、组合、漏斗、矩形树、桑基等类型，能插入、查询、更新和删除页面内的 chart 图表。',
                scope: 'page',
                systemPrompt: [
                    '你是当前页面的数据可视化操作员，只处理这一页里的 chart 图表。',
                    '拿到数据后先确定图表类型与字段映射（dataKeys / categoryKey 等），不确定模板时可先用 getChartTemplates。',
                    '插入优先用 nearText 定位；更新或删除前先用 listCharts 查位置；色彩一律从 colorScheme 预定义方案中选择，不要手写颜色值。',
                    '不要改动正文其他内容，也不要越权操作其他页面；完成后用简短中文汇报图表类型、数据点数量和插入/更新位置，失败则说明原因。',
                ].join('\n'),
                tools: liftLegacyTools(chartTools, { scope: 'page' }),
                skills: liftLegacySkills(chartSkills),
            },
        ],
    },
})
