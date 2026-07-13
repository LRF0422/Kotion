import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"
import { Node as PmNode } from "@kn/editor"
import { normalizeColumnWidths, buildColumnsRow, type LayoutRowSpec, type LayoutCellSpec } from "@kn/editor"
import { parseMarkdownToNodes } from "@kn/common"
import { scrollToPosition } from "@kn/common"

/**
 * Columns info with nesting support
 */
interface ColumnsInfo {
    pos: number
    node: PmNode
    index: number          // 全局扁平索引（保持向后兼容）
    columnsCount: number
    layout: string
    gap: number | null
    depth: number          // 嵌套深度：0=顶层，1=一级嵌套...
    parentPath: number[]   // 父分栏路径 [parentColumnsIndex, parentColumnIndex, ...]
}

/**
 * Helper: Find all columns nodes in the document (supports nested columns)
 */
const findColumnsInDocument = (editor: Editor): ColumnsInfo[] => {
    const results: ColumnsInfo[] = []
    let globalIndex = 0

    const traverse = (node: PmNode, pos: number, depth: number, parentPath: number[]) => {
        node.forEach((child, offset) => {
            const childPos = pos + offset + 1
            if (child.type.name === 'columns') {
                const currentIndex = globalIndex++
                results.push({
                    pos: childPos,
                    node: child,
                    index: currentIndex,
                    columnsCount: child.childCount,
                    layout: child.attrs.type || 'none',
                    gap: typeof child.attrs.gap === 'number' ? child.attrs.gap : null,
                    depth,
                    parentPath: [...parentPath]
                })
                // 递归进入 columns 的 column 子节点，发现更深层嵌套
                child.forEach((col, colOffset, colIdx) => {
                    traverse(col, childPos + colOffset + 1, depth + 1, [...parentPath, currentIndex, colIdx])
                })
            } else if (child.childCount > 0) {
                // 非 columns 节点，继续向下搜索
                traverse(child, childPos, depth, parentPath)
            }
        })
    }

    traverse(editor.state.doc, 0, 0, [])
    return results
}

/**
 * Helper: Get column content as text, plus per-column style attrs, with
 * optional nested columns annotation.
 */
const getColumnContent = (column: PmNode, nestedColumnsMap?: Map<number, number>): {
    text: string
    style: {
        width: number | null
        background: string | null
        padding: 'none' | 'sm' | 'md' | 'lg'
        verticalAlign: 'top' | 'center' | 'bottom'
    }
    blocks: Array<{ type: string; text: string; hasNestedColumns?: boolean; nestedColumnsIndex?: number }>
} => {
    const blocks: Array<{ type: string; text: string; hasNestedColumns?: boolean; nestedColumnsIndex?: number }> = []
    let fullText = ''
    let blockOffset = 0

    column.forEach((child) => {
        const block: { type: string; text: string; hasNestedColumns?: boolean; nestedColumnsIndex?: number } = {
            type: child.type.name,
            text: child.textContent
        }
        if (child.type.name === 'columns' && nestedColumnsMap) {
            block.hasNestedColumns = true
            const nestedIdx = nestedColumnsMap.get(blockOffset)
            if (nestedIdx !== undefined) {
                block.nestedColumnsIndex = nestedIdx
            }
        }
        blocks.push(block)
        fullText += child.textContent + '\n'
        blockOffset++
    })

    return {
        text: fullText.trim(),
        style: {
            width: typeof column.attrs.width === 'number' ? column.attrs.width : null,
            background: typeof column.attrs.background === 'string' ? column.attrs.background : null,
            padding: (column.attrs.padding as 'none' | 'sm' | 'md' | 'lg') || 'none',
            verticalAlign: (column.attrs.verticalAlign as 'top' | 'center' | 'bottom') || 'top'
        },
        blocks
    }
}

/** Zod schema shared by tools that accept per-column style overrides. */
const columnStyleSchema = z.object({
    background: z.string().optional().describe("背景色（CSS 颜色，如 #f5f5f5、rgb(...)、var(--muted)），只允许安全子集"),
    padding: z.enum(['none', 'sm', 'md', 'lg']).optional().describe("列内边距: none/sm(6px)/md(12px)/lg(20px)"),
    verticalAlign: z.enum(['top', 'center', 'bottom']).optional().describe("列内容垂直对齐")
})

/** Zod schema for the LayoutTree consumed by the `buildLayout` tool. */
const layoutCellSchema: z.ZodType<any> = z.lazy(() => z.object({
    width: z.number().optional().describe("列宽百分比 (5-95)。同一行的宽度会被自动归一化到 100"),
    background: z.string().optional(),
    padding: z.enum(['none', 'sm', 'md', 'lg']).optional(),
    verticalAlign: z.enum(['top', 'center', 'bottom']).optional(),
    content: z.string().optional().describe("列内 Markdown 内容"),
    nested: z.array(layoutRowSchema).optional().describe("嵌套子行；最多一层嵌套")
}))
const layoutRowSchema: z.ZodType<any> = z.lazy(() => z.object({
    gap: z.number().min(0).max(128).optional().describe("列间距 (px)"),
    layout: z.enum(['none', 'left', 'right', 'center']).optional().describe("预设布局；提供 widths 时忽略"),
    cols: z.array(layoutCellSchema).min(2).max(8)
}))

/** Safe background sanitizer mirrored from the schema-side validator. */
const SAFE_BG_RE = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([^"'`]+\)|var\(--[a-zA-Z0-9-_]+\)|[a-zA-Z]+)$/
const safeBackground = (value?: string | null): string | null => {
    if (typeof value !== 'string') return null
    const v = value.trim()
    if (!v || v.length > 64) return null
    return SAFE_BG_RE.test(v) ? v : null
}

/**
 * Convert an agent-facing LayoutCell (with markdown `content`) to the
 * LayoutCellSpec understood by `buildColumnsRow` (with parsed `contentJSON`).
 */
const cellToSpec = (cell: any, hasNested = false): LayoutCellSpec => {
    const contentJSON = typeof cell?.content === 'string' && cell.content.length > 0
        ? parseMarkdownToNodes(cell.content)
        : []
    const nested = Array.isArray(cell?.nested)
        ? cell.nested.map((r: any) => rowToSpec(r, true))
        : undefined
    return {
        width: typeof cell?.width === 'number' ? cell.width : null,
        background: safeBackground(cell?.background),
        padding: cell?.padding ?? 'none',
        verticalAlign: cell?.verticalAlign ?? 'top',
        contentJSON,
        nested: hasNested ? undefined : nested
    }
}

const rowToSpec = (row: any, isNested = false): LayoutRowSpec => {
    return {
        gap: typeof row?.gap === 'number' ? row.gap : null,
        layout: row?.layout ?? 'none',
        cols: Array.isArray(row?.cols) ? row.cols.map((c: any) => cellToSpec(c, isNested)) : []
    }
}

/**
 * Create columns manipulation tools for AI agent
 */
export const createColumnsTools = (editor: Editor): ToolsRecord => ({
    insertColumns: {
        description: '插入分栏布局。用于创建多列内容布局，可指定列数、位置、布局预设、自定义列宽（百分比数组，自动归一化）、列间距和各列样式',
        inputSchema: z.object({
            cols: z.number().min(2).max(8).optional()
                .describe("列数，2-8列，默认2列"),
            layout: z.enum(['none', 'left', 'right', 'center']).optional()
                .describe("布局类型: 'none'等宽, 'left'左侧宽, 'right'右侧宽, 'center'中间宽。指定 widths 时被忽略"),
            widths: z.array(z.number()).optional()
                .describe("每列宽度百分比数组，最终会被归一化到总和 100（最小 5%）。指定时覆盖 layout 预设"),
            gap: z.number().min(0).max(128).optional()
                .describe("列间距 (px)，0-128"),
            styles: z.array(columnStyleSchema).optional()
                .describe("每列样式（背景色/内边距/垂直对齐）"),
            position: z.number().optional()
                .describe("插入位置的文档坐标，不指定则插入到当前光标位置")
        }),
        execute: async ({ cols = 2, layout = 'none', widths, gap, styles, position }: {
            cols?: number
            layout?: 'none' | 'left' | 'right' | 'center'
            widths?: number[]
            gap?: number
            styles?: Array<{
                background?: string
                padding?: 'none' | 'sm' | 'md' | 'lg'
                verticalAlign?: 'top' | 'center' | 'bottom'
            }>
            position?: number
        }) => {
            try {
                const colCount = Math.min(Math.max(2, cols), 8)
                const normalized = widths ? normalizeColumnWidths(widths, colCount) : []

                // Build per-column attribute list up front
                const columnNodes = Array.from({ length: colCount }, (_, i) => {
                    const style = styles?.[i]
                    return editor.schema.nodes['column'].createAndFill({
                        index: i,
                        type: layout,
                        cols: colCount,
                        width: normalized.length === colCount ? normalized[i] : null,
                        background: safeBackground(style?.background),
                        padding: style?.padding ?? 'none',
                        verticalAlign: style?.verticalAlign ?? 'top'
                    })!
                })

                const columnsAttrs: Record<string, any> = { cols: colCount, type: layout }
                if (typeof gap === 'number') columnsAttrs.gap = Math.max(0, Math.min(128, gap))

                const columnsNode = editor.schema.nodes['columns'].createChecked(columnsAttrs, columnNodes)

                let success: boolean
                if (position !== undefined) {
                    success = editor.commands.insertContentAt(position, columnsNode)
                } else {
                    // Insert at current cursor using the same node so widths/styles apply.
                    success = editor.chain()
                        .focus()
                        .insertContent(columnsNode.toJSON())
                        .scrollIntoView()
                        .run()
                }

                if (!success) {
                    return { error: '插入分栏失败' }
                }

                const allColumns = findColumnsInDocument(editor)
                const newColumns = allColumns[allColumns.length - 1]
                if (newColumns) scrollToPosition(editor, newColumns.pos)

                return {
                    success: true,
                    columnsIndex: newColumns?.index ?? 0,
                    columnsCount: colCount,
                    layout,
                    widths: normalized.length === colCount ? normalized : undefined,
                    gap: columnsAttrs.gap,
                    message: `已创建 ${colCount} 列布局`
                }
            } catch (error) {
                return { error: `插入分栏失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    getColumnsInfo: {
        description: '获取文档中所有分栏布局的信息，包括位置、列数、间距、各列宽度/样式/内容',
        inputSchema: z.object({
            columnsIndex: z.number().optional()
                .describe("指定获取哪个分栏的详细信息（从0开始），不填则返回所有分栏概览")
        }),
        execute: async ({ columnsIndex }: { columnsIndex?: number }) => {
            try {
                const allColumns = findColumnsInDocument(editor)

                if (allColumns.length === 0) {
                    return {
                        success: true,
                        hasColumns: false,
                        totalColumnsLayouts: 0,
                        message: '文档中没有分栏布局'
                    }
                }

                if (columnsIndex !== undefined) {
                    if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                        return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                    }

                    const target = allColumns[columnsIndex]

                    const columnsData: Array<{ index: number; content: ReturnType<typeof getColumnContent> }> = []

                    target.node.forEach((column, _, colIdx) => {
                        const nestedColumnsMap = new Map<number, number>()
                        let blockOffset = 0
                        column.forEach((child) => {
                            if (child.type.name === 'columns') {
                                const nested = allColumns.find(c =>
                                    c.depth === target.depth + 1 &&
                                    c.parentPath.length >= 2 &&
                                    c.parentPath[c.parentPath.length - 2] === target.index &&
                                    c.parentPath[c.parentPath.length - 1] === colIdx
                                )
                                if (nested) {
                                    nestedColumnsMap.set(blockOffset, nested.index)
                                }
                            }
                            blockOffset++
                        })

                        columnsData.push({
                            index: colIdx,
                            content: getColumnContent(column, nestedColumnsMap)
                        })
                    })

                    return {
                        success: true,
                        columnsIndex,
                        pos: target.pos,
                        columnsCount: target.columnsCount,
                        layout: target.layout,
                        gap: target.gap,
                        depth: target.depth,
                        parentPath: target.parentPath,
                        columns: columnsData
                    }
                }

                // Return overview of all columns
                return {
                    success: true,
                    hasColumns: true,
                    totalColumnsLayouts: allColumns.length,
                    columnsLayouts: allColumns.map(c => ({
                        index: c.index,
                        pos: c.pos,
                        columnsCount: c.columnsCount,
                        layout: c.layout,
                        gap: c.gap,
                        depth: c.depth,
                        parentPath: c.parentPath
                    }))
                }
            } catch (error) {
                return { error: `获取分栏信息失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    updateColumnContent: {
        description: '更新指定分栏中某一列的内容',
        inputSchema: z.object({
            columnsIndex: z.number().describe("分栏索引（从0开始）"),
            columnIndex: z.number().describe("列索引（从0开始，左到右）"),
            content: z.string().describe("要设置的新内容文本"),
            mode: z.enum(['replace', 'append', 'prepend']).optional()
                .describe("更新模式: 'replace'替换, 'append'追加到末尾, 'prepend'插入到开头")
        }),
        execute: async ({
            columnsIndex,
            columnIndex,
            content,
            mode = 'replace'
        }: {
            columnsIndex: number
            columnIndex: number
            content: string
            mode?: 'replace' | 'append' | 'prepend'
        }) => {
            try {
                const allColumns = findColumnsInDocument(editor)

                if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                    return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                }

                const target = allColumns[columnsIndex]

                if (columnIndex < 0 || columnIndex >= target.columnsCount) {
                    return { error: `列索引 ${columnIndex} 超出范围，该分栏共 ${target.columnsCount} 列` }
                }

                // Calculate position of the target column
                let columnPos = target.pos + 1
                for (let i = 0; i < columnIndex; i++) {
                    columnPos += target.node.child(i).nodeSize
                }

                const targetColumn = target.node.child(columnIndex)
                const contentStart = columnPos + 1
                const contentEnd = columnPos + targetColumn.nodeSize - 1

                // Parse markdown content to nodes
                const contentNodes = parseMarkdownToNodes(content);

                let success: boolean

                if (mode === 'replace') {
                    success = editor.chain()
                        .focus()
                        .deleteRange({ from: contentStart, to: contentEnd })
                        .insertContentAt(contentStart, contentNodes)
                        .scrollIntoView()
                        .run()
                } else if (mode === 'append') {
                    success = editor.chain()
                        .focus()
                        .insertContentAt(contentEnd, contentNodes)
                        .scrollIntoView()
                        .run()
                } else {
                    success = editor.chain()
                        .focus()
                        .insertContentAt(contentStart, contentNodes)
                        .scrollIntoView()
                        .run()
                }

                if (!success) {
                    return { error: '更新列内容失败' }
                }

                return {
                    success: true,
                    columnsIndex,
                    columnIndex,
                    mode,
                    message: `已${mode === 'replace' ? '替换' : mode === 'append' ? '追加' : '插入'}第 ${columnsIndex + 1} 个分栏的第 ${columnIndex + 1} 列内容`
                }
            } catch (error) {
                return { error: `更新列内容失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    setColumnsLayout: {
        description: '设置分栏的布局类型，改变各列宽度比例（清除已有的自定义宽度）',
        inputSchema: z.object({
            columnsIndex: z.number().describe("分栏索引（从0开始）"),
            layout: z.enum(['none', 'left', 'right', 'center'])
                .describe("布局类型: 'none'等宽, 'left'左宽右窄, 'right'左窄右宽, 'center'中间宽")
        }),
        execute: async ({ columnsIndex, layout }: {
            columnsIndex: number
            layout: 'none' | 'left' | 'right' | 'center'
        }) => {
            try {
                const allColumns = findColumnsInDocument(editor)

                if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                    return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                }

                const target = allColumns[columnsIndex]

                // Use setColumnsType command: propagates type to all child columns and clears custom width.
                const success = editor.chain()
                    .focus()
                    .setTextSelection(target.pos + 2)
                    .setColumnsType(layout)
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '设置布局失败' }
                }

                return {
                    success: true,
                    columnsIndex,
                    previousLayout: target.layout,
                    newLayout: layout,
                    message: `已将分栏布局从 ${target.layout} 改为 ${layout}`
                }
            } catch (error) {
                return { error: `设置布局失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    setColumnWidths: {
        description: '批量设置某个分栏中所有列的宽度（百分比）。数组长度必须等于列数，会被自动归一化到总和 100（每列最少 5%）',
        inputSchema: z.object({
            columnsIndex: z.number().describe("分栏索引（从0开始）"),
            widths: z.array(z.number()).min(2).max(8)
                .describe("宽度百分比数组；长度必须与列数一致")
        }),
        execute: async ({ columnsIndex, widths }: { columnsIndex: number; widths: number[] }) => {
            try {
                const allColumns = findColumnsInDocument(editor)
                if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                    return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                }
                const target = allColumns[columnsIndex]

                if (widths.length !== target.columnsCount) {
                    return { error: `widths 数组长度 ${widths.length} 与列数 ${target.columnsCount} 不匹配` }
                }

                const normalized = normalizeColumnWidths(widths, target.columnsCount)
                if (normalized.length !== target.columnsCount) {
                    return { error: '宽度归一化失败' }
                }

                const tr = editor.state.tr
                let offset = target.pos + 1
                target.node.forEach((col) => {
                    const attrs = { ...col.attrs, width: normalized[col.attrs.index] }
                    tr.setNodeMarkup(offset, undefined, attrs)
                    offset += col.nodeSize
                })
                editor.view.dispatch(tr)

                return {
                    success: true,
                    columnsIndex,
                    widths: normalized,
                    message: `已设置分栏 ${columnsIndex} 的列宽为 [${normalized.map(w => w.toFixed(1)).join(', ')}]`
                }
            } catch (error) {
                return { error: `设置列宽失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    setColumnStyle: {
        description: '设置分栏中某一列的样式：背景色、内边距、垂直对齐。任一参数为空表示不修改',
        inputSchema: z.object({
            columnsIndex: z.number().describe("分栏索引（从0开始）"),
            columnIndex: z.number().describe("列索引（从0开始）"),
            background: z.string().nullable().optional()
                .describe("背景色 CSS，传 null 清除。仅接受安全子集（hex/rgb/hsl/var/named color）"),
            padding: z.enum(['none', 'sm', 'md', 'lg']).optional().describe("列内边距"),
            verticalAlign: z.enum(['top', 'center', 'bottom']).optional().describe("列内容垂直对齐")
        }),
        execute: async ({ columnsIndex, columnIndex, background, padding, verticalAlign }: {
            columnsIndex: number
            columnIndex: number
            background?: string | null
            padding?: 'none' | 'sm' | 'md' | 'lg'
            verticalAlign?: 'top' | 'center' | 'bottom'
        }) => {
            try {
                const allColumns = findColumnsInDocument(editor)
                if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                    return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                }
                const target = allColumns[columnsIndex]
                if (columnIndex < 0 || columnIndex >= target.columnsCount) {
                    return { error: `列索引 ${columnIndex} 超出范围，该分栏共 ${target.columnsCount} 列` }
                }

                let columnPos = target.pos + 1
                for (let i = 0; i < columnIndex; i++) {
                    columnPos += target.node.child(i).nodeSize
                }
                const column = target.node.child(columnIndex)

                const nextAttrs: Record<string, any> = { ...column.attrs }
                if (background === null) {
                    nextAttrs.background = null
                } else if (typeof background === 'string') {
                    const safe = safeBackground(background)
                    if (!safe) return { error: `background 值不在允许的 CSS 颜色子集内: ${background}` }
                    nextAttrs.background = safe
                }
                if (padding !== undefined) nextAttrs.padding = padding
                if (verticalAlign !== undefined) nextAttrs.verticalAlign = verticalAlign

                const tr = editor.state.tr.setNodeMarkup(columnPos, undefined, nextAttrs)
                editor.view.dispatch(tr)

                return {
                    success: true,
                    columnsIndex,
                    columnIndex,
                    applied: {
                        background: nextAttrs.background,
                        padding: nextAttrs.padding,
                        verticalAlign: nextAttrs.verticalAlign
                    },
                    message: `已更新第 ${columnsIndex + 1} 个分栏的第 ${columnIndex + 1} 列样式`
                }
            } catch (error) {
                return { error: `设置列样式失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    setColumnsGap: {
        description: '设置分栏的列间距 (px)。传 null 恢复默认 12px',
        inputSchema: z.object({
            columnsIndex: z.number().describe("分栏索引（从0开始）"),
            gap: z.number().min(0).max(128).nullable().describe("列间距 (px)，0-128，或 null 恢复默认")
        }),
        execute: async ({ columnsIndex, gap }: { columnsIndex: number; gap: number | null }) => {
            try {
                const allColumns = findColumnsInDocument(editor)
                if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                    return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                }
                const target = allColumns[columnsIndex]

                const nextAttrs = { ...target.node.attrs, gap: gap === null ? null : Math.max(0, Math.min(128, gap)) }
                const tr = editor.state.tr.setNodeMarkup(target.pos, undefined, nextAttrs)
                editor.view.dispatch(tr)

                return {
                    success: true,
                    columnsIndex,
                    gap: nextAttrs.gap,
                    message: gap === null ? `已重置分栏 ${columnsIndex} 的间距` : `已设置分栏 ${columnsIndex} 的间距为 ${nextAttrs.gap}px`
                }
            } catch (error) {
                return { error: `设置间距失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    addColumnToLayout: {
        description: '向现有分栏布局添加新列',
        inputSchema: z.object({
            columnsIndex: z.number().describe("分栏索引（从0开始）"),
            position: z.enum(['before', 'after']).optional()
                .describe("添加位置: 'before'在当前列前, 'after'在当前列后。默认'after'")
        }),
        execute: async ({ columnsIndex, position = 'after' }: {
            columnsIndex: number
            position?: 'before' | 'after'
        }) => {
            try {
                const allColumns = findColumnsInDocument(editor)

                if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                    return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                }

                const target = allColumns[columnsIndex]

                if (target.columnsCount >= 8) {
                    return { error: '分栏已达最大列数（8列）' }
                }

                // Focus into the columns first
                const focusPos = target.pos + 2
                editor.chain().focus().setTextSelection(focusPos).scrollIntoView().run()

                const success = position === 'before'
                    ? editor.commands.addColBefore()
                    : editor.commands.addColAfter()

                if (!success) {
                    return { error: '添加列失败' }
                }

                return {
                    success: true,
                    columnsIndex,
                    previousColumnsCount: target.columnsCount,
                    newColumnsCount: target.columnsCount + 1,
                    position,
                    message: `已在分栏${position === 'before' ? '前' : '后'}添加新列`
                }
            } catch (error) {
                return { error: `添加列失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    deleteColumn: {
        description: '删除分栏中的指定列',
        inputSchema: z.object({
            columnsIndex: z.number().describe("分栏索引（从0开始）"),
            columnIndex: z.number().describe("要删除的列索引（从0开始）")
        }),
        execute: async ({ columnsIndex, columnIndex }: {
            columnsIndex: number
            columnIndex: number
        }) => {
            try {
                const allColumns = findColumnsInDocument(editor)

                if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                    return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                }

                const target = allColumns[columnsIndex]

                if (target.columnsCount <= 2) {
                    return { error: '分栏至少需要保留2列，无法继续删除' }
                }

                if (columnIndex < 0 || columnIndex >= target.columnsCount) {
                    return { error: `列索引 ${columnIndex} 超出范围，该分栏共 ${target.columnsCount} 列` }
                }

                // Calculate position of the target column and focus there
                let columnPos = target.pos + 1
                for (let i = 0; i < columnIndex; i++) {
                    columnPos += target.node.child(i).nodeSize
                }

                editor.chain().focus().setTextSelection(columnPos + 1).scrollIntoView().run()

                const success = editor.commands.deleteCol()

                if (!success) {
                    return { error: '删除列失败' }
                }

                return {
                    success: true,
                    columnsIndex,
                    deletedColumnIndex: columnIndex,
                    previousColumnsCount: target.columnsCount,
                    newColumnsCount: target.columnsCount - 1,
                    message: `已删除第 ${columnsIndex + 1} 个分栏的第 ${columnIndex + 1} 列`
                }
            } catch (error) {
                return { error: `删除列失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    deleteColumnsLayout: {
        description: '删除整个分栏布局',
        inputSchema: z.object({
            columnsIndex: z.number().describe("要删除的分栏索引（从0开始）")
        }),
        execute: async ({ columnsIndex }: { columnsIndex: number }) => {
            try {
                const allColumns = findColumnsInDocument(editor)

                if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                    return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                }

                const target = allColumns[columnsIndex]

                scrollToPosition(editor, target.pos)

                const success = editor.chain()
                    .focus()
                    .deleteRange({
                        from: target.pos,
                        to: target.pos + target.node.nodeSize
                    })
                    .scrollIntoView()
                    .run()

                if (!success) {
                    return { error: '删除分栏失败' }
                }

                return {
                    success: true,
                    deletedColumnsIndex: columnsIndex,
                    deletedColumnsCount: target.columnsCount,
                    message: `已删除第 ${columnsIndex + 1} 个分栏布局`
                }
            } catch (error) {
                return { error: `删除分栏失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    insertNestedColumns: {
        description: '在已有分栏的指定列内插入嵌套分栏布局，实现更复杂的布局。支持 widths / gap / styles',
        inputSchema: z.object({
            columnsIndex: z.number().describe("父分栏索引（从0开始）"),
            columnIndex: z.number().describe("在哪一列内插入（从0开始）"),
            cols: z.number().min(2).max(4).optional()
                .describe("子分栏列数（2-4，默认2）"),
            layout: z.enum(['none', 'left', 'right', 'center']).optional()
                .describe("子分栏布局类型"),
            widths: z.array(z.number()).optional().describe("嵌套子分栏每列宽度百分比"),
            gap: z.number().min(0).max(128).optional().describe("嵌套子分栏列间距 (px)"),
            styles: z.array(columnStyleSchema).optional().describe("嵌套子分栏每列样式"),
            position: z.enum(['start', 'end']).optional()
                .describe("插入到列的开头还是末尾（默认end）")
        }),
        execute: async ({
            columnsIndex,
            columnIndex,
            cols = 2,
            layout = 'none',
            widths,
            gap,
            styles,
            position = 'end'
        }: {
            columnsIndex: number
            columnIndex: number
            cols?: number
            layout?: 'none' | 'left' | 'right' | 'center'
            widths?: number[]
            gap?: number
            styles?: Array<{
                background?: string
                padding?: 'none' | 'sm' | 'md' | 'lg'
                verticalAlign?: 'top' | 'center' | 'bottom'
            }>
            position?: 'start' | 'end'
        }) => {
            try {
                const allColumns = findColumnsInDocument(editor)

                if (columnsIndex < 0 || columnsIndex >= allColumns.length) {
                    return { error: `分栏索引 ${columnsIndex} 超出范围，共 ${allColumns.length} 个分栏` }
                }

                const target = allColumns[columnsIndex]

                if (target.depth >= 1) {
                    return { error: '嵌套分栏最多支持 1 层，无法在嵌套分栏内继续嵌套' }
                }

                if (columnIndex < 0 || columnIndex >= target.columnsCount) {
                    return { error: `列索引 ${columnIndex} 超出范围，该分栏共 ${target.columnsCount} 列` }
                }

                const colCount = Math.min(Math.max(2, cols), 4)
                const normalized = widths ? normalizeColumnWidths(widths, colCount) : []

                // Calculate position of the target column
                let columnPos = target.pos + 1
                for (let i = 0; i < columnIndex; i++) {
                    columnPos += target.node.child(i).nodeSize
                }

                const targetColumn = target.node.child(columnIndex)
                const contentStart = columnPos + 1
                const contentEnd = columnPos + targetColumn.nodeSize - 1

                const columnNodes = Array.from({ length: colCount }, (_, i) => {
                    const style = styles?.[i]
                    return editor.schema.nodes['column'].createAndFill({
                        index: i,
                        type: layout,
                        cols: colCount,
                        width: normalized.length === colCount ? normalized[i] : null,
                        background: safeBackground(style?.background),
                        padding: style?.padding ?? 'none',
                        verticalAlign: style?.verticalAlign ?? 'top'
                    })!
                })
                const columnsAttrs: Record<string, any> = { cols: colCount, type: layout }
                if (typeof gap === 'number') columnsAttrs.gap = Math.max(0, Math.min(128, gap))

                const nestedColumnsNode = editor.schema.nodes['columns'].createChecked(columnsAttrs, columnNodes)

                if (!nestedColumnsNode) {
                    return { error: '创建嵌套分栏节点失败' }
                }

                const insertPos = position === 'start' ? contentStart : contentEnd
                const success = editor.commands.insertContentAt(insertPos, nestedColumnsNode)

                if (!success) {
                    return { error: '插入嵌套分栏失败' }
                }

                scrollToPosition(editor, insertPos)

                const updatedColumns = findColumnsInDocument(editor)
                const nestedEntry = updatedColumns.find(c =>
                    c.depth === target.depth + 1 &&
                    c.parentPath.length >= 2 &&
                    c.parentPath[c.parentPath.length - 2] === columnsIndex &&
                    c.parentPath[c.parentPath.length - 1] === columnIndex
                )

                return {
                    success: true,
                    parentColumnsIndex: columnsIndex,
                    parentColumnIndex: columnIndex,
                    nestedColumnsIndex: nestedEntry?.index,
                    nestedColumnsCount: colCount,
                    layout,
                    position,
                    widths: normalized.length === colCount ? normalized : undefined,
                    gap: columnsAttrs.gap,
                    message: `已在第 ${columnsIndex + 1} 个分栏的第 ${columnIndex + 1} 列${position === 'start' ? '开头' : '末尾'}插入 ${colCount} 列嵌套布局`
                }
            } catch (error) {
                return { error: `插入嵌套分栏失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    buildLayout: {
        description: '一次性构建完整的多行多列页面布局，用于复刻网站骨架 (hero / features / footer 等)。传入 rows 层级 JSON 描述整个布局；同一行中的 widths 会被自动归一化到 100，最多支持 1 层嵌套。这是布局构建的首选工具',
        inputSchema: z.object({
            position: z.number().optional().describe("插入位置的文档坐标；不指定则插入到当前光标"),
            replaceSelection: z.boolean().optional().describe("为 true 时替换当前选区"),
            rows: z.array(layoutRowSchema).min(1).max(20)
                .describe("布局行数组；每行是一个 columns 节点。示例：[{cols:[{content:'# Hero'},{content:'描述'}]}, {gap:24, cols:[{content:'A'},{content:'B'},{content:'C'}]}]")
        }),
        execute: async ({ position, replaceSelection, rows }: {
            position?: number
            replaceSelection?: boolean
            rows: any[]
        }) => {
            try {
                if (!Array.isArray(rows) || rows.length === 0) {
                    return { error: 'rows 不能为空' }
                }

                // Build all row nodes up front so we can reject early on validation failure.
                const rowNodes: PmNode[] = []
                for (let i = 0; i < rows.length; i++) {
                    const spec = rowToSpec(rows[i], false)
                    if (!spec.cols || spec.cols.length < 2 || spec.cols.length > 8) {
                        return { error: `第 ${i} 行列数无效（需 2-8）` }
                    }
                    const node = buildColumnsRow(editor.schema, spec, 0)
                    if (!node) {
                        return { error: `第 ${i} 行构建失败（可能是嵌套过深或内容非法）` }
                    }
                    rowNodes.push(node)
                }

                const before = findColumnsInDocument(editor).length

                // Insert all rows as a fragment in a single transaction.
                const insertJSON = rowNodes.map(n => n.toJSON())
                let success: boolean
                if (typeof position === 'number') {
                    success = editor.chain().focus().insertContentAt(position, insertJSON).scrollIntoView().run()
                } else if (replaceSelection) {
                    success = editor.chain().focus().insertContent(insertJSON).scrollIntoView().run()
                } else {
                    success = editor.chain().focus().insertContent(insertJSON).scrollIntoView().run()
                }

                if (!success) {
                    return { error: '插入布局失败' }
                }

                const after = findColumnsInDocument(editor)
                // The newly-created top-level columnsIndexes are the depth-0 entries appended at the end.
                const newTopLevel: number[] = []
                let seen = 0
                for (let i = after.length - 1; i >= 0 && newTopLevel.length < rowNodes.length; i--) {
                    if (after[i].depth === 0) {
                        newTopLevel.unshift(after[i].index)
                        seen++
                        if (seen >= rowNodes.length) break
                    }
                }

                if (newTopLevel[0] !== undefined) {
                    const firstNew = after.find(c => c.index === newTopLevel[0])
                    if (firstNew) scrollToPosition(editor, firstNew.pos)
                }

                return {
                    success: true,
                    rowsCreated: rowNodes.length,
                    columnsIndices: newTopLevel,
                    totalColumnsBlocksBefore: before,
                    totalColumnsBlocksAfter: after.length,
                    message: `已构建 ${rowNodes.length} 行布局`
                }
            } catch (error) {
                return { error: `构建布局失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
