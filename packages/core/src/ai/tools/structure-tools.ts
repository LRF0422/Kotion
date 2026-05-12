import type { Editor } from "@kn/editor"
import { findNodeByBlockId } from "@kn/editor"
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
        description: '通过 blockId 将一个块移动到目标块的前面或后面。相比基于索引的移动，blockId 不会因其他块的插入/删除而失效，更适合多步骤操作。',
        inputSchema: z.object({
            blockId: z.string().describe("要移动的源块 blockId"),
            targetBlockId: z.string().describe("目标参考块的 blockId"),
            position: z.enum(['before', 'after']).optional()
                .describe("放置位置：'before' 放到目标块之前，'after' 放到目标块之后（默认 after）")
        }),
        execute: async ({ blockId, targetBlockId, position = 'after' }: {
            blockId: string
            targetBlockId: string
            position?: 'before' | 'after'
        }) => {
            try {
                if (!blockId || !targetBlockId) {
                    return { error: '必须同时提供 blockId 和 targetBlockId' }
                }

                if (blockId === targetBlockId) {
                    return { success: true, message: '源块与目标块相同，无需移动' }
                }

                // Capture source block info before the move (for diagnostics).
                const sourceResult = findNodeByBlockId(editor.state, blockId)
                const targetResult = findNodeByBlockId(editor.state, targetBlockId)

                if (!sourceResult) {
                    return { error: `未找到 blockId 为 "${blockId}" 的块` }
                }
                if (!targetResult) {
                    return { error: `未找到 targetBlockId 为 "${targetBlockId}" 的块` }
                }

                const sourceNode = sourceResult.node

                const success = editor.commands.moveBlockById(blockId, targetBlockId, position)

                if (!success) {
                    return { error: '移动块失败：不能将块移动到其自身内部' }
                }

                return {
                    success: true,
                    blockId,
                    targetBlockId,
                    position,
                    blockType: sourceNode.type.name,
                    blockPreview: sourceNode.textContent.slice(0, 80),
                    message: `已将块 ${blockId} 移动到块 ${targetBlockId} 的${position === 'before' ? '前面' : '后面'}`
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
    },

    indentListItem: {
        description: 'Indent (sink) a list item one nesting level deeper, creating a sub-list.',
        inputSchema: z.object({
            blockIndex: z.number().describe("列表块索引（从0开始）"),
            itemIndex: z.number().optional()
                .describe("列表项索引（从0开始），不提供则使用当前选中项")
        }),
        execute: async ({ blockIndex, itemIndex }: {
            blockIndex: number
            itemIndex?: number
        }) => {
            try {
                const blocks = discoverBlocks(editor)

                if (blockIndex < 0 || blockIndex >= blocks.length) {
                    return { error: `块索引越界。有效范围: 0-${blocks.length - 1}，请求: ${blockIndex}` }
                }

                const block = blocks[blockIndex]
                const listTypes = ['bulletList', 'orderedList', 'taskList']
                if (!listTypes.includes(block.type)) {
                    return { error: `块类型 "${block.type}" 不是列表类型。支持: ${listTypes.join(', ')}` }
                }

                // Position cursor inside the list item
                let selPos = block.contentStart + 1
                if (itemIndex !== undefined) {
                    const node = editor.state.doc.nodeAt(block.pos)
                    if (!node) {
                        return { error: '无法获取列表块内容' }
                    }
                    let currentItem = 0
                    let itemPos: number | null = null
                    node.forEach((child, offset) => {
                        if (currentItem === itemIndex) {
                            itemPos = block.pos + 1 + offset + 1
                        }
                        currentItem++
                    })
                    if (itemPos === null) {
                        return { error: `列表项索引越界。有效范围: 0-${currentItem - 1}，请求: ${itemIndex}` }
                    }
                    selPos = itemPos
                }

                editor.chain().focus().setTextSelection(selPos).scrollIntoView().run()
                const success = editor.chain().focus().sinkListItem('listItem').run()

                if (!success) {
                    return { error: '缩进列表项失败（可能已是最深层级或为第一项）' }
                }

                return {
                    success: true,
                    blockIndex,
                    ...(itemIndex !== undefined ? { itemIndex } : {}),
                    message: `已缩进列表项`
                }
            } catch (error) {
                return { error: `缩进列表项失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    outdentListItem: {
        description: 'Outdent (lift) a list item one nesting level up.',
        inputSchema: z.object({
            blockIndex: z.number().describe("列表块索引（从0开始）"),
            itemIndex: z.number().optional()
                .describe("列表项索引（从0开始），不提供则使用当前选中项")
        }),
        execute: async ({ blockIndex, itemIndex }: {
            blockIndex: number
            itemIndex?: number
        }) => {
            try {
                const blocks = discoverBlocks(editor)

                if (blockIndex < 0 || blockIndex >= blocks.length) {
                    return { error: `块索引越界。有效范围: 0-${blocks.length - 1}，请求: ${blockIndex}` }
                }

                const block = blocks[blockIndex]
                const listTypes = ['bulletList', 'orderedList', 'taskList']
                if (!listTypes.includes(block.type)) {
                    return { error: `块类型 "${block.type}" 不是列表类型。支持: ${listTypes.join(', ')}` }
                }

                // Position cursor inside the list item
                let selPos = block.contentStart + 1
                if (itemIndex !== undefined) {
                    const node = editor.state.doc.nodeAt(block.pos)
                    if (!node) {
                        return { error: '无法获取列表块内容' }
                    }
                    let currentItem = 0
                    let itemPos: number | null = null
                    node.forEach((child, offset) => {
                        if (currentItem === itemIndex) {
                            itemPos = block.pos + 1 + offset + 1
                        }
                        currentItem++
                    })
                    if (itemPos === null) {
                        return { error: `列表项索引越界。有效范围: 0-${currentItem - 1}，请求: ${itemIndex}` }
                    }
                    selPos = itemPos
                }

                editor.chain().focus().setTextSelection(selPos).scrollIntoView().run()
                const success = editor.chain().focus().liftListItem('listItem').run()

                if (!success) {
                    return { error: '提升列表项失败（可能已是最顶层级）' }
                }

                return {
                    success: true,
                    blockIndex,
                    ...(itemIndex !== undefined ? { itemIndex } : {}),
                    message: `已提升列表项`
                }
            } catch (error) {
                return { error: `提升列表项失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    setCodeBlockLanguage: {
        description: 'Set the programming language for syntax highlighting on a code block.',
        inputSchema: z.object({
            blockIndex: z.number().describe("代码块索引（从0开始）"),
            language: z.string().describe("编程语言标识符，如 'javascript', 'python', 'typescript' 等")
        }),
        execute: async ({ blockIndex, language }: {
            blockIndex: number
            language: string
        }) => {
            try {
                const blocks = discoverBlocks(editor)

                if (blockIndex < 0 || blockIndex >= blocks.length) {
                    return { error: `块索引越界。有效范围: 0-${blocks.length - 1}，请求: ${blockIndex}` }
                }

                const block = blocks[blockIndex]
                if (block.type !== 'codeBlock') {
                    return { error: `块类型 "${block.type}" 不是代码块。只能对 codeBlock 类型设置语言` }
                }

                // Set selection into the code block and update language attribute
                const selPos = block.contentStart + 1
                editor.chain().focus().setTextSelection(selPos).scrollIntoView().run()

                const success = editor.chain().focus().updateAttributes('codeBlock', { language }).run()

                if (!success) {
                    return { error: '设置代码块语言失败' }
                }

                return {
                    success: true,
                    blockIndex,
                    language,
                    message: `已将代码块语言设置为 ${language}`
                }
            } catch (error) {
                return { error: `设置代码块语言失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
