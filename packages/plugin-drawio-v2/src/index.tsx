
import { KPlugin, PluginConfig } from "@kn/common"
import { DrawioV2Extension } from "./extension"

interface DrawioV2PluginConfig extends PluginConfig {
}

class DrawioV2 extends KPlugin<DrawioV2PluginConfig> {
}

export const drawioV2 = new DrawioV2({
    status: '',
    name: 'DrawioV2',
    editorExtension: [DrawioV2Extension],
})
