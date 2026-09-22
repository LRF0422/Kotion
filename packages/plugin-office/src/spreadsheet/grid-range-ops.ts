import type { CellValue, WorkbookData } from "./workbook-data"

/**
 * Pure range operations for the engine adapters.
 *
 * These are the semantics behind `GridApi.readRange` / `writeRange` and the
 * `applyExternalData` echo check. They hold no engine state, which is what lets
 * them be unit-tested — the AI tools and the Excel import path depend on them
 * behaving exactly as they did under jspreadsheet.
 */

/** Read a rectangular block, padding short rows and normalising `undefined` → `null`. */
export function readRangeFrom(
    rows: CellValue[][],
    startRow: number,
    startColumn: number,
    endRow: number,
    endColumn: number,
): CellValue[][] {
    const out: CellValue[][] = []
    for (let row = startRow; row <= endRow; row += 1) {
        const line: CellValue[] = []
        for (let column = startColumn; column <= endColumn; column += 1) {
            const value = rows[row]?.[column]
            line.push(value === undefined ? null : value)
        }
        out.push(line)
    }
    return out
}

/** A single cell, or `null` outside the data. */
export function readCellFrom(rows: CellValue[][], row: number, column: number): CellValue {
    const value = rows[row]?.[column]
    return value === undefined ? null : value
}

export interface MatrixWriteResult {
    /** The rows to apply, already clamped to the sheet ceiling. */
    matrix: CellValue[][]
    /** Rows required to hold the write. */
    requiredRows: number
    /** Columns required to hold the write. */
    requiredColumns: number
    /** Cells actually written (non-null within bounds). */
    written: number
}

/**
 * Prepare a matrix for a write at `(startRow, startColumn)`.
 *
 * `null` marks "leave this cell alone" — it is a sparse patch, not a blanking
 * write. That is what the fill handle and the AI tools rely on, and it is why a
 * `null` does not count towards `written`.
 */
export function prepareMatrixWrite(
    matrix: CellValue[][],
    startRow: number,
    startColumn: number,
    maxRows: number,
    maxColumns: number,
): MatrixWriteResult {
    const width = matrix.reduce((max, row) => Math.max(max, row?.length ?? 0), 0)
    if (width === 0 || matrix.length === 0) {
        return { matrix: [], requiredRows: 0, requiredColumns: 0, written: 0 }
    }

    let written = 0
    const clamped: CellValue[][] = matrix.map((row, rowOffset) => {
        const target: CellValue[] = []
        for (let columnOffset = 0; columnOffset < (row?.length ?? 0); columnOffset += 1) {
            const value = row[columnOffset]
            const rowIndex = startRow + rowOffset
            const columnIndex = startColumn + columnOffset
            if (value === null || value === undefined) {
                target.push(null)
                continue
            }
            if (rowIndex >= maxRows || columnIndex >= maxColumns) {
                target.push(null)
                continue
            }
            target.push(value)
            written += 1
        }
        return target
    })

    return {
        matrix: clamped,
        requiredRows: startRow + matrix.length,
        requiredColumns: startColumn + width,
        written,
    }
}

/**
 * How the adapter should react to a payload arriving from outside the view.
 *
 * The caller supplies the fingerprints rather than this module computing them:
 * `workbookContentKey` lives in `workbook-data`, and importing it here would
 * make this module unloadable by the Node test runner (see the note in
 * vtable-config.ts). The hook already keeps the applied key, so it is free.
 *
 * - `echo` — this view produced it (the round trip through the node attributes
 *   came back unchanged). Re-rendering would fight the live grid and drop the
 *   caret, so it must be ignored.
 * - `apply` — someone else changed it; the grid has to be rebuilt.
 * - `ignore` — nothing to do.
 */
export type ExternalDataDecision = 'echo' | 'apply' | 'ignore'

export function decideExternalData(
    incoming: WorkbookData | null | undefined,
    incomingKey: string,
    persistedIdentity: WorkbookData | null | undefined,
    appliedKey: string,
): ExternalDataDecision {
    if (!incoming) return 'ignore'
    // The exact object we last handed to `onSave`. This is the check that matters
    // for our own round trip: the view stores what we persisted and React hands
    // that same object back, whereas the *key* comparison below can miss it — the
    // payload React is holding may still be an older revision at that moment, and
    // treating it as external re-seeds tracked state (which reverted an unmerge).
    if (incoming === persistedIdentity) return 'echo'
    // A different object with the same content: the same save, re-created by a
    // serialisation round trip through the document.
    if (incomingKey === appliedKey) return 'echo'
    return 'apply'
}

/**
 * Merge a sheet-level `active` flag into a set of engine sheet definitions.
 *
 * The engine takes the active sheet as a property of each definition, whereas
 * our model keeps one index on the workbook; a mismatch leaves the user looking
 * at a different sheet after a reload.
 */
export function activeSheetIndexFrom(
    sheets: ReadonlyArray<{ active?: boolean }>,
    fallback: number,
): number {
    const index = sheets.findIndex((sheet) => sheet.active)
    if (index >= 0) return index
    return Math.max(0, Math.min(fallback, Math.max(sheets.length - 1, 0)))
}
