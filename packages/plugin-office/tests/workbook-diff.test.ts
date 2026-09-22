/**
 * Incremental workbook diff.
 *
 * This is the correctness core of L3: the store applies only these operations to
 * the shared Y.Doc, so a missed change silently desyncs collaborators.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSheetData, createEmptyWorkbookData, type WorkbookData } from '../src/spreadsheet/workbook-data.ts'
import { diffWorkbook, isEmptyDiff } from '../src/spreadsheet/workbook-diff.ts'

function workbook(): WorkbookData {
    const sheet = createSheetData('Sheet1', 3, 3, [
        [1, 2, null],
        [null, 'x', null],
        [null, null, null],
    ])
    sheet.styles = { A1: 'font-weight: bold' }
    sheet.numberFormats = { B2: 'percent' }
    sheet.rawValues = { B2: 0.5 }
    sheet.columnWidths = { '0': 120 }
    sheet.rowHeights = { '1': 40 }
    sheet.merges = [[0, 0, 1, 0]]
    return { ...createEmptyWorkbookData(3, 3), sheets: [sheet], activeSheet: 0 }
}

test('an unchanged workbook produces an empty diff', () => {
    const before = workbook()
    const after = workbook()
    assert.equal(isEmptyDiff(diffWorkbook(before, after)), true)
})

test('a single cell edit becomes a single value change', () => {
    const before = workbook()
    const after = workbook()
    after.sheets[0].rows[1][0] = 99
    const diff = diffWorkbook(before, after)
    assert.equal(diff.grid.length, 1)
    assert.deepEqual(diff.grid[0], { sheet: 0, row: 1, column: 0, kind: 'value', value: 99 })
})

test('clearing a cell produces a null value change', () => {
    const before = workbook()
    const after = workbook()
    after.sheets[0].rows[0][1] = null
    const diff = diffWorkbook(before, after)
    assert.equal(diff.grid.length, 1)
    assert.equal(diff.grid[0].value, null)
})

test('style, number format, raw value and dimensions are diffed per entry', () => {
    const before = workbook()
    const after = workbook()
    after.sheets[0].styles = { A1: 'font-weight: bold', C3: 'color: red' }
    after.sheets[0].numberFormats = {}
    after.sheets[0].rawValues = {}
    after.sheets[0].columnWidths = { '0': 120, '2': 60 }
    after.sheets[0].rowHeights = {}
    after.sheets[0].merges = []
    const diff = diffWorkbook(before, after)
    assert.deepEqual(
        diff.grid.filter((change) => change.kind === 'style').map((change) => [change.row, change.column]),
        [[2, 2]],
    )
    assert.deepEqual(
        diff.grid.filter((change) => change.kind === 'numberFormat').map((change) => change.value),
        [null],
    )
    assert.deepEqual(
        diff.grid.filter((change) => change.kind === 'rawValue').map((change) => change.value),
        [null],
    )
    assert.deepEqual(diff.dimensions, [
        { sheet: 0, axis: 'column', index: 2, size: 60 },
        { sheet: 0, axis: 'row', index: 1, size: null },
    ])
    assert.deepEqual(diff.merges, [{ sheet: 0, merges: [] }])
})

test('active sheet and sheet metadata are tracked', () => {
    const before = workbook()
    const after = workbook()
    after.activeSheet = 0
    after.sheets[0].name = 'Renamed'
    after.sheets[0].rowCount = 5
    const diff = diffWorkbook(before, after)
    assert.deepEqual(diff.meta, [{ sheet: 0, name: 'Renamed', rowCount: 5, columnCount: 3 }])
    // activeSheet is unchanged here, so it stays null.
    assert.equal(diff.activeSheet, null)
})

test('a sheet count change is reported as structural, not as cell edits', () => {
    const before = workbook()
    const after = workbook()
    after.sheets.push(createSheetData('Sheet2', 2, 2))
    const diff = diffWorkbook(before, after)
    assert.equal(diff.structureChanged, true)
    assert.equal(diff.grid.length, 0)
})

test('a workbook with no previous snapshot is structural', () => {
    const diff = diffWorkbook(null, workbook())
    assert.equal(diff.structureChanged, true)
})
