import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { discoverBlocks } from "@kn/common"

/**
 * Create document deletion tools
 */
export const createDeleteTools = (editor: Editor): ToolsRecord => ({
    deleteBySearch: {
        description: '通过搜索文本定位并删除内容',
        inputSchema: z.object({
            searchText: z.string().describe("要删除的文本内容"),
            deleteMode: z.enum(['text', 'block']).optional()
                .describe("删除模式: 'text'只删除匹配的文本, 'block'删除整个包含文本的块"),
            occurrence: z.number().optional().describe("删除第几次出现的匹配项（从1开始）")
        }),
        execute: async ({ searchText, deleteMode = 'text', occurrence = 1 }: {
            searchText: string
            deleteMode?: 'text' | 'block'
            occurrence?: number
        }) => {
            const docSize = editor.state.doc.nodeSize

            if (!searchText || searchText.trim().length === 0) {
                return { error: '搜索文本不能为空' }
            }

            try {
                const doc = editor.state.doc
                const searchLower = searchText.toLowerCase()

                const matches: Array<{
                    textFrom: number
                    textTo: number
                    blockFrom: number
                    blockTo: number
                    blockType: string
                    matchedText: string
                    context: string
                }> = []

                doc.descendants((node, pos) => {
                    if (node.isTextblock) {
                        const blockText = node.textContent
                        const blockTextLower = blockText.toLowerCase()
                        let searchIdx = 0

                        while ((searchIdx = blockTextLower.indexOf(searchLower, searchIdx)) !== -1) {
                            let charCount = 0
                            let textFrom = -1
                            let textTo = -1

                            node.forEach((child, offset) => {
                                if (textFrom !== -1 && textTo !== -1) return

                                if (child.isText && child.text) {
                                    const childText = child.text
                                    const childStart = charCount
                                    const childEnd = charCount + childText.length

                                    if (textFrom === -1 && searchIdx >= childStart && searchIdx < childEnd) {
                                        textFrom = pos + 1 + offset + (searchIdx - childStart)
                                    }

                                    const matchEnd = searchIdx + searchText.length
                                    if (textFrom !== -1 && textTo === -1 && matchEnd > childStart && matchEnd <= childEnd) {
                                        textTo = pos + 1 + offset + (matchEnd - childStart)
                                    }

                                    charCount = childEnd
                                } else if (child.isLeaf) {
                                    charCount += 1
                                }
                            })

                            if (textFrom !== -1 && textTo !== -1) {
                                const contextStart = Math.max(0, searchIdx - 20)
                                const contextEnd = Math.min(blockText.length, searchIdx + searchText.length + 20)

                                matches.push({
                                    textFrom,
                                    textTo,
                                    blockFrom: pos,
                                    blockTo: pos + node.nodeSize,
                                    blockType: node.type.name,
                                    matchedText: blockText.substring(searchIdx, searchIdx + searchText.length),
                                    context: blockText.substring(contextStart, contextEnd)
                                })
                            }

                            searchIdx += 1
                        }
                    }
                    return true
                })

                if (matches.length === 0) {
                    return { error: `未找到文本: "${searchText}"` }
                }

                const targetOccurrence = Math.min(Math.max(1, occurrence), matches.length)
                const match = matches[targetOccurrence - 1]

                let from: number, to: number
                if (deleteMode === 'block') {
                    from = match.blockFrom
                    to = match.blockTo
                } else {
                    from = match.textFrom
                    to = match.textTo
                }

                const textToDelete = editor.state.doc.textBetween(from, to, '', '')

                // Scroll to show the matched text before deleting
                editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run()

                const success = editor.chain()
                    .focus()
                    .setTextSelection({ from, to })
                    .deleteSelection()
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '删除失败' }
                }

                const newDocSize = editor.state.doc.nodeSize
                const deletedSize = docSize - newDocSize

                return {
                    success: true,
                    searchText,
                    deleteMode,
                    occurrence: targetOccurrence,
                    totalMatches: matches.length,
                    deletedFrom: from,
                    deletedTo: to,
                    deletedText: deleteMode === 'block' ? `[整个${match.blockType}块]` : match.matchedText,
                    actualDeletedText: textToDelete,
                    context: match.context,
                    deletedSize,
                    oldDocSize: docSize,
                    newDocSize
                }
            } catch (error) {
                return { error: `删除失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    clearDocument: {
        description: '清空文档内容，保留标题。用于需要重写整个文档的场景',
        inputSchema: z.object({
            preserveTitle: z.boolean().optional().describe("是否保留标题，默认 true")
        }),
        execute: async ({ preserveTitle = true }: {
            preserveTitle?: boolean
        }) => {
            try {
                const doc = editor.state.doc

                if (doc.childCount === 0) {
                    return { error: '文档中没有内容' }
                }

                // Iterate only the top-level children of the doc.
                // NOTE: do NOT use discoverBlocks() here because it recurses
                // into descendants and would return the inner `heading` node
                // of the `title` container as a separate block, causing the
                // deletion range to start INSIDE the title node when
                // preserveTitle is true.
                const topBlocks: Array<{ pos: number; size: number; type: string }> = []
                let offset = 0
                doc.forEach(child => {
                    topBlocks.push({ pos: offset, size: child.nodeSize, type: child.type.name })
                    offset += child.nodeSize
                })

                const firstIsTitle = topBlocks.length > 0 && topBlocks[0].type === 'title'
                const startIndex = preserveTitle && firstIsTitle ? 1 : 0

                if (startIndex >= topBlocks.length) {
                    return {
                        success: true,
                        message: '文档已经是空的（仅有标题）',
                        deletedCount: 0
                    }
                }

                const firstBlock = topBlocks[startIndex]
                const lastBlock = topBlocks[topBlocks.length - 1]
                const from = firstBlock.pos
                const to = lastBlock.pos + lastBlock.size
                const docSize = doc.nodeSize

                const success = editor.chain()
                    .focus()
                    .deleteRange({ from, to })
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '清空文档失败' }
                }

                const newDocSize = editor.state.doc.nodeSize
                const deletedCount = topBlocks.length - startIndex

                return {
                    success: true,
                    preserveTitle,
                    deletedCount,
                    deletedSize: docSize - newDocSize,
                    message: preserveTitle && firstIsTitle
                        ? `已清空文档内容（保留标题），删除了 ${deletedCount} 个块`
                        : `已清空整个文档，删除了 ${deletedCount} 个块`
                }
            } catch (error) {
                return { error: `清空文档失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    deleteBlock: {
        description: '通过块索引删除整个块',
        inputSchema: z.object({
            blockIndex: z.number().describe("要删除的块索引（从0开始）"),
            blockType: z.string().optional().describe("期望的块类型，用于验证")
        }),
        execute: async ({ blockIndex, blockType }: {
            blockIndex: number
            blockType?: string
        }) => {
            const docSize = editor.state.doc.nodeSize

            try {
                const blocks = discoverBlocks(editor)

                if (blocks.length === 0) {
                    return { error: '文档中没有可删除的块' }
                }

                if (blockIndex < 0 || blockIndex >= blocks.length) {
                    return { error: `块索引越界。有效范围: 0-${blocks.length - 1}，请求: ${blockIndex}` }
                }

                const targetBlock = blocks[blockIndex]

                if (blockType && targetBlock.type !== blockType) {
                    return {
                        error: `块类型不匹配。期望: ${blockType}，实际: ${targetBlock.type}`,
                        actualBlock: targetBlock
                    }
                }

                // Scroll to show the target block before deleting
                editor.chain().focus().setTextSelection(targetBlock.pos + 1).scrollIntoView().run()

                const success = editor.chain()
                    .focus()
                    .deleteRange({ from: targetBlock.pos, to: targetBlock.pos + targetBlock.size })
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '删除块失败' }
                }

                const newDocSize = editor.state.doc.nodeSize
                const deletedSize = docSize - newDocSize

                return {
                    success: true,
                    blockIndex,
                    blockType: targetBlock.type,
                    blockPreview: targetBlock.text,
                    deletedFrom: targetBlock.pos,
                    deletedTo: targetBlock.pos + targetBlock.size,
                    deletedSize,
                    oldDocSize: docSize,
                    newDocSize,
                    remainingBlocks: blocks.length - 1
                }
            } catch (error) {
                return { error: `删除块失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    deleteByBlockId: {
        description: '通过块的 blockId 删除一个或多个块。支持批量删除，批量删除在同一个事务中完成，按位置从后向前删除以保证位置正确性',
        inputSchema: z.object({
            blockIds: z.union([
                z.string().describe('单个 blockId'),
                z.array(z.string()).describe('多个 blockId，用于批量删除')
            ]).describe('要删除的块 ID，可以是单个字符串或字符串数组'),
        }),
        execute: async ({ blockIds }: {
            blockIds: string | string[]
        }) => {
            const ids = typeof blockIds === 'string' ? [blockIds] : blockIds

            if (ids.length === 0) {
                return { error: '未提供 blockIds' }
            }

            try {
                // Use the editor command which handles batch deletion
                // with descending position sort in a single transaction
                const result = editor.commands.deleteByBlockId(ids)

                return {
                    success: result,
                    deletedIds: ids,
                    message: result
                        ? `已删除 ${ids.length} 个块`
                        : `未找到 ID 对应的块`
                }
            } catch (error) {
                return { error: `通过 blockId 删除块失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
