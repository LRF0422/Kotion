
import { KPlugin, PluginConfig } from "@kn/common"
import { ChartExtension } from "./editor-extension/chart"

interface ChartPluginConfig extends PluginConfig {

}

class ChartPlugin extends KPlugin<ChartPluginConfig> {
}

export const chart = new ChartPlugin({
    status: '',
    name: 'Chart',
    editorExtension: [ChartExtension]
})
