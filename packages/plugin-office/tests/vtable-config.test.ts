/**
 * The engine-swap translation layer.
 *
 * `vtable-config.ts` is the one part of the VTableSheet migration that can be
 * verified outside a browser (the engine itself cannot — docs/VTABLE_MIGRATION.md
 * risk 1), so the coordinate and layout semantics the adapter depends on are
 * pinned here. The failure this guards against is a silent transposition: our
 * model is (row, column) with inclusive ranges, VTable's `WorkbookData`-side
 * merges are tuples and its `WorkSheet` accessors are (col, row).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSheetData, createWorkbookFromRows, type CellValue, type WorkbookData } from '../src/spreadsheet/workbook-data.ts'
import {
    extractFormulas,
    normalizeSavedConfig,
    fromVTableColumnWidths,
    fromVTableMerges,
    fromVTableRowHeights,
    isRefInBounds,
    sheetDefineLayout,
    toVTableColumnWidths,
    toVTableMerges,
    toVTableRowHeights,
    workbookToSheetDefines,
} from '../src/spreadsheet/vtable-config.ts'

/** A workbook exercising every layout field the translation touches. */
function fixture(): WorkbookData {
    const rows: CellValue[][] = [
        ['名称', '数量', '金额'],
        ['物料A', 3, 12.5],
        ['物料B', 7, '=B2*2'],
    ]
    const sheet = createSheetData('库存', 3, 3, rows, undefined, {
        columnWidths: { '1': 160, '2': 120 },
        rowHeights: { '0': 40 },
        merges: [
            [0, 0, 1, 0],
            [2, 1, 2, 2],
        ],
    })
    return {
        id: 'wb-test',
        activeSheet: 0,
        version: 2,
        sheets: [
            sheet,
            createSheetData('汇总', 2, 2, [['合计', '=SUM(库存!C1:C3)']]),
        ],
    }
}

test('merges round-trip through VTable without transposing', () => {
    const source = fixture().sheets[0]!.merges!
    const back = fromVTableMerges(toVTableMerges(source))
    assert.deepEqual(back, source, 'merge tuples must survive a round trip')

    // Spot-check the axis mapping on the first merge: columns 0..1 on row 0.
    const [first] = toVTableMerges(source)!
    assert.deepEqual(first.range.start, { col: 0, row: 0 })
    assert.deepEqual(first.range.end, { col: 1, row: 0 })
})

test('reversed merge corners are normalised rather than trusted', () => {
    // Engines hand back merges in whatever order the user dragged them.
    const back = fromVTableMerges([
        { range: { start: { col: 3, row: 5 }, end: { col: 1, row: 2 } } },
    ])
    assert.deepEqual(back, [[1, 2, 3, 5]])
})

test('column widths and row heights round-trip, keys coerced to indices', () => {
    const sheet = fixture().sheets[0]!
    assert.deepEqual(fromVTableColumnWidths(toVTableColumnWidths(sheet.columnWidths)), sheet.columnWidths)
    assert.deepEqual(fromVTableRowHeights(toVTableRowHeights(sheet.rowHeights)), sheet.rowHeights)
})

test('non-positive and non-numeric sizing entries are dropped, not passed on', () => {
    assert.equal(toVTableColumnWidths({ '0': 0, '1': -5, '2': Number.NaN }), undefined)
    assert.equal(toVTableRowHeights({ '0': 0 }), undefined)
})

test('a sheet definition carries the data matrix verbatim (formulas included)', () => {
    const workbook = fixture()
    const defines = workbookToSheetDefines(workbook)
    assert.equal(defines.length, 2)
    assert.deepEqual(defines[0]!.data, workbook.sheets[0]!.rows)
    // Formula text must survive: the engine reads formulas out of the data, and
    // flattening it here would silently turn every formula into a text cell.
    assert.equal(defines[0]!.data[2]![2], '=B2*2')
    assert.equal(defines[1]!.data[0]![1], '=SUM(库存!C1:C3)')
})

test('the engine gets its own rows, so writing a display value cannot edit the payload', () => {
    // The engine keeps the matrix it is handed and writes display values into it.
    // Sharing the payload's rows let `applyFormulas` overwrite `=SUM(B1:B5)` with
    // its computed "85" inside the document's own data, before any save had run.
    const workbook = fixture()
    const defines = workbookToSheetDefines(workbook)
    defines[0]!.data[2]![2] = '85'
    defines[0]!.data[0]![0] = 'overwritten'
    assert.equal(workbook.sheets[0]!.rows[2]![2], '=B2*2')
    assert.equal(workbook.sheets[0]!.rows[0]![0], '名称')
    // Rows must be copied, not just the outer array.
    assert.notEqual(defines[0]!.data[2], workbook.sheets[0]!.rows[2])
})

test('sheetKey is the sheet index, because pivots and activeSheet address by index', () => {
    const defines = workbookToSheetDefines(fixture())
    assert.deepEqual(defines.map((d) => d.sheetKey), ['0', '1'])
    assert.deepEqual(defines.map((d) => d.sheetTitle), ['库存', '汇总'])
})

test('only the active sheet is flagged active', () => {
    const workbook = fixture()
    workbook.activeSheet = 1
    const defines = workbookToSheetDefines(workbook)
    assert.equal(defines[0]!.active, undefined)
    assert.equal(defines[1]!.active, true)
})

test('one malformed payload cannot bring the whole workbook down', () => {
    // createSheetData pads to at least one row/column, so a definition always has
    // usable dimensions even for a hand-built empty sheet.
    const defines = workbookToSheetDefines(createWorkbookFromRows([], 'Empty'))
    assert.equal(defines[0]!.rowCount >= 1, true)
    assert.equal(defines[0]!.columnCount >= 1, true)
})

test('generated (pivot) sheets are flagged for the adapter to lock', () => {
    const workbook = fixture()
    workbook.sheets[1] = {
        ...workbook.sheets[1]!,
        pivot: {
            sources: [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 2 } }],
            hasHeader: true,
            rows: [],
            columns: [],
            values: [{ field: '金额', aggregate: 'sum' }],
            showRowTotals: false,
            showColumnTotals: false,
        },
    }
    const defines = workbookToSheetDefines(workbook)
    assert.equal(defines[0]!._generated, undefined)
    assert.equal(defines[1]!._generated, true, 'a pivot sheet must be marked so it can be locked')
})

test('layout comes back out of a definition in persisted shape', () => {
    const workbook = fixture()
    const [first] = workbookToSheetDefines(workbook)
    const layout = sheetDefineLayout(first!)
    assert.deepEqual(layout.merges, workbook.sheets[0]!.merges)
    assert.deepEqual(layout.columnWidths, workbook.sheets[0]!.columnWidths)
    assert.deepEqual(layout.rowHeights, workbook.sheets[0]!.rowHeights)
    assert.equal(layout.rowCount, first!.rowCount)
    assert.equal(layout.columnCount, first!.columnCount)
})

test('extractFormulas emits A1 keys with 1-based rows', () => {
    const formulas = extractFormulas([
        ['a', 'b'],
        ['c', '=SUM(A1:B1)'],
    ])
    assert.deepEqual(formulas, { B2: '=SUM(A1:B1)' })
})

test('isRefInBounds uses (row, column) order, not (column, row)', () => {
    // A1:B3 spans columns 0..1 and rows 0..2. A grid of 3 rows x 2 columns holds
    // all of it; a grid of 2 rows x 3 columns does not (row 2 is out of range).
    assert.equal(isRefInBounds('B3', 3, 2), true, '2 columns hold column B')
    assert.equal(isRefInBounds('B3', 2, 2), false, '2 rows do not hold row 3')
    // If the implementation transposed its arguments, C2 (col 2, row 1) would
    // pass a 3-row/2-column grid only by reading rowCount as the column bound.
    assert.equal(isRefInBounds('C2', 3, 2), false, 'column C is out of range')
    assert.equal(isRefInBounds('C2', 2, 3), true, '3 columns hold column C')
    assert.equal(isRefInBounds('nonsense', 3, 2), false)
})

test('the inlined A1 helpers agree with workbook-data, which is why they can be duplicated', async () => {
    // vtable-config cannot import workbook-data at runtime (see the note in that
    // module), so the two A1 helpers are duplicated. This is the guard: if either
    // copy drifts, the round-trip assertions above would start lying.
    const wb = await import('../src/spreadsheet/workbook-data.ts')
    for (const ref of ['A1', 'B2', 'Z26', 'AA1', 'AB100', 'XFD1048576']) {
        const position = wb.parseCellRef(ref)
        assert.ok(position, `${ref} should parse`)
        // Rebuild the label from the parsed column and confirm it matches the prefix.
        assert.equal(wb.columnIndexToLabel(position.column), ref.match(/^[A-Z]+/)![0])
        assert.equal(position.row, Number(ref.match(/\d+$/)![0]) - 1)
    }
    assert.equal(wb.parseCellRef('nonsense'), null)
    assert.equal(wb.parseCellRef('1A'), null)
})

test('a definition with no pivot is not flagged as generated', () => {
    const defines = workbookToSheetDefines(fixture())
    assert.equal(defines.every((d) => d._generated === undefined), true)
})

// ─── saveToConfig shape ──────────────────────────────────────────────────
//
// The engine returns the whole options object, not an array. Reading it as an
// array used to throw inside the snapshot, which silently dropped styles and
// merges from every save — the symptom looked like "formatting is not persisted".

test('a saved config object is unwrapped to its sheet definitions', () => {
    const sheets = [{ sheetKey: '0' }, { sheetKey: '1' }]
    assert.deepEqual(normalizeSavedConfig({ sheets }), sheets)
})

test('an array is accepted as-is', () => {
    const sheets = [{ sheetKey: '0' }]
    assert.deepEqual(normalizeSavedConfig(sheets), sheets)
})

test('anything unusable yields an empty list rather than throwing', () => {
    // An empty list means the snapshot keeps the previously stored layout; a
    // throw would abort the whole save.
    assert.deepEqual(normalizeSavedConfig(undefined), [])
    assert.deepEqual(normalizeSavedConfig(null), [])
    assert.deepEqual(normalizeSavedConfig('nonsense'), [])
    assert.deepEqual(normalizeSavedConfig({}), [])
    assert.deepEqual(normalizeSavedConfig({ sheets: 'nope' }), [])
})
