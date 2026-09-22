import type { CellValue, NumberFormatKind } from "./workbook-data"
import type { NumberMeta } from "./grid-api"

/**
 * Parse a cell the user considers numeric, tolerating the decorations a format
 * adds (`"12.50%"`, `"¥12.50"`, `"1,234.5"`, `"１２３"`).
 *
 * A string with no digit at all is **not** numeric. That matters more than it
 * looks: this decision gates both "does applying a number format to this cell do
 * anything" and the save-time bookkeeping, so a text cell must be a no-op rather
 * than formatted. Stripping every non-numeric character first (the previous
 * approach) turned `"物料A"`, `"abc"` and even `"   "` into `0`, which then
 * rendered as `"0.00%"`.
 */
export function numericValue(value: CellValue | undefined): number | null {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'boolean') return value ? 1 : 0

    const text = String(value).trim()
    if (text === '') return null
    // Require at least one digit (ASCII or full-width) before accepting anything.
    if (!/\d/.test(text) && !/[０-９]/.test(text)) return null

    const normalized = text
        // Full-width digits and a leading full-width minus are what an IME produces.
        // `String.fromCharCode`, not `String`: the latter renders the code
        // point in decimal ('4','9' for '１') instead of the digit '1'.
        .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
        .replace(/[－−]/g, '-')
        // Grouping separators: ASCII and the full-width comma.
        .replace(/[,\uFF0C]/g, '')
        // Currency symbols and percent signs are decorations; percentage scaling
        // is the number format's job, not the value's.
        .replace(/[¥$€£%]/g, '')
        .trim()

    if (normalized === '' || normalized === '-' || normalized === '+') return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
}

export function currencySymbol(): string {
    return typeof navigator !== 'undefined' && navigator.language?.startsWith('zh') ? '¥' : '$'
}

/** Render a formatted display string from a number + format kind. */
export function formatNumeric(value: number, kind: NumberFormatKind): string {
    switch (kind) {
        case 'decimal':
            return value.toFixed(2)
        case 'percent':
            return `${(value * 100).toFixed(2)}%`
        case 'currency':
            return `${currencySymbol()}${value.toFixed(2)}`
        default:
            return String(value)
    }
}


/**
 * Number formatting for the engine adapters.
 *
 * Neither engine has a number-format API (jspreadsheet stores rendered strings;
 * VTable has only formatter callbacks — see docs/VTABLE_REFERENCE.md §2), so the
 * persisted model carries the work: `numberFormats` says which format produced a
 * cell's *display* text and `rawValues` keeps the value it was applied to. That
 * is what makes the operation reversible (`general` restores the number rather
 * than the string) and idempotent (percent is never applied twice).
 *
 * This module is the forward half — turning a raw value into the display text a
 * grid should show. `grid-utils.captureNumberFormats` is the reverse half, run
 * on save to drop formats the user has typed over.
 */

/** Apply a format to a value for display. `general` (and non-numerics) pass through. */
export function formatCellDisplay(value: CellValue, kind: NumberFormatKind): CellValue {
    if (kind === 'general') return value
    const numeric = numericValue(value)
    if (numeric === null) return value
    return formatNumeric(numeric, kind)
}

/**
 * Result of formatting one cell: what to show, and what to remember so the
 * operation can be undone later.
 */
export interface FormattedCell {
    display: CellValue
    /** The unformatted value, present only when a format was actually applied. */
    raw?: CellValue
    /** The format that produced `display`. */
    kind: NumberFormatKind
}

/**
 * Format one cell, reporting the bookkeeping the caller should store.
 *
 * - Applying `general` to a cell that carries a stored `raw` restores the number
 *   and tells the caller to forget the entry (`raw`/`kind` absent).
 * - Applying a format to a cell that carries no stored `raw` remembers the
 *   *current* value — which is the display text only if it was never formatted,
 *   so re-formatting a formatted cell does not compound.
 * - A non-numeric value is left alone and nothing is remembered, matching the
 *   jspreadsheet behaviour this replaces (formatting text is a no-op).
 */
export function formatCell(
    value: CellValue,
    kind: NumberFormatKind,
    stored?: { raw?: CellValue; kind?: NumberFormatKind },
): FormattedCell {
    const source = stored?.raw !== undefined ? stored.raw : value
    const numeric = numericValue(source)

    if (numeric === null) {
        // Nothing to format. `general` still clears any stale bookkeeping.
        return kind === 'general' ? { display: value, kind } : { display: value, kind: 'general' }
    }

    if (kind === 'general') {
        // Reversible: restore the number the format was hiding.
        return stored?.raw !== undefined
            ? { display: stored.raw, kind: 'general' }
            : { display: value, kind: 'general' }
    }

    return { display: formatNumeric(numeric, kind), raw: source, kind }
}

/**
 * Row-major matrix of display values for a sheet, for seeding an engine that
 * stores rendered strings.
 *
 * `numberFormats`/`rawValues` are keyed by A1 reference (`"B3"`), 1-based rows;
 * `toColumnLabel` is injected so this module needs no runtime imports (it has to
 * stay loadable by the Node test runner).
 *
 * `_rawValues` is accepted but unused: recovering the pre-format value is
 * `captureNumberFormats`' job, and formatting only needs the current display
 * text. It stays in the signature because the two are a pair.
 */
export function applyNumberFormats(
    rows: CellValue[][],
    numberFormats: Record<string, NumberFormatKind> | undefined,
    _rawValues: Record<string, CellValue> | undefined,
    toColumnLabel: (column: number) => string,
): CellValue[][] {
    if (!numberFormats || Object.keys(numberFormats).length === 0) return rows
    return rows.map((row, rowIndex) => row.map((value, columnIndex) => {
        const ref = `${toColumnLabel(columnIndex)}${rowIndex + 1}`
        const kind = numberFormats[ref]
        if (!kind || kind === 'general') return value
        return formatCellDisplay(value, kind)
    }))
}

/** Round a display string back to a number, for engines that store numbers. */
export function displayToNumeric(display: CellValue): number | null {
    return numericValue(display)
}

/**
 * Keep the number-format bookkeeping and drop entries whose display no longer
 * matches (i.e. the user typed over the formatted cell), so a later re-format
 * never double-converts.
 */
export function captureNumberFormats(rows: CellValue[][], meta: NumberMeta | undefined): NumberMeta {
    if (!meta) return { numberFormats: {}, rawValues: {} }
    const numberFormats: Record<string, NumberFormatKind> = {}
    const rawValues: Record<string, CellValue> = {}
    for (const [ref, kind] of Object.entries(meta.numberFormats)) {
        const position = parseCellRef(ref)
        if (!position) continue
        const raw = meta.rawValues[ref]
        const numeric = numericValue(raw)
        if (numeric === null) continue
        if (String(rows[position.row]?.[position.column] ?? '') !== formatNumeric(numeric, kind)) continue
        numberFormats[ref] = kind
        rawValues[ref] = raw
    }
    return { numberFormats, rawValues }
}

/** `"B3"` → `{ row: 2, column: 1 }`, or null when malformed. Inlined: this module must stay loadable by the Node test runner. */
function parseCellRef(ref: string): { row: number; column: number } | null {
    const match = String(ref ?? "").trim().match(/^([A-Za-z]+)(\d+)$/)
    if (!match) return null
    let column = 0
    const letters = match[1]!.toUpperCase()
    for (let i = 0; i < letters.length; i += 1) column = column * 26 + (letters.charCodeAt(i) - 64)
    column -= 1
    const row = Number.parseInt(match[2]!, 10) - 1
    if (row < 0 || column < 0) return null
    return { row, column }
}
