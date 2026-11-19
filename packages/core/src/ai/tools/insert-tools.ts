import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import {
    discoverBlocks,
    findBlockByText,
} from "@kn/common"
import { parseMarkdownToNodes } from "@kn/common"
import { scrollToPosition } from "@kn/common"
import {
    TITLE_EDIT_HINT,
    applyDocumentTitle,
    asTitleEditor,
    titleBoundary,
} from "./document-title"

/**
 * Create document insertion tools
 */
export const createInsertTools = (editor: Editor): ToolsRecord => ({
    updateTitle: {
        description: '修改当前编辑页面的标题（文档第一个受保护的 title 块）。这是改标题的唯一正确方式：标题不是普通块，不要用 replaceBlockById / applyEdits / deleteText / replaceContent / insertNear 等工具去改它。传入的是纯文本标题，不是 Markdown。',
        inputSchema: z.object({
            newTitle: z.string().describe("新的标题纯文本（单行；不要传 Markdown 或 HTML）")
        }),
        execute: async ({ newTitle }: { newTitle: string }) => {
            try {
                const result = applyDocumentTitle(asTitleEditor(editor), newTitle)
                if (!result.success) {
                    return { error: result.error }
                }
                return {
                    success: true,
                    previousTitle: result.previousTitle,
                    newTitle: result.newTitle,
                    changed: result.changed,
                    message: result.changed
                        ? `标题已从 "${result.previousTitle}" 更新为 "${result.newTitle}"`
                        : `标题已经是 "${result.newTitle}"，无需修改`
                }
            } catch (error) {
                return { error: `更新标题失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    write: {
        description: '在指定块后插入内容，支持 Markdown 格式自动解析。这是推荐的插入工具。',
        inputSchema: z.object({
            text: z.string().describe("要插入的内容，支持 Markdown 格式（如 **粗体**、- 列表、## 标题、```代码块``` 等）"),
            blockIndex: z.number().optional().describe("在此块之后插入（从0开始），不填则在文档末尾插入"),
            parseMarkdown: z.boolean().optional().describe("是否解析 Markdown 格式，默认 true")
        }),
        execute: async ({ text, blockIndex, parseMarkdown = true }: {
            text: string
            blockIndex?: number
            parseMarkdown?: boolean
        }) => {
            try {
                const blocks = discoverBlocks(editor)

                if (blocks.length === 0) {
                    return { error: '文档中没有块节点' }
                }

                // No blockIndex → append at the true end of the document
                // (doc.content.size, not last-block pos+size which breaks with
                // nested blocks).
                let targetIndex: number | undefined
                let insertPos: number
                let targetBlock: (typeof blocks)[number] | undefined

                if (blockIndex !== undefined) {
                    targetIndex = Math.min(Math.max(0, blockIndex), blocks.length - 1)
                    targetBlock = blocks[targetIndex]
                    insertPos = targetBlock.pos + targetBlock.size
                } else {
                    insertPos = editor.state.doc.content.size
                }

                const docSize = editor.state.doc.nodeSize

                // The title container is pinned first: an insertion point inside
                // it would put body nodes where only a heading may live. Clamp to
                // just after the title (a legacy blockIndex can map onto its
                // heading, which is not addressable any more).
                const boundary = titleBoundary(editor.state.doc)
                const redirectedFromTitle = boundary !== null && insertPos < boundary.to
                if (redirectedFromTitle) insertPos = boundary.to

                // Parse markdown if enabled
                const nodes = parseMarkdown
                    ? parseMarkdownToNodes(text)
                    : [{ type: 'paragraph', content: [{ type: 'text', text }] }]

                const success = editor.commands.insertContentAt(insertPos, nodes)

                if (!success) {
                    return { error: `插入失败，位置: ${insertPos}` }
                }

                scrollToPosition(editor, insertPos)
                const newDocSize = editor.state.doc.nodeSize

                return {
                    success: true,
                    blockIndex: targetIndex,
                    blockType: targetBlock?.type ?? 'documentEnd',
                    insertedAfter: insertPos,
                    insertedSize: newDocSize - docSize,
                    parsedNodes: nodes.length,
                    markdownParsed: parseMarkdown,
                    ...(redirectedFromTitle ? { redirectedFromTitle: true } : {})
                }
            } catch (error) {
                return { error: `插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    insertNear: {
        description: '在包含指定文本的块附近插入内容，支持 Markdown 格式自动解析',
        inputSchema: z.object({
            searchText: z.string().describe("要搜索的文本，用于定位插入位置"),
            text: z.string().describe("要插入的内容，支持 Markdown 格式"),
            position: z.enum(['before', 'after', 'start', 'end']).optional()
                .describe("插入位置: 'before'块前, 'after'块后, 'start'块内开头, 'end'块内末尾"),
            parseMarkdown: z.boolean().optional().describe("是否解析 Markdown 格式，默认 true（仅 before/after 有效）")
        }),
        execute: async ({ searchText, text, position = 'after', parseMarkdown = true }: {
            searchText: string
            text: string
            position?: 'before' | 'after' | 'start' | 'end'
            parseMarkdown?: boolean
        }) => {
            const docSize = editor.state.doc.nodeSize

            try {
                const blocks = discoverBlocks(editor)
                const foundBlock = findBlockByText(blocks, searchText)

                if (!foundBlock) {
                    return { error: `未找到包含 "${searchText}" 的块` }
                }

                // The title is one protected block. "After the title" is valid;
                // inserting before it (title must stay first) or inside it (only
                // its heading may live there) is not, and silently failing made
                // the model retry with another tool — often a destructive one.
                const boundary = titleBoundary(editor.state.doc)
                const targetsTitle = boundary !== null && foundBlock.pos < boundary.to
                if (targetsTitle) {
                    if (position === 'before') {
                        return { error: `不能在页面标题之前插入内容（标题必须是第一个块）。${TITLE_EDIT_HINT}` }
                    }
                    if (position === 'start' || position === 'end') {
                        return { error: `不能在页面标题内部插入内容。${TITLE_EDIT_HINT}` }
                    }
                }
                // 'after' the title container means the end of the title.
                const anchorPos = targetsTitle ? boundary!.to : foundBlock.pos
                const anchorSize = targetsTitle ? 0 : foundBlock.size

                let success: boolean
                let insertedAt: number | string
                let nodes: any[]

                // Parse markdown for block-level insertions (before/after)
                if (parseMarkdown && (position === 'before' || position === 'after')) {
                    nodes = parseMarkdownToNodes(text)
                } else {
                    nodes = [{ type: 'paragraph', content: [{ type: 'text', text }] }]
                }

                switch (position) {
                    case 'before':
                        success = editor.commands.insertContentAt(anchorPos, nodes)
                        insertedAt = anchorPos
                        if (success) scrollToPosition(editor, anchorPos)
                        break
                    case 'after':
                        success = editor.commands.insertContentAt(anchorPos + anchorSize, nodes)
                        insertedAt = anchorPos + anchorSize
                        if (success) scrollToPosition(editor, anchorPos + anchorSize)
                        break
                    case 'start':
                        // Inline insertion - parse inline markdown only
                        success = editor.chain()
                            .focus()
                            .setTextSelection(foundBlock.contentStart)
                            .insertContent(text)
                            .scrollIntoView()
                            .run()
                        insertedAt = foundBlock.contentStart
                        break
                    case 'end':
                        // Inline insertion - parse inline markdown only
                        success = editor.chain()
                            .focus()
                            .setTextSelection(foundBlock.contentEnd)
                            .insertContent(text)
                            .scrollIntoView()
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
                    insertedSize: newDocSize - docSize,
                    parsedNodes: nodes.length,
                    markdownParsed: parseMarkdown && (position === 'before' || position === 'after')
                }
            } catch (error) {
                return { error: `插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
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

                // Title text is page metadata, not body copy. Excluding it here
                // is what stops `replaceAll` from silently renaming every page
                // whose title happens to contain the search phrase.
                const boundary = titleBoundary(doc)
                const titleMatches = boundary
                    ? matches.filter(match => match.from < boundary.to)
                    : []
                const bodyMatches = boundary
                    ? matches.filter(match => match.from >= boundary.to)
                    : matches

                if (bodyMatches.length === 0) {
                    return {
                        error: `匹配文本只出现在页面标题里。${TITLE_EDIT_HINT}`,
                        titleMatches: titleMatches.length
                    }
                }

                const toReplace = replaceAll ? bodyMatches : [bodyMatches[0]]
                const sortedMatches = [...toReplace].sort((a, b) => b.from - a.from)

                // Single transaction: the previous per-match dispatch made each
                // replacement a separate undo step — replacing N occurrences
                // required N undos. Building one chain keeps it one step.
                let success = true
                const chain = editor.chain().focus()
                for (const match of sortedMatches) {
                    chain.setTextSelection({ from: match.from, to: match.to })
                        .insertContent(replaceWith)
                }
                const result = chain.scrollIntoView().run()
                if (!result) success = false

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
                    sizeChange: newDocSize - docSize,
                    ...(titleMatches.length > 0
                        ? { skippedTitleMatches: titleMatches.length, titleHint: TITLE_EDIT_HINT }
                        : {})
                }
            } catch (error) {
                return { error: `替换失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
