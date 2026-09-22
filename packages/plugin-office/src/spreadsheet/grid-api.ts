import type { CellStyles, CellValue, NumberFormatKind, WorkbookData } from "./workbook-data"

/**
 * The spreadsheet contract the rest of the feature codes against.
 *
 * This is deliberately engine-agnostic and moved out of `useJspreadsheet.ts` so
 * the engine can be replaced (jspreadsheet-ce -> VTableSheet, see
 * docs/VTABLE_MIGRATION.md) without touching the toolbar, formula bar, pivot
 * dialogs, the AI tools or the node persistence path. Those all consume this
 * interface and nothing else:
 *
 *   - `SheetToolbar`, `SheetFormulaBar`, `PivotDialog`, `PivotDetailsDialog`
 *     take a `GridApi`
 *   - `SpreadsheetView` is the only module that constructs one
 *
 * Two rules keep the boundary honest:
 *
 * 1. **Coordinates are always (row, column) and 0-based.** Engines disagree —
 *    VTable's `WorkSheet.getCellValue` is (col, row) — so an adapter must
 *    translate rather than leak the engine's order.
 * 2. **Ranges are inclusive on both ends**, matching the persisted data model.
 */
export interface GridSelection {
    startRow: number
    startColumn: number
    endRow: number
    endColumn: number
}

export interface GridApi {
    /** Full workbook snapshot, always current (values + styles + layout). */
    getSnapshot(): WorkbookData | null
    /** Current selection in 0-based coordinates, or null before the grid exists. */
    getSelection(): GridSelection | null
    /** 0-based index of the worksheet the user is looking at. */
    getActiveSheetIndex(): number
    /** Apply CSS declarations (e.g. `{ 'font-weight': 'bold' }`) to the selection. */
    applyStyle(style: Record<string, string | null>): void
    /** Merge / unmerge the current selection. */
    toggleMerge(): void
    /** Apply a number format to the selection (reversible; `general` resets it). */
    applyNumberFormat(kind: NumberFormatKind): void
    /** Move the selection (formula-bar name box, AI navigation). */
    selectRange(startRow: number, startColumn: number, endRow: number, endColumn: number): void
    /** Styles of the selection's anchor cell, for toolbar state. */
    getSelectionStyle(): Record<string, string>
    /** History. */
    undo(): void
    redo(): void
    /** Read a rectangular block of values. */
    readRange(sheetIndex: number, startRow: number, startColumn: number, endRow: number, endColumn: number): CellValue[][]
    /** Write a block, growing the grid when needed. Returns cells written, or null when the sheet is gone. */
    writeRange(
        sheetIndex: number,
        startRow: number,
        startColumn: number,
        matrix: CellValue[][],
        options?: { show?: boolean },
    ): number | null
    /** Read a single cell. */
    readCell(sheetIndex: number, row: number, column: number): CellValue
    /** Persist the live grid into node attributes, right now. */
    flush(): void
    /** Replace everything (Excel import, external/AI data). */
    replaceAll(next: WorkbookData): void
    /** Apply payload that changed outside this view; ignores exact echoes. */
    applyExternalData(incoming: WorkbookData): void
    /** False until the grid exists. */
    isReady: boolean
}

/**
 * Per-sheet number-format bookkeeping.
 *
 * The engine stores only rendered strings, so a format has to be applied to the
 * *display* value while remembering the original (`rawValues`) and which format
 * produced it (`numberFormats`). That is what makes the operation reversible
 * (`general` restores the raw value) and idempotent (percent is never applied
 * twice). Any engine adapter must carry this model, because the engines have no
 * number-format API of their own — see docs/VTABLE_REFERENCE.md §2.
 */
export interface NumberMeta {
    numberFormats: Record<string, NumberFormatKind>
    rawValues: Record<string, CellValue>
}

/** Style keys carried in `SheetData.styles` are CSS declaration text. */
export type CellStyleMap = CellStyles
