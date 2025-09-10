
import { KPlugin, PluginConfig } from "@kn/common"

interface BlockReferenceConfig extends PluginConfig {



}
class BlockReferencePlugin extends KPlugin<BlockReferenceConfig> {
}

export const blockReference = new BlockReferencePlugin({
    status: '',
    name: 'blockReference',
    editorExtension: []
})