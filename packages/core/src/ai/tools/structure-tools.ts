import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { discoverBlocks, findBlockByText } from "@kn/common"
import { scrollToPosition } from "@kn/common"

/**
 * Create document structure manipulation tools
 */
export const createStructureTools = (editor: Editor): ToolsRecord => ({
    convertBlock: {
        description: '转换块类型。将段落、标题、引用、代码块、列表等互相转换',
        inputSchema: z.object({
            targetType: z.enum([
                'paragraph', 'heading', 'blockquote', 'codeBlock',
                'bulletList', 'orderedList', 'taskList'
            ]).describe("目标块类型"),
            headingLevel: z.number().min(1).max(6).optional()
                .describe("标题级别（1-6），仅当 targetType 为 heading 时需要"),
            blockIndex: z.number().optional()
                .describe("要转换的块索引（从0开始）"),
            searchText: z.string().optional()
                .describe("通过文本内容定位块（与 blockIndex 二选一）")
        }),
        execute: async ({ targetType, headingLevel = 2, blockIndex, searchText }: {
            targetType: 'paragraph' | 'heading' | 'blockquote' | 'codeBlock' | 'bulletList' | 'orderedList' | 'taskList'
            headingLevel?: number
            blockIndex?: number
            searchText?: string
        }) => {
            try {
                const blocks = discoverBlocks(editor)

                // Locate the target block
                let block
                if (blockIndex !== undefined) {
                    if (blockIndex < 0 || blockIndex >= blocks.length) {
                        return { error: `块索引越界。有效范围: 0-${blocks.length - 1}，请求: ${blockIndex}` }
                    }
                    block = blocks[blockIndex]
                } else if (searchText) {
                    block = findBlockByText(blocks, searchText)
                    if (!block) {
                        return { error: `未找到包含文本 "${searchText}" 的块` }
                    }
                } else {
                    return { error: '必须提供 blockIndex 或 searchText 来定位块' }
                }

                const previousType = block.type

                // Set selection into the block and scroll to it
                const selPos = block.contentStart + 1
                editor.chain().focus().setTextSelection(selPos).scrollIntoView().run()

                let success = false
                const chain = editor.chain().focus()

                switch (targetType) {
                    case 'paragraph':
                        success = chain.setParagraph().run()
                        break
                    case 'heading':
                        success = chain.toggleHeading({ level: headingLevel as 1 | 2 | 3 | 4 | 5 | 6 }).run()
                        break
                    case 'blockquote':
                        success = chain.toggleBlockquote().run()
                        break
                    case 'codeBlock':
                        success = chain.toggleCodeBlock().run()
                        break
                    case 'bulletList': {
                        // If currently another list type, toggle off first
                        if (previousType === 'listItem' || previousType === 'orderedList' || previousType === 'taskList' || previousType === 'taskItem') {
                            editor.chain().focus().setTextSelection(selPos).liftListItem('listItem').run()
                        }
                        success = chain.toggleBulletList().run()
                        break
                    }
                    case 'orderedList': {
                        if (previousType === 'listItem' || previousType === 'bulletList' || previousType === 'taskList' || previousType === 'taskItem') {
                            editor.chain().focus().setTextSelection(selPos).liftListItem('listItem').run()
                        }
                        success = chain.toggleOrderedList().run()
                        break
                    }
                    case 'taskList': {
                        if (previousType === 'listItem' || previousType === 'bulletList' || previousType === 'orderedList') {
                            editor.chain().focus().setTextSelection(selPos).liftListItem('listItem').run()
                        }
                        success = chain.toggleTaskList().run()
                        break
                    }
                }

                return {
                    success: true,
                    previousType,
                    newType: targetType,
                    ...(targetType === 'heading' ? { headingLevel } : {}),
                    message: `已将块从 ${previousType} 转换为 ${targetType}${targetType === 'heading' ? ` (H${headingLevel})` : ''}`
                }
            } catch (error) {
                return { error: `转换块类型失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    moveBlock: {
        description: '移动块到新位置',
        inputSchema: z.object({
            blockIndex: z.number().describe("要移动的块索引（从0开始）"),
            direction: z.enum(['up', 'down']).optional()
                .describe("移动方向: 'up'上移一位, 'down'下移一位"),
            toIndex: z.number().optional()
                .describe("目标索引位置（与 direction 二选一）")
        }),
        execute: async ({ blockIndex, direction, toIndex }: {
            blockIndex: number
            direction?: 'up' | 'down'
            toIndex?: number
        }) => {
            try {
                const blocks = discoverBlocks(editor)

                if (blockIndex < 0 || blockIndex >= blocks.length) {
                    return { error: `块索引越界。有效范围: 0-${blocks.length - 1}，请求: ${blockIndex}` }
                }

                // Calculate target index
                let targetIndex: number
                if (toIndex !== undefined) {
                    targetIndex = toIndex
                } else if (direction === 'up') {
                    targetIndex = blockIndex - 1
                } else if (direction === 'down') {
                    targetIndex = blockIndex + 1
                } else {
                    return { error: '必须提供 direction 或 toIndex' }
                }

                if (targetIndex < 0 || targetIndex >= blocks.length) {
                    return { error: `目标索引越界。有效范围: 0-${blocks.length - 1}，请求: ${targetIndex}` }
                }

                if (targetIndex === blockIndex) {
                    return { success: true, message: '块已在目标位置' }
                }

                const sourceBlock = blocks[blockIndex]
                const sourceFrom = sourceBlock.pos
                const sourceTo = sourceBlock.pos + sourceBlock.size

                // Get the content of the source block as JSON
                const sourceNode = editor.state.doc.nodeAt(sourceFrom)
                if (!sourceNode) {
                    return { error: '无法获取源块内容' }
                }
                const sourceJSON = sourceNode.toJSON()

                // Delete source block first
                editor.chain().focus().deleteRange({ from: sourceFrom, to: sourceTo }).run()

                // After deletion, re-discover blocks to get correct positions
                const updatedBlocks = discoverBlocks(editor)

                // Adjust target index after deletion
                let insertPos: number
                const adjustedTargetIndex = targetIndex > blockIndex ? targetIndex - 1 : targetIndex

                if (adjustedTargetIndex >= updatedBlocks.length) {
                    // Insert at end
                    const lastBlock = updatedBlocks[updatedBlocks.length - 1]
                    insertPos = lastBlock.pos + lastBlock.size
                } else {
                    insertPos = updatedBlocks[adjustedTargetIndex].pos
                }

                const success = editor.commands.insertContentAt(insertPos, sourceJSON)

                if (!success) {
                    return { error: '移动块失败：插入内容失败' }
                }

                scrollToPosition(editor, insertPos)

                return {
                    success: true,
                    fromIndex: blockIndex,
                    toIndex: targetIndex,
                    blockType: sourceBlock.type,
                    blockPreview: sourceBlock.text,
                    message: `已将块从位置 ${blockIndex} 移动到位置 ${targetIndex}`
                }
            } catch (error) {
                return { error: `移动块失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    setBlockAlignment: {
        description: '设置块的文本对齐方式',
        inputSchema: z.object({
            alignment: z.enum(['left', 'center', 'right', 'justify'])
                .describe("对齐方式: left/center/right/justify"),
            blockIndex: z.number().optional()
                .describe("要设置的块索引（从0开始）"),
            searchText: z.string().optional()
                .describe("通过文本内容定位块（与 blockIndex 二选一）")
        }),
        execute: async ({ alignment, blockIndex, searchText }: {
            alignment: 'left' | 'center' | 'right' | 'justify'
            blockIndex?: number
            searchText?: string
        }) => {
            try {
                const blocks = discoverBlocks(editor)

                let block
                if (blockIndex !== undefined) {
                    if (blockIndex < 0 || blockIndex >= blocks.length) {
                        return { error: `块索引越界。有效范围: 0-${blocks.length - 1}，请求: ${blockIndex}` }
                    }
                    block = blocks[blockIndex]
                } else if (searchText) {
                    block = findBlockByText(blocks, searchText)
                    if (!block) {
                        return { error: `未找到包含文本 "${searchText}" 的块` }
                    }
                } else {
                    return { error: '必须提供 blockIndex 或 searchText 来定位块' }
                }

                // Set selection into the block and scroll to it
                const selPos = block.contentStart + 1
                editor.chain().focus().setTextSelection(selPos).scrollIntoView().run()

                const success = editor.commands.setTextAlign(alignment)

                if (!success) {
                    return { error: '设置对齐失败' }
                }

                return {
                    success: true,
                    alignment,
                    blockType: block.type,
                    blockPreview: block.text,
                    message: `已将块对齐方式设置为 ${alignment}`
                }
            } catch (error) {
                return { error: `设置对齐失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
