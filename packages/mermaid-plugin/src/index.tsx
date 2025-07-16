
import { KPlugin, PluginConfig } from "@repo/common"
import { MermaidExtension } from "./editor-extension/mermaid"

interface MermaidPluginConfig extends PluginConfig {



}
class MermaidPlugin extends KPlugin<MermaidPluginConfig> {
}

export const mermaid = new MermaidPlugin({
    status: '',
    name: 'Mermaid',
    editorExtension: [MermaidExtension]
})