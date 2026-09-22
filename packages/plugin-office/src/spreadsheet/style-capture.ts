import type { CellStyles } from "./workbook-data"

/**
 * Style capture for the engine adapters.
 *
 * Styled cells are persisted sparsely (`"A1" → "font-weight: bold"`), and the
 * payload is bounded: an all-cells-styled 10k-row sheet would otherwise put
 * megabytes of declarations into the document on every save.
 *
 * The iteration is pure — it takes a reader callback — so the bounding and
 * key-building rules are unit-testable without an engine.
 */

/**
 * Styles of at most this many cells are persisted, bounding the payload size.
 * Matches the jspreadsheet adapter's budget so documents do not change size
 * characteristics across the swap.
 */
export const MAX_STYLED_CELLS = 2_000

export interface CaptureStylesResult {
    styles: CellStyles | undefined
    /** True when the cap was hit and some formatting was not persisted. */
    truncated: boolean
}

/**
 * Walk a sheet's extent, collecting the non-empty style of each cell.
 *
 * @param rowCount   rows to inspect (clamped by the caller to the sheet extent)
 * @param columnCount columns to inspect
 * @param read       `(row, column) => cssText | undefined`, the engine's reader
 * @param toRef      `(row, column) => "A1"`, injected so this module stays
 *                   free of runtime imports
 * @param limit      cap on persisted cells; defaults to {@link MAX_STYLED_CELLS}
 */
export function captureStylesFrom(
    rowCount: number,
    columnCount: number,
    read: (row: number, column: number) => string | undefined,
    toRef: (row: number, column: number) => string,
    limit: number = MAX_STYLED_CELLS,
): CaptureStylesResult {
    const styles: CellStyles = {}
    let count = 0
    let truncated = false

    for (let row = 0; row < rowCount; row += 1) {
        for (let column = 0; column < columnCount; column += 1) {
            const text = read(row, column)
            if (!text) continue
            if (count >= limit) {
                truncated = true
                break
            }
            styles[toRef(row, column)] = text
            count += 1
        }
        if (truncated) break
    }

    return { styles: count > 0 ? styles : undefined, truncated }
}

/** Prefix of the style ids this adapter registers (`kn-<A1 ref>`). */
export const STYLE_ID_PREFIX = "kn-"

/** The style id for a cell reference, shared by apply and capture. */
export function styleIdForRef(ref: string): string {
    return `${STYLE_ID_PREFIX}${ref}`
}

/**
 * Capture styles for a known set of styled cells only.
 *
 * Necessary because the engine's `getCellStyle()` returns a **fully resolved**
 * style for *every* cell — 27 keys including the table default
 * (`bgColor: '#FDFDFD'`, `textAlign: 'left'`, …). Sweeping the sheet by extent
 * therefore reports every cell as styled, which both misrepresents a plain sheet
 * as fully formatted and burns the {@link MAX_STYLED_CELLS} budget on defaults,
 * so the user's real formatting is the part that gets dropped.
 *
 * Tracking the cells we actually arranged sidesteps that entirely: a plain sheet
 * yields no styles, and the cap only limits deliberate formatting.
 */
export function captureTrackedStyles(
    refs: Iterable<string>,
    read: (ref: string) => string | undefined,
    limit: number = MAX_STYLED_CELLS,
): CaptureStylesResult {
    const styles: CellStyles = {}
    let count = 0
    let truncated = false
    for (const ref of refs) {
        if (count >= limit) {
            truncated = true
            break
        }
        const text = read(ref)
        if (!text) continue
        styles[ref] = text
        count += 1
    }
    return { styles: count > 0 ? styles : undefined, truncated }
}

/**
 * The tracked style set for a sheet, created on demand.
 *
 * Tracking has to be **per sheet**: an A1 ref alone is ambiguous across sheets,
 * so a single flat set makes every sheet report the same styled cells — and at
 * save time that copies one sheet's formatting onto all of them. Keeping the
 * selector here (rather than inline in the adapter) means a regression to a flat
 * set fails a unit test instead of shipping.
 */
export function trackedSetFor(
    sets: Array<Set<string>>,
    sheetIndex: number,
): Set<string> {
    const index = Math.max(0, sheetIndex)
    while (sets.length <= index) sets.push(new Set())
    return sets[index]!
}

/** Per-sheet tracked sets seeded from the formatting already in a payload. */
export function seedTrackedSets(
    sheets: ReadonlyArray<{ styles?: Record<string, string> }>,
): Array<Set<string>> {
    return sheets.map((sheet) => new Set(sheet.styles ? Object.keys(sheet.styles) : []))
}
