import { KPlugin, PluginConfig } from "@kn/common"
import { CommentExtension } from "./extension"

interface CommentPluginConfig extends PluginConfig { }

class CommentPlugin extends KPlugin<CommentPluginConfig> { }

export const comment = new CommentPlugin({
    status: '',
    name: 'Comment',
    editorExtension: [CommentExtension],
})
