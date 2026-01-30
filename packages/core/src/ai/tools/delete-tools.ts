import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "../types"
import { discoverBlocks, findTextPosition } from "../utils/block-utils"
import { validateRange } from "../utils/document-utils"

/**
 * Create document deletion tools
 */
export const createDeleteTools = (editor: Editor): ToolsRecord => ({
    deleteRange: {
        description: '删除指定范围的内容',
        inputSchema: z.object({
            range: z.object({
                from: z.number().describe("起始位置"),
                to: z.number().describe("结束位置"),
            })
        }),
        execute: async ({ range }: { range: { from: number; to: number } }) => {
            const { from, to } = range
            const docSize = editor.state.doc.nodeSize
            const validation = validateRange(from, to, docSize)

            if (!validation.valid) {
                return { error: validation.error }
            }

            const success = editor.chain()
                .focus()
                .deleteRange({ from, to })
                .run()

            if (!success) {
                return { error: `Failed to delete range ${from}-${to}` }
            }

            const newDocSize = editor.state.doc.nodeSize
            const deletedSize = docSize - newDocSize

            return {
                success: true,
                from,
                to,
                deletedSize,
                oldDocSize: docSize,
                newDocSize
            }
        }
    },

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

                const success = editor.chain()
                    .focus()
                    .setTextSelection({ from, to })
                    .deleteSelection()
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

                const success = editor.chain()
                    .focus()
                    .deleteRange({ from: targetBlock.pos, to: targetBlock.pos + targetBlock.size })
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
    }
})
