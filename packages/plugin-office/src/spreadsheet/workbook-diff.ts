/**
 * Incremental diff between two workbook snapshots.
 *
 * L3 moved the workbook out of the ProseMirror node and into the shared Y.Doc
 * (see workbook-store.ts). The store only needs the *changes* between the last
 * persisted snapshot and the new one, so this module turns two WorkbookData
 * values into a small list of cell / style / dimension / merge operations.
 *
 * Pure and unit-tested on purpose: it is the part of the L3 persistence path
 * that can be verified without a browser or a collaboration server.
 */
import type { CellValue, SheetMerges, WorkbookData } from './workbook-data'

/**
 * Resolve an A1 ref inline.
 *
 * A runtime import of workbook-data would make this module unloadable by the
 * Node test runner (relative imports are resolved literally, with no extension
 * guessing). vtable-config.ts inlines the same pair for the same reason.
 */
function parseA1(ref: string): { row: number; column: number } | null {
    const match = String(ref ?? '').trim().match(/^([A-Za-z]+)(\d+)$/)
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

export type GridChangeKind = 'value' | 'style' | 'numberFormat' | 'rawValue'

export interface WorkbookGridChange {
    sheet: number
    row: number
    column: number
    kind: GridChangeKind
    /** null deletes the entry. */
    value: CellValue | string | null
}

export interface WorkbookDimensionChange {
    sheet: number
    axis: 'column' | 'row'
    index: number
    /** null deletes the override and returns the axis to its default. */
    size: number | null
}

export interface WorkbookMergeChange {
    sheet: number
    merges: SheetMerges | undefined
}

export interface WorkbookMetaChange {
    sheet: number
    name: string
    rowCount: number
    columnCount: number
}

export interface WorkbookDiff {
    grid: WorkbookGridChange[]
    dimensions: WorkbookDimensionChange[]
    merges: WorkbookMergeChange[]
    meta: WorkbookMetaChange[]
    activeSheet: number | null
    /**
     * Sheet count or order changed. The store has no stable per-sheet identity
     * beyond the index, so callers rebuild the sheet structure rather than patch.
     */
    structureChanged: boolean
}

export function isEmptyDiff(diff: WorkbookDiff): boolean {
    return (
        diff.grid.length === 0 &&
        diff.dimensions.length === 0 &&
        diff.merges.length === 0 &&
        diff.meta.length === 0 &&
        diff.activeSheet === null &&
        !diff.structureChanged
    )
}

/** Compare the last persisted workbook with the live one. */
export function diffWorkbook(previous: WorkbookData | null, next: WorkbookData): WorkbookDiff {
    const diff: WorkbookDiff = {
        grid: [],
        dimensions: [],
        merges: [],
        meta: [],
        activeSheet: null,
        structureChanged: false,
    }
    if (!previous || previous.sheets.length !== next.sheets.length) {
        diff.structureChanged = true
        return diff
    }
    next.sheets.forEach((sheet, index) => {
        const before = previous.sheets[index]
        if (!before) {
            diff.structureChanged = true
            return
        }
        if (
            before.name !== sheet.name ||
            before.rowCount !== sheet.rowCount ||
            before.columnCount !== sheet.columnCount
        ) {
            diff.meta.push({
                sheet: index,
                name: sheet.name,
                rowCount: sheet.rowCount,
                columnCount: sheet.columnCount,
            })
        }
        diffValues(before.rows, sheet.rows, index, diff)
        diffRefMap(before.styles, sheet.styles, index, 'style', diff)
        diffRefMap(before.numberFormats, sheet.numberFormats, index, 'numberFormat', diff)
        diffRefMap(before.rawValues, sheet.rawValues, index, 'rawValue', diff)
        diffDimensionMap(before.columnWidths, sheet.columnWidths, index, 'column', diff)
        diffDimensionMap(before.rowHeights, sheet.rowHeights, index, 'row', diff)
        if (!sameMerges(before.merges, sheet.merges)) {
            diff.merges.push({ sheet: index, merges: sheet.merges })
        }
    })
    if (previous.activeSheet !== next.activeSheet) diff.activeSheet = next.activeSheet
    return diff
}

function diffValues(
    before: CellValue[][],
    after: CellValue[][],
    sheet: number,
    diff: WorkbookDiff,
): void {
    const rowCount = Math.max(before.length, after.length)
    for (let row = 0; row < rowCount; row += 1) {
        const previousRow = before[row] ?? []
        const nextRow = after[row] ?? []
        const columnCount = Math.max(previousRow.length, nextRow.length)
        for (let column = 0; column < columnCount; column += 1) {
            const previousValue = previousRow[column] ?? null
            const nextValue = nextRow[column] ?? null
            if (previousValue !== nextValue) {
                diff.grid.push({ sheet, row, column, kind: 'value', value: nextValue })
            }
        }
    }
}

function diffRefMap(
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
    sheet: number,
    kind: GridChangeKind,
    diff: WorkbookDiff,
): void {
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
    for (const ref of keys) {
        const previousValue = before?.[ref]
        const nextValue = after?.[ref]
        if (previousValue === nextValue) continue
        const position = parseA1(ref)
        if (!position) continue
        diff.grid.push({
            sheet,
            row: position.row,
            column: position.column,
            kind,
            value: (nextValue ?? null) as CellValue | string | null,
        })
    }
}

function diffDimensionMap(
    before: Record<string, number> | undefined,
    after: Record<string, number> | undefined,
    sheet: number,
    axis: 'column' | 'row',
    diff: WorkbookDiff,
): void {
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
    for (const key of keys) {
        const previousValue = before?.[key]
        const nextValue = after?.[key]
        if (previousValue === nextValue) continue
        const index = Number(key)
        if (!Number.isFinite(index)) continue
        diff.dimensions.push({ sheet, axis, index, size: nextValue ?? null })
    }
}

function sameMerges(a: SheetMerges | undefined, b: SheetMerges | undefined): boolean {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    return JSON.stringify(a) === JSON.stringify(b)
}
