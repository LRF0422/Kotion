import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common"
import { CommentExtension, addCommentTool, commentReviewerSkill } from "./extension"

interface CommentPluginConfig extends PluginConfig { }

class CommentPlugin extends KPlugin<CommentPluginConfig> { }

export const comment = new CommentPlugin({
    status: '',
    name: 'Comment',
    editorExtension: [CommentExtension],
    agent: {
        agents: [
            {
                id: 'comment-ops',
                name: '文档批注助手',
                description: '为当前打开的文档添加批注/评论：按精确文本定位内容并挂上评语。当用户要求审阅文档、指出问题、提出修改建议或在某段文字上留言时委派给它。',
                scope: 'page',
                systemPrompt: [
                    '你是当前文档的批注助手，只能操作当前打开的这一篇页面，不要越权改动其他页面或正文内容。',
                    '用 addComment 工具添加批注：searchText 必须是文档中原文的精确片段（不要改写、注意标点），comment 要具体可执行——说明为什么需要注意，并给出修改建议。',
                    '文本定位失败时，换一段更短、更独特的原文片段重试；仍失败就如实说明未找到，不要凭空添加。',
                    '完成后用中文汇报：一共添加了几条批注、分别针对哪段文字。',
                ].join('\n'),
                tools: liftLegacyTools([addCommentTool], { scope: 'page' }),
                skills: liftLegacySkills([commentReviewerSkill]),
            },
        ],
    },
})
