/**
 * Callout (InfoPanel) Tools
 *
 * Tools for inserting, querying, updating, and deleting callout/info-panel blocks.
 * Callouts are highlighted boxes used to draw attention to important information.
 *
 * Types: default, info, success, warning, error, tip, bookmark
 */

import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "../types"
import { discoverBlocks } from "../utils/block-utils"
import { scrollToPosition } from "../utils/editor-effects"

const CALLOUT_TYPES = ['default', 'info', 'success', 'warning', 'error', 'tip', 'bookmark'] as const

const CALLOUT_TYPE_DESC: Record<string, string> = {
    default: '灰色默认',
    info: '蓝色信息提示',
    success: '绿色成功提示',
    warning: '黄色警告提示',
    error: '红色错误提示',
    tip: '绿色小贴士',
    bookmark: '紫色书签'
}

/**
 * Find all callout nodes in the document
 */
function findCallouts(editor: Editor): Array<{
    index: number
    pos: number
    endPos: number
    type: string
    content: string
    nodeSize: number
}> {
    const callouts: Array<{
        index: number
        pos: number
        endPos: number
        type: string
        content: string
        nodeSize: number
    }> = []

    let calloutIndex = 0
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'infoPanel') {
            callouts.push({
                index: calloutIndex++,
                pos,
                endPos: pos + node.nodeSize,
                type: node.attrs.type || 'default',
                content: node.textContent,
                nodeSize: node.nodeSize
            })
            return false // Don't descend into callout children
        }
        return true
    })

    return callouts
}

/**
 * Create callout (info panel) tools
 */
export const createCalloutTools = (editor: Editor): ToolsRecord => ({

    /**
     * Insert a callout block
     */
    insertCallout: {
        description: `插入一个高亮提示框（Callout/InfoPanel）。适用于需要突出显示重要信息、注意事项、提示、警告等内容的场景。
支持7种类型：info(蓝色信息)、success(绿色成功)、warning(黄色警告)、error(红色错误)、tip(绿色贴士)、bookmark(紫色书签)、default(灰色默认)。
可以在文档中指定位置插入，支持通过块索引或匹配文本定位。`,
        inputSchema: z.object({
            type: z.enum(CALLOUT_TYPES).describe("提示框类型: info/success/warning/error/tip/bookmark/default"),
            content: z.string().optional().describe("提示框内的文本内容"),
            blockIndex: z.number().optional().describe("在此块之后插入（从0开始），不填则在文档末尾插入"),
            nearText: z.string().optional().describe("在包含此文本的块之后插入，优先使用此参数定位")
        }),
        execute: async ({ type, content, blockIndex, nearText }: {
            type: string
            content?: string
            blockIndex?: number
            nearText?: string
        }) => {
            try {
                // Build the callout node
                const calloutNode: any = {
                    type: 'infoPanel',
                    attrs: { type },
                    content: [{
                        type: 'paragraph',
                        content: content ? [{ type: 'text', text: content }] : []
                    }]
                }

                let insertPos: number | null = null

                // Strategy 1: Find position by nearText
                if (nearText) {
                    const searchText = nearText.toLowerCase()
                    editor.state.doc.descendants((node, pos) => {
                        if (insertPos !== null) return false
                        if (node.isTextblock && node.textContent.toLowerCase().includes(searchText)) {
                            // Find the top-level block containing this text
                            const resolvedPos = editor.state.doc.resolve(pos)
                            // Walk up to find the direct child of doc
                            let depth = resolvedPos.depth
                            while (depth > 1) depth--
                            const blockStart = resolvedPos.before(Math.max(depth, 1))
                            const blockNode = editor.state.doc.nodeAt(blockStart)
                            if (blockNode) {
                                insertPos = blockStart + blockNode.nodeSize
                            }
                            return false
                        }
                        return true
                    })
                }

                // Strategy 2: Find position by blockIndex
                if (insertPos === null && blockIndex !== undefined) {
                    const blocks = discoverBlocks(editor)
                    const targetIndex = Math.min(Math.max(0, blockIndex), blocks.length - 1)
                    if (blocks[targetIndex]) {
                        insertPos = blocks[targetIndex].pos + blocks[targetIndex].size
                    }
                }

                // Strategy 3: Default - insert at document end
                if (insertPos === null) {
                    insertPos = editor.state.doc.content.size
                }

                // Ensure position is valid
                const docSize = editor.state.doc.nodeSize
                insertPos = Math.min(insertPos, docSize - 2)
                insertPos = Math.max(insertPos, 0)

                const success = editor.chain()
                    .focus()
                    .insertContentAt(insertPos, calloutNode)
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '插入提示框失败' }
                }

                scrollToPosition(editor, insertPos)

                return {
                    success: true,
                    type,
                    typeLabel: CALLOUT_TYPE_DESC[type] || type,
                    content: content || '',
                    insertedAt: insertPos,
                    message: `已在位置 ${insertPos} 插入 ${CALLOUT_TYPE_DESC[type] || type} 类型的提示框`
                }
            } catch (error) {
                return { error: `插入提示框失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    /**
     * Get info about all callouts in the document
     */
    getCalloutInfo: {
        description: '获取文档中所有提示框（Callout/InfoPanel）的信息，包括位置、类型和内容。在修改或删除提示框之前应先调用此工具。',
        inputSchema: z.object({}),
        execute: async () => {
            const callouts = findCallouts(editor)

            return {
                success: true,
                count: callouts.length,
                callouts: callouts.map(c => ({
                    index: c.index,
                    type: c.type,
                    typeLabel: CALLOUT_TYPE_DESC[c.type] || c.type,
                    content: c.content.substring(0, 200) + (c.content.length > 200 ? '...' : ''),
                    pos: c.pos,
                    endPos: c.endPos
                })),
                availableTypes: Object.entries(CALLOUT_TYPE_DESC).map(([key, label]) => `${key}: ${label}`),
                message: callouts.length > 0
                    ? `文档中有 ${callouts.length} 个提示框`
                    : '文档中没有提示框'
            }
        }
    },

    /**
     * Update callout type
     */
    updateCalloutType: {
        description: '修改指定提示框的类型（如将 info 改为 warning）。需要先通过 getCalloutInfo 获取提示框索引。',
        inputSchema: z.object({
            calloutIndex: z.number().describe("提示框索引（从0开始，通过 getCalloutInfo 获取）"),
            newType: z.enum(CALLOUT_TYPES).describe("新的提示框类型")
        }),
        execute: async ({ calloutIndex, newType }: { calloutIndex: number; newType: string }) => {
            try {
                const callouts = findCallouts(editor)

                if (calloutIndex < 0 || calloutIndex >= callouts.length) {
                    return {
                        error: `提示框索引 ${calloutIndex} 超出范围，文档中共有 ${callouts.length} 个提示框（索引 0-${callouts.length - 1}）`
                    }
                }

                const target = callouts[calloutIndex]
                const node = editor.state.doc.nodeAt(target.pos)

                if (!node || node.type.name !== 'infoPanel') {
                    return { error: '目标位置不是提示框节点' }
                }

                const oldType = node.attrs.type || 'default'

                const tr = editor.state.tr
                tr.setNodeMarkup(target.pos, undefined, { ...node.attrs, type: newType })
                editor.view.dispatch(tr)

                return {
                    success: true,
                    calloutIndex,
                    oldType,
                    oldTypeLabel: CALLOUT_TYPE_DESC[oldType] || oldType,
                    newType,
                    newTypeLabel: CALLOUT_TYPE_DESC[newType] || newType,
                    message: `已将提示框类型从 ${CALLOUT_TYPE_DESC[oldType] || oldType} 修改为 ${CALLOUT_TYPE_DESC[newType] || newType}`
                }
            } catch (error) {
                return { error: `修改提示框类型失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    /**
     * Update callout content
     */
    updateCalloutContent: {
        description: '更新指定提示框的文本内容。需要先通过 getCalloutInfo 获取提示框索引。',
        inputSchema: z.object({
            calloutIndex: z.number().describe("提示框索引（从0开始）"),
            content: z.string().describe("新的文本内容")
        }),
        execute: async ({ calloutIndex, content }: { calloutIndex: number; content: string }) => {
            try {
                const callouts = findCallouts(editor)

                if (calloutIndex < 0 || calloutIndex >= callouts.length) {
                    return {
                        error: `提示框索引 ${calloutIndex} 超出范围，文档中共有 ${callouts.length} 个提示框（索引 0-${callouts.length - 1}）`
                    }
                }

                const target = callouts[calloutIndex]
                const node = editor.state.doc.nodeAt(target.pos)

                if (!node || node.type.name !== 'infoPanel') {
                    return { error: '目标位置不是提示框节点' }
                }

                const oldContent = node.textContent

                // Replace the content inside the callout
                // infoPanel contains block+ (paragraphs), replace all inner content
                const contentStart = target.pos + 1 // After the infoPanel opening
                const contentEnd = target.pos + node.nodeSize - 1 // Before the infoPanel closing

                const tr = editor.state.tr
                const newParagraph = editor.state.schema.nodes.paragraph.create(
                    null,
                    content ? editor.state.schema.text(content) : null
                )
                tr.replaceWith(contentStart, contentEnd, newParagraph)
                editor.view.dispatch(tr)

                return {
                    success: true,
                    calloutIndex,
                    oldContent: oldContent.substring(0, 100) + (oldContent.length > 100 ? '...' : ''),
                    newContent: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
                    message: '已更新提示框内容'
                }
            } catch (error) {
                return { error: `更新提示框内容失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    /**
     * Delete a callout
     */
    deleteCallout: {
        description: '删除指定的提示框。需要先通过 getCalloutInfo 获取提示框索引。',
        inputSchema: z.object({
            calloutIndex: z.number().describe("要删除的提示框索引（从0开始，通过 getCalloutInfo 获取）")
        }),
        execute: async ({ calloutIndex }: { calloutIndex: number }) => {
            try {
                const callouts = findCallouts(editor)

                if (calloutIndex < 0 || calloutIndex >= callouts.length) {
                    return {
                        error: `提示框索引 ${calloutIndex} 超出范围，文档中共有 ${callouts.length} 个提示框（索引 0-${callouts.length - 1}）`
                    }
                }

                const target = callouts[calloutIndex]
                const node = editor.state.doc.nodeAt(target.pos)

                if (!node) {
                    return { error: '目标节点不存在' }
                }

                const deletedType = node.attrs.type || 'default'
                const deletedContent = node.textContent

                const tr = editor.state.tr
                tr.delete(target.pos, target.pos + node.nodeSize)
                editor.view.dispatch(tr)

                return {
                    success: true,
                    calloutIndex,
                    deletedType,
                    deletedTypeLabel: CALLOUT_TYPE_DESC[deletedType] || deletedType,
                    deletedContent: deletedContent.substring(0, 100) + (deletedContent.length > 100 ? '...' : ''),
                    message: `已删除 ${CALLOUT_TYPE_DESC[deletedType] || deletedType} 类型的提示框`
                }
            } catch (error) {
                return { error: `删除提示框失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
