import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "../types"
import {
    discoverBlocks,
    findBlockByText,
    findBlockByHeading,
    findTextBlocks
} from "../utils/block-utils"
import { contentItemsToNodes } from "../utils/markdown-parser"
import { validateRange } from "../utils/document-utils"

/**
 * Create document insertion tools
 */
export const createInsertTools = (editor: Editor): ToolsRecord => ({
    write: {
        description: '插入文本到文档。可以指定块索引和位置',
        inputSchema: z.object({
            text: z.string().describe("要插入的文本"),
            blockIndex: z.number().optional().describe("块索引（从0开始），不填则使用最后一个块"),
            location: z.enum(['start', 'end']).optional().describe("在块内的位置: 'start'开头, 'end'末尾。默认'end'")
        }),
        execute: async ({ text, blockIndex, location = 'end' }: {
            text: string
            blockIndex?: number
            location?: 'start' | 'end'
        }) => {
            try {
                const textBlocks = findTextBlocks(editor)

                if (textBlocks.length === 0) {
                    return { error: '文档中没有可插入文本的块' }
                }

                const targetIndex = blockIndex !== undefined
                    ? Math.min(Math.max(0, blockIndex), textBlocks.length - 1)
                    : textBlocks.length - 1

                const targetBlock = textBlocks[targetIndex]
                const insertPos = location === 'start'
                    ? targetBlock.contentStart
                    : targetBlock.contentEnd

                const docSize = editor.state.doc.nodeSize
                const success = editor.chain()
                    .focus()
                    .setTextSelection(insertPos)
                    .insertContent(text)
                    .run()

                if (!success) {
                    return { error: `插入失败，位置: ${insertPos}` }
                }

                const newDocSize = editor.state.doc.nodeSize

                return {
                    success: true,
                    blockIndex: targetIndex,
                    blockType: targetBlock.type,
                    location,
                    insertedAt: insertPos,
                    insertedSize: newDocSize - docSize
                }
            } catch (error) {
                return { error: `插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    insertAtEnd: {
        description: '在文档末尾插入内容',
        inputSchema: z.object({
            text: z.string().describe("要插入的文本内容"),
            asNewParagraph: z.boolean().optional().describe("是否作为新段落插入，默认true")
        }),
        execute: async ({ text, asNewParagraph = true }: {
            text: string
            asNewParagraph?: boolean
        }) => {
            const docSize = editor.state.doc.nodeSize

            try {
                let success: boolean
                if (asNewParagraph) {
                    success = editor.chain()
                        .focus('end')
                        .insertContent([{ type: 'paragraph', content: [{ type: 'text', text }] }])
                        .run()
                } else {
                    success = editor.chain()
                        .focus('end')
                        .insertContent(text)
                        .run()
                }

                if (!success) {
                    return { error: 'Failed to insert content at document end' }
                }

                const newDocSize = editor.state.doc.nodeSize

                return {
                    success: true,
                    insertedAt: 'end',
                    insertedSize: newDocSize - docSize,
                    asNewParagraph
                }
            } catch (error) {
                return { error: `Insert failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
            }
        }
    },

    insertAtPosition: {
        description: 'Insert content at a specific document position. Use getDocumentStructure or searchInDocument first to find the correct position.',
        inputSchema: z.object({
            pos: z.number().describe("The document position to insert at"),
            content: z.string().describe("The content to insert"),
            insertMode: z.enum(['text', 'paragraph']).optional()
                .describe("Insert mode: 'text' inserts raw text at cursor, 'paragraph' wraps in paragraph block. Default: 'paragraph'")
        }),
        execute: async ({ pos, content, insertMode = 'paragraph' }: {
            pos: number
            content: string
            insertMode?: 'text' | 'paragraph'
        }) => {
            if (!content || content.trim().length === 0) {
                return { error: 'Content cannot be empty' }
            }

            const docSize = editor.state.doc.nodeSize
            const validation = validateRange(pos, undefined, docSize)

            if (!validation.valid) {
                return { error: validation.error }
            }

            try {
                let success: boolean

                if (insertMode === 'text') {
                    // Insert raw text at position (must be inside a textblock)
                    success = editor.chain()
                        .focus()
                        .setTextSelection(pos)
                        .insertContent(content)
                        .run()
                } else {
                    // Insert as new paragraph
                    const insertContent = [{ type: 'paragraph', content: [{ type: 'text', text: content }] }]
                    success = editor.commands.insertContentAt(pos, insertContent)
                }

                if (!success) {
                    return { error: `Failed to insert at position ${pos}` }
                }

                const newDocSize = editor.state.doc.nodeSize

                return {
                    success: true,
                    position: pos,
                    insertMode,
                    insertedSize: newDocSize - docSize,
                    oldDocSize: docSize,
                    newDocSize
                }
            } catch (error) {
                return { error: `Insert failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
            }
        }
    },

    insertAfterBlock: {
        description: '在指定块节点之后插入新段落',
        inputSchema: z.object({
            blockIndex: z.number().describe("块索引（从0开始）"),
            text: z.string().describe("要插入的文本内容")
        }),
        execute: async ({ blockIndex, text }: { blockIndex: number; text: string }) => {
            const docSize = editor.state.doc.nodeSize

            try {
                const blocks = discoverBlocks(editor)

                if (blocks.length === 0) {
                    return { error: '文档中没有块节点' }
                }

                const targetIndex = Math.min(Math.max(0, blockIndex), blocks.length - 1)
                const targetBlock = blocks[targetIndex]
                const insertPos = targetBlock.pos + targetBlock.size

                const success = editor.commands.insertContentAt(insertPos, [
                    { type: 'paragraph', content: [{ type: 'text', text }] }
                ])

                if (!success) {
                    return { error: '插入失败' }
                }

                const newDocSize = editor.state.doc.nodeSize

                return {
                    success: true,
                    blockIndex: targetIndex,
                    blockType: targetBlock.type,
                    insertedAfter: insertPos,
                    insertedSize: newDocSize - docSize
                }
            } catch (error) {
                return { error: `插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    insertNear: {
        description: '在包含指定文本的块附近插入内容',
        inputSchema: z.object({
            searchText: z.string().describe("要搜索的文本，用于定位插入位置"),
            text: z.string().describe("要插入的文本"),
            position: z.enum(['before', 'after', 'start', 'end']).optional()
                .describe("插入位置: 'before'块前, 'after'块后, 'start'块内开头, 'end'块内末尾")
        }),
        execute: async ({ searchText, text, position = 'after' }: {
            searchText: string
            text: string
            position?: 'before' | 'after' | 'start' | 'end'
        }) => {
            const docSize = editor.state.doc.nodeSize

            try {
                const blocks = discoverBlocks(editor)
                const foundBlock = findBlockByText(blocks, searchText)

                if (!foundBlock) {
                    return { error: `未找到包含 "${searchText}" 的块` }
                }

                let success: boolean
                let insertedAt: number | string

                switch (position) {
                    case 'before':
                        success = editor.commands.insertContentAt(foundBlock.pos, [
                            { type: 'paragraph', content: [{ type: 'text', text }] }
                        ])
                        insertedAt = foundBlock.pos
                        break
                    case 'after':
                        success = editor.commands.insertContentAt(foundBlock.pos + foundBlock.size, [
                            { type: 'paragraph', content: [{ type: 'text', text }] }
                        ])
                        insertedAt = foundBlock.pos + foundBlock.size
                        break
                    case 'start':
                        success = editor.chain()
                            .focus()
                            .setTextSelection(foundBlock.contentStart)
                            .insertContent(text)
                            .run()
                        insertedAt = foundBlock.contentStart
                        break
                    case 'end':
                        success = editor.chain()
                            .focus()
                            .setTextSelection(foundBlock.contentEnd)
                            .insertContent(text)
                            .run()
                        insertedAt = foundBlock.contentEnd
                        break
                }

                if (!success) {
                    return { error: '插入失败' }
                }

                const newDocSize = editor.state.doc.nodeSize

                return {
                    success: true,
                    searchText,
                    foundInBlock: foundBlock.type,
                    position,
                    insertedAt,
                    insertedSize: newDocSize - docSize
                }
            } catch (error) {
                return { error: `插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },
    batchInsert: {
        description: '批量插入多个内容块',
        inputSchema: z.object({
            items: z.array(z.object({
                content: z.string().describe("要插入的内容"),
                type: z.enum(['paragraph', 'heading', 'bulletItem', 'numberedItem', 'quote']).optional(),
                headingLevel: z.number().optional()
            })).describe("要插入的内容数组"),
            position: z.enum(['start', 'end', 'afterBlock']).optional().describe("插入位置"),
            afterBlockIndex: z.number().optional().describe("afterBlock时的块索引")
        }),
        execute: async (params: {
            items: Array<{
                content: string
                type?: 'paragraph' | 'heading' | 'bulletItem' | 'numberedItem' | 'quote'
                headingLevel?: number
            }>
            position?: 'start' | 'end' | 'afterBlock'
            afterBlockIndex?: number
        }) => {
            const { items, position = 'end', afterBlockIndex } = params
            const docSize = editor.state.doc.nodeSize

            if (!items || items.length === 0) {
                return { error: '插入内容数组不能为空' }
            }

            try {
                const nodes = contentItemsToNodes(items)

                let insertPos: number
                switch (position) {
                    case 'start':
                        insertPos = 0
                        break
                    case 'afterBlock':
                        const blocks = discoverBlocks(editor)
                        if (blocks.length === 0) {
                            insertPos = 0
                        } else {
                            const idx = afterBlockIndex !== undefined
                                ? Math.min(Math.max(0, afterBlockIndex), blocks.length - 1)
                                : blocks.length - 1
                            insertPos = blocks[idx].pos + blocks[idx].size
                        }
                        break
                    case 'end':
                    default:
                        insertPos = docSize - 2
                }

                const success = editor.commands.insertContentAt(insertPos, nodes)

                if (!success) {
                    return { error: '批量插入失败' }
                }

                const newDocSize = editor.state.doc.nodeSize

                return {
                    success: true,
                    insertedCount: items.length,
                    position,
                    insertedAt: insertPos,
                    insertedSize: newDocSize - docSize
                }
            } catch (error) {
                return { error: `批量插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    replaceContent: {
        description: '搜索并替换内容',
        inputSchema: z.object({
            searchText: z.string().describe("要搜索替换的文本"),
            replaceWith: z.string().describe("替换成的新内容"),
            replaceAll: z.boolean().optional().describe("是否替换所有匹配项"),
            caseSensitive: z.boolean().optional().describe("是否区分大小写")
        }),
        execute: async (params: {
            searchText: string
            replaceWith: string
            replaceAll?: boolean
            caseSensitive?: boolean
        }) => {
            const { searchText, replaceWith, replaceAll = false, caseSensitive = false } = params
            const docSize = editor.state.doc.nodeSize

            if (!searchText || searchText.trim().length === 0) {
                return { error: '搜索文本不能为空' }
            }

            try {
                const doc = editor.state.doc
                const searchLower = caseSensitive ? searchText : searchText.toLowerCase()
                const matches: Array<{ from: number; to: number }> = []

                doc.descendants((node, pos) => {
                    if (node.isTextblock) {
                        const blockText = node.textContent
                        const compareText = caseSensitive ? blockText : blockText.toLowerCase()
                        let searchIdx = 0

                        while ((searchIdx = compareText.indexOf(searchLower, searchIdx)) !== -1) {
                            let charCount = 0
                            let textFrom = -1

                            node.forEach((child, offset) => {
                                if (textFrom !== -1) return

                                if (child.isText && child.text) {
                                    const childStart = charCount
                                    const childEnd = charCount + child.text.length

                                    if (searchIdx >= childStart && searchIdx < childEnd) {
                                        textFrom = pos + 1 + offset + (searchIdx - childStart)
                                    }
                                    charCount = childEnd
                                } else if (child.isLeaf) {
                                    charCount += 1
                                }
                            })

                            if (textFrom !== -1) {
                                matches.push({
                                    from: textFrom,
                                    to: textFrom + searchText.length
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

                const toReplace = replaceAll ? matches : [matches[0]]
                const sortedMatches = [...toReplace].sort((a, b) => b.from - a.from)

                let success = true
                for (const match of sortedMatches) {
                    const result = editor.chain()
                        .focus()
                        .setTextSelection({ from: match.from, to: match.to })
                        .insertContent(replaceWith)
                        .run()
                    if (!result) success = false
                }

                if (!success) {
                    return { error: '替换操作部分失败' }
                }

                const newDocSize = editor.state.doc.nodeSize

                return {
                    success: true,
                    searchText,
                    replaceWith,
                    replacedCount: toReplace.length,
                    totalMatches: matches.length,
                    sizeChange: newDocSize - docSize
                }
            } catch (error) {
                return { error: `替换失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
