/**
 * Workbook payload for a spreadsheet block.
 *
 * Small and serialisable: a sheet is a list of rows, a row is a list of cell
 * values, plus a sparse map of cell styles (plain CSS text, keyed `"row:col"`).
 * This is what the grid consumes and what we persist on the ProseMirror node,
 * so there is no translation layer to drift out of sync.
 *
 * Documents written by the earlier engine stored a sparse `cellData` matrix
 * instead; {@link normalizeWorkbookData} migrates those on load.
 */

/** A cell as the grid stores it. */
export type CellValue = string | number | boolean | null

/** Sparse cell styles: `"row:col"` → CSS declarations (e.g. `"font-weight:bold"`). */
export type CellStyles = Record<string, string>

export interface SheetData {
    name: string
    /** Row-major cell values. */
    rows: CellValue[][]
    rowCount: number
    columnCount: number
    /** Optional styling; absent for a plain data sheet. */
    styles?: CellStyles
}

/** Options the grid was created with (kept out of the React tree). */
export interface SheetMeta {
    /** Column pixel widths, index → width. */
    columnWidths?: Record<string, number>
    /** Merged ranges as `[startColumn, startRow, endColumn, endRow]`. */
    merges?: [number, number, number, number][]
}

export interface WorkbookData {
    /** Stable id for this block's data (used to tell an echo from external data). */
    id: string
    sheets: SheetData[]
    /** Sheet the user last looked at. */
    activeSheet: number
    version: 2
}

export const DEFAULT_SHEET_NAME = 'Sheet1'
/** Grid size a new block starts with (compact density, so this fits the block). */
export const DEFAULT_ROW_COUNT = 40
export const DEFAULT_COLUMN_COUNT = 12
export const DEFAULT_COLUMN_WIDTH = 96

let workbookSeq = 0

function newWorkbookId(): string {
    workbookSeq += 1
    return `wb-${Date.now().toString(36)}-${workbookSeq}`
}

/** Build an empty single-sheet workbook. */
export function createEmptyWorkbookData(rowCount = DEFAULT_ROW_COUNT, columnCount = DEFAULT_COLUMN_COUNT): WorkbookData {
    return {
        id: newWorkbookId(),
        sheets: [createSheetData(DEFAULT_SHEET_NAME, rowCount, columnCount)],
        activeSheet: 0,
        version: 2,
    }
}

/** Build one sheet with the given grid size. */
export function createSheetData(
    name: string,
    rowCount: number,
    columnCount: number,
    rows?: CellValue[][],
    styles?: CellStyles,
): SheetData {
    return {
        name: name || DEFAULT_SHEET_NAME,
        rows: padRows(rows ?? [], rowCount, columnCount),
        rowCount: Math.max(rowCount, 1),
        columnCount: Math.max(columnCount, 1),
        ...(styles && Object.keys(styles).length > 0 ? { styles } : {}),
    }
}

/** Build a workbook from tabular values (Excel import and the AI tools). */
export function createWorkbookFromRows(
    rows: CellValue[][],
    sheetName = DEFAULT_SHEET_NAME,
): WorkbookData {
    const columnCount = Math.max(rows.reduce((max, row) => Math.max(max, row.length), 0), DEFAULT_COLUMN_COUNT)
    const rowCount = Math.max(rows.length, DEFAULT_ROW_COUNT)
    return {
        id: newWorkbookId(),
        sheets: [createSheetData(sheetName, rowCount, columnCount, rows)],
        activeSheet: 0,
        version: 2,
    }
}

/** Pad/truncate a matrix to exactly `rowCount` × `columnCount`. */
function padRows(rows: CellValue[][], rowCount: number, columnCount: number): CellValue[][] {
    const out: CellValue[][] = []
    for (let r = 0; r < rowCount; r++) {
        const source = rows[r] ?? []
        const row: CellValue[] = new Array(columnCount)
        for (let c = 0; c < columnCount; c++) {
            const value = source[c]
            row[c] = value === undefined ? null : value
        }
        out.push(row)
    }
    return out
}

/** Detach a matrix from a sheet so callers cannot mutate the store by accident. */
export function cloneRows(rows: CellValue[][]): CellValue[][] {
    return rows.map((row) => row.slice())
}

/** Style key for a 0-based cell coordinate. */
export function styleKey(row: number, column: number): string {
    return `${row}:${column}`
}

/**
 * Bring any known payload shape up to the current {@link WorkbookData} model.
 *
 * Handles the current shape, the legacy sparse `cellData` matrix (previous
 * engine), and nothing at all.
 */
export function normalizeWorkbookData(data: any): WorkbookData {
    if (!data || typeof data !== 'object') return createEmptyWorkbookData()

    // Current shape.
    if (Array.isArray(data.sheets) && data.sheets.length > 0) {
        const sheets: SheetData[] = data.sheets.map((sheet: any, index: number) =>
            createSheetData(
                sheet?.name || `Sheet${index + 1}`,
                Math.max(Number(sheet?.rowCount) || 0, (sheet?.rows?.length ?? 0) || DEFAULT_ROW_COUNT),
                Math.max(Number(sheet?.columnCount) || 0, DEFAULT_COLUMN_COUNT),
                Array.isArray(sheet?.rows) ? sheet.rows : [],
                isStyleMap(sheet?.styles) ? sheet.styles : undefined,
            ),
        )
        return {
            id: typeof data.id === 'string' && data.id ? data.id : newWorkbookId(),
            sheets,
            activeSheet: Math.min(Math.max(Number(data.activeSheet) || 0, 0), sheets.length - 1),
            version: 2,
        }
    }

    // Legacy shape: { sheets: { sheetId: { cellData: { row: { col: cell } } } }, sheetOrder }
    if (data.sheets && typeof data.sheets === 'object') {
        const order: string[] = Array.isArray(data.sheetOrder) && data.sheetOrder.length
            ? data.sheetOrder
            : Object.keys(data.sheets)
        const sheets: SheetData[] = []
        for (const sheetId of order) {
            const legacy = data.sheets[sheetId]
            if (!legacy) continue
            const { rows, rowCount, columnCount } = legacyCellsToRows(legacy.cellData)
            sheets.push(createSheetData(
                legacy.name || `Sheet${sheets.length + 1}`,
                Math.max(rowCount, DEFAULT_ROW_COUNT),
                Math.max(columnCount, DEFAULT_COLUMN_COUNT),
                rows,
            ))
        }
        if (sheets.length > 0) {
            return { id: newWorkbookId(), sheets, activeSheet: 0, version: 2 }
        }
    }

    return createEmptyWorkbookData()
}

function isStyleMap(value: any): value is CellStyles {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Convert a legacy sparse `cellData` matrix into row-major values. */
function legacyCellsToRows(cellData: any): { rows: CellValue[][]; rowCount: number; columnCount: number } {
    const rows: CellValue[][] = []
    let rowCount = 0
    let columnCount = 0
    if (!cellData || typeof cellData !== 'object') return { rows, rowCount, columnCount }

    for (const rowKey of Object.keys(cellData)) {
        const rowIndex = Number(rowKey)
        const row = cellData[rowKey]
        if (!Number.isFinite(rowIndex) || rowIndex < 0 || !row) continue
        rows[rowIndex] = rows[rowIndex] ?? []
        for (const colKey of Object.keys(row)) {
            const colIndex = Number(colKey)
            if (!Number.isFinite(colIndex) || colIndex < 0) continue
            const cell = row[colKey]
            const value = cell && typeof cell === 'object' ? cell.v : cell
            rows[rowIndex][colIndex] = value === undefined ? null : (value as CellValue)
            columnCount = Math.max(columnCount, colIndex + 1)
        }
        rowCount = Math.max(rowCount, rowIndex + 1)
    }
    return { rows, rowCount, columnCount }
}

/** Ensure a payload is usable (at least one sheet with a positive grid). */
export function ensureValidWorkbookData(data: any): WorkbookData {
    const normalized = normalizeWorkbookData(data)
    if (normalized.sheets.length === 0) return createEmptyWorkbookData()
    return normalized
}

/**
 * Spreadsheet column index (0-based) → letter label, e.g. 0→A, 25→Z, 26→AA.
 */
export function columnIndexToLabel(index: number): string {
    let label = ''
    let value = index
    while (value >= 0) {
        label = String.fromCharCode((value % 26) + 65) + label
        value = Math.floor(value / 26) - 1
    }
    return label
}

/** Letter label → column index (0-based); returns -1 when malformed. */
export function columnLabelToIndex(label: string): number {
    const text = String(label ?? '').toUpperCase()
    if (!/^[A-Z]+$/.test(text)) return -1
    let index = 0
    for (let i = 0; i < text.length; i++) {
        index = index * 26 + (text.charCodeAt(i) - 64)
    }
    return index - 1
}

/** Parse an A1-style reference such as `B3` into 0-based coordinates. */
export function parseCellRef(ref: string): { row: number; column: number } | null {
    const match = String(ref ?? '').trim().match(/^([A-Za-z]+)(\d+)$/)
    if (!match) return null
    const row = Number.parseInt(match[2], 10) - 1
    const column = columnLabelToIndex(match[1])
    if (row < 0 || column < 0) return null
    return { row, column }
}

/** Format 0-based coordinates as an A1-style reference. */
export function formatCellRef(row: number, column: number): string {
    return `${columnIndexToLabel(column)}${row + 1}`
}

/** Parse `A1:C10` (or a single cell) into inclusive bounds, or null when malformed. */
export function parseRangeSpec(
    range: string,
): { startRow: number; endRow: number; startColumn: number; endColumn: number } | null {
    const parts = String(range ?? '').trim().split(':')
    const from = parseCellRef(parts[0])
    const to = parts[1] !== undefined ? parseCellRef(parts[1]) : from
    if (!from || !to) return null
    return {
        startRow: Math.min(from.row, to.row),
        endRow: Math.max(from.row, to.row),
        startColumn: Math.min(from.column, to.column),
        endColumn: Math.max(from.column, to.column),
    }
}

/** True when a workbook carries any value or style (i.e. is not effectively blank). */
export function workbookHasContent(workbook: WorkbookData | null | undefined): boolean {
    if (!workbook) return false
    return workbook.sheets.some((sheet) => {
        if (sheet.styles && Object.keys(sheet.styles).length > 0) return true
        return sheet.rows.some((row) => row.some((value) => value !== null && value !== undefined && value !== ''))
    })
}
