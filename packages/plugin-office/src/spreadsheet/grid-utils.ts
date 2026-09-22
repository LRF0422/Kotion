import type {
    CellValue,
    SheetData,
    WorkbookData,
} from "./workbook-data"
import type { NumberMeta } from "./grid-api"

// Re-exported so a caller that only needs the helpers can import the bookkeeping
// type from the same module.
export type { NumberMeta } from "./grid-api"

// The numeric helpers live in `number-format.ts` (they are its runtime
// primitives and that module must stay import-free for the Node test runner).
// Re-exported here because they are conceptually part of this toolbox and are
// imported from here by the jspreadsheet adapter.
export { currencySymbol, formatNumeric, numericValue } from "./number-format"
/**
 * Engine-agnostic helpers shared by any spreadsheet engine adapter.
 *
 * Everything here is pure: it operates on the persisted `WorkbookData` model and
 * on plain value matrices, never on a grid instance or its DOM. That is what
 * lets the engine be swapped (see docs/VTABLE_MIGRATION.md) while the value,
 * style and number-format semantics stay identical.
 */

/** Row/column ceiling for a single grid, so a stray paste cannot hang the tab. */
export const MAX_ROWS = 10_000
export const MAX_COLUMNS = 256

/** CSS declaration object → `"a: b; c: d"` text. */
export function styleToText(style: Record<string, string>): string {
    return Object.entries(style)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ')
}

/** `"a: b; c: d"` text → CSS declaration object. */
export function textToStyle(text: string): Record<string, string> {
    const out: Record<string, string> = {}
    String(text).split(';').forEach((part) => {
        const index = part.indexOf(':')
        if (index <= 0) return
        const key = part.slice(0, index).trim()
        const value = part.slice(index + 1).trim()
        if (key && value) out[key] = value
    })
    return out
}

export function clampMatrix(matrix: CellValue[][]): CellValue[][] {
    return matrix.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS))
}

/** Drop trailing empty rows/columns so two matrices compare structurally. */
export function trimMatrix(matrix: CellValue[][]): CellValue[][] {
    const out = matrix.map((row) => {
        const copy = (row ?? []).slice()
        while (copy.length > 0 && (copy[copy.length - 1] === null || copy[copy.length - 1] === undefined || copy[copy.length - 1] === '')) {
            copy.pop()
        }
        return copy
    })
    while (out.length > 0 && out[out.length - 1].length === 0) out.pop()
    return out
}

/** True when two value matrices hold the same used cells. */
export function sameMatrix(a: CellValue[][], b: CellValue[][]): boolean {
    return JSON.stringify(trimMatrix(a)) === JSON.stringify(trimMatrix(b))
}

/**
 * Sheets that feed a pivot. Their values must be read *computed* (a formula
 * cell contributes its result, not "=SUM(...)" text) — the persisted payload
 * still keeps the formula so the document round-trips.
 */
export function pivotSourceIndices(workbook: WorkbookData): Set<number> {
    const indices = new Set<number>()
    workbook.sheets.forEach((sheet) => {
        sheet.pivot?.sources.forEach((source) => indices.add(source.sheet))
    })
    return indices
}

export function sheetNumberMeta(sheet: SheetData): NumberMeta {
    return {
        numberFormats: { ...(sheet.numberFormats ?? {}) },
        rawValues: { ...(sheet.rawValues ?? {}) },
    }
}

/** True when a payload already carries values, styles or structure worth keeping. */
export function payloadHasContent(workbook: WorkbookData | null): boolean {
    if (!workbook) return false
    return workbook.sheets.some((sheet) => {
        if (sheet.styles && Object.keys(sheet.styles).length > 0) return true
        if (sheet.numberFormats && Object.keys(sheet.numberFormats).length > 0) return true
        if (sheet.merges && sheet.merges.length > 0) return true
        return sheet.rows.some((row) => row.some((value) => value !== null && value !== undefined && value !== ''))
    })
}
