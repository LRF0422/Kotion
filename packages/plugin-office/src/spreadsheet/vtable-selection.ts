import type { GridSelection } from "./grid-api"

/**
 * Range and selection translation for the VTableSheet adapter.
 *
 * VTable is inconsistent about axis naming, and the adapter has to absorb that
 * rather than let it leak:
 *
 * - its *coordinate* parameters are `(col, row)` — e.g. `getCellValue(col, row)`
 * - its *range* objects are `CellRange { startRow, startCol, endRow, endCol }`
 * - its *position* objects are `{ col?, row? }`
 *
 * Ours is `GridSelection { startRow, startColumn, endRow, endColumn }`, always
 * (row, column) and always inclusive. Getting one of these wrong transposes the
 * grid silently, so every crossing point goes through this module.
 *
 * Kept free of runtime imports so the Node test runner can load it (see the note
 * in vtable-config.ts).
 */

/** VTable's `CellRange`. */
export interface VTableCellRange {
    startRow: number
    startCol: number
    endRow: number
    endCol: number
}

/** Our inclusive bounds, in our own axis order. */
export interface InclusiveBounds {
    startRow: number
    startColumn: number
    endRow: number
    endColumn: number
}

/** True when a value looks like a VTable `CellRange` (rather than a position). */
export function isCellRange(value: unknown): value is VTableCellRange {
    if (!value || typeof value !== "object") return false
    const candidate = value as Record<string, unknown>
    return (
        typeof candidate.startRow === "number"
        && typeof candidate.startCol === "number"
        && typeof candidate.endRow === "number"
        && typeof candidate.endCol === "number"
    )
}

/**
 * VTable selection/reported range → our bounds.
 *
 * VTable reports a drag selection in whatever order the user dragged, so the
 * corners are normalised here. A degenerate range (`start === end`) is valid and
 * describes a single cell.
 */
export function fromVTableRange(range: VTableCellRange | null | undefined): GridSelection | null {
    if (!range || !isCellRange(range)) return null
    return {
        startRow: Math.min(range.startRow, range.endRow),
        endRow: Math.max(range.startRow, range.endRow),
        startColumn: Math.min(range.startCol, range.endCol),
        endColumn: Math.max(range.startCol, range.endCol),
    }
}

/** Our bounds → VTable's range object. */
export function toVTableRange(bounds: InclusiveBounds): VTableCellRange {
    return {
        startRow: bounds.startRow,
        startCol: bounds.startColumn,
        endRow: bounds.endRow,
        endCol: bounds.endColumn,
    }
}

/**
 * Our bounds → VTable's `{ col, row }` position for a single cell.
 *
 * Only meaningful for a single cell: `arrangeCustomCellStyle` accepts a position
 * *or* a range, and passing a position for a multi-cell selection would style
 * one corner and silently drop the rest.
 */
export function topLeftPosition(bounds: InclusiveBounds): { col: number; row: number } {
    return { col: bounds.startColumn, row: bounds.startRow }
}

/** Number of cells in an inclusive range. */
export function cellCount(bounds: InclusiveBounds): number {
    return (bounds.endRow - bounds.startRow + 1) * (bounds.endColumn - bounds.startColumn + 1)
}

/**
 * Iterate an inclusive range in row-major order, calling `visit(row, column)`.
 *
 * The adapter uses this to walk a selection when it has to apply something
 * cell-by-cell (number formats, which have no range API).
 */
export function forEachCell(
    bounds: InclusiveBounds,
    visit: (row: number, column: number) => void,
): void {
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
            visit(row, column)
        }
    }
}

/**
 * Clamp bounds to a sheet's extent.
 *
 * A selection can outlive the data that justified it (rows deleted, a payload
 * swapped underneath). VTable does not bounds-check programmatic writes, so the
 * adapter clamps first and counts what it actually wrote.
 */
export function clampBounds(
    bounds: InclusiveBounds,
    rowCount: number,
    columnCount: number,
): InclusiveBounds | null {
    if (rowCount <= 0 || columnCount <= 0) return null
    const startRow = Math.max(0, Math.min(bounds.startRow, rowCount - 1))
    const startColumn = Math.max(0, Math.min(bounds.startColumn, columnCount - 1))
    const endRow = Math.max(startRow, Math.min(bounds.endRow, rowCount - 1))
    const endColumn = Math.max(startColumn, Math.min(bounds.endColumn, columnCount - 1))
    return { startRow, startColumn, endRow, endColumn }
}

/**
 * Our zero-based bounds → `"A1:C3"` for VTable APIs that take a range spec.
 * A single cell collapses to `"A1"` rather than `"A1:A1"`.
 */
export function rangeToA1(bounds: InclusiveBounds): string {
    const from = `${columnLabel(bounds.startColumn)}${bounds.startRow + 1}`
    if (bounds.startRow === bounds.endRow && bounds.startColumn === bounds.endColumn) return from
    return `${from}:${columnLabel(bounds.endColumn)}${bounds.endRow + 1}`
}

/** 0-based column index → letter label. Inlined; see the note in vtable-config.ts. */
function columnLabel(index: number): string {
    let label = ""
    let value = index
    while (value >= 0) {
        label = String.fromCharCode((value % 26) + 65) + label
        value = Math.floor(value / 26) - 1
    }
    return label
}
