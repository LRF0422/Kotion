import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePivot, pivotDrillDown, pivotFieldLabels, upsertPivotSheet, type PivotLabels } from '../src/spreadsheet/pivot.ts'
import { createSheetData, createWorkbookFromRows, normalizeWorkbookData, workbookContentKey, type PivotConfig } from '../src/spreadsheet/workbook-data.ts'

const labels: PivotLabels = { total: '总计', source: '来源', aggregate: (kind: string) => kind }

function sheetFrom(rows: (string | number | null)[], name = 'Sheet1') {
    return createSheetData(name, Math.max(rows.length, 5), 6, rows)
}

test('sum with row and column groups and totals', () => {
    const sheet = sheetFrom([
        ['Region', 'Quarter', 'Amount'],
        ['East', 'Q1', 10],
        ['East', 'Q2', 20],
        ['West', 'Q1', 5],
        ['West', 'Q2', 15],
    ])
    const config: PivotConfig = {
        sources: [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 4, endColumn: 2 } }],
        hasHeader: true,
        rows: [{ field: 'Region' }],
        columns: [{ field: 'Quarter' }],
        values: [{ field: 'Amount', aggregate: 'sum' }],
        showRowTotals: true,
        showColumnTotals: true,
    }
    const result = computePivot([sheet], config, labels)
    assert.deepEqual(result.rows, [
        ['Region', 'Q1', 'Q2', '总计'],
        ['East', 10, 20, 30],
        ['West', 5, 15, 20],
        ['总计', 15, 35, 50],
    ])
    assert.equal(result.totalRowIndex, 3)
    assert.deepEqual(result.totalColumnIndices, [3])
    assert.equal(result.columnCount, 4)
    assert.deepEqual(result.rowKeys, [['East'], ['West']])
})

test('count / average / max / min on a single bucket', () => {
    const sheet = sheetFrom([
        ['Value'],
        [10],
        [20],
        [30],
        ['abc'],
    ])
    const config: PivotConfig = {
        sources: [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 4, endColumn: 0 } }],
        hasHeader: true,
        rows: [],
        columns: [],
        values: [
            { field: 'Value', aggregate: 'count' },
            { field: 'Value', aggregate: 'average' },
            { field: 'Value', aggregate: 'max' },
            { field: 'Value', aggregate: 'min' },
            { field: 'Value', aggregate: 'sum' },
        ],
        showRowTotals: false,
        showColumnTotals: false,
    }
    const result = computePivot([sheet], config, labels)
    assert.deepEqual(result.rows, [
        ['', 'Value · count', 'Value · average', 'Value · max', 'Value · min', 'Value · sum'],
        [null, 4, 20, 30, 10, 60],
    ])
})

test('row fields only, no column groups', () => {
    const sheet = sheetFrom([
        ['Team', 'Points'],
        ['A', 3],
        ['B', 5],
        ['A', 7],
    ])
    const config: PivotConfig = {
        sources: [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 3, endColumn: 1 } }],
        hasHeader: true,
        rows: [{ field: 'Team' }],
        columns: [],
        values: [{ field: 'Points', aggregate: 'sum' }],
        showRowTotals: false,
        showColumnTotals: true,
    }
    const result = computePivot([sheet], config, labels)
    assert.deepEqual(result.rows, [
        ['Team', 'Points'],
        ['A', 10],
        ['B', 5],
        ['总计', 15],
    ])
})

test('no header uses column letters and duplicate headers are disambiguated', () => {
    const sheet = sheetFrom([
        ['x', 'y'],
        [1, 2],
    ])
    assert.deepEqual(
        pivotFieldLabels([sheet], [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 1, endColumn: 1 } }], false),
        ['A', 'B'],
    )

    const duplicate = sheetFrom([
        ['Amount', 'Amount'],
        [1, 2],
    ])
    assert.deepEqual(
        pivotFieldLabels([duplicate], [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 1, endColumn: 1 } }], true),
        ['Amount', 'Amount (2)'],
    )
})

test('multiple sources are unioned', () => {
    const first = sheetFrom([
        ['Region', 'Amount'],
        ['East', 10],
        ['West', 20],
    ], 'Q1')
    const second = sheetFrom([
        ['Region', 'Amount'],
        ['East', 5],
        ['West', 7],
    ], 'Q2')
    const config: PivotConfig = {
        sources: [
            { sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 1 } },
            { sheet: 1, range: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 1 } },
        ],
        hasHeader: true,
        rows: [{ field: 'Region' }],
        columns: [],
        values: [{ field: 'Amount', aggregate: 'sum' }],
        showRowTotals: false,
        showColumnTotals: false,
    }
    const result = computePivot([first, second], config, labels)
    assert.deepEqual(result.rows, [
        ['Region', 'Amount'],
        ['East', 15],
        ['West', 27],
    ])
})

test('date grouping buckets by month and quarter', () => {
    const sheet = sheetFrom([
        ['Date', 'Amount'],
        ['2024-01-05', 10],
        ['2024-01-20', 20],
        ['2024-02-02', 5],
        ['2024/04/11', 7],
    ])
    const byMonth: PivotConfig = {
        sources: [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 4, endColumn: 1 } }],
        hasHeader: true,
        rows: [{ field: 'Date', dateGroup: 'month' }],
        columns: [],
        values: [{ field: 'Amount', aggregate: 'sum' }],
        showRowTotals: false,
        showColumnTotals: false,
    }
    assert.deepEqual(computePivot([sheet], byMonth, labels).rows, [
        ['Date', 'Amount'],
        ['2024-01', 30],
        ['2024-02', 5],
        ['2024-04', 7],
    ])

    const byQuarter: PivotConfig = { ...byMonth, rows: [{ field: 'Date', dateGroup: 'quarter' }] }
    assert.deepEqual(computePivot([sheet], byQuarter, labels).rows, [
        ['Date', 'Amount'],
        ['2024 Q1', 35],
        ['2024 Q2', 7],
    ])
})

test('drill-down returns the matching source rows', () => {
    const sheet = sheetFrom([
        ['Date', 'Amount'],
        ['2024-01-05', 10],
        ['2024-01-20', 20],
        ['2024-02-02', 5],
    ])
    const config: PivotConfig = {
        sources: [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 3, endColumn: 1 } }],
        hasHeader: true,
        rows: [{ field: 'Date', dateGroup: 'month' }],
        columns: [],
        values: [{ field: 'Amount', aggregate: 'sum' }],
        showRowTotals: false,
        showColumnTotals: false,
    }
    const result = computePivot([sheet], config, labels)
    const detail = pivotDrillDown([sheet], config, result, 1, 1, labels)
    assert.ok(detail)
    assert.equal(detail!.rows.length, 2)
    assert.deepEqual(detail!.rows[0].slice(0, 2), ['2024-01-05', 10])
    assert.equal(detail!.rows[0][2], 'Sheet1!A2')
})

test('upsertPivotSheet replaces an existing pivot sheet of the same name', () => {
    const workbook = createWorkbookFromRows([
        ['Region', 'Amount'],
        ['East', 10],
        ['West', 20],
    ])
    const config: PivotConfig = {
        sources: [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 1 } }],
        hasHeader: true,
        rows: [{ field: 'Region' }],
        columns: [],
        values: [{ field: 'Amount', aggregate: 'sum' }],
        showRowTotals: false,
        showColumnTotals: false,
    }
    const once = upsertPivotSheet(workbook, config, '透视表', labels)
    assert.equal(once.sheets.length, 2)
    assert.deepEqual(once.sheets[1].rows[1].slice(0, 2), ['East', 10])
    assert.equal(once.activeSheet, 1)
    assert.ok(once.sheets[1].pivot)

    const twice = upsertPivotSheet(once, { ...config, values: [{ field: 'Amount', aggregate: 'count' }] }, '透视表', labels)
    assert.equal(twice.sheets.length, 2)
    assert.deepEqual(twice.sheets[1].rows[1].slice(0, 2), ['East', 1])
})

test('pivot config survives a normalize round-trip and migrates the legacy shape', () => {
    const workbook = createWorkbookFromRows([
        ['Region', 'Amount'],
        ['East', 10],
        ['West', 20],
    ])
    const config: PivotConfig = {
        sources: [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 1 } }],
        hasHeader: true,
        rows: [{ field: 'Region' }],
        columns: [],
        values: [{ field: 'Amount', aggregate: 'average' }],
        showRowTotals: false,
        showColumnTotals: true,
    }
    const withPivot = upsertPivotSheet(workbook, config, '透视表', labels)
    const roundTripped = normalizeWorkbookData(JSON.parse(JSON.stringify(withPivot)))
    assert.deepEqual(roundTripped.sheets[1].pivot, config)
    assert.deepEqual(roundTripped.sheets[1].rows[1].slice(0, 2), ['East', 10])
    assert.notEqual(workbookContentKey(withPivot), workbookContentKey(workbook))

    // Legacy single-source + string field lists still migrate.
    const legacy = normalizeWorkbookData({
        id: 'legacy',
        version: 2,
        activeSheet: 0,
        sheets: [
            workbook.sheets[0],
            {
                name: 'P',
                rows: [['x']],
                rowCount: 1,
                columnCount: 1,
                pivot: {
                    sourceSheet: 0,
                    sourceRange: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 1 },
                    hasHeader: true,
                    rows: ['Region'],
                    columns: ['Quarter'],
                    values: [{ field: 'Amount', aggregate: 'sum' }],
                },
            },
        ],
    })
    assert.deepEqual(legacy.sheets[1].pivot?.sources, [{ sheet: 0, range: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 1 } }])
    assert.deepEqual(legacy.sheets[1].pivot?.rows, [{ field: 'Region' }])
    assert.deepEqual(legacy.sheets[1].pivot?.columns, [{ field: 'Quarter' }])
})
