
import { KPlugin, PluginConfig } from "@kn/common"
import { DrawnixExtension } from "./extension"

interface DrawnixPluginConfig extends PluginConfig {
}
class Drawnix extends KPlugin<DrawnixPluginConfig> {
}

export const drawnix = new Drawnix({
    status: '',
    name: 'Drawnix',
    editorExtension: [DrawnixExtension],
})