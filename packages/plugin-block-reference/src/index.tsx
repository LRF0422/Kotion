
import { KPlugin, PluginConfig } from "@kn/common"
import { BlockReferenceExtension } from "./extension/block-reference/inde"

interface BlockReferenceConfig extends PluginConfig {



}
class BlockReferencePlugin extends KPlugin<BlockReferenceConfig> {
}

export const blockReference = new BlockReferencePlugin({
    status: '',
    name: 'blockReference',
    editorExtension: [BlockReferenceExtension]
})