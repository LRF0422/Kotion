import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { parseMarkdownToNodes, scrollToPosition } from "@kn/common"

/**
 * Locate a block by its stable id inside an arbitrary doc (state doc or a
 * transaction's mapped doc). Checks `attrs.id` with `attrs.blockId` fallback,
 * matching the editor's UniqueID conventions.
 */
const findBlockInDoc = (
    doc: any,
    blockId: string
): { node: any; pos: number } | null => {
    let found: { node: any; pos: number } | null = null
    doc.descendants((node: any, pos: number) => {
        if (found) return false
        const id = (node.attrs?.id ?? node.attrs?.blockId) as string | undefined
        if (id === blockId) {
            found = { node, pos }
            return false
        }
        return true
    })
    return found
}

/** Parse markdown into ProseMirror nodes, dropping any that fail schema validation. */
const markdownToPmNodes = (editor: Editor, markdown: string): { nodes: any[]; dropped: number } => {
    const jsonNodes = parseMarkdownToNodes(markdown)
    const pmNodes: any[] = []
    let dropped = 0
    for (const json of jsonNodes) {
        try {
            pmNodes.push(editor.schema.nodeFromJSON(json))
        } catch {
            dropped++
        }
    }
    return { nodes: pmNodes, dropped }
}

/**
 * Create tools that address blocks by their stable blockId.
 *
 * blockId addressing is preferred over positions (stale after any edit) and
 * blockIndex (ambiguous with nested blocks): ids survive edits, so multi-step
 * agent plans stay valid without re-reading the document between steps.
 */
export const createBlockIdTools = (editor: Editor): ToolsRecord => ({
    replaceBlockById: {
        description: '通过 blockId 替换整个块的内容，支持 Markdown。blockId 从 getDocumentStructure 或 searchInDocument 获取，比位置寻址更可靠（编辑后不失效）',
        inputSchema: z.object({
            blockId: z.string().describe("目标块的 blockId"),
            markdown: z.string().describe("新的块内容，支持 Markdown 格式（可以是多个块）")
        }),
        execute: async ({ blockId, markdown }: { blockId: string; markdown: string }) => {
            try {
                const found = findBlockInDoc(editor.state.doc, blockId)
                if (!found) {
                    return { error: `未找到 blockId 为 "${blockId}" 的块，请用 getDocumentStructure 获取有效的 blockId` }
                }

                const { nodes, dropped } = markdownToPmNodes(editor, markdown)
                if (nodes.length === 0) {
                    return { error: '内容解析后为空，未执行替换' }
                }

                const tr = editor.state.tr
                tr.replaceWith(found.pos, found.pos + found.node.nodeSize, nodes)
                editor.view.dispatch(tr)
                scrollToPosition(editor, found.pos)

                return {
                    success: true,
                    blockId,
                    previousType: found.node.type.name,
                    previousText: found.node.textContent.slice(0, 80),
                    insertedBlocks: nodes.length,
                    ...(dropped > 0 ? { warning: `${dropped} 个节点因不符合文档结构被跳过` } : {})
                }
            } catch (error) {
                return { error: `替换块失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    insertAtBlockId: {
        description: '在指定 blockId 的块之前或之后插入内容，支持 Markdown。比 blockIndex/位置寻址更可靠',
        inputSchema: z.object({
            blockId: z.string().describe("锚点块的 blockId"),
            markdown: z.string().describe("要插入的内容，支持 Markdown 格式"),
            position: z.enum(['before', 'after']).optional().describe("插入位置，默认 'after'")
        }),
        execute: async ({ blockId, markdown, position = 'after' }: {
            blockId: string
            markdown: string
            position?: 'before' | 'after'
        }) => {
            try {
                const found = findBlockInDoc(editor.state.doc, blockId)
                if (!found) {
                    return { error: `未找到 blockId 为 "${blockId}" 的块，请用 getDocumentStructure 获取有效的 blockId` }
                }

                const { nodes, dropped } = markdownToPmNodes(editor, markdown)
                if (nodes.length === 0) {
                    return { error: '内容解析后为空，未执行插入' }
                }

                const insertPos = position === 'before'
                    ? found.pos
                    : found.pos + found.node.nodeSize

                const tr = editor.state.tr
                tr.insert(insertPos, nodes)
                editor.view.dispatch(tr)
                scrollToPosition(editor, insertPos)

                return {
                    success: true,
                    blockId,
                    position,
                    insertedAt: insertPos,
                    insertedBlocks: nodes.length,
                    ...(dropped > 0 ? { warning: `${dropped} 个节点因不符合文档结构被跳过` } : {})
                }
            } catch (error) {
                return { error: `插入失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    applyEdits: {
        description: '【推荐用于多处修改】在单个事务中批量执行多个编辑操作（替换块/插入/删除/追加）。所有操作一次性生效、一步撤销、只滚动一次，比逐个调用工具流畅得多。操作按顺序执行，用 blockId 定位（位置自动保持正确）',
        inputSchema: z.object({
            operations: z.array(z.object({
                action: z.enum(['replaceBlock', 'insertBefore', 'insertAfter', 'deleteBlock', 'append'])
                    .describe("操作类型: replaceBlock 替换块 / insertBefore 块前插入 / insertAfter 块后插入 / deleteBlock 删除块 / append 追加到文档末尾"),
                blockId: z.string().optional().describe("目标块的 blockId（append 操作不需要）"),
                markdown: z.string().optional().describe("内容，支持 Markdown（deleteBlock 操作不需要）")
            })).min(1).describe("要执行的编辑操作列表，按顺序执行")
        }),
        execute: async ({ operations }: {
            operations: Array<{
                action: 'replaceBlock' | 'insertBefore' | 'insertAfter' | 'deleteBlock' | 'append'
                blockId?: string
                markdown?: string
            }>
        }) => {
            try {
                const tr = editor.state.tr
                const results: Array<Record<string, any>> = []
                let appliedCount = 0
                let lastTouchedPos: number | null = null

                for (const [index, op] of operations.entries()) {
                    // Resolve the anchor block against the CURRENT tr.doc so
                    // earlier operations in this batch can't invalidate it.
                    const needsBlock = op.action !== 'append'
                    let found: { node: any; pos: number } | null = null

                    if (needsBlock) {
                        if (!op.blockId) {
                            results.push({ index, action: op.action, error: '缺少 blockId' })
                            continue
                        }
                        found = findBlockInDoc(tr.doc, op.blockId)
                        if (!found) {
                            results.push({ index, action: op.action, blockId: op.blockId, error: '未找到该 blockId 对应的块' })
                            continue
                        }
                    }

                    const needsContent = op.action !== 'deleteBlock'
                    let nodes: any[] = []
                    if (needsContent) {
                        if (!op.markdown) {
                            results.push({ index, action: op.action, error: '缺少 markdown 内容' })
                            continue
                        }
                        nodes = markdownToPmNodes(editor, op.markdown).nodes
                        if (nodes.length === 0) {
                            results.push({ index, action: op.action, error: '内容解析后为空' })
                            continue
                        }
                    }

                    switch (op.action) {
                        case 'replaceBlock':
                            tr.replaceWith(found!.pos, found!.pos + found!.node.nodeSize, nodes)
                            lastTouchedPos = found!.pos
                            break
                        case 'insertBefore':
                            tr.insert(found!.pos, nodes)
                            lastTouchedPos = found!.pos
                            break
                        case 'insertAfter':
                            tr.insert(found!.pos + found!.node.nodeSize, nodes)
                            lastTouchedPos = found!.pos + found!.node.nodeSize
                            break
                        case 'deleteBlock':
                            tr.delete(found!.pos, found!.pos + found!.node.nodeSize)
                            lastTouchedPos = found!.pos
                            break
                        case 'append':
                            tr.insert(tr.doc.content.size, nodes)
                            lastTouchedPos = tr.doc.content.size
                            break
                    }

                    appliedCount++
                    results.push({ index, action: op.action, blockId: op.blockId, success: true })
                }

                if (appliedCount === 0) {
                    return { error: '没有任何操作被执行', results }
                }

                editor.view.dispatch(tr)
                if (lastTouchedPos !== null) {
                    scrollToPosition(editor, Math.min(lastTouchedPos, editor.state.doc.content.size), true)
                }

                return {
                    success: true,
                    applied: appliedCount,
                    total: operations.length,
                    results,
                    message: `已在单个事务中执行 ${appliedCount}/${operations.length} 个操作（可一步撤销）`
                }
            } catch (error) {
                return { error: `批量编辑失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
