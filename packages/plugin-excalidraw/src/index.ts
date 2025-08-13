
import { KPlugin, PluginConfig } from "@kn/common"
import { ExcalidrawExtension } from "./excalidraw"
import "@kn/ui/globals.css"


interface ExcalidrawPluginConfig extends PluginConfig {



}
class ExcalidrawPlugin extends KPlugin<ExcalidrawPluginConfig> {
}

export const excalidraw = new ExcalidrawPlugin({
    status: '',
    name: 'Excalidraw',
    editorExtension: [ExcalidrawExtension]
})