
import { KPlugin, PluginConfig } from "@repo/common"

interface FileManagerPluginConfig extends PluginConfig {



}
class FileManager extends KPlugin<FileManagerPluginConfig> {
}

export const fileManager = new FileManager({
    status: '',
    name: 'test',
    menus: [

    ]
})