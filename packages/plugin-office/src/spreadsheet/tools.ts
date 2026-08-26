/**
 * Spreadsheet Plugin Tools for AI Agent Interaction
 *
 * These tools allow the AI agent to create, read, update, and manage
 * spreadsheet blocks powered by Univer.
 */

import { Editor } from '@kn/editor'
import { z } from '@kn/ui'

// ─── Helpers ────────────────────────────────────────────────

/** Column index (0-based) → letter label, e.g. 0→A, 25→Z, 26→AA */
function colToLabel(col: number): string {
    let label = ''
    let c = col
    while (c >= 0) {
        label = String.fromCharCode((c % 26) + 65) + label
        c = Math.floor(c / 26) - 1
    }
    return label
}

/** Letter label → column index (0-based), e.g. A→0, Z→25, AA→26 */
function labelToCol(label: string): number {
    let col = 0
    for (let i = 0; i < label.length; i++) {
        col = col * 26 + (label.charCodeAt(i) - 64)
    }
    return col - 1
}

/** Parse a cell reference like "A1" into { row, col } (0-based) */
function parseCellRef(ref: string): { row: number; col: number } | null {
    const match = ref.match(/^([A-Z]+)(\d+)$/i)
    if (!match) return null
    return { row: parseInt(match[2], 10) - 1, col: labelToCol(match[1].toUpperCase()) }
}

/** Format { row, col } (0-based) into "A1"-style reference */
function formatCellRef(row: number, col: number): string {
    return `${colToLabel(col)}${row + 1}`
}

interface SpreadsheetNodeInfo {
    pos: number
    workbookData: Record<string, any> | null
    height: number
}

/** Find all spreadsheet nodes in the document */
function findSpreadsheetNodes(editor: Editor): SpreadsheetNodeInfo[] {
    const nodes: SpreadsheetNodeInfo[] = []
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'spreadsheet') {
            nodes.push({
                pos,
                workbookData: node.attrs.workbookData,
                height: node.attrs.height,
            })
        }
    })
    return nodes
}

/** Find a spreadsheet node by its 0-based index (order of appearance) */
function findSpreadsheetByIndex(editor: Editor, index: number): SpreadsheetNodeInfo | null {
    const nodes = findSpreadsheetNodes(editor)
    return nodes[index] ?? null
}

// Univer cell value types
const CellValueType = { STRING: 1, NUMBER: 2, BOOLEAN: 3 } as const

/** Build a Univer cell object */
function buildCell(value: string | number | boolean): Record<string, any> {
    if (typeof value === 'number') return { v: value, t: CellValueType.NUMBER }
    if (typeof value === 'boolean') return { v: value, t: CellValueType.BOOLEAN }
    return { v: String(value), t: CellValueType.STRING }
}

// ─── Tools ──────────────────────────────────────────────────

/**
 * Tool: Insert a spreadsheet block into the document
 */
export const insertSpreadsheetTool = {
    name: 'insertSpreadsheet',
    description: '在文档中插入一个电子表格。可以插入空表格，也可以预填充数据（支持二维数组或带表头的对象数组）。',
    inputSchema: z.object({
        data: z
            .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
            .optional()
            .describe('二维数组数据。第一行可作为表头，例如 [["Name","Score"],["Alice",95]]'),
        height: z.number().optional().describe('表格块高度（像素），默认 560'),
        pos: z.number().optional().describe('插入位置，不填则在光标处插入'),
    }),
    execute: (editor: Editor) => async (params: {
        data?: (string | number | boolean)[][]
        height?: number
        pos?: number
    }) => {
        try {
            let workbookData: Record<string, any> | null = null

            if (params.data && params.data.length > 0) {
                const cellData: Record<number, Record<number, any>> = {}
                let maxCol = 0
                params.data.forEach((row, r) => {
                    cellData[r] = {}
                    row.forEach((val, c) => {
                        cellData[r][c] = buildCell(val)
                        if (c > maxCol) maxCol = c
                    })
                })

                const sheetId = 'sheet-0'
                workbookData = {
                    id: `workbook-${Date.now()}`,
                    sheetOrder: [sheetId],
                    sheets: {
                        [sheetId]: {
                            id: sheetId,
                            name: 'Sheet1',
                            rowCount: Math.max(params.data.length, 100),
                            columnCount: Math.max(maxCol + 1, 26),
                            cellData,
                            defaultColumnWidth: 88,
                            defaultRowHeight: 24,
                        },
                    },
                    appVersion: '1.0.0',
                }
            }

            const nodeContent: any = {
                type: 'spreadsheet',
                attrs: {
                    workbookData,
                    height: params.height ?? undefined,
                },
            }

            if (params.pos !== undefined) {
                const docSize = editor.state.doc.nodeSize
                if (params.pos < 0 || params.pos >= docSize) {
                    return { success: false, error: `Position ${params.pos} out of range (0-${docSize - 1})` }
                }
                editor.chain().focus().insertContentAt(params.pos, nodeContent).run()
            } else {
                editor.chain().focus().insertContent(nodeContent).run()
            }

            return {
                success: true,
                hasData: !!params.data,
                rows: params.data?.length ?? 0,
                message: params.data
                    ? `已插入包含 ${params.data.length} 行数据的电子表格`
                    : '已插入空白电子表格',
            }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '插入电子表格失败' }
        }
    },
}

/**
 * Tool: List all spreadsheet blocks in the document
 */
export const getSpreadsheetInfoTool = {
    name: 'getSpreadsheetInfo',
    description: '获取文档中所有电子表格块的概览信息，包括位置、工作表名、行列数量。',
    inputSchema: z.object({}),
    execute: (editor: Editor) => async () => {
        try {
            const nodes = findSpreadsheetNodes(editor)
            const info = nodes.map((n, index) => {
                const wb = n.workbookData
                const sheets =
                    wb?.sheets
                        ? Object.values(wb.sheets as Record<string, any>).map((s: any) => ({
                            name: s.name,
                            rowCount: s.rowCount,
                            columnCount: s.columnCount,
                        }))
                        : []
                return { index, pos: n.pos, height: n.height, sheetCount: sheets.length, sheets }
            })
            return { success: true, count: info.length, spreadsheets: info }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '获取电子表格信息失败' }
        }
    },
}

/**
 * Tool: Read cell data from a spreadsheet
 */
export const readSpreadsheetDataTool = {
    name: 'readSpreadsheetData',
    description: '读取文档中某个电子表格的单元格数据。可读取指定范围或整个工作表。返回二维数组。',
    inputSchema: z.object({
        index: z.number().describe('电子表格在文档中的序号（从 0 开始，可通过 getSpreadsheetInfo 获取）'),
        sheetName: z.string().optional().describe('工作表名称，默认第一个工作表'),
        range: z
            .string()
            .optional()
            .describe('读取范围，如 "A1:C10"。不填则读取所有已填充单元格'),
        maxRows: z.number().optional().describe('最大返回行数，默认 200，防止数据过大'),
    }),
    execute: (editor: Editor) => async (params: {
        index: number
        sheetName?: string
        range?: string
        maxRows?: number
    }) => {
        try {
            const node = findSpreadsheetByIndex(editor, params.index)
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }
            const wb = node.workbookData
            if (!wb?.sheets) return { success: false, error: '该电子表格暂无数据' }

            // Find sheet
            const sheetEntries = Object.values(wb.sheets as Record<string, any>)
            const sheet = params.sheetName
                ? sheetEntries.find((s: any) => s.name === params.sheetName)
                : sheetEntries[0]
            if (!sheet) return { success: false, error: `未找到工作表 "${params.sheetName}"` }

            const cellData: Record<number, Record<number, any>> = sheet.cellData || {}
            const maxRows = params.maxRows ?? 200

            let startRow = 0,
                endRow = (sheet.rowCount ?? 100) - 1,
                startCol = 0,
                endCol = (sheet.columnCount ?? 26) - 1

            if (params.range) {
                const parts = params.range.split(':')
                const from = parseCellRef(parts[0])
                const to = parts[1] ? parseCellRef(parts[1]) : from
                if (!from || !to) return { success: false, error: `无效的范围格式 "${params.range}"` }
                startRow = from.row
                endRow = to.row
                startCol = from.col
                endCol = to.col
            } else {
                // Auto-detect used range
                const usedRows = Object.keys(cellData).map(Number)
                if (usedRows.length === 0) return { success: true, data: [], sheetName: sheet.name, message: '工作表为空' }
                endRow = Math.min(Math.max(...usedRows), startRow + maxRows - 1)
                const usedCols = usedRows.flatMap((r) =>
                    cellData[r] ? Object.keys(cellData[r]).map(Number) : []
                )
                if (usedCols.length > 0) endCol = Math.max(...usedCols)
            }

            // Clamp rows
            if (endRow - startRow + 1 > maxRows) endRow = startRow + maxRows - 1

            const result: (string | number | boolean | null)[][] = []
            for (let r = startRow; r <= endRow; r++) {
                const row: (string | number | boolean | null)[] = []
                for (let c = startCol; c <= endCol; c++) {
                    const cell = cellData[r]?.[c]
                    row.push(cell?.v ?? null)
                }
                result.push(row)
            }

            return {
                success: true,
                sheetName: sheet.name,
                range: `${formatCellRef(startRow, startCol)}:${formatCellRef(endRow, endCol)}`,
                rows: result.length,
                columns: endCol - startCol + 1,
                data: result,
            }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '读取电子表格数据失败' }
        }
    },
}

/**
 * Tool: Write / update cells in a spreadsheet
 */
export const updateSpreadsheetDataTool = {
    name: 'updateSpreadsheetData',
    description: '向文档中的电子表格写入数据。支持从指定起始单元格写入二维数组数据。',
    inputSchema: z.object({
        index: z.number().describe('电子表格序号（从 0 开始）'),
        sheetName: z.string().optional().describe('目标工作表名称，默认第一个工作表'),
        startCell: z.string().optional().describe('起始单元格，如 "A1"（默认 A1）'),
        data: z
            .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
            .describe('要写入的二维数组数据，null 表示跳过该单元格'),
    }),
    execute: (editor: Editor) => async (params: {
        index: number
        sheetName?: string
        startCell?: string
        data: (string | number | boolean | null)[][]
    }) => {
        try {
            const nodes = findSpreadsheetNodes(editor)
            const node = nodes[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }

            // Deep clone workbook data
            const wb: Record<string, any> = node.workbookData
                ? JSON.parse(JSON.stringify(node.workbookData))
                : {
                    id: `workbook-${Date.now()}`,
                    sheetOrder: ['sheet-0'],
                    sheets: {
                        'sheet-0': {
                            id: 'sheet-0',
                            name: 'Sheet1',
                            rowCount: 100,
                            columnCount: 26,
                            cellData: {},
                            defaultColumnWidth: 88,
                            defaultRowHeight: 24,
                        },
                    },
                    appVersion: '1.0.0',
                }

            const sheetEntries = Object.values(wb.sheets as Record<string, any>)
            const sheet: any = params.sheetName
                ? sheetEntries.find((s: any) => s.name === params.sheetName)
                : sheetEntries[0]
            if (!sheet) return { success: false, error: `未找到工作表 "${params.sheetName}"` }

            const start = parseCellRef(params.startCell ?? 'A1')
            if (!start) return { success: false, error: `无效的起始单元格 "${params.startCell}"` }

            if (!sheet.cellData) sheet.cellData = {}

            let cellsWritten = 0
            params.data.forEach((row, ri) => {
                const r = start.row + ri
                row.forEach((val, ci) => {
                    if (val === null) return // skip
                    const c = start.col + ci
                    if (!sheet.cellData[r]) sheet.cellData[r] = {}
                    sheet.cellData[r][c] = buildCell(val)
                    cellsWritten++
                })
            })

            // Expand rowCount / columnCount if needed
            const maxRow = start.row + params.data.length
            const maxCol = start.col + Math.max(...params.data.map((r) => r.length), 0)
            if (maxRow > sheet.rowCount) sheet.rowCount = Math.max(maxRow, 100)
            if (maxCol > sheet.columnCount) sheet.columnCount = Math.max(maxCol, 26)

            // Update node attrs
            editor.view.dispatch(
                editor.view.state.tr.setNodeMarkup(node.pos, undefined, {
                    ...editor.state.doc.nodeAt(node.pos)!.attrs,
                    workbookData: wb,
                })
            )

            return {
                success: true,
                cellsWritten,
                range: `${params.startCell ?? 'A1'}:${formatCellRef(
                    start.row + params.data.length - 1,
                    start.col + Math.max(...params.data.map((r) => r.length)) - 1
                )}`,
                message: `已写入 ${cellsWritten} 个单元格`,
            }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '更新电子表格数据失败' }
        }
    },
}

/**
 * Tool: Delete a spreadsheet block from the document
 */
export const deleteSpreadsheetTool = {
    name: 'deleteSpreadsheet',
    description: '删除文档中指定序号的电子表格块。',
    inputSchema: z.object({
        index: z.number().describe('要删除的电子表格序号（从 0 开始）'),
    }),
    execute: (editor: Editor) => async (params: { index: number }) => {
        try {
            const nodes = findSpreadsheetNodes(editor)
            const node = nodes[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }

            const docNode = editor.state.doc.nodeAt(node.pos)
            if (!docNode) return { success: false, error: '无法定位电子表格节点' }

            editor.view.dispatch(
                editor.view.state.tr.delete(node.pos, node.pos + docNode.nodeSize)
            )

            return { success: true, message: `已删除第 ${params.index} 个电子表格` }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '删除电子表格失败' }
        }
    },
}

/**
 * Tool: Resize a spreadsheet block
 */
export const resizeSpreadsheetTool = {
    name: 'resizeSpreadsheet',
    description: '调整文档中电子表格块的显示高度。',
    inputSchema: z.object({
        index: z.number().describe('电子表格序号（从 0 开始）'),
        height: z.number().min(100).max(2000).describe('新高度（像素），范围 100-2000'),
    }),
    execute: (editor: Editor) => async (params: { index: number; height: number }) => {
        try {
            const nodes = findSpreadsheetNodes(editor)
            const node = nodes[params.index]
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }

            editor.view.dispatch(
                editor.view.state.tr.setNodeMarkup(node.pos, undefined, {
                    ...editor.state.doc.nodeAt(node.pos)!.attrs,
                    height: params.height,
                })
            )

            return { success: true, message: `已将电子表格高度调整为 ${params.height}px` }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '调整电子表格大小失败' }
        }
    },
}

/**
 * Tool: Export a spreadsheet block to a downloadable .xlsx file
 */
export const exportSpreadsheetTool = {
    name: 'exportSpreadsheet',
    description: '将文档中指定序号的电子表格导出为 .xlsx 文件并触发浏览器下载。保留值、公式、合并单元格与行列宽高。',
    inputSchema: z.object({
        index: z.number().describe('电子表格序号（从 0 开始）'),
        filename: z.string().optional().describe('下载文件名，默认 "spreadsheet.xlsx"'),
    }),
    execute: (editor: Editor) => async (params: { index: number; filename?: string }) => {
        try {
            const node = findSpreadsheetByIndex(editor, params.index)
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }
            if (!node.workbookData) return { success: false, error: '该电子表格暂无数据可导出' }

            const filename = params.filename?.trim() || 'spreadsheet.xlsx'
            const { downloadWorkbookAsExcel } = await import('./univer-to-excel')
            downloadWorkbookAsExcel(node.workbookData, filename)

            return { success: true, message: `已导出电子表格为 ${filename.endsWith('.xlsx') ? filename : filename + '.xlsx'}` }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : '导出电子表格失败' }
        }
    },
}

/**
 * All spreadsheet plugin tools
 */
export const spreadsheetTools = [
    insertSpreadsheetTool,
    getSpreadsheetInfoTool,
    readSpreadsheetDataTool,
    updateSpreadsheetDataTool,
    deleteSpreadsheetTool,
    resizeSpreadsheetTool,
    exportSpreadsheetTool,
]
