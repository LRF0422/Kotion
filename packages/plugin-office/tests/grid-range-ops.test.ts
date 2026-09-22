/**
 * Pure range operations behind `GridApi.readRange` / `writeRange` and the
 * external-payload check.
 *
 * These carry the semantics the AI tools, the fill handle and the Excel import
 * path depend on, so they are pinned here rather than left to the browser POC.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    activeSheetIndexFrom,
    decideExternalData,
    prepareMatrixWrite,
    readCellFrom,
    readRangeFrom,
} from '../src/spreadsheet/grid-range-ops.ts'
import { createWorkbookFromRows, type CellValue, type WorkbookData } from '../src/spreadsheet/workbook-data.ts'

const rows: CellValue[][] = [
    ['A', 'B', 'C'],
    ['D', 'E', 'F'],
]

// ─── reads ───────────────────────────────────────────────────────────────

test('readRange returns an inclusive block in row-major order', () => {
    assert.deepEqual(readRangeFrom(rows, 0, 0, 1, 1), [['A', 'B'], ['D', 'E']])
    assert.deepEqual(readRangeFrom(rows, 1, 2, 1, 2), [['F']])
})

test('readRange pads ragged rows with null instead of undefined', () => {
    const ragged: CellValue[][] = [['A'], ['B', 'C']]
    assert.deepEqual(readRangeFrom(ragged, 0, 0, 1, 1), [['A', null], ['B', 'C']])
})

test('readRange past the data yields nulls rather than throwing', () => {
    assert.deepEqual(readRangeFrom(rows, 5, 5, 6, 6), [[null, null], [null, null]])
})

test('readCell mirrors readRange for a single cell', () => {
    assert.equal(readCellFrom(rows, 1, 2), 'F')
    assert.equal(readCellFrom(rows, 9, 9), null)
})

// ─── writes ──────────────────────────────────────────────────────────────

test('a full matrix reports what it needs to grow to', () => {
    const result = prepareMatrixWrite([['x', 'y'], ['z', 'w']], 1, 1, 100, 100)
    assert.equal(result.written, 4)
    assert.equal(result.requiredRows, 3)
    assert.equal(result.requiredColumns, 3)
})

test('null is a sparse patch: it skips a cell and does not count as written', () => {
    // The fill handle relies on this: null means "leave the cell alone", not
    // "blank it".
    const result = prepareMatrixWrite([['x', null, 'z']], 0, 0, 100, 100)
    assert.equal(result.written, 2)
    assert.deepEqual(result.matrix, [['x', null, 'z']])
})

test('cells beyond the sheet ceiling are dropped, not partially applied', () => {
    const result = prepareMatrixWrite([['a', 'b', 'c']], 0, 0, 10, 2)
    assert.deepEqual(result.matrix, [['a', 'b', null]], 'the third cell is over the column ceiling')
    assert.equal(result.written, 2)
})

test('a matrix entirely past the ceiling writes nothing', () => {
    const result = prepareMatrixWrite([['a']], 10, 0, 10, 10)
    assert.equal(result.written, 0)
})

test('an empty or widthless matrix is a no-op', () => {
    assert.deepEqual(prepareMatrixWrite([], 0, 0, 10, 10), {
        matrix: [], requiredRows: 0, requiredColumns: 0, written: 0,
    })
    assert.equal(prepareMatrixWrite([[]], 0, 0, 10, 10).written, 0)
})

// ─── external payloads ───────────────────────────────────────────────────

function workbook(rowsIn: CellValue[][]): WorkbookData {
    return createWorkbookFromRows(rowsIn, 'Sheet1')
}

test('the exact object we persisted is recognised as our own echo', () => {
    const saved = workbook([['A']])
    // This is the case that matters: the view stores what we handed it and React
    // gives that same object back. A key-only comparison missed it when React was
    // still holding an older revision, and treating it as external reverted edits.
    assert.equal(decideExternalData(saved, 'KEY', saved, 'KEY'), 'echo')
    assert.equal(decideExternalData(saved, 'ANY', saved, 'OTHER'), 'echo', 'identity wins over the key')
})

test('the same content in a new object is also an echo', () => {
    const saved = workbook([['A']])
    // The round trip through the document's serialisation.
    const echoed = { ...saved, sheets: saved.sheets.map((s) => ({ ...s })) }
    assert.equal(decideExternalData(echoed, 'KEY', saved, 'KEY'), 'echo')
})

test('a payload we did not persist is applied', () => {
    const saved = workbook([['A']])
    const other = workbook([['B']])
    assert.equal(decideExternalData(other, 'NEW', saved, 'OLD'), 'apply')
    // Same key but a different object and a different identity: still not ours.
    assert.equal(decideExternalData(other, 'SAME', saved, 'SAME'), 'echo', 'identical content is an echo')
})

test('different content from elsewhere is applied', () => {
    const applied = workbook([['A']])
    const incoming = workbook([['B']])
    assert.equal(decideExternalData(incoming, 'NEW', applied, 'OLD'), 'apply')
})

test('a missing payload is ignored', () => {
    assert.equal(decideExternalData(null, '', null, ''), 'ignore')
    assert.equal(decideExternalData(undefined, '', null, ''), 'ignore')
})

// ─── active sheet ────────────────────────────────────────────────────────

test('activeSheetIndexFrom reads the engine flag, falling back to the stored index', () => {
    assert.equal(activeSheetIndexFrom([{}, { active: true }, {}], 0), 1)
    assert.equal(activeSheetIndexFrom([{}, {}], 1), 1, 'no flag: use the stored index')
    assert.equal(activeSheetIndexFrom([{}, {}], 9), 1, 'stored index clamped to the sheet count')
    assert.equal(activeSheetIndexFrom([], 3), 0)
})
