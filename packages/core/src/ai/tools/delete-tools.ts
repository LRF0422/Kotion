import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { findBlockPosById, findTextMatchesInDoc, scrollToPosition } from "@kn/common"

/**
 * Precise document deletion tools.
 *
 * These replace the legacy deleteBySearch / deleteBlock / deleteByBlockId
 * tools, which had three classes of defects:
 *
 *  1. Wrong positions — they mapped textContent indices onto doc positions
 *     1:1, which breaks when a block contains inline atoms (images, mentions,
 *     hard breaks occupy a position but contribute no text) or the match spans
 *     a mark boundary; the per-block char counter also stopped updating after
 *     the first complete match, so the 2nd+ match in the same block computed
 *     wrong positions.
 *  2. Silent wrong-target deletions — an out-of-range `occurrence` was
 *     clamped to the last match, and an ambiguous multi-match search silently
 *     deleted the first hit.
 *  3. Unverified mutations — deleteByBlockId reported success even when no
 *     block was found, and deletions ran as two chained transactions
 *     (scroll + delete) instead of one.
 *
 * The new contract: blockId-first addressing, verified targets (fail fast on
 * ambiguity instead of guessing), per-target reporting, and every deletion
 * batched into a single transaction applied in descending position order.
 */

/** Block types that must never be removed by AI deletion. */
const PROTECTED_TYPES = new Set(['title', 'tableOfContents'])

type CollectedBlock = { id: string; node: any; pos: number }

/** Collect every node whose blockId is in `ids` (single traversal). */
const collectBlocksByIds = (doc: any, ids: string[]): { found: CollectedBlock[]; missing: string[] } => {
    const idSet = new Set(ids)
    const found: CollectedBlock[] = []
    doc.descendants((node: any, pos: number) => {
        const id = (node.attrs?.id ?? node.attrs?.blockId) as string | undefined
        if (id && idSet.has(id)) {
            found.push({ id, node, pos })
        }
        return true
    })
    const foundIds = new Set(found.map(f => f.id))
    return { found, missing: ids.filter(id => !foundIds.has(id)) }
}

/** Whether the node at `pos`, or any of its ancestors, is protected. */
const isProtected = (doc: any, pos: number, node: any): boolean => {
    if (PROTECTED_TYPES.has(node.type.name)) return true
    const $pos = doc.resolve(pos)
    for (let depth = $pos.depth; depth > 0; depth--) {
        if (PROTECTED_TYPES.has($pos.node(depth).type.name)) return true
    }
    return false
}

/** Doc range of the pinned leading block (title), when present. */
const titleRange = (doc: any): { from: number; to: number } | null => {
    const first = doc.firstChild
    return first && PROTECTED_TYPES.has(first.type.name)
        ? { from: 0, to: first.nodeSize }
        : null
}

/** Preview of a node's text content for result reporting. */
const preview = (node: any): string =>
    node.textContent.length > 60
        ? `${node.textContent.slice(0, 60)}...`
        : node.textContent

/**
 * Create document deletion tools
 */
export const createDeleteTools = (editor: Editor): ToolsRecord => ({
    deleteText: {
        description: '精确删除匹配到的文本（只删文本，不动块结构；要删整块请用 deleteBlocks）。默认要求能唯一定位：多处匹配时必须提供 blockId 或 occurrence 之一，或显式设置 deleteAllMatches',
        inputSchema: z.object({
            searchText: z.string().min(1).describe('要删除的文本，须与文档内容一致（默认不区分大小写）'),
            blockId: z.string().optional().describe('限定在该 blockId 的块（及其子块）内查找，用于多处匹配时精确定位'),
            occurrence: z.number().optional().describe('删除第几处匹配（从 1 开始）。超出范围会报错而不会猜测'),
            deleteAllMatches: z.boolean().optional().describe('删除所有匹配处（同一事务，从后向前），默认 false'),
            caseSensitive: z.boolean().optional().describe('是否区分大小写，默认 false')
        }),
        execute: async ({ searchText, blockId, occurrence, deleteAllMatches = false, caseSensitive = false }: {
            searchText: string
            blockId?: string
            occurrence?: number
            deleteAllMatches?: boolean
            caseSensitive?: boolean
        }) => {
            try {
                if (!searchText || searchText.trim().length === 0) {
                    return { error: 'searchText 不能为空' }
                }

                const doc = editor.state.doc
                const options: { caseSensitive: boolean; scopeFrom?: number; scopeTo?: number } = { caseSensitive }

                if (blockId) {
                    const scope = findBlockPosById(doc, blockId)
                    if (!scope) {
                        return { error: `未找到 blockId 为 "${blockId}" 的块，请用 getDocumentStructure 获取有效 blockId` }
                    }
                    options.scopeFrom = scope.pos
                    options.scopeTo = scope.pos + scope.node.nodeSize
                }

                const matches = findTextMatchesInDoc(doc, searchText, options)

                if (matches.length === 0) {
                    return {
                        error: `未找到文本 "${searchText}"${blockId ? `（在块 ${blockId} 内）` : ''}${caseSensitive ? '（区分大小写）' : ''}`,
                        suggestion: '用 searchInDocument 确认文本内容与所在块'
                    }
                }

                let targets
                if (deleteAllMatches) {
                    targets = matches
                } else if (occurrence !== undefined) {
                    if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > matches.length) {
                        return {
                            error: `occurrence=${occurrence} 超出范围（共 ${matches.length} 处匹配），未执行删除`,
                            totalMatches: matches.length,
                            matches: matches.map(m => ({ from: m.from, to: m.to, blockId: m.blockId, context: m.context }))
                        }
                    }
                    targets = [matches[occurrence - 1]]
                } else if (matches.length === 1) {
                    targets = matches
                } else {
                    // Ambiguous: refuse to guess which match was meant.
                    return {
                        error: `文本 "${searchText}" 有 ${matches.length} 处匹配，无法确定删除目标。请补充 blockId（限定块）或 occurrence（第几处），或设置 deleteAllMatches: true`,
                        matches: matches.map((m, i) => ({
                            occurrence: i + 1,
                            from: m.from,
                            to: m.to,
                            blockId: m.blockId,
                            blockType: m.blockType,
                            context: m.context
                        }))
                    }
                }

                const docSize = doc.nodeSize
                const tr = editor.state.tr
                // Descending order keeps positions valid across deletions.
                const ordered = [...targets].sort((a, b) => b.from - a.from)
                for (const match of ordered) {
                    tr.delete(match.from, match.to)
                }
                editor.view.dispatch(tr)

                scrollToPosition(editor, Math.min(ordered[ordered.length - 1].from, editor.state.doc.content.size), true)

                return {
                    success: true,
                    deletedCount: targets.length,
                    totalMatches: matches.length,
                    scopedToBlockId: blockId,
                    deleted: targets.map(m => ({
                        text: m.text,
                        from: m.from,
                        to: m.to,
                        blockId: m.blockId,
                        blockType: m.blockType
                    })),
                    deletedSize: docSize - editor.state.doc.nodeSize,
                    message: `已删除 ${targets.length}/${matches.length} 处匹配文本`
                }
            } catch (error) {
                return { error: `删除文本失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    deleteBlocks: {
        description: '按 blockId 删除一个或多个块（整块删除，含块内全部内容）。批量在单个事务中按位置从后向前执行，一步撤销。默认所有 blockId 都必须存在，任一不存在则整体失败并报告（可设 ignoreMissing 跳过缺失项）',
        inputSchema: z.object({
            blockIds: z.union([
                z.string().describe('单个 blockId'),
                z.array(z.string()).describe('多个 blockId')
            ]).describe('要删除的块 ID（来自 getDocumentStructure / searchInDocument）'),
            ignoreMissing: z.boolean().optional().describe('是否忽略文档中不存在的 blockId，默认 false（任一缺失则不执行任何删除）')
        }),
        execute: async ({ blockIds, ignoreMissing = false }: {
            blockIds: string | string[]
            ignoreMissing?: boolean
        }) => {
            try {
                const ids = Array.from(new Set(typeof blockIds === 'string' ? [blockIds] : blockIds))
                if (ids.length === 0) {
                    return { error: '未提供 blockIds' }
                }

                const doc = editor.state.doc
                const { found, missing } = collectBlocksByIds(doc, ids)

                if (found.length === 0) {
                    return { error: `未找到任何 blockId 对应的块: ${missing.join(', ')}`, missing }
                }

                // Drop ids whose block is nested inside another deleted block —
                // the outer deletion already covers them.
                const ascending = [...found].sort((a, b) => a.pos - b.pos)
                const targets = ascending.filter(entry =>
                    !ascending.some(other =>
                        other !== entry &&
                        other.pos <= entry.pos &&
                        other.pos + other.node.nodeSize >= entry.pos + entry.node.nodeSize
                    )
                )

                // Protected blocks (page title / ToC) can never be AI-deleted.
                const protectedTargets = targets.filter(t => isProtected(doc, t.pos, t.node))
                if (protectedTargets.length > 0) {
                    return {
                        error: `以下块受保护不可删除: ${protectedTargets.map(t => `${t.id}(${t.node.type.name})`).join(', ')}。标题内容请用 updateTitle 修改`,
                        protected: protectedTargets.map(t => t.id)
                    }
                }

                if (missing.length > 0 && !ignoreMissing) {
                    return {
                        error: `以下 blockId 在文档中不存在，未执行任何删除: ${missing.join(', ')}。请重读文档获取有效 blockId，或传 ignoreMissing: true 跳过缺失项`,
                        missing,
                        foundIds: targets.map(t => t.id)
                    }
                }

                const docSize = doc.nodeSize
                const tr = editor.state.tr
                // Descending order keeps positions valid across deletions.
                const ordered = [...targets].sort((a, b) => b.pos - a.pos)
                for (const { node, pos } of ordered) {
                    tr.delete(pos, pos + node.nodeSize)
                }
                editor.view.dispatch(tr)

                scrollToPosition(editor, Math.min(ordered[ordered.length - 1].pos, editor.state.doc.content.size), true)

                return {
                    success: true,
                    deleted: [...targets]
                        .sort((a, b) => a.pos - b.pos)
                        .map(t => ({ blockId: t.id, type: t.node.type.name, preview: preview(t.node) })),
                    deletedCount: targets.length,
                    ...(missing.length > 0 ? { skippedMissing: missing } : {}),
                    deletedSize: docSize - editor.state.doc.nodeSize,
                    message: `已在单个事务中删除 ${targets.length} 个块${missing.length > 0 ? `（跳过 ${missing.length} 个不存在的 blockId）` : ''}`
                }
            } catch (error) {
                return { error: `删除块失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    deleteRange: {
        description: '删除精确位置范围内的内容（from/to 来自 searchInDocument）。强烈建议传 expectedText：位置因其他编辑失效时会校验并自动重定位后删除',
        inputSchema: z.object({
            from: z.number().describe('起始位置'),
            to: z.number().describe('结束位置'),
            expectedText: z.string().optional().describe('预期在 from-to 位置的文本，用于校验位置有效性；失效且能唯一定位时自动重定位')
        }),
        execute: async ({ from, to, expectedText }: {
            from: number
            to: number
            expectedText?: string
        }) => {
            try {
                const doc = editor.state.doc
                const docSize = doc.content.size
                let relocated = false

                if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > docSize) {
                    return { error: `位置超出文档范围（0-${docSize}），收到 from=${from}, to=${to}` }
                }
                if (from >= to) {
                    return { error: `起始位置 ${from} 必须小于结束位置 ${to}` }
                }

                // Self-heal: verify the range still holds the expected text,
                // otherwise re-locate it (positions go stale after any edit).
                if (expectedText) {
                    const actual = doc.textBetween(from, to)
                    if (actual !== expectedText) {
                        const occurrences = findTextMatchesInDoc(doc, expectedText, { caseSensitive: true })
                        if (occurrences.length === 0) {
                            return {
                                error: `位置 ${from}-${to} 实际为 "${actual}"，与 expectedText 不符，且文档中已找不到该文本，请重新读取文档`
                            }
                        }
                        if (occurrences.length > 1) {
                            return {
                                error: `位置已失效，且 "${expectedText}" 有 ${occurrences.length} 处匹配无法自动重定位，请用 searchInDocument 重新获取位置`,
                                occurrences
                            }
                        }
                        from = occurrences[0].from
                        to = occurrences[0].to
                        relocated = true
                    }
                }

                const title = titleRange(doc)
                if (title && from < title.to) {
                    return { error: `范围 ${from}-${to} 覆盖了文档标题，标题内容请用 updateTitle 修改` }
                }

                const deletedText = doc.textBetween(from, to, '\n')
                const tr = editor.state.tr
                tr.delete(from, to)
                editor.view.dispatch(tr)

                scrollToPosition(editor, Math.min(from, editor.state.doc.content.size), true)

                return {
                    success: true,
                    from,
                    to,
                    deletedText,
                    ...(relocated ? { relocated: true } : {}),
                    message: `已删除位置 ${from}-${to} 的内容${relocated ? '（原位置已失效，按 expectedText 自动重定位）' : ''}`
                }
            } catch (error) {
                return { error: `删除范围内容失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    deleteBlocksBetween: {
        description: '删除两个锚点块之间的连续区域（含中间所有块），适合“删除从 X 到 Y 这一节”的请求。锚点用 blockId 定位，可选是否包含锚点块本身',
        inputSchema: z.object({
            fromBlockId: z.string().describe('起始锚点块的 blockId'),
            toBlockId: z.string().describe('结束锚点块的 blockId'),
            includeFrom: z.boolean().optional().describe('是否包含起始锚点块本身，默认 true'),
            includeTo: z.boolean().optional().describe('是否包含结束锚点块本身，默认 true')
        }),
        execute: async ({ fromBlockId, toBlockId, includeFrom = true, includeTo = true }: {
            fromBlockId: string
            toBlockId: string
            includeFrom?: boolean
            includeTo?: boolean
        }) => {
            try {
                const doc = editor.state.doc

                const fromAnchor = findBlockPosById(doc, fromBlockId)
                if (!fromAnchor) {
                    return { error: `未找到 fromBlockId "${fromBlockId}" 对应的块，请用 getDocumentStructure 获取有效 blockId` }
                }
                const toAnchor = findBlockPosById(doc, toBlockId)
                if (!toAnchor) {
                    return { error: `未找到 toBlockId "${toBlockId}" 对应的块，请用 getDocumentStructure 获取有效 blockId` }
                }

                // Nested anchors (one inside the other): "between" is
                // ambiguous — refuse and point at deleteBlocks.
                const fromEnd = fromAnchor.pos + fromAnchor.node.nodeSize
                const toEnd = toAnchor.pos + toAnchor.node.nodeSize
                if (fromBlockId !== toBlockId &&
                    ((toAnchor.pos >= fromAnchor.pos && toAnchor.pos < fromEnd) ||
                     (fromAnchor.pos >= toAnchor.pos && fromAnchor.pos < toEnd))) {
                    return {
                        error: '两个锚点块存在嵌套关系（一个包含另一个），无法按“之间”删除。请改用 deleteBlocks 删除外层块，或分别指定内部各块'
                    }
                }

                const fromFirst = fromAnchor.pos <= toAnchor.pos
                const earlier = fromFirst ? fromAnchor : toAnchor
                const later = fromFirst ? toAnchor : fromAnchor
                const earlierIncluded = fromFirst ? includeFrom : includeTo
                const laterIncluded = fromFirst ? includeTo : includeFrom

                const from = earlierIncluded ? earlier.pos : earlier.pos + earlier.node.nodeSize
                const to = laterIncluded ? later.pos + later.node.nodeSize : later.pos

                if (from >= to) {
                    return { error: '删除区间为空（锚点块被排除或锚点重叠），未执行删除' }
                }

                const title = titleRange(doc)
                if (title && from < title.to) {
                    return { error: `删除区间 ${from}-${to} 覆盖了文档标题，标题请用 updateTitle 修改` }
                }

                // Count blocks in the span (nested included) for the report.
                let blockCount = 0
                doc.nodesBetween(from, to, node => {
                    if (node.isBlock) blockCount++
                    return true
                })

                const docSize = doc.nodeSize
                const tr = editor.state.tr
                tr.delete(from, to)
                editor.view.dispatch(tr)

                scrollToPosition(editor, Math.min(from, editor.state.doc.content.size), true)

                return {
                    success: true,
                    fromBlockId,
                    toBlockId,
                    includeFrom,
                    includeTo,
                    deletedFrom: from,
                    deletedTo: to,
                    deletedBlockCount: blockCount,
                    deletedSize: docSize - editor.state.doc.nodeSize,
                    message: `已删除 ${fromBlockId} 到 ${toBlockId} 之间的 ${blockCount} 个块（含嵌套，单事务可一步撤销）`
                }
            } catch (error) {
                return { error: `删除区间失败: ${error instanceof Error ? error.message : '未知错误'}` }
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
    }
})

