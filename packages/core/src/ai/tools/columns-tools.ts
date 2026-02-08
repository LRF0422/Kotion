import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "../types"
import { Node as PmNode } from "@kn/editor"
import { parseMarkdownToNodes } from "../utils/markdown-parser"
import { scrollToPosition } from "../utils/editor-effects"

/**
 * Columns info with nesting support
 */
interface ColumnsInfo {
    pos: number
    node: PmNode
    index: number          // 全局扁平索引（保持向后兼容）
    columnsCount: number
    layout: string
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
 * Helper: Get column content as text, with optional nested columns annotation
 */
const getColumnContent = (column: PmNode, nestedColumnsMap?: Map<number, number>): {
    text: string
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

    return { text: fullText.trim(), blocks }
}

/**
 * Create columns manipulation tools for AI agent
 */
export const createColumnsTools = (editor: Editor): ToolsRecord => ({
    insertColumns: {
        description: '插入分栏布局。用于创建多列内容布局，可指定列数和插入位置',
        inputSchema: z.object({
            cols: z.number().min(2).max(6).optional()
                .describe("列数，2-6列，默认2列"),
            layout: z.enum(['none', 'left', 'right', 'center']).optional()
                .describe("布局类型: 'none'等宽, 'left'左侧宽, 'right'右侧宽, 'center'中间宽"),
            position: z.number().optional()
                .describe("插入位置的文档坐标，不指定则插入到当前光标位置")
        }),
        execute: async ({ cols = 2, layout = 'none', position }: {
            cols?: number
            layout?: 'none' | 'left' | 'right' | 'center'
            position?: number
        }) => {
            try {
                const colCount = Math.min(Math.max(2, cols), 6)

                let success: boolean
                if (position !== undefined) {
                    // Insert at specific position using the createColumns utility function
                    const columnsNode = editor.schema.nodes['columns'].createChecked(
                        { cols: colCount, type: layout },
                        Array.from({ length: colCount }, (_, i) =>
                            editor.schema.nodes['column'].createAndFill({ index: i, type: layout, cols: colCount })!
                        )
                    )

                    if (columnsNode) {
                        success = editor.commands.insertContentAt(position, columnsNode)
                    } else {
                        return { error: '创建分栏节点失败' }
                    }
                } else {
                    // Insert at current cursor position
                    success = editor.chain()
                        .focus()
                        .insertColumns({ cols: colCount })
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
                    message: `已创建 ${colCount} 列布局`
                }
            } catch (error) {
                return { error: `插入分栏失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    getColumnsInfo: {
        description: '获取文档中所有分栏布局的信息，包括位置、列数、各列内容',
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

                    // Build a map of nested columns within this target's columns
                    // For each column child, track which block offsets are nested columns
                    const columnsData: Array<{ index: number; content: ReturnType<typeof getColumnContent> }> = []

                    target.node.forEach((column, _, colIdx) => {
                        // Build nestedColumnsMap: blockOffset -> globalColumnsIndex
                        const nestedColumnsMap = new Map<number, number>()
                        let blockOffset = 0
                        column.forEach((child) => {
                            if (child.type.name === 'columns') {
                                // Find the matching entry in allColumns
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
        description: '设置分栏的布局类型，改变各列宽度比例',
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

                const success = editor.chain()
                    .focus()
                    .setNodeSelection(target.pos)
                    .updateAttributes('columns', { type: layout })
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

                if (target.columnsCount >= 6) {
                    return { error: '分栏已达最大列数（6列）' }
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

                // Scroll to show the columns before deleting
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
        description: '在已有分栏的指定列内插入嵌套分栏布局，实现更复杂的布局',
        inputSchema: z.object({
            columnsIndex: z.number().describe("父分栏索引（从0开始）"),
            columnIndex: z.number().describe("在哪一列内插入（从0开始）"),
            cols: z.number().min(2).max(4).optional()
                .describe("子分栏列数（2-4，默认2）"),
            layout: z.enum(['none', 'left', 'right', 'center']).optional()
                .describe("子分栏布局类型"),
            position: z.enum(['start', 'end']).optional()
                .describe("插入到列的开头还是末尾（默认end）")
        }),
        execute: async ({
            columnsIndex,
            columnIndex,
            cols = 2,
            layout = 'none',
            position = 'end'
        }: {
            columnsIndex: number
            columnIndex: number
            cols?: number
            layout?: 'none' | 'left' | 'right' | 'center'
            position?: 'start' | 'end'
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

                const colCount = Math.min(Math.max(2, cols), 4)

                // Calculate position of the target column
                let columnPos = target.pos + 1
                for (let i = 0; i < columnIndex; i++) {
                    columnPos += target.node.child(i).nodeSize
                }

                const targetColumn = target.node.child(columnIndex)
                const contentStart = columnPos + 1
                const contentEnd = columnPos + targetColumn.nodeSize - 1

                // Create nested columns node
                const nestedColumnsNode = editor.schema.nodes['columns'].createChecked(
                    { cols: colCount, type: layout },
                    Array.from({ length: colCount }, (_, i) =>
                        editor.schema.nodes['column'].createAndFill({ index: i, type: layout, cols: colCount })!
                    )
                )

                if (!nestedColumnsNode) {
                    return { error: '创建嵌套分栏节点失败' }
                }

                const insertPos = position === 'start' ? contentStart : contentEnd
                const success = editor.commands.insertContentAt(insertPos, nestedColumnsNode)

                if (!success) {
                    return { error: '插入嵌套分栏失败' }
                }

                scrollToPosition(editor, insertPos)

                // Re-discover to get updated indices
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
                    message: `已在第 ${columnsIndex + 1} 个分栏的第 ${columnIndex + 1} 列${position === 'start' ? '开头' : '末尾'}插入 ${colCount} 列嵌套布局`
                }
            } catch (error) {
                return { error: `插入嵌套分栏失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
