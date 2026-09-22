/**
 * Number-format semantics.
 *
 * Neither engine formats numbers, so the persisted `numberFormats` / `rawValues`
 * pair is what makes the feature reversible and idempotent. Both halves live in
 * `number-format.ts` and are pinned here: the forward half (raw → display) when
 * seeding a grid, and the reverse half (`captureNumberFormats`) when saving.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    applyNumberFormats,
    captureNumberFormats,
    displayToNumeric,
    formatCell,
    formatCellDisplay,
    numericValue,
} from '../src/spreadsheet/number-format.ts'

/** 0-based column → letter. Spelled out so the fixture cannot drift from src. */
function label(column: number): string {
    let out = ''
    let value = column
    while (value >= 0) {
        out = String.fromCharCode((value % 26) + 65) + out
        value = Math.floor(value / 26) - 1
    }
    return out
}

test('general is a pass-through', () => {
    assert.equal(formatCellDisplay(12.345, 'general'), 12.345)
    assert.equal(formatCellDisplay('text', 'general'), 'text')
})

test('currency, percent and decimal render the expected text', () => {
    assert.equal(formatCellDisplay(12.5, 'decimal'), '12.50')
    assert.equal(formatCellDisplay(0.125, 'percent'), '12.50%')
    const currency = formatCellDisplay(12.5, 'currency')
    assert.equal(typeof currency, 'string')
    assert.match(String(currency), /12\.50$/, 'currency keeps two decimals')
})

test('formatting a non-numeric cell is a no-op rather than a corruption', () => {
    assert.equal(formatCellDisplay('物料A', 'percent'), '物料A')
    assert.equal(formatCellDisplay('', 'decimal'), '')
    assert.equal(formatCellDisplay(null, 'currency'), null)
})

test('applying a format remembers the raw value, so it can be undone', () => {
    const applied = formatCell(0.125, 'percent')
    assert.equal(applied.display, '12.50%')
    assert.equal(applied.raw, 0.125)
    assert.equal(applied.kind, 'percent')

    // `general` restores the number, not the string.
    const reverted = formatCell(applied.display, 'general', { raw: applied.raw, kind: applied.kind })
    assert.equal(reverted.display, 0.125)
    assert.equal(reverted.raw, undefined)
})

test('re-formatting a formatted cell does not compound', () => {
    // percent → currency must format the ORIGINAL value, not "12.50%" parsed again.
    const once = formatCell(0.125, 'percent')
    const twice = formatCell(once.display, 'currency', { raw: once.raw, kind: once.kind })
    assert.equal(twice.raw, 0.125, 'raw value is carried through untouched')
    assert.match(String(twice.display), /0\.13$/, 'formats the raw value (12.5 → ¥12.50)')
    assert.doesNotMatch(String(twice.display), /%/, 'no percent sign survives')
})

test('applying general to an unformatted cell remembers nothing', () => {
    const result = formatCell(42, 'general')
    assert.equal(result.display, 42)
    assert.equal(result.raw, undefined)
})

test('formatting text is a no-op and does not create bookkeeping', () => {
    const result = formatCell('物料A', 'percent')
    assert.equal(result.display, '物料A')
    assert.equal(result.raw, undefined)
})

test('applyNumberFormats walks the matrix with A1 keys and leaves plain cells alone', () => {
    const rows: (string | number | null)[][] = [
        [1, 2],
        [0.125, 'x'],
    ]
    const formatted = applyNumberFormats(
        rows,
        { B1: 'percent', A2: 'decimal' },
        {},
        label,
    )
    assert.equal(formatted[0]![1], '200.00%', 'B1 formatted')
    assert.equal(formatted[1]![0], '0.13', 'A2 formatted')
    assert.equal(formatted[0]![0], 1, 'unformatted cell untouched')
    assert.equal(formatted[1]![1], 'x', 'non-numeric untouched')
})

test('applyNumberFormats is a no-op when nothing is formatted', () => {
    const rows = [[1, 2]]
    assert.equal(applyNumberFormats(rows, undefined, undefined, label), rows, 'same array identity')
    assert.equal(applyNumberFormats(rows, {}, {}, label), rows)
})

test('captureNumberFormats keeps entries whose display still matches and drops typed-over ones', () => {
    const rows: (string | number)[][] = [
        ['12.50%', 'typed over'],
    ]
    const captured = captureNumberFormats(rows, {
        numberFormats: { A1: 'percent', B1: 'percent' },
        rawValues: { A1: 0.125, B1: 0.5 },
    } as never)
    // A1 still renders as its format dictates, so the entry stays reversible.
    assert.deepEqual(Object.keys(captured.numberFormats), ['A1'])
    assert.equal(captured.numberFormats.A1, 'percent')
    assert.equal(captured.rawValues.A1, 0.125)
    // B1 now holds text: the format must be forgotten, otherwise a later
    // re-format would parse "typed over" and write a wrong number.
    assert.equal(captured.numberFormats.B1, undefined, 'stale format dropped')
    assert.equal(captured.rawValues.B1, undefined)
})

test('captureNumberFormats tolerates missing bookkeeping and bad refs', () => {
    assert.deepEqual(captureNumberFormats([[1]], undefined), { numberFormats: {}, rawValues: {} })
    const captured = captureNumberFormats([[1]], {
        numberFormats: { nonsense: 'percent' },
        rawValues: { nonsense: 1 },
    } as never)
    assert.deepEqual(captured, { numberFormats: {}, rawValues: {} })
})

test('displayToNumeric recovers the number behind a formatted string', () => {
    assert.equal(displayToNumeric('12.50%'), 12.5)
    assert.equal(displayToNumeric('¥12.50'), 12.5)
    assert.equal(displayToNumeric('abc'), null)
    assert.equal(displayToNumeric(''), null)
})

test('numericValue only accepts strings that actually contain a digit', () => {
    // Regression guard: the previous implementation stripped every non-numeric
    // character, so these all became 0 — and a text cell then rendered as
    // "0.00%" when a number format was applied to it.
    assert.equal(numericValue('物料A'), null)
    assert.equal(numericValue('abc'), null)
    assert.equal(numericValue('   '), null)
    assert.equal(numericValue('%'), null)
    assert.equal(numericValue('-'), null)
})

test('numericValue still understands the decorations a format adds', () => {
    assert.equal(numericValue('12.50%'), 12.5)
    assert.equal(numericValue('¥12.50'), 12.5)
    assert.equal(numericValue('1,234.5'), 1234.5)
    assert.equal(numericValue('-3.5'), -3.5)
    assert.equal(numericValue('１２３'), 123)
    assert.equal(numericValue(''), null)
    assert.equal(numericValue(null), null)
    assert.equal(numericValue(7), 7)
    assert.equal(numericValue(true), 1)
    assert.equal(numericValue(Number.NaN), null)
})
