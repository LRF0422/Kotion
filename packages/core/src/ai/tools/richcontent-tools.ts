import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { discoverBlocks } from "@kn/common"
import { scrollToPosition } from "@kn/common"

/**
 * Create rich content tools for AI agent (horizontal rules, details/toggle blocks, etc.)
 */
export const createRichContentTools = (editor: Editor): ToolsRecord => ({
    insertHorizontalRule: {
        description: '插入一条水平分割线。如果指定 blockIndex，则在该块之后插入；否则在文档末尾插入',
        inputSchema: z.object({
            blockIndex: z.number().optional()
                .describe("在此块之后插入分割线（从0开始），不填则在文档末尾插入")
        }),
        execute: async ({ blockIndex }: { blockIndex?: number }) => {
            try {
                const blocks = discoverBlocks(editor)

                if (blocks.length === 0) {
                    return { error: '文档中没有块节点' }
                }

                const targetIndex = blockIndex !== undefined
                    ? Math.min(Math.max(0, blockIndex), blocks.length - 1)
                    : blocks.length - 1

                const targetBlock = blocks[targetIndex]
                const insertPos = targetBlock.pos + targetBlock.size

                const success = editor.chain()
                    .focus()
                    .setTextSelection(insertPos)
                    .setHorizontalRule()
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '插入分割线失败' }
                }

                scrollToPosition(editor, insertPos)

                return {
                    success: true,
                    blockIndex: targetIndex,
                    insertedAt: insertPos,
                    message: `已在第 ${targetIndex} 块之后插入分割线`
                }
            } catch (error) {
                return { error: `插入分割线失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    insertDetails: {
        description: '插入一个可折叠/切换的详情块（details block）。可选设置标题和内容',
        inputSchema: z.object({
            blockIndex: z.number().optional()
                .describe("在此块之后插入（从0开始），不填则在文档末尾插入"),
            title: z.string().optional()
                .describe("折叠块的标题/摘要文本"),
            content: z.string().optional()
                .describe("折叠块的内容文本")
        }),
        execute: async ({ blockIndex, title, content }: {
            blockIndex?: number
            title?: string
            content?: string
        }) => {
            try {
                // Check if Details extension is available
                const detailsType = editor.schema.nodes.details
                if (!detailsType) {
                    return { error: '当前编辑器不支持 details（折叠块）功能' }
                }

                const blocks = discoverBlocks(editor)

                if (blocks.length === 0) {
                    return { error: '文档中没有块节点' }
                }

                const targetIndex = blockIndex !== undefined
                    ? Math.min(Math.max(0, blockIndex), blocks.length - 1)
                    : blocks.length - 1

                const targetBlock = blocks[targetIndex]
                const insertPos = targetBlock.pos + targetBlock.size

                // Position cursor at insertion point
                editor.chain().focus().setTextSelection(insertPos).run()

                // Build the details node structure
                const detailsNode: any = {
                    type: 'details',
                    content: [
                        {
                            type: 'detailsSummary',
                            content: title
                                ? [{ type: 'text', text: title }]
                                : []
                        },
                        {
                            type: 'detailsContent',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: content
                                        ? [{ type: 'text', text: content }]
                                        : []
                                }
                            ]
                        }
                    ]
                }

                const success = editor.commands.insertContentAt(insertPos, detailsNode)

                if (!success) {
                    return { error: '插入折叠块失败' }
                }

                scrollToPosition(editor, insertPos)

                return {
                    success: true,
                    blockIndex: targetIndex,
                    insertedAt: insertPos,
                    title: title || '(空标题)',
                    hasContent: !!content,
                    message: `已在第 ${targetIndex} 块之后插入折叠块${title ? `："${title}"` : ''}`
                }
            } catch (error) {
                return { error: `插入折叠块失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
