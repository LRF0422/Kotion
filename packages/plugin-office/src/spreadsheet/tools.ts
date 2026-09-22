/**
 * Spreadsheet Plugin Tools for AI Agent Interaction
 *
 * These tools let the AI create, read, update and manage spreadsheet blocks.
 *
 * Read/write ordering: when a block currently has a mounted node view, tools go
 * through the live grid (see ./workbook-registry) so they see and produce exactly
 * what the user sees. Otherwise they work on the snapshot persisted on the node.
 */

import type { Editor } from '@kn/editor'
import { z } from '@kn/ui'
import { DEFAULT_SPREADSHEET_HEIGHT } from './constants'
import { getLiveHandle } from './workbook-registry'
import { buildPivotSheet, pivotFieldLabels, upsertPivotSheet, type PivotLabels } from './pivot'
import { translate } from '../i18n'
import {
    createEmptyWorkbookData,
    createWorkbookFromRows,
    ensureValidWorkbookData,
    formatCellRef,
    parseCellRef,
    parseRangeSpec,
    type CellValue,
    type PivotAggregate,
    type PivotConfig,
    type PivotGroupField,
    type PivotSource,
    type SheetData,
    type WorkbookData,
} from './workbook-data'

/** Guard rails so a tool call cannot build an unbounded grid. */
const MAX_TOOL_ROWS = 5000
const MAX_TOOL_COLUMNS = 256
const MAX_READ_ROWS = 5000

interface SpreadsheetNodeInfo {
    pos: number
    workbookData: WorkbookData | null
    height: number
}

/** Find all spreadsheet nodes in the document. */
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

/** Find a spreadsheet node by its 0-based index (order of appearance). */
function findSpreadsheetByIndex(editor: Editor, index: number): SpreadsheetNodeInfo | null {
    return findSpreadsheetNodes(editor)[index] ?? null
}

/**
 * Prefer the live grid when the block is mounted (always current), else the
 * payload persisted on the node.
 */
function resolveWorkbook(editor: Editor, node: SpreadsheetNodeInfo): WorkbookData | null {
    const live = getLiveHandle(editor, node.pos)
    if (live) {
        const snapshot = live.getSnapshot()
        if (snapshot) return snapshot
    }
    return node.workbookData ? ensureValidWorkbookData(node.workbookData) : null
}

/** Pick a sheet by name (or index), defaulting to the first one. */
function pickSheet(workbook: WorkbookData | null, sheetName?: string): SheetData | null {
    if (!workbook || workbook.sheets.length === 0) return null
    if (!sheetName) return workbook.sheets[0]
    return workbook.sheets.find((sheet) => sheet.name === sheetName) ?? null
}

/** Sheet names in order, for tool output. */
function sheetNames(workbook: WorkbookData | null): string[] {
    return workbook?.sheets.map((sheet) => sheet.name) ?? []
}

/** Normalise a value into what the grid stores. */
function toCellValue(value: unknown): CellValue {
    if (value === null || value === undefined) return null
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    return String(value)
}

/** Read the minimal error message from an unknown throw. */
function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback
}

// ─── Tools ──────────────────────────────────────────────────

/**
 * Tool: Insert a spreadsheet block into the document
 */
export const insertSpreadsheetTool = {
    name: 'insertSpreadsheet',
    description: '在文档中插入一个电子表格。可以插入空表格，也可以预填充数据（二维数组，第一行通常作为表头）。',
    inputSchema: z.object({
        data: z
            .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
            .optional()
            .describe('二维数组数据。第一行可作为表头，例如 [["Name","Score"],["Alice",95]]'),
        height: z.number().optional().describe(`表格块高度（像素），默认 ${DEFAULT_SPREADSHEET_HEIGHT}`),
        pos: z.number().optional().describe('插入位置，不填则在光标处插入'),
    }),
    execute: (editor: Editor) => async (params: {
        data?: (string | number | boolean)[][]
        height?: number
        pos?: number
    }) => {
        try {
            const rows = Array.isArray(params.data) ? params.data.slice(0, MAX_TOOL_ROWS) : []
            const workbookData = rows.length > 0
                ? createWorkbookFromRows(rows.map((row) => row.map(toCellValue)))
                : createEmptyWorkbookData()

            const nodeContent: any = {
                type: 'spreadsheet',
                attrs: {
                    workbookData,
                    height: params.height ?? DEFAULT_SPREADSHEET_HEIGHT,
                },
            }

            let inserted = false
            if (params.pos !== undefined) {
                const docSize = editor.state.doc.nodeSize
                if (params.pos < 0 || params.pos >= docSize) {
                    return { success: false, error: `Position ${params.pos} out of range (0-${docSize - 1})` }
                }
                inserted = editor.chain().focus().insertContentAt(params.pos, nodeContent).run()
            } else {
                inserted = editor.chain().focus().insertContent(nodeContent).run()
            }

            if (!inserted) {
                return { success: false, error: '电子表格插入被编辑器拒绝（当前选区可能不允许在此处插入块）' }
            }

            return {
                success: true,
                hasData: rows.length > 0,
                rows: rows.length,
                message: rows.length > 0
                    ? `已插入包含 ${rows.length} 行数据的电子表格`
                    : '已插入空白电子表格',
            }
        } catch (error) {
            return { success: false, error: errorMessage(error, '插入电子表格失败') }
        }
    },
}

/**
 * Tool: List all spreadsheet blocks in the document
 */
export const getSpreadsheetInfoTool = {
    name: 'getSpreadsheetInfo',
    description: 'List spreadsheet blocks, worksheet names, used ranges, and existing pivot configurations. Read this before creating or updating a pivot table.',
    readOnly: true,
    inputSchema: z.object({}),
    execute: (editor: Editor) => async () => {
        try {
            const nodes = findSpreadsheetNodes(editor)
            const info = nodes.map((node, index) => {
                const workbook = resolveWorkbook(editor, node)
                return {
                    index,
                    pos: node.pos,
                    height: node.height,
                    live: getLiveHandle(editor, node.pos) !== null,
                    sheetCount: workbook?.sheets.length ?? 0,
                    sheets: (workbook?.sheets ?? []).map((sheet, sheetIndex) => {
                        const used = usedBounds(sheet)
                        return {
                            index: sheetIndex,
                            name: sheet.name,
                            rowCount: sheet.rowCount,
                            columnCount: sheet.columnCount,
                            usedRange: used ? `A1:${formatCellRef(used.endRow, used.endColumn)}` : null,
                            isPivot: !!sheet.pivot,
                            pivot: sheet.pivot ? {
                                ...sheet.pivot,
                                sources: sheet.pivot.sources.map((source) => ({
                                    sheet: workbook?.sheets[source.sheet]?.name,
                                    range: `${formatCellRef(source.range.startRow, source.range.startColumn)}:${formatCellRef(source.range.endRow, source.range.endColumn)}`,
                                })),
                            } : null,
                        }
                    }),
                }
            })
            return { success: true, count: info.length, spreadsheets: info }
        } catch (error) {
            return { success: false, error: errorMessage(error, '获取电子表格信息失败') }
        }
    },
}

/**
 * Tool: Read cell data from a spreadsheet
 */
export const readSpreadsheetDataTool = {
    name: 'readSpreadsheetData',
    readOnly: true,
    description: '读取文档中某个电子表格的单元格数据。可读取指定范围或整个工作表，返回二维数组（公式单元格返回公式文本）。',
    inputSchema: z.object({
        index: z.number().describe('电子表格在文档中的序号（从 0 开始，可通过 getSpreadsheetInfo 获取）'),
        sheetName: z.string().optional().describe('工作表名称，默认第一个工作表'),
        range: z.string().optional().describe('读取范围，如 "A1:C10"。不填则读取所有已填充单元格'),
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

            const maxRows = Math.max(1, Math.min(params.maxRows ?? 200, MAX_READ_ROWS))
            const requested = params.range ? parseRangeSpec(params.range) : null
            if (params.range && !requested) {
                return { success: false, error: `无效的范围格式 "${params.range}"` }
            }

            const workbook = resolveWorkbook(editor, node)
            const sheet = pickSheet(workbook, params.sheetName)
            if (!sheet) return { success: false, error: `未找到工作表 "${params.sheetName}"` }

            const used = usedBounds(sheet)
            if (!requested && !used) {
                return { success: true, sheetName: sheet.name, data: [], message: '工作表为空' }
            }

            const startRow = requested?.startRow ?? 0
            const startColumn = requested?.startColumn ?? 0
            const rawEndRow = requested ? requested.endRow : (used?.endRow ?? 0)
            const rawEndColumn = requested ? requested.endColumn : (used?.endColumn ?? 0)
            const endRow = Math.min(rawEndRow, startRow + maxRows - 1)
            const endColumn = Math.min(Math.max(rawEndColumn, startColumn), startColumn + MAX_TOOL_COLUMNS - 1)

            const data: CellValue[][] = []
            for (let row = startRow; row <= endRow; row++) {
                const line: CellValue[] = []
                for (let column = startColumn; column <= endColumn; column++) {
                    line.push(sheet.rows[row]?.[column] ?? null)
                }
                data.push(line)
            }

            return {
                success: true,
                sheetName: sheet.name,
                sheetNames: sheetNames(workbook),
                range: `${formatCellRef(startRow, startColumn)}:${formatCellRef(endRow, endColumn)}`,
                rows: data.length,
                columns: endColumn - startColumn + 1,
                truncated: endRow < rawEndRow,
                data,
            }
        } catch (error) {
            return { success: false, error: errorMessage(error, '读取电子表格数据失败') }
        }
    },
}

/** Bounding box of populated cells, or null when the sheet is empty. */
function usedBounds(sheet: SheetData): { endRow: number; endColumn: number } | null {
    let endRow = -1
    let endColumn = -1
    sheet.rows.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
            if (value !== null && value !== undefined && value !== '') {
                endRow = Math.max(endRow, rowIndex)
                endColumn = Math.max(endColumn, columnIndex)
            }
        })
    })
    return endRow < 0 ? null : { endRow, endColumn }
}

/**
 * Tool: Write / update cells in a spreadsheet
 */
export const updateSpreadsheetDataTool = {
    name: 'updateSpreadsheetData',
    description: '向文档中的电子表格写入数据。支持从指定起始单元格写入二维数组数据，null 表示跳过该单元格。',
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
            const node = findSpreadsheetByIndex(editor, params.index)
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }

            if (!editor.isEditable || getLiveHandle(editor, node.pos)?.isEditable() === false) {
                return { success: false, error: 'The spreadsheet is read-only.' }
            }
            const data = Array.isArray(params.data) ? params.data.slice(0, MAX_TOOL_ROWS) : []
            if (data.length === 0) return { success: false, error: '写入数据为空' }

            const startCell = params.startCell ?? 'A1'
            const start = parseCellRef(startCell)
            if (!start) return { success: false, error: `无效的起始单元格 "${params.startCell}"` }

            const matrix = data.map((row) =>
                (Array.isArray(row) ? row : []).slice(0, MAX_TOOL_COLUMNS).map(toCellValue),
            )
            const width = matrix.reduce((max, row) => Math.max(max, row.length), 0)
            if (width === 0) return { success: false, error: '写入数据为空' }

            const range = `${startCell}:${formatCellRef(start.row + matrix.length - 1, start.column + width - 1)}`

            // ── Resolve the target sheet. A name that does not exist is an error;
            //    silently defaulting to the first sheet would write to the wrong one.
            const live = getLiveHandle(editor, node.pos)
            const workbook = resolveWorkbook(editor, node)
            const sheets = workbook?.sheets ?? []
            let sheetIndex = 0
            if (params.sheetName) {
                const found = sheets.findIndex((sheet) => sheet.name === params.sheetName)
                if (found < 0) return { success: false, error: `未找到工作表 "${params.sheetName}"` }
                sheetIndex = found
            }
            if (sheets[sheetIndex]?.pivot) {
                return { success: false, error: 'Pivot cells are generated. Update the source data or use createPivotTable with the same outputName to change its configuration.' }
            }

            // ── Live grid first: keeps the instance, undo history and autosave
            //    pipeline intact. 0 written means the grid refused the coordinates,
            //    so fall through to the persisted-payload path.
            if (live && live.isEditable()) {
                // `show: false`: an AI write must not move the page the user is on.
                const written = live.setRangeValues(sheetIndex, start.row, start.column, matrix, { show: false })
                if (written !== null && written > 0) {
                    return {
                        success: true,
                        cellsWritten: written,
                        range,
                        message: `已写入 ${written} 个单元格（${range}）`,
                    }
                }
            }

            // ── Fallback: update the persisted payload (no live grid mounted).
            const base = workbook ?? createEmptyWorkbookData()
            const next: WorkbookData = {
                ...base,
                sheets: base.sheets.map((sheet, index) => {
                    if (index !== sheetIndex) return sheet
                    const rows = sheet.rows.map((row) => row.slice())
                    let cellsWritten = 0
                    matrix.forEach((row, rowOffset) => {
                        row.forEach((value, columnOffset) => {
                            if (value === null) return
                            const rowIndex = start.row + rowOffset
                            const columnIndex = start.column + columnOffset
                            rows[rowIndex] = rows[rowIndex] ?? []
                            while (rows[rowIndex].length <= columnIndex) rows[rowIndex].push(null)
                            rows[rowIndex][columnIndex] = value
                            cellsWritten += 1
                        })
                    })
                    return {
                        ...sheet,
                        rows,
                        rowCount: Math.max(sheet.rowCount, rows.length),
                        columnCount: Math.max(sheet.columnCount, width + start.column),
                    }
                }),
            }

            next.sheets = next.sheets.map((sheet) => sheet.pivot
                ? buildPivotSheet(next, sheet.pivot, sheet.name, pivotLabels())
                : sheet)

            const docNode = editor.state.doc.nodeAt(node.pos)
            if (!docNode) return { success: false, error: '无法定位电子表格节点' }
            editor.view.dispatch(
                editor.view.state.tr.setNodeMarkup(node.pos, undefined, {
                    ...docNode.attrs,
                    workbookData: next,
                }),
            )

            const cellsWritten = matrix.reduce(
                (total, row) => total + row.filter((value) => value !== null).length,
                0,
            )
            return {
                success: true,
                cellsWritten,
                range,
                message: `已写入 ${cellsWritten} 个单元格（${range}）`,
            }
        } catch (error) {
            return { success: false, error: errorMessage(error, '更新电子表格数据失败') }
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
            const node = findSpreadsheetByIndex(editor, params.index)
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }

            const docNode = editor.state.doc.nodeAt(node.pos)
            if (!docNode) return { success: false, error: '无法定位电子表格节点' }

            editor.view.dispatch(editor.view.state.tr.delete(node.pos, node.pos + docNode.nodeSize))
            return { success: true, message: `已删除第 ${params.index} 个电子表格` }
        } catch (error) {
            return { success: false, error: errorMessage(error, '删除电子表格失败') }
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
            const node = findSpreadsheetByIndex(editor, params.index)
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }

            const docNode = editor.state.doc.nodeAt(node.pos)
            if (!docNode) return { success: false, error: '无法定位电子表格节点' }
            editor.view.dispatch(
                editor.view.state.tr.setNodeMarkup(node.pos, undefined, {
                    ...docNode.attrs,
                    height: params.height,
                }),
            )
            return { success: true, message: `已将电子表格高度调整为 ${params.height}px` }
        } catch (error) {
            return { success: false, error: errorMessage(error, '调整电子表格大小失败') }
        }
    },
}

/**
 * Tool: Export a spreadsheet block to a downloadable .xlsx file
 */
export const exportSpreadsheetTool = {
    name: 'exportSpreadsheet',
    description: '将文档中指定序号的电子表格导出为 .xlsx 文件并触发浏览器下载。保留值与公式。',
    inputSchema: z.object({
        index: z.number().describe('电子表格序号（从 0 开始）'),
        filename: z.string().optional().describe('下载文件名，默认 "spreadsheet.xlsx"'),
    }),
    execute: (editor: Editor) => async (params: { index: number; filename?: string }) => {
        try {
            const node = findSpreadsheetByIndex(editor, params.index)
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }

            const workbook = resolveWorkbook(editor, node)
            if (!workbook) return { success: false, error: '该电子表格暂无数据可导出' }

            const filename = params.filename?.trim() || 'spreadsheet.xlsx'
            const { downloadWorkbookAsExcel } = await import('./workbook-to-excel')
            downloadWorkbookAsExcel(workbook, filename)

            return {
                success: true,
                message: `已导出电子表格为 ${filename.endsWith('.xlsx') ? filename : filename + '.xlsx'}`,
            }
        } catch (error) {
            return { success: false, error: errorMessage(error, '导出电子表格失败') }
        }
    },
}

const PIVOT_AGGREGATES = ['sum', 'count', 'average', 'max', 'min'] as const
const PIVOT_DATE_GROUPS = ['none', 'year', 'quarter', 'month', 'day'] as const

function pivotLabels(): PivotLabels {
    return {
        total: translate('spreadsheet.pivot.total'),
        source: translate('spreadsheet.pivot.source'),
        aggregate: (kind) => translate('spreadsheet.pivot.aggregate.' + kind),
    }
}

const pivotFieldSchema = z.string().trim().min(1)
const pivotGroupSchema = z.union([
    pivotFieldSchema,
    z.object({ field: pivotFieldSchema, dateGroup: z.enum(PIVOT_DATE_GROUPS).optional() }),
])
const createPivotTableSchema = z.object({
    index: z.number().int().min(0).describe('Spreadsheet block index from getSpreadsheetInfo (0-based).'),
    range: z.string().optional().describe('Source range, e.g. A1:D100. Required unless sources is provided; include the header row when hasHeader is true.'),
    sourceSheet: z.string().optional().describe('Source worksheet name; defaults to the first worksheet.'),
    sources: z.array(z.object({
        sheet: z.string().optional().describe('Worksheet name; defaults to the first worksheet.'),
        range: z.string().describe('Source range in A1 notation.'),
    })).min(1).max(32).optional().describe('Cross-sheet union. Overrides range/sourceSheet. All regions must have the same fields in the same column order.'),
    hasHeader: z.boolean().optional().describe('Whether each region starts with field names; defaults to true. Without headers use column letters from the first range.'),
    rows: z.array(pivotGroupSchema).max(MAX_TOOL_COLUMNS).optional().describe('Row grouping fields. Use a field name or { field, dateGroup: year/quarter/month/day/none }.'),
    columns: z.array(pivotGroupSchema).max(MAX_TOOL_COLUMNS).optional().describe('Column grouping fields, optionally bucketed by date.'),
    values: z.array(z.object({
        field: pivotFieldSchema.describe('Exact source field label. Duplicate headers use labels such as Amount (2).'),
        aggregate: z.enum(PIVOT_AGGREGATES).optional().describe('Aggregation; defaults to sum. count counts non-empty values.'),
    })).min(1).max(32).describe('One or more measures: sum, count, average, max, or min.'),
    outputName: z.string().trim().min(1).optional().describe('Output worksheet name. Reuses an existing pivot of this name; never overwrites a regular worksheet.'),
    showRowTotals: z.boolean().optional().describe('Include row totals; defaults to true.'),
    showColumnTotals: z.boolean().optional().describe('Include column totals; defaults to true.'),
})

/** Accept plain field names or { field, dateGroup } objects. */
function toGroupFields(value: unknown): PivotGroupField[] {
    if (!Array.isArray(value)) return []
    const out: PivotGroupField[] = []
    for (const entry of value) {
        if (typeof entry === 'string') {
            const field = entry.trim()
            if (field) out.push({ field })
            continue
        }
        const record = entry as { field?: unknown; dateGroup?: unknown }
        const field = typeof record?.field === 'string' ? record.field.trim() : ''
        if (!field) continue
        const dateGroup = (PIVOT_DATE_GROUPS as readonly string[]).includes(String(record.dateGroup))
            ? (record.dateGroup as PivotGroupField['dateGroup'])
            : undefined
        out.push(dateGroup ? { field, dateGroup } : { field })
    }
    return out
}

/**
 * Tool: Create (or refresh) a pivot table
 */
export const createPivotTableTool = {
    name: 'createPivotTable',
    description: 'Create or reconfigure a pivot table (cross-tab/group summary) in a spreadsheet. Supports multiple source sheets, row/column groups, date buckets, sum/count/average/max/min, and totals. Read source data first; output is a generated worksheet that refreshes when source cells change.',
    inputSchema: createPivotTableSchema,
    execute: (editor: Editor) => async (params: {
        index: number
        range?: string
        sourceSheet?: string
        sources?: { sheet?: string; range: string }[]
        hasHeader?: boolean
        rows?: (string | { field: string; dateGroup?: string })[]
        columns?: (string | { field: string; dateGroup?: string })[]
        values: { field: string; aggregate?: PivotAggregate }[]
        outputName?: string
        showRowTotals?: boolean
        showColumnTotals?: boolean
    }) => {
        try {
            const node = findSpreadsheetByIndex(editor, params.index)
            if (!node) return { success: false, error: `未找到序号 ${params.index} 的电子表格` }
            if (!editor.isEditable || getLiveHandle(editor, node.pos)?.isEditable() === false) {
                return { success: false, error: 'The spreadsheet is read-only.' }
            }
            const parsed = createPivotTableSchema.safeParse(params)
            if (!parsed.success) return { success: false, error: parsed.error.message }
            params = parsed.data
            const workbook = resolveWorkbook(editor, node)
            if (!workbook) return { success: false, error: '该电子表格暂无数据' }

            const resolveSheet = (name?: string) => name
                ? workbook.sheets.findIndex((sheet) => sheet.name === name)
                : 0

            const sources: PivotSource[] = []
            if (Array.isArray(params.sources) && params.sources.length > 0) {
                for (const spec of params.sources) {
                    const sheetIndex = resolveSheet(spec?.sheet)
                    if (sheetIndex < 0) return { success: false, error: `未找到工作表 "${spec?.sheet}"` }
                    const range = parseRangeSpec(spec?.range ?? '')
                    if (!range) return { success: false, error: `无效的区域格式 "${spec?.range ?? ''}"` }
                    sources.push({ sheet: sheetIndex, range })
                }
            } else {
                const sheetIndex = resolveSheet(params.sourceSheet)
                if (sheetIndex < 0) return { success: false, error: `未找到工作表 "${params.sourceSheet}"` }
                if (!params.range) return { success: false, error: 'Provide range or a non-empty sources array.' }
                const range = parseRangeSpec(params.range)
                if (!range) return { success: false, error: `无效的区域格式 "${params.range}"` }
                sources.push({ sheet: sheetIndex, range })
            }
            if (sources.some((source) => workbook.sheets[source.sheet]?.pivot)) {
                return { success: false, error: '源工作表不能是生成的透视表' }
            }

            let sourceRows = 0
            const width = sources[0].range.endColumn - sources[0].range.startColumn + 1
            for (const source of sources) {
                const { range } = source
                const sheet = workbook.sheets[source.sheet]
                const height = range.endRow - range.startRow + 1
                sourceRows += height
                if (!Number.isSafeInteger(height) || sourceRows > MAX_TOOL_ROWS
                    || !Number.isSafeInteger(width) || width > MAX_TOOL_COLUMNS
                    || range.endRow >= sheet.rowCount || range.endColumn >= sheet.columnCount) {
                    return { success: false, error: `Source ranges must fit their worksheets and contain at most ${MAX_TOOL_ROWS} rows in total and ${MAX_TOOL_COLUMNS} columns.` }
                }
                if (range.endColumn - range.startColumn + 1 !== width) {
                    return { success: false, error: 'All source ranges must have the same number of columns.' }
                }
                if (params.hasHeader !== false && height < 2) {
                    return { success: false, error: 'A source range must include data rows below its header.' }
                }
            }
            const availableFields = pivotFieldLabels(workbook.sheets, sources, params.hasHeader !== false)
            if (params.hasHeader !== false && sources.slice(1).some((source) =>
                JSON.stringify(pivotFieldLabels(workbook.sheets, [source], true)) !== JSON.stringify(availableFields))) {
                return { success: false, error: 'Source headers must match in the same column order.', availableFields }
            }

            const values = (params.values ?? [])
                .filter((entry) => entry && typeof entry.field === 'string' && entry.field.trim() !== '')
                .map((entry) => ({
                    field: entry.field.trim(),
                    aggregate: (PIVOT_AGGREGATES as readonly string[]).includes(entry.aggregate ?? '')
                        ? (entry.aggregate as PivotAggregate)
                        : ('sum' as PivotAggregate),
                }))
            if (values.length === 0) return { success: false, error: '至少需要一个值字段（values）' }

            const config: PivotConfig = {
                sources,
                hasHeader: params.hasHeader !== false,
                rows: toGroupFields(params.rows),
                columns: toGroupFields(params.columns),
                values,
                showRowTotals: params.showRowTotals !== false,
                showColumnTotals: params.showColumnTotals !== false,
            }
            const unknownFields = [...config.rows, ...config.columns, ...config.values]
                .map((entry) => entry.field).filter((field) => !availableFields.includes(field))
            if (unknownFields.length > 0) {
                return { success: false, error: `Unknown pivot fields: ${[...new Set(unknownFields)].join(', ')}`, availableFields }
            }
            const name = params.outputName?.trim() || translate('spreadsheet.pivot.outputNamePlaceholder')
            if (workbook.sheets.some((sheet) => sheet.name === name && !sheet.pivot)) {
                return { success: false, error: `A regular worksheet named "${name}" already exists. Choose a different outputName.` }
            }
            const updated = workbook.sheets.some((sheet) => sheet.name === name && !!sheet.pivot)
            const next = upsertPivotSheet(workbook, config, name, pivotLabels(), {
                maxRows: MAX_TOOL_ROWS,
                maxColumns: MAX_TOOL_COLUMNS,
            })
            const output = next.sheets[next.activeSheet]
            const bounds = usedBounds(output)

            const docNode = editor.state.doc.nodeAt(node.pos)
            if (!docNode) return { success: false, error: '无法定位电子表格节点' }
            editor.view.dispatch(
                editor.view.state.tr.setNodeMarkup(node.pos, undefined, {
                    ...docNode.attrs,
                    workbookData: next,
                }),
            )

            return {
                success: true,
                sheetName: name,
                sheetIndex: next.activeSheet,
                updated,
                range: bounds ? `A1:${formatCellRef(bounds.endRow, bounds.endColumn)}` : null,
                preview: output.rows.slice(0, Math.min((bounds?.endRow ?? 0) + 1, 10))
                    .map((row) => row.slice(0, Math.min((bounds?.endColumn ?? 0) + 1, 20))),
                sources: sources.length,
                rows: config.rows.map((entry) => entry.field),
                columns: config.columns.map((entry) => entry.field),
                values: config.values,
                message: `${updated ? 'Updated' : 'Created'} pivot table "${name}". Source cell changes refresh the result; use readSpreadsheetData to inspect it.`,
            }
        } catch (error) {
            return { success: false, error: errorMessage(error, '创建透视表失败') }
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
    createPivotTableTool,
]
