import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    columnIndexToLabel,
    columnLabelToIndex,
    createEmptyWorkbookData,
    createWorkbookFromRows,
    ensureValidWorkbookData,
    formatCellRef,
    normalizeWorkbookData,
    parseCellRef,
    parseRangeSpec,
    workbookContentKey,
    workbookHasContent,
} from '../src/spreadsheet/workbook-data.ts'

test('column labels round-trip', () => {
    for (const [index, label] of [[0, 'A'], [25, 'Z'], [26, 'AA'], [27, 'AB'], [51, 'AZ'], [52, 'BA'], [701, 'ZZ'], [702, 'AAA']] as [number, string][]) {
        assert.equal(columnIndexToLabel(index), label)
        assert.equal(columnLabelToIndex(label), index)
    }
    assert.equal(columnLabelToIndex('1A'), -1)
})

test('cell references round-trip', () => {
    assert.deepEqual(parseCellRef('B3'), { row: 2, column: 1 })
    assert.deepEqual(parseCellRef('aa10'), { row: 9, column: 26 })
    assert.equal(parseCellRef('A0'), null)
    assert.equal(parseCellRef('3B'), null)
    assert.equal(formatCellRef(2, 1), 'B3')
    assert.equal(formatCellRef(9, 26), 'AA10')
})

test('parseRangeSpec normalises reversed ranges', () => {
    assert.deepEqual(parseRangeSpec('C3:A1'), { startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 })
    assert.deepEqual(parseRangeSpec('B2'), { startRow: 1, endRow: 1, startColumn: 1, endColumn: 1 })
    assert.equal(parseRangeSpec('nope'), null)
})

test('createWorkbookFromRows pads to the default grid', () => {
    const workbook = createWorkbookFromRows([['Name', 'Score'], ['Alice', 95]])
    assert.equal(workbook.sheets.length, 1)
    assert.equal(workbook.sheets[0].rows.length, 40)
    assert.equal(workbook.sheets[0].rows[0].length, 12)
    assert.equal(workbook.sheets[0].rows[1][1], 95)
    assert.equal(workbook.sheets[0].rows[39][11], null)
})

test('createEmptyWorkbookData has a usable sheet', () => {
    const workbook = createEmptyWorkbookData(2, 3)
    assert.equal(workbook.sheets[0].rowCount, 2)
    assert.equal(workbook.sheets[0].columnCount, 3)
    assert.equal(workbook.sheets[0].rows.length, 2)
})

test('normalizeWorkbookData keeps layout, numbers and merges', () => {
    const input = {
        id: 'wb-1',
        activeSheet: 0,
        version: 2,
        sheets: [{
            name: 'Data',
            rows: [[1, '=A1+1']],
            rowCount: 1,
            columnCount: 2,
            styles: { A1: 'font-weight: bold' },
            numberFormats: { A1: 'decimal', B2: 'bogus' },
            rawValues: { A1: 1 },
            columnWidths: { 0: 180, '-1': 40, 2: 0 },
            rowHeights: { 3: 44 },
            merges: [[0, 0, 1, 2], [5, 5, 4, 4], ['x', 1, 2, 3]],
        }],
    }
    const workbook = normalizeWorkbookData(input)
    const sheet = workbook.sheets[0]
    assert.equal(sheet.name, 'Data')
    assert.deepEqual(sheet.numberFormats, { A1: 'decimal' })
    assert.deepEqual(sheet.columnWidths, { '0': 180 })
    assert.deepEqual(sheet.rowHeights, { '3': 44 })
    // Invalid tuples are dropped; reversed bounds are normalised.
    assert.deepEqual(sheet.merges, [[0, 0, 1, 2], [4, 4, 5, 5]])
    assert.equal(sheet.rows[0][1], '=A1+1')
})

test('normalizeWorkbookData migrates the legacy cellData shape', () => {
    const workbook = normalizeWorkbookData({
        sheets: { s1: { name: 'Legacy', cellData: { 0: { 0: { v: 'hi' }, 1: { v: 2 } } } } },
        sheetOrder: ['s1'],
    })
    assert.equal(workbook.sheets[0].name, 'Legacy')
    assert.equal(workbook.sheets[0].rows[0][0], 'hi')
    assert.equal(workbook.sheets[0].rows[0][1], 2)
})

test('ensureValidWorkbookData never returns an empty sheet list', () => {
    assert.equal(ensureValidWorkbookData(null).sheets.length, 1)
    assert.equal(ensureValidWorkbookData({ sheets: [] }).sheets.length, 1)
})

test('workbookContentKey ignores object identity but not content', () => {
    const a = createWorkbookFromRows([['x']])
    const b = normalizeWorkbookData(JSON.parse(JSON.stringify(a)))
    assert.equal(workbookContentKey(a), workbookContentKey(b))

    const c = normalizeWorkbookData(JSON.parse(JSON.stringify(a)))
    c.sheets[0].rows[0][0] = 'y'
    assert.notEqual(workbookContentKey(a), workbookContentKey(c))
})

test('workbookHasContent sees values, styles and merges', () => {
    assert.equal(workbookHasContent(createEmptyWorkbookData()), false)

    const styled = createEmptyWorkbookData()
    styled.sheets[0].styles = { A1: 'color: red' }
    assert.equal(workbookHasContent(styled), true)

    const merged = createEmptyWorkbookData()
    merged.sheets[0].merges = [[0, 0, 1, 1]]
    assert.equal(workbookHasContent(merged), true)

    const valued = createEmptyWorkbookData()
    valued.sheets[0].rows[0][0] = 0
    assert.equal(workbookHasContent(valued), true)
})
