import type { CellValue, SheetMerges, WorkbookData } from "./workbook-data"

/**
 * Pure translation between the persisted workbook model and VTable's sheet
 * definitions.
 *
 * Kept separate from the React hook on purpose: this is the part of the engine
 * swap that can be unit-tested without a browser (the engine itself cannot —
 * see docs/VTABLE_MIGRATION.md risk 1), so it carries the coordinate and layout
 * semantics that the adapter must not get wrong.
 *
 * Two contracts this module owns:
 *
 * 1. **`sheetKey` is the sheet's index, stringified.** Pivot sources address
 *    sheets by index (`PivotSource.sheet`) and `WorkbookData.activeSheet` is an
 *    index, so an index-derived key keeps the mapping total and stateless.
 * 2. **`data` stays the raw row-major matrix** (`SheetData.rows`), including
 *    `=FORMULA` text. VTable's engine reads formulas straight out of the data,
 *    and vtable-sheet normalises both matrix and record shapes — passing the
 *    matrix keeps the persisted payload and the engine in lockstep with no
 *    translation that could drift.
 */

/**
 * A1 helpers, inlined on purpose.
 *
 * This module is loaded by the Node test runner, and Node resolves relative
 * imports literally — a runtime import would need a `.ts` extension, which the
 * package build rejects (TS5097 + TS5096 against `rollup-plugin-typescript2`).
 * A type-only import is erased and therefore safe, so the two tiny A1 helpers
 * are duplicated here rather than pulled in. `vtable-config.test.ts` pins their
 * behaviour against `workbook-data`'s versions.
 */

/** 0-based column index → letter label, e.g. 0→A, 26→AA. */
function columnLabel(index: number): string {
    let label = ""
    let value = index
    while (value >= 0) {
        label = String.fromCharCode((value % 26) + 65) + label
        value = Math.floor(value / 26) - 1
    }
    return label
}

/** `"B3"` → `{ row: 2, column: 1 }`, or null when malformed. */
function parseA1(ref: string): { row: number; column: number } | null {
    const match = String(ref ?? "").trim().match(/^([A-Za-z]+)(\d+)$/)
    if (!match) return null
    let column = 0
    const letters = match[1]!.toUpperCase()
    for (let i = 0; i < letters.length; i += 1) {
        column = column * 26 + (letters.charCodeAt(i) - 64)
    }
    column -= 1
    const row = Number.parseInt(match[2]!, 10) - 1
    if (row < 0 || column < 0) return null
    return { row, column }
}

/** The parts of `ISheetDefine` we set. Typed structurally to avoid a hard dep here. */
export interface VTableSheetDefine {
    sheetTitle: string
    sheetKey: string
    rowCount: number
    columnCount: number
    data: CellValue[][]
    active?: boolean
    cellMerge?: { range: { start: { col: number; row: number }; end: { col: number; row: number } } }[]
    columnWidthConfig?: { key: string | number; width: number }[]
    rowHeightConfig?: { key: number; height: number }[]
    /** Generated sheets are locked by the adapter; see docs/VTABLE_MIGRATION.md §3.1. */
    readonly _generated?: boolean
}

/**
 * Our merges are inclusive `[startColumn, startRow, endColumn, endRow]` tuples
 * (0-based); VTable wants `{ start: {col,row}, end: {col,row} }`.
 */
export function toVTableMerges(merges: SheetMerges | undefined): VTableSheetDefine["cellMerge"] {
    if (!merges || merges.length === 0) return undefined
    return merges.map(([startColumn, startRow, endColumn, endRow]) => ({
        range: {
            start: { col: startColumn, row: startRow },
            end: { col: endColumn, row: endRow },
        },
    }))
}

/** Inverse of {@link toVTableMerges}. */
export function fromVTableMerges(
    cellMerge: VTableSheetDefine["cellMerge"],
): SheetMerges | undefined {
    if (!cellMerge || cellMerge.length === 0) return undefined
    const out: SheetMerges = []
    for (const entry of cellMerge) {
        const start = entry?.range?.start
        const end = entry?.range?.end
        if (!start || !end) continue
        out.push([
            Math.min(start.col, end.col),
            Math.min(start.row, end.row),
            Math.max(start.col, end.col),
            Math.max(start.row, end.row),
        ])
    }
    return out.length > 0 ? out : undefined
}

/** Our sparse `{ "0": 120 }` map → VTable's config array. Column key is the index. */
export function toVTableColumnWidths(
    columnWidths: Record<string, number> | undefined,
): VTableSheetDefine["columnWidthConfig"] {
    if (!columnWidths) return undefined
    const out: { key: number; width: number }[] = []
    for (const [column, width] of Object.entries(columnWidths)) {
        const index = Number(column)
        if (!Number.isFinite(index) || !Number.isFinite(width) || width <= 0) continue
        out.push({ key: index, width })
    }
    return out.length > 0 ? out : undefined
}

/** Our sparse `{ "3": 40 }` map → VTable's config array. */
export function toVTableRowHeights(
    rowHeights: Record<string, number> | undefined,
): VTableSheetDefine["rowHeightConfig"] {
    if (!rowHeights) return undefined
    const out: { key: number; height: number }[] = []
    for (const [row, height] of Object.entries(rowHeights)) {
        const index = Number(row)
        if (!Number.isFinite(index) || !Number.isFinite(height) || height <= 0) continue
        out.push({ key: index, height })
    }
    return out.length > 0 ? out : undefined
}

/** Inverse of {@link toVTableColumnWidths}. */
export function fromVTableColumnWidths(
    config: VTableSheetDefine["columnWidthConfig"],
): Record<string, number> | undefined {
    if (!config || config.length === 0) return undefined
    const out: Record<string, number> = {}
    for (const entry of config) {
        const index = Number(entry?.key)
        if (!Number.isFinite(index)) continue
        out[String(index)] = entry.width
    }
    return Object.keys(out).length > 0 ? out : undefined
}

/** Inverse of {@link toVTableRowHeights}. */
export function fromVTableRowHeights(
    config: VTableSheetDefine["rowHeightConfig"],
): Record<string, number> | undefined {
    if (!config || config.length === 0) return undefined
    const out: Record<string, number> = {}
    for (const entry of config) {
        const index = Number(entry?.key)
        if (!Number.isFinite(index)) continue
        out[String(index)] = entry.height
    }
    return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Extract `"A1" → "=…"` entries from a value matrix.
 *
 * VTable's formula engine reads formulas out of the cell data itself, so the
 * matrix is the source of truth; this exists for callers that need the same
 * shape our `SheetData.rows` already implies (and for asserting that a formula
 * survived a round trip).
 */
export function extractFormulas(rows: CellValue[][]): Record<string, string> {
    const out: Record<string, string> = {}
    rows.forEach((row, rowIndex) => {
        ;(row ?? []).forEach((value, columnIndex) => {
            if (typeof value !== "string" || !value.startsWith("=")) return
            out[`${columnLabel(columnIndex)}${rowIndex + 1}`] = value
        })
    })
    return out
}

/** Copy the matrix so the engine can write through it without touching the payload.
 *
 * The engine keeps the array it is handed and writes display values into it. While
 * we were passing `sheet.rows` by reference, `applyFormulas` writing a computed
 * result for `=SUM(B1:B5)` overwrote the formula *in the document's own rows* —
 * visible through `storedRows()` before any save had even run, and gone for good
 * on the next snapshot. Rows and cells are both copied, since the engine writes
 * per cell. See docs/VTABLE_MIGRATION.md §5.
 */
export function cloneRows(rows: readonly (readonly unknown[])[]): CellValue[][] {
    return rows.map((row) => (Array.isArray(row) ? (row.slice() as CellValue[]) : []))
}

/**
 * Workbook → engine sheets.
 *
 * Note what is *not* translated here: cell styles and number formats. Both need
 * a live engine instance to apply (VTable has no style option on the sheet
 * definition, and no number-format API at all — see
 * docs/VTABLE_REFERENCE.md §2), so the adapter applies them after mount rather
 * than smuggling them through the constructor.
 */
export function workbookToSheetDefines(workbook: WorkbookData): VTableSheetDefine[] {
    return workbook.sheets.map((sheet, index) => {
        const columnCount = Math.max(sheet.columnCount, 1)
        const rowCount = Math.max(sheet.rowCount, sheet.rows.length, 1)
        return {
            sheetTitle: sheet.name || `Sheet${index + 1}`,
            sheetKey: String(index),
            rowCount,
            columnCount,
            data: cloneRows(sheet.rows),
            ...(index === workbook.activeSheet ? { active: true } : {}),
            ...(toVTableMerges(sheet.merges) ? { cellMerge: toVTableMerges(sheet.merges) } : {}),
            ...(toVTableColumnWidths(sheet.columnWidths)
                ? { columnWidthConfig: toVTableColumnWidths(sheet.columnWidths) }
                : {}),
            ...(toVTableRowHeights(sheet.rowHeights)
                ? { rowHeightConfig: toVTableRowHeights(sheet.rowHeights) }
                : {}),
            // Recorded so the adapter can lock generated sheets, which VTable has
            // no native notion of.
            ...(sheet.pivot ? { _generated: true } : {}),
        }
    })
}

/**
 * Engine sheet → persisted `SheetData` fields that come back *from* the engine.
 *
 * Values, styles and number-format bookkeeping are supplied by the caller: they
 * come from the live grid (via `getData` / style capture) rather than from the
 * definition we handed the engine, which is why this returns only the layout
 * half of `SheetData`.
 */
export function sheetDefineLayout(sheet: {
    cellMerge?: VTableSheetDefine["cellMerge"]
    columnWidthConfig?: VTableSheetDefine["columnWidthConfig"]
    rowHeightConfig?: VTableSheetDefine["rowHeightConfig"]
    rowCount?: number
    columnCount?: number
}): {
    merges?: SheetMerges
    columnWidths?: Record<string, number>
    rowHeights?: Record<string, number>
    rowCount?: number
    columnCount?: number
} {
    return {
        ...(fromVTableMerges(sheet.cellMerge) ? { merges: fromVTableMerges(sheet.cellMerge) } : {}),
        ...(fromVTableColumnWidths(sheet.columnWidthConfig)
            ? { columnWidths: fromVTableColumnWidths(sheet.columnWidthConfig) }
            : {}),
        ...(fromVTableRowHeights(sheet.rowHeightConfig)
            ? { rowHeights: fromVTableRowHeights(sheet.rowHeightConfig) }
            : {}),
        ...(typeof sheet.rowCount === "number" ? { rowCount: sheet.rowCount } : {}),
        ...(typeof sheet.columnCount === "number" ? { columnCount: sheet.columnCount } : {}),
    }
}

/**
 * True when an `"A1"` reference is inside the given bounds. Used when filtering
 * captured styles back down to a sheet's live extent.
 */
export function isRefInBounds(ref: string, rowCount: number, columnCount: number): boolean {
    const position = parseA1(ref)
    if (!position) return false
    return position.row < rowCount && position.column < columnCount
}

/**
 * Normalise whatever `VTableSheet.saveToConfig()` returns into sheet definitions.
 *
 * Its declared return type is the whole `IVTableSheetOptions` object (i.e.
 * `{ sheets: [...] }`), **not** an array. Treating the result as an array made the
 * adapter's snapshot throw on `config.find`, which silently dropped styles and
 * merges from every save — the failure looked like "formatting is not persisted"
 * rather than like a type error. Both shapes are accepted so an engine change in
 * either direction degrades instead of losing data.
 */
export function normalizeSavedConfig(
    saved: unknown,
): VTableSheetDefine[] {
    if (Array.isArray(saved)) return saved as VTableSheetDefine[]
    if (saved && typeof saved === 'object') {
        const sheets = (saved as { sheets?: unknown }).sheets
        if (Array.isArray(sheets)) return sheets as VTableSheetDefine[]
    }
    return []
}
