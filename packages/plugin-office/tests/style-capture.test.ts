/**
 * Style capture.
 *
 * The cap matters for the document, not just performance: styles are persisted
 * sparsely, so an uncapped sweep of a 10k-row styled sheet would write megabytes
 * of declarations into the node attributes on every save.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureStylesFrom, captureTrackedStyles, MAX_STYLED_CELLS, seedTrackedSets, styleIdForRef, STYLE_ID_PREFIX, trackedSetFor } from '../src/spreadsheet/style-capture.ts'

/** `(row, column)` → `"A1"`, matching the engine adapter's key format. */
function ref(row: number, column: number): string {
    let out = ''
    let value = column
    while (value >= 0) {
        out = String.fromCharCode((value % 26) + 65) + out
        value = Math.floor(value / 26) - 1
    }
    return `${out}${row + 1}`
}

test('only non-empty styles are collected, keyed by A1', () => {
    const result = captureStylesFrom(2, 2, (row, column) => {
        if (row === 0 && column === 1) return 'font-weight: bold'
        if (row === 1 && column === 0) return 'color: #f00'
        return undefined
    }, ref)
    assert.deepEqual(result.styles, { B1: 'font-weight: bold', A2: 'color: #f00' })
    assert.equal(result.truncated, false)
})

test('a sheet with no styling yields undefined, not an empty object', () => {
    // An empty object would persist `styles: {}` and differ from a sheet that
    // never had styling, which the content fingerprint would report as a change.
    const result = captureStylesFrom(3, 3, () => undefined, ref)
    assert.equal(result.styles, undefined)
    assert.equal(result.truncated, false)
})

test('an empty string is not a style', () => {
    const result = captureStylesFrom(1, 1, () => '', ref)
    assert.equal(result.styles, undefined)
})

test('the cap stops the sweep and reports truncation', () => {
    const result = captureStylesFrom(10, 10, () => 'font-weight: bold', ref, 5)
    assert.equal(Object.keys(result.styles ?? {}).length, 5)
    assert.equal(result.truncated, true)
})

test('a sheet exactly at the cap is not reported as truncated', () => {
    const result = captureStylesFrom(2, 2, () => 'color: #000', ref, 4)
    assert.equal(Object.keys(result.styles ?? {}).length, 4)
    assert.equal(result.truncated, false, 'hitting the cap exactly loses nothing')
})

test('the walk is row-major, so truncation drops the bottom of the sheet', () => {
    const seen: string[] = []
    captureStylesFrom(3, 2, (row, column) => {
        seen.push(`${row},${column}`)
        return undefined
    }, ref)
    assert.deepEqual(seen, ['0,0', '0,1', '1,0', '1,1', '2,0', '2,1'])
})

test('the default cap is the documented budget', () => {
    // The jspreadsheet adapter used the same figure; changing it changes how much
    // formatting a large document carries.
    assert.equal(MAX_STYLED_CELLS, 2000)
})

// ─── ref-tracked capture ─────────────────────────────────────────────────
//
// This is the path the VTable adapter uses, and the reason it exists: the engine
// resolves a *default* style for every cell, so an extent-based sweep reports the
// whole sheet as styled and spends the payload cap on defaults — dropping the
// user's real formatting.

test('tracked capture reads only the cells we arranged', () => {
    const read = (ref: string) => (ref === 'B2' ? 'font-weight: bold' : undefined)
    const result = captureTrackedStyles(['B2', 'C3'], read)
    assert.deepEqual(result.styles, { B2: 'font-weight: bold' })
    assert.equal(result.truncated, false)
})

test('a sheet with no arranged styles yields nothing, even though every cell has a default style', () => {
    // The engine would happily return a resolved style for any cell; the ref set
    // being empty is what keeps a plain sheet plain.
    const result = captureTrackedStyles([], () => 'textAlign: left; color: #000')
    assert.equal(result.styles, undefined)
})

test('tracked capture honours the same cap', () => {
    const refs = ['A1', 'A2', 'A3', 'A4']
    const result = captureTrackedStyles(refs, () => 'color: #000', 2)
    assert.equal(Object.keys(result.styles ?? {}).length, 2)
    assert.equal(result.truncated, true)
})

test('a ref whose reader returns nothing is skipped without counting', () => {
    const result = captureTrackedStyles(['A1', 'A2'], (ref) => (ref === 'A2' ? 'color: #fff' : undefined))
    assert.deepEqual(result.styles, { A2: 'color: #fff' })
})

test('style ids are predictable and prefixed, so capture can follow them', () => {
    assert.equal(STYLE_ID_PREFIX, 'kn-')
    assert.equal(styleIdForRef('B2'), 'kn-B2')
})

// ─── per-sheet scoping ───────────────────────────────────────────────────
//
// Regression guard: a single flat set of refs made every sheet report the same
// styled cells, so saving copied one sheet's formatting onto all of them.

test('tracked sets are scoped per sheet, so one sheet cannot style another', () => {
    const sets = seedTrackedSets([{ styles: { B2: 'font-weight: bold' } }, {}])
    assert.deepEqual(Array.from(trackedSetFor(sets, 0)), ['B2'])
    assert.equal(trackedSetFor(sets, 1).size, 0, 'the second sheet has no styles of its own')
})

test('trackedSetFor creates missing sets and keeps indices aligned', () => {
    const sets: Array<Set<string>> = []
    const third = trackedSetFor(sets, 2)
    third.add('C3')
    assert.equal(sets.length, 3)
    assert.equal(trackedSetFor(sets, 0).size, 0, 'indices 0 and 1 exist and are empty')
    assert.equal(trackedSetFor(sets, 1).size, 0)
    assert.deepEqual(Array.from(trackedSetFor(sets, 2)), ['C3'])
})

test('a negative or fractional sheet index is clamped rather than creating a hole', () => {
    const sets: Array<Set<string>> = []
    trackedSetFor(sets, -1).add('A1')
    assert.equal(sets.length, 1, 'index -1 maps to sheet 0')
    assert.deepEqual(Array.from(trackedSetFor(sets, 0)), ['A1'])
})

test('seeding from a payload keeps each sheet’s own map', () => {
    const sets = seedTrackedSets([
        { styles: { A1: 'color: #f00', B2: 'color: #0f0' } },
        { styles: { A1: 'color: #00f' } },
    ])
    assert.deepEqual(Array.from(trackedSetFor(sets, 0)).sort(), ['A1', 'B2'])
    assert.deepEqual(Array.from(trackedSetFor(sets, 1)), ['A1'])
})
