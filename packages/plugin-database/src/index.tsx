
import { KPlugin, PluginConfig } from "@kn/common"
import { DatabaseExtension } from "./database"

interface DataBasePluginConfig extends PluginConfig {



}
class DataBasePlugin extends KPlugin<DataBasePluginConfig> {
}

export const database = new DataBasePlugin({
    status: '',
    name: 'Database',
    editorExtension: [DatabaseExtension]
})