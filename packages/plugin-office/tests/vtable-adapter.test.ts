/**
 * The adapter's pure translation layers: ranges and styles.
 *
 * These are the two places the engine swap can silently regress behaviour —
 * a transposed range styles or writes the wrong cells, and a lossy style mapping
 * makes formatting "disappear" after a save. Both are pure, so they are pinned
 * here rather than left to the browser POC.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    cellCount,
    clampBounds,
    forEachCell,
    fromVTableRange,
    isCellRange,
    rangeToA1,
    toVTableRange,
    topLeftPosition,
} from '../src/spreadsheet/vtable-selection.ts'
import {
    fromVTableStyle,
    mergeStyleText,
    parseDeclarations,
    toVTableStyle,
    toVTableStylePatch,
} from '../src/spreadsheet/vtable-style.ts'

// ─── ranges ──────────────────────────────────────────────────────────────

test('a VTable range maps to our bounds without swapping the axes', () => {
    // startRow/endRow are rows; startCol/endCol are columns.
    const bounds = fromVTableRange({ startRow: 1, startCol: 2, endRow: 3, endCol: 4 })
    assert.deepEqual(bounds, { startRow: 1, startColumn: 2, endRow: 3, endColumn: 4 })
})

test('a drag reported backwards is normalised', () => {
    const bounds = fromVTableRange({ startRow: 5, startCol: 4, endRow: 2, endCol: 1 })
    assert.deepEqual(bounds, { startRow: 2, startColumn: 1, endRow: 5, endColumn: 4 })
})

test('a degenerate range is a single cell, not a rejection', () => {
    assert.deepEqual(fromVTableRange({ startRow: 2, startCol: 3, endRow: 2, endCol: 3 }), {
        startRow: 2, startColumn: 3, endRow: 2, endColumn: 3,
    })
})

test('a position object is not mistaken for a range', () => {
    // arrangeCustomCellStyle takes a position OR a range; confusing them styles
    // one corner of a selection and drops the rest.
    assert.equal(isCellRange({ col: 1, row: 2 }), false)
    assert.equal(isCellRange({ startRow: 0, startCol: 0, endRow: 1, endColumn: 1 }), false)
    assert.equal(isCellRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 }), true)
    assert.equal(fromVTableRange(null), null)
    assert.equal(fromVTableRange({ col: 1, row: 2 } as never), null)
})

test('range round-trips through VTable shape', () => {
    const bounds = { startRow: 1, startColumn: 2, endRow: 3, endColumn: 4 }
    assert.deepEqual(fromVTableRange(toVTableRange(bounds)), bounds)
})

test('topLeftPosition takes the minimum corner and is (col, row)', () => {
    // VTable positions are { col, row } — the reverse of our field order.
    assert.deepEqual(topLeftPosition({ startRow: 4, startColumn: 7, endRow: 9, endColumn: 9 }), {
        col: 7,
        row: 4,
    })
})

test('cellCount counts inclusive cells', () => {
    assert.equal(cellCount({ startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 }), 1)
    assert.equal(cellCount({ startRow: 0, startColumn: 0, endRow: 2, endColumn: 3 }), 12)
})

test('forEachCell walks row-major and covers every cell exactly once', () => {
    const seen: string[] = []
    forEachCell({ startRow: 1, startColumn: 2, endRow: 2, endColumn: 3 }, (row, column) => {
        seen.push(`${row},${column}`)
    })
    assert.deepEqual(seen, ['1,2', '1,3', '2,2', '2,3'])
})

test('clampBounds keeps writes inside the sheet and reports an empty sheet as null', () => {
    const bounds = { startRow: 0, startColumn: 0, endRow: 99, endColumn: 99 }
    assert.deepEqual(clampBounds(bounds, 10, 5), { startRow: 0, startColumn: 0, endRow: 9, endColumn: 4 })
    // A selection entirely outside the sheet collapses onto the last valid cell
    // rather than inverting.
    assert.deepEqual(clampBounds({ startRow: 50, startColumn: 50, endRow: 60, endColumn: 60 }, 10, 5), {
        startRow: 9, startColumn: 4, endRow: 9, endColumn: 4,
    })
    assert.equal(clampBounds(bounds, 0, 0), null)
})

test('rangeToA1 collapses single cells', () => {
    assert.equal(rangeToA1({ startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 }), 'A1')
    assert.equal(rangeToA1({ startRow: 0, startColumn: 0, endRow: 2, endColumn: 2 }), 'A1:C3')
    assert.equal(rangeToA1({ startRow: 9, startColumn: 26, endRow: 9, endColumn: 27 }), 'AA10:AB10')
})

// ─── styles ──────────────────────────────────────────────────────────────

test('CSS declarations map onto VTable style properties', () => {
    const style = toVTableStyle('font-weight: bold; background-color: #ffee00; text-align: center')
    assert.deepEqual(style, {
        fontWeight: 'bold',
        bgColor: '#ffee00',
        textAlign: 'center',
    })
})

test('numeric font weights become bold, matching the toolbar vocabulary', () => {
    assert.equal(toVTableStyle('font-weight: 700')?.fontWeight, 'bold')
    assert.equal(toVTableStyle('font-weight: 400')?.fontWeight, 'normal')
})

test('the border trick has no VTable equivalent and is dropped, not passed through', () => {
    // `--kn-cell-border` exists only to out-specify the editor's table rules in
    // the jspreadsheet DOM; VTable owns its own border model.
    const style = toVTableStyle('--kn-cell-border: 1px solid red; font-style: italic')
    assert.deepEqual(style, { fontStyle: 'italic' })
})

test('unknown declarations are dropped rather than forwarded blindly', () => {
    assert.equal(toVTableStyle('will-change: transform; contain: layout'), undefined)
    assert.equal(toVTableStyle(''), undefined)
    assert.equal(toVTableStyle(undefined), undefined)
})

test('VTable style reads back as CSS declarations for the toolbar', () => {
    const css = fromVTableStyle({ fontWeight: 'bold', bgColor: '#fff', color: '#111', textAlign: 'right' })
    assert.equal(css, 'font-weight: bold; color: #111; background-color: #fff; text-align: right')
    assert.equal(fromVTableStyle(undefined), '')
})

test('style text survives a round trip through the VTable vocabulary', () => {
    const original = 'font-weight: bold; font-style: italic; color: #ff0000; text-align: center'
    const restored = fromVTableStyle(toVTableStyle(original))
    assert.deepEqual(parseDeclarations(restored), parseDeclarations(original))
})

test('a toolbar patch is translated, including explicit clears', () => {
    // The toolbar sends null to mean "remove this declaration"; that must become
    // a concrete neutral value, otherwise the cell keeps its old style.
    assert.deepEqual(toVTableStylePatch({ 'font-weight': 'bold' }), { fontWeight: 'bold' })
    assert.deepEqual(toVTableStylePatch({ 'font-weight': null }), { fontWeight: 'normal' })
    assert.deepEqual(toVTableStylePatch({ 'font-style': '' }), { fontStyle: 'normal' })
    assert.equal(toVTableStylePatch({ 'unknown-prop': 'x' }), undefined)
})

test('merging a patch keeps the declarations it did not touch', () => {
    // arrangeCustomCellStyle replaces the arranged style wholesale, so applying
    // bold to an italic cell must not lose the italic.
    const merged = mergeStyleText('font-style: italic; color: #111', { 'font-weight': 'bold' })
    const declarations = parseDeclarations(merged)
    assert.deepEqual(declarations, { 'font-style': 'italic', color: '#111', 'font-weight': 'bold' })
})

test('merging a null removes just that declaration', () => {
    const merged = mergeStyleText('font-style: italic; font-weight: bold', { 'font-weight': null })
    assert.deepEqual(parseDeclarations(merged), { 'font-style': 'italic' })
})

test('merging onto nothing yields just the patch, and clearing everything yields undefined', () => {
    assert.deepEqual(parseDeclarations(mergeStyleText(undefined, { color: '#000' })), { color: '#000' })
    assert.equal(mergeStyleText('color: #000', { color: null }), undefined)
})

test('declaration parsing tolerates casing and spacing', () => {
    assert.deepEqual(parseDeclarations('  Font-Weight :  bold ;; COLOR:#fff; '), {
        'font-weight': 'bold',
        color: '#fff',
    })
})
