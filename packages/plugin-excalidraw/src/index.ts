
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
     * Excalidraw 工具与技能。scope 'page'：每个工具都需要当前编辑器实例。
     */
    agent: {
        tools: liftLegacyTools(excalidrawTools, { scope: 'page' }),
        skills: liftLegacySkills(excalidrawSkills),
    },
})