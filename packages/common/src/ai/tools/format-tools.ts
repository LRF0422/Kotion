import type { Editor } from "@kn/editor"
import { z } from "zod"
import type { ToolsRecord } from "../types"
import { discoverBlocks } from "../utils/block-utils"
import { findTextPosition, findTablesInDocument, findTableCellPosition } from "../utils/block-utils"
import { scrollToPosition } from "../utils/editor-effects"

/**
 * Create format and table tools for AI agent
 */
export const createFormatTools = (editor: Editor): ToolsRecord => ({
    formatText: {
        description: '为文档中已有的文本应用内联格式（加粗、斜体、下划线、删除线、代码）',
        inputSchema: z.object({
            searchText: z.string().describe("要格式化的文本内容"),
            format: z.enum(['bold', 'italic', 'underline', 'strike', 'code'])
                .describe("要应用的格式: bold/italic/underline/strike/code"),
            occurrence: z.number().optional()
                .describe("第几次出现的匹配项（从1开始，默认1）")
        }),
        execute: async ({ searchText, format, occurrence = 1 }: {
            searchText: string
            format: 'bold' | 'italic' | 'underline' | 'strike' | 'code'
            occurrence?: number
        }) => {
            try {
                const pos = findTextPosition(editor, searchText, occurrence)
                if (!pos) {
                    return { error: `未找到文本: "${searchText}"` }
                }

                // Select the text range and scroll to it
                editor.chain().focus().setTextSelection({ from: pos.from, to: pos.to }).scrollIntoView().run()

                // Apply format
                let success = false
                switch (format) {
                    case 'bold':
                        success = editor.commands.toggleBold()
                        break
                    case 'italic':
                        success = editor.commands.toggleItalic()
                        break
                    case 'underline':
                        success = editor.commands.toggleUnderline()
                        break
                    case 'strike':
                        success = editor.commands.toggleStrike()
                        break
                    case 'code':
                        success = editor.commands.toggleCode()
                        break
                }

                if (!success) {
                    return { error: `应用格式 ${format} 失败` }
                }

                return {
                    success: true,
                    format,
                    text: pos.text,
                    from: pos.from,
                    to: pos.to,
                    message: `已为文本 "${pos.text}" 应用 ${format} 格式`
                }
            } catch (error) {
                return { error: `格式化失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    insertTable: {
        description: '插入一个新表格',
        inputSchema: z.object({
            rows: z.number().min(1).max(20).optional()
                .describe("行数（默认3，最大20）"),
            cols: z.number().min(1).max(10).optional()
                .describe("列数（默认3，最大10）"),
            withHeaderRow: z.boolean().optional()
                .describe("是否包含表头行（默认true）"),
            blockIndex: z.number().optional()
                .describe("在指定块索引后插入表格")
        }),
        execute: async ({ rows = 3, cols = 3, withHeaderRow = true, blockIndex }: {
            rows?: number
            cols?: number
            withHeaderRow?: boolean
            blockIndex?: number
        }) => {
            try {
                // If blockIndex specified, position cursor there first
                if (blockIndex !== undefined) {
                    const blocks = discoverBlocks(editor)
                    if (blockIndex < 0 || blockIndex >= blocks.length) {
                        return { error: `块索引越界。有效范围: 0-${blocks.length - 1}，请求: ${blockIndex}` }
                    }
                    const block = blocks[blockIndex]
                    // Position at end of the target block and scroll to it
                    editor.chain().focus().setTextSelection(block.contentEnd).scrollIntoView().run()
                }

                const success = editor.commands.insertTable({
                    rows,
                    cols,
                    withHeaderRow
                })

                if (!success) {
                    return { error: '插入表格失败' }
                }

                return {
                    success: true,
                    rows,
                    cols,
                    withHeaderRow,
                    message: `已插入 ${rows}×${cols} 表格${withHeaderRow ? '（含表头）' : ''}`
                }
            } catch (error) {
                return { error: `插入表格失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    getTableInfo: {
        description: '获取文档中表格的结构信息和单元格内容',
        inputSchema: z.object({
            tableIndex: z.number().optional()
                .describe("指定获取哪个表格的详细信息（从0开始），不填则返回所有表格概览")
        }),
        execute: async ({ tableIndex }: { tableIndex?: number }) => {
            try {
                const tables = findTablesInDocument(editor)

                if (tables.length === 0) {
                    return {
                        success: true,
                        hasTables: false,
                        totalTables: 0,
                        message: '文档中没有表格'
                    }
                }

                if (tableIndex !== undefined) {
                    if (tableIndex < 0 || tableIndex >= tables.length) {
                        return { error: `表格索引 ${tableIndex} 超出范围，共 ${tables.length} 个表格` }
                    }

                    const table = tables[tableIndex]
                    const cellData: Array<{ row: number; col: number; text: string; isHeader: boolean }> = []

                    let rowIdx = 0
                    table.node.forEach((row) => {
                        let colIdx = 0
                        row.forEach((cell) => {
                            cellData.push({
                                row: rowIdx,
                                col: colIdx,
                                text: cell.textContent,
                                isHeader: cell.type.name === 'tableHeader'
                            })
                            colIdx++
                        })
                        rowIdx++
                    })

                    return {
                        success: true,
                        tableIndex,
                        pos: table.pos,
                        rows: table.rows,
                        cols: table.cols,
                        cells: cellData
                    }
                }

                // Return overview of all tables
                return {
                    success: true,
                    hasTables: true,
                    totalTables: tables.length,
                    tables: tables.map(t => ({
                        index: t.index,
                        pos: t.pos,
                        rows: t.rows,
                        cols: t.cols
                    }))
                }
            } catch (error) {
                return { error: `获取表格信息失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    editTable: {
        description: '表格结构操作：添加/删除行列、合并/拆分单元格',
        inputSchema: z.object({
            action: z.enum([
                'addRowBefore', 'addRowAfter',
                'addColumnBefore', 'addColumnAfter',
                'deleteRow', 'deleteColumn',
                'mergeCells', 'splitCell'
            ]).describe("操作类型"),
            tableIndex: z.number().optional()
                .describe("表格索引（从0开始，默认0）"),
            rowIndex: z.number().optional()
                .describe("行索引（从0开始）"),
            colIndex: z.number().optional()
                .describe("列索引（从0开始）")
        }),
        execute: async ({ action, tableIndex = 0, rowIndex = 0, colIndex = 0 }: {
            action: 'addRowBefore' | 'addRowAfter' | 'addColumnBefore' | 'addColumnAfter' | 'deleteRow' | 'deleteColumn' | 'mergeCells' | 'splitCell'
            tableIndex?: number
            rowIndex?: number
            colIndex?: number
        }) => {
            try {
                const tables = findTablesInDocument(editor)

                if (tables.length === 0) {
                    return { error: '文档中没有表格' }
                }

                if (tableIndex < 0 || tableIndex >= tables.length) {
                    return { error: `表格索引 ${tableIndex} 超出范围，共 ${tables.length} 个表格` }
                }

                const table = tables[tableIndex]

                if (rowIndex < 0 || rowIndex >= table.rows) {
                    return { error: `行索引 ${rowIndex} 超出范围，该表格共 ${table.rows} 行` }
                }

                if (colIndex < 0 || colIndex >= table.cols) {
                    return { error: `列索引 ${colIndex} 超出范围，该表格共 ${table.cols} 列` }
                }

                // Position cursor in the target cell
                const cellPos = findTableCellPosition(table.node, table.pos, rowIndex, colIndex)
                if (!cellPos) {
                    return { error: '无法定位目标单元格' }
                }

                // Set cursor inside the cell (+1 to enter cell content) and scroll to it
                editor.chain().focus().setTextSelection(cellPos.pos + 1).scrollIntoView().run()

                let success = false
                switch (action) {
                    case 'addRowBefore':
                        success = editor.commands.addRowBefore()
                        break
                    case 'addRowAfter':
                        success = editor.commands.addRowAfter()
                        break
                    case 'addColumnBefore':
                        success = editor.commands.addColumnBefore()
                        break
                    case 'addColumnAfter':
                        success = editor.commands.addColumnAfter()
                        break
                    case 'deleteRow':
                        success = editor.commands.deleteRow()
                        break
                    case 'deleteColumn':
                        success = editor.commands.deleteColumn()
                        break
                    case 'mergeCells':
                        success = editor.commands.mergeCells()
                        break
                    case 'splitCell':
                        success = editor.commands.splitCell()
                        break
                }

                if (!success) {
                    return { error: `表格操作 ${action} 失败` }
                }

                const actionNames: Record<string, string> = {
                    addRowBefore: '在上方添加行',
                    addRowAfter: '在下方添加行',
                    addColumnBefore: '在左侧添加列',
                    addColumnAfter: '在右侧添加列',
                    deleteRow: '删除行',
                    deleteColumn: '删除列',
                    mergeCells: '合并单元格',
                    splitCell: '拆分单元格'
                }

                return {
                    success: true,
                    action,
                    tableIndex,
                    rowIndex,
                    colIndex,
                    message: `已执行: ${actionNames[action]}`
                }
            } catch (error) {
                return { error: `表格操作失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    editTableCell: {
        description: '编辑表格中指定单元格的内容',
        inputSchema: z.object({
            tableIndex: z.number().describe("表格索引（从0开始）"),
            rowIndex: z.number().describe("行索引（从0开始）"),
            colIndex: z.number().describe("列索引（从0开始）"),
            content: z.string().describe("要设置的内容"),
            mode: z.enum(['replace', 'append', 'prepend']).optional()
                .describe("编辑模式: replace 替换, append 追加, prepend 前置（默认 replace）")
        }),
        execute: async ({ tableIndex, rowIndex, colIndex, content, mode = 'replace' }: {
            tableIndex: number
            rowIndex: number
            colIndex: number
            content: string
            mode?: 'replace' | 'append' | 'prepend'
        }) => {
            try {
                const tables = findTablesInDocument(editor)

                if (tables.length === 0) {
                    return { error: '文档中没有表格' }
                }

                if (tableIndex < 0 || tableIndex >= tables.length) {
                    return { error: `表格索引 ${tableIndex} 超出范围，共 ${tables.length} 个表格` }
                }

                const table = tables[tableIndex]

                if (rowIndex < 0 || rowIndex >= table.rows) {
                    return { error: `行索引 ${rowIndex} 超出范围，该表格共 ${table.rows} 行` }
                }

                if (colIndex < 0 || colIndex >= table.cols) {
                    return { error: `列索引 ${colIndex} 超出范围，该表格共 ${table.cols} 列` }
                }

                const cellPos = findTableCellPosition(table.node, table.pos, rowIndex, colIndex)
                if (!cellPos) {
                    return { error: '无法定位目标单元格' }
                }

                const cell = cellPos.node
                const cellContentStart = cellPos.pos + 1 // +1 to enter cell
                // The cell contains paragraphs, find the inner content boundary
                const firstChild = cell.firstChild
                if (!firstChild) {
                    return { error: '单元格结构异常' }
                }

                const innerStart = cellContentStart + 1 // +1 for paragraph opening
                const innerEnd = innerStart + firstChild.content.size

                let success = false
                switch (mode) {
                    case 'replace':
                        success = editor.chain()
                            .focus()
                            .setTextSelection({ from: innerStart, to: innerEnd })
                            .insertContent(content)
                            .scrollIntoView()
                            .run()
                        break
                    case 'append':
                        success = editor.chain()
                            .focus()
                            .setTextSelection(innerEnd)
                            .insertContent(content)
                            .scrollIntoView()
                            .run()
                        break
                    case 'prepend':
                        success = editor.chain()
                            .focus()
                            .setTextSelection(innerStart)
                            .insertContent(content)
                            .scrollIntoView()
                            .run()
                        break
                }

                if (!success) {
                    return { error: '编辑单元格失败' }
                }

                return {
                    success: true,
                    tableIndex,
                    rowIndex,
                    colIndex,
                    mode,
                    content,
                    message: `已${mode === 'replace' ? '替换' : mode === 'append' ? '追加' : '前置'}单元格 [${rowIndex}, ${colIndex}] 的内容`
                }
            } catch (error) {
                return { error: `编辑单元格失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
