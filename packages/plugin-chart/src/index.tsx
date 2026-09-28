
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
     * Chart 工具与技能。scope 'page'：每个工具都需要当前编辑器实例。
     */
    agent: {
        tools: liftLegacyTools(chartTools, { scope: 'page' }),
        skills: liftLegacySkills(chartSkills),
    },
})
