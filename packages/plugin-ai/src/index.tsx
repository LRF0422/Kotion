
import { KPlugin, PluginConfig } from "@kn/common"
import { AIExtension } from "./ai"

interface AiPluginConfig extends PluginConfig {



}
class AiPlugin extends KPlugin<AiPluginConfig> {
}

export const ai = new AiPlugin({
    status: '',
    name: 'Mermaid',
    editorExtension: [AIExtension]
})