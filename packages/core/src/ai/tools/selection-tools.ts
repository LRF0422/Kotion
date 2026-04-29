import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"

/**
 * Create selection tools for AI agent
 */
export const createSelectionTools = (editor: Editor): ToolsRecord => ({
    getSelection: {
        description: '读取当前编辑器选区。返回选中的文本、位置范围和所在块的信息。用于在执行上下文相关编辑之前了解用户选中了什么内容',
        inputSchema: z.object({}),
        execute: async () => {
            try {
                const { from, to, anchor, head } = editor.state.selection
                const isEmpty = from === to

                // Resolve position to find the block
                const $from = editor.state.doc.resolve(from)
                // Get the depth-1 node (top-level block)
                const blockIndex = $from.index(0)
                const blockNode = $from.node(1)
                const blockType = blockNode ? blockNode.type.name : 'unknown'

                if (isEmpty) {
                    return {
                        success: true,
                        isEmpty: true,
                        cursorPosition: from,
                        blockIndex,
                        blockType,
                        message: '当前没有选中文本，光标位于指定位置'
                    }
                }

                const text = editor.state.doc.textBetween(from, to)

                return {
                    success: true,
                    isEmpty: false,
                    text,
                    from,
                    to,
                    anchor,
                    head,
                    length: text.length,
                    blockIndex,
                    blockType,
                    message: `选中了 ${text.length} 个字符的文本`
                }
            } catch (error) {
                return { error: `读取选区失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
