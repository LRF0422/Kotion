
import { KPlugin, PluginConfig } from "@kn/common"
import { DrawioExtension } from "./extension"

interface DrawioPluginConfig extends PluginConfig {
}
class Drawio extends KPlugin<DrawioPluginConfig> {
}

export const drawio = new Drawio({
    status: '',
    name: 'Drawio',
    editorExtension: [DrawioExtension],
})