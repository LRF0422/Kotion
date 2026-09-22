/**
 * Workbook payload for a spreadsheet block.
 *
 * Small and serialisable: a sheet is a list of rows, a row is a list of cell
 * values, plus sparse maps for styles, number formats, column/row sizing and
 * merges. This is what the grid consumes and what we persist on the
 * ProseMirror node, so there is no translation layer to drift out of sync.
 *
 * Documents written by the earlier engine stored a sparse `cellData` matrix
 * instead; {@link normalizeWorkbookData} migrates those on load.
 */

/** A cell as the grid stores it. */
export type CellValue = string | number | boolean | null

/** Sparse cell styles: `"A1"` → CSS declarations (e.g. `"font-weight: bold"`). */
export type CellStyles = Record<string, string>

/** Number formats the toolbar can apply. `general` clears the format. */
export type NumberFormatKind = 'general' | 'decimal' | 'percent' | 'currency'

/** Merged ranges as `[startColumn, startRow, endColumn, endRow]` (inclusive, 0-based). */
export type SheetMerges = [number, number, number, number][]

/** How a pivot value field is aggregated. */
export type PivotAggregate = 'sum' | 'count' | 'average' | 'max' | 'min'

/** One measure in a pivot table. */
export interface PivotValueField {
    /** Field label (source header text, or the column letter). */
    field: string
    aggregate: PivotAggregate
}

/** Inclusive source range for a pivot, 0-based. */
export interface PivotRange {
    startRow: number
    startColumn: number
    endRow: number
    endColumn: number
}

/** Date bucket a row/column field can be grouped by. */
export type PivotDateGroup = 'none' | 'year' | 'quarter' | 'month' | 'day'

/** A row/column grouping field, optionally bucketed by date. */
export interface PivotGroupField {
    field: string
    /** When set (and the values parse as dates) group by this bucket. */
    dateGroup?: PivotDateGroup
}

/** One region contributed to a pivot; several can be unioned together. */
export interface PivotSource {
    /** Index of the source sheet in the workbook. */
    sheet: number
    range: PivotRange
}

/**
 * Pivot table definition.
 *
 * Stored on the *output* sheet: that sheet's `rows` always hold the generated
 * result, so a reader that ignores `pivot` still renders the last computed
 * table. `useJspreadsheet` recomputes it whenever the source data changes.
 */
export interface PivotConfig {
    /** Source regions (cross-sheet union). At least one. */
    sources: PivotSource[]
    /** When true the first row of every source holds field names. */
    hasHeader: boolean
    /** Fields grouped into rows, in output order. */
    rows: PivotGroupField[]
    /** Fields grouped into columns, in output order. */
    columns: PivotGroupField[]
    /** Measures; at least one is required by the UI. */
    values: PivotValueField[]
    showRowTotals: boolean
    showColumnTotals: boolean
}

export interface SheetData {
    name: string
    /** Row-major cell values. */
    rows: CellValue[][]
    rowCount: number
    columnCount: number
    /** Optional styling; absent for a plain data sheet. */
    styles?: CellStyles
    /** `"A1"` → the number format applied to that cell. */
    numberFormats?: Record<string, NumberFormatKind>
    /** `"A1"` → the unformatted value the number format was applied to. */
    rawValues?: Record<string, CellValue>
    /** Column index (as a string) → pixel width, only when non-default. */
    columnWidths?: Record<string, number>
    /** Row index (as a string) → pixel height, only when non-default. */
    rowHeights?: Record<string, number>
    /** Merged ranges. */
    merges?: SheetMerges
    /** Present when this sheet is a generated pivot table. */
    pivot?: PivotConfig
}

export interface WorkbookData {
    /** Stable id for this block's data (used to tell an echo from external data). */
    id: string
    sheets: SheetData[]
    /** Sheet the user last looked at. */
    activeSheet: number
    version: 2
}

/** The sparse maps a sheet may carry alongside its values. */
export interface SheetExtras {
    styles?: CellStyles
    numberFormats?: Record<string, NumberFormatKind>
    rawValues?: Record<string, CellValue>
    columnWidths?: Record<string, number>
    rowHeights?: Record<string, number>
    merges?: SheetMerges
    pivot?: PivotConfig
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
    extras?: SheetExtras,
): SheetData {
    const numberFormats = extras?.numberFormats && Object.keys(extras.numberFormats).length > 0
        ? extras.numberFormats
        : undefined
    const rawValues = extras?.rawValues && Object.keys(extras.rawValues).length > 0
        ? extras.rawValues
        : undefined
    const columnWidths = extras?.columnWidths && Object.keys(extras.columnWidths).length > 0
        ? extras.columnWidths
        : undefined
    const rowHeights = extras?.rowHeights && Object.keys(extras.rowHeights).length > 0
        ? extras.rowHeights
        : undefined
    const merges = extras?.merges && extras.merges.length > 0 ? extras.merges : undefined
    return {
        name: name || DEFAULT_SHEET_NAME,
        rows: padRows(rows ?? [], rowCount, columnCount),
        rowCount: Math.max(rowCount, 1),
        columnCount: Math.max(columnCount, 1),
        ...(styles && Object.keys(styles).length > 0 ? { styles } : {}),
        ...(numberFormats ? { numberFormats } : {}),
        ...(rawValues ? { rawValues } : {}),
        ...(columnWidths ? { columnWidths } : {}),
        ...(rowHeights ? { rowHeights } : {}),
        ...(merges ? { merges } : {}),
        ...(extras?.pivot ? { pivot: extras.pivot } : {}),
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
                {
                    numberFormats: normalizeNumberFormats(sheet?.numberFormats),
                    rawValues: isCellValueMap(sheet?.rawValues) ? sheet.rawValues : undefined,
                    columnWidths: normalizeDimensionMap(sheet?.columnWidths),
                    rowHeights: normalizeDimensionMap(sheet?.rowHeights),
                    merges: normalizeMerges(sheet?.merges),
                    pivot: normalizePivotConfig(sheet?.pivot),
                },
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

function isCellValueMap(value: any): value is Record<string, CellValue> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNumberFormatKind(value: any): value is NumberFormatKind {
    return value === 'general' || value === 'decimal' || value === 'percent' || value === 'currency'
}

function normalizeNumberFormats(value: any): Record<string, NumberFormatKind> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const out: Record<string, NumberFormatKind> = {}
    Object.entries(value as Record<string, unknown>).forEach(([ref, kind]) => {
        if (/^[A-Z]+\d+$/i.test(ref) && isNumberFormatKind(kind)) out[ref.toUpperCase()] = kind
    })
    return Object.keys(out).length > 0 ? out : undefined
}

/** Keep only finite positive widths/heights keyed by a non-negative integer. */
function normalizeDimensionMap(value: any): Record<string, number> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const out: Record<string, number> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
        const index = Number(key)
        const size = Number(raw)
        if (Number.isInteger(index) && index >= 0 && Number.isFinite(size) && size > 0) {
            out[String(index)] = size
        }
    })
    return Object.keys(out).length > 0 ? out : undefined
}

/** Keep only well-formed `[startColumn, startRow, endColumn, endRow]` tuples. */
function normalizeMerges(value: any): SheetMerges | undefined {
    if (!Array.isArray(value)) return undefined
    const out: SheetMerges = []
    for (const entry of value) {
        if (!Array.isArray(entry) || entry.length < 4) continue
        const [c1, r1, c2, r2] = entry.map((part) => Number(part))
        if (![c1, r1, c2, r2].every((part) => Number.isInteger(part) && part >= 0)) continue
        out.push([Math.min(c1, c2), Math.min(r1, r2), Math.max(c1, c2), Math.max(r1, r2)])
    }
    return out.length > 0 ? out : undefined
}

const PIVOT_AGGREGATES: PivotAggregate[] = ['sum', 'count', 'average', 'max', 'min']

function isPivotAggregate(value: any): value is PivotAggregate {
    return PIVOT_AGGREGATES.includes(value)
}

function normalizePivotRange(value: any): PivotRange | null {
    if (!value || typeof value !== 'object') return null
    const nums = [value.startRow, value.startColumn, value.endRow, value.endColumn].map((part) => Number(part))
    if (!nums.every((part) => Number.isInteger(part) && part >= 0)) return null
    const [startRow, startColumn, endRow, endColumn] = nums
    return {
        startRow: Math.min(startRow, endRow),
        endRow: Math.max(startRow, endRow),
        startColumn: Math.min(startColumn, endColumn),
        endColumn: Math.max(startColumn, endColumn),
    }
}

const PIVOT_DATE_GROUPS: PivotDateGroup[] = ['none', 'year', 'quarter', 'month', 'day']

function isPivotDateGroup(value: any): value is PivotDateGroup {
    return PIVOT_DATE_GROUPS.includes(value)
}

/** Accept both the older `string[]` and the current `{ field, dateGroup }[]`. */
function normalizeGroupFields(value: any): PivotGroupField[] {
    if (!Array.isArray(value)) return []
    const out: PivotGroupField[] = []
    for (const entry of value) {
        if (typeof entry === 'string') {
            const field = entry.trim()
            if (field) out.push({ field })
            continue
        }
        const field = typeof entry?.field === 'string' ? entry.field.trim() : ''
        if (!field) continue
        const dateGroup = isPivotDateGroup(entry?.dateGroup) && entry.dateGroup !== 'none' ? entry.dateGroup : undefined
        out.push(dateGroup ? { field, dateGroup } : { field })
    }
    return out
}

function normalizePivotSource(value: any): PivotSource | null {
    const range = normalizePivotRange(value?.range)
    if (!range) return null
    return { sheet: Math.max(Math.trunc(Number(value?.sheet) || 0), 0), range }
}

/** Validate a persisted pivot definition; returns undefined for anything unusable. */
export function normalizePivotConfig(value: any): PivotConfig | undefined {
    if (!value || typeof value !== 'object') return undefined
    // Current shape is { sources: [...] }; migrate the earlier { sourceSheet, sourceRange }.
    const sources: PivotSource[] = []
    if (Array.isArray(value.sources)) {
        for (const entry of value.sources) {
            const source = normalizePivotSource(entry)
            if (source) sources.push(source)
        }
    } else {
        const range = normalizePivotRange(value.sourceRange)
        if (range) sources.push({ sheet: Math.max(Math.trunc(Number(value.sourceSheet) || 0), 0), range })
    }
    if (sources.length === 0) return undefined
    const values: PivotValueField[] = []
    if (Array.isArray(value.values)) {
        for (const entry of value.values) {
            const field = typeof entry?.field === 'string' ? entry.field.trim() : ''
            if (!field) continue
            values.push({ field, aggregate: isPivotAggregate(entry?.aggregate) ? entry.aggregate : 'sum' })
        }
    }
    return {
        sources,
        hasHeader: value.hasHeader !== false,
        rows: normalizeGroupFields(value.rows),
        columns: normalizeGroupFields(value.columns),
        values,
        showRowTotals: value.showRowTotals !== false,
        showColumnTotals: value.showColumnTotals !== false,
    }
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
            const cell = row[colIndex]
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

/** True when a workbook carries any value, style or structure (i.e. is not blank). */
export function workbookHasContent(workbook: WorkbookData | null | undefined): boolean {
    if (!workbook) return false
    return workbook.sheets.some((sheet) => {
        if (sheet.styles && Object.keys(sheet.styles).length > 0) return true
        if (sheet.numberFormats && Object.keys(sheet.numberFormats).length > 0) return true
        if (sheet.merges && sheet.merges.length > 0) return true
        return sheet.rows.some((row) => row.some((value) => value !== null && value !== undefined && value !== ''))
    })
}

/**
 * Stable content fingerprint of a workbook, ignoring object identity.
 *
 * The grid auto-saves the whole payload on a throttle, so the same content can
 * arrive back as a *new object* (ProseMirror/Yjs round-trips). Conversely an
 * undo, a remote collaborator or an AI tool can deliver *different* content with
 * the same workbook id. Comparing ids alone cannot tell those apart; comparing
 * this key can, so callers apply exactly the updates that change something.
 */
export function workbookContentKey(workbook: WorkbookData | null | undefined): string {
    if (!workbook) return ''
    return JSON.stringify([
        workbook.id,
        workbook.activeSheet,
        workbook.sheets.map((sheet) => [
            sheet.name,
            sheet.rows,
            sheet.styles ?? null,
            sheet.numberFormats ?? null,
            sheet.rawValues ?? null,
            sheet.columnWidths ?? null,
            sheet.rowHeights ?? null,
            sheet.merges ?? null,
            sheet.pivot ?? null,
        ]),
    ])
}
