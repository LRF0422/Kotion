import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common"
import { CommentExtension, addCommentTool, commentReviewerSkill } from "./extension"

interface CommentPluginConfig extends PluginConfig { }

class CommentPlugin extends KPlugin<CommentPluginConfig> { }

export const comment = new CommentPlugin({
    status: '',
    name: 'Comment',
    editorExtension: [CommentExtension],
    agent: {
        tools: liftLegacyTools([addCommentTool], { scope: 'page' }),
        skills: liftLegacySkills([commentReviewerSkill]),
    },
})
