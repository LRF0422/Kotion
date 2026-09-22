import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createSheetData, createWorkbookFromRows, type WorkbookData } from '../src/spreadsheet/workbook-data.ts'
import { registerSpreadsheetLive, unregisterSpreadsheetLive } from '../src/spreadsheet/workbook-registry.ts'
import { spreadsheetExpertSkill } from '../src/spreadsheet/skills.ts'

// Exercise the real tools and Zod schemas without loading the browser-only UI
// barrels. The production i18n translator and workbook modules remain real.
const sourceRoot = new URL('../src/', import.meta.url).href
const uiRequire = createRequire(new URL('../../ui/package.json', import.meta.url))
const zodUrl = pathToFileURL(uiRequire.resolve('zod')).href
const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (context.parentURL?.startsWith(sourceRoot)) {
            if (specifier === '@kn/ui') return nextResolve(zodUrl, context)
            if (specifier === '@kn/common') {
                return { url: 'data:text/javascript,export const i18n = { language: "en" }', shortCircuit: true }
            }
            if (specifier === '@kn/editor') {
                // Only the runtime helper is imported; type-only imports are erased.
                return {
                    url: 'data:text/javascript,export const getCollaborationRuntime = () => undefined',
                    shortCircuit: true,
                }
            }
            if (specifier === '../i18n') return nextResolve('../i18n/index.ts', context)
            if (specifier.startsWith('.') && !specifier.endsWith('.ts')) {
                return nextResolve(specifier + '.ts', context)
            }
        }
        return nextResolve(specifier, context)
    },
})
const {
    createPivotTableTool,
    getSpreadsheetInfoTool,
    readSpreadsheetDataTool,
    updateSpreadsheetDataTool,
    spreadsheetTools,
} = await import('../src/spreadsheet/tools.ts')
const { z } = await import(zodUrl)
hooks.deregister()

function fixture(workbook = createWorkbookFromRows([
    ['Region', 'Date', 'Amount'],
    ['East', '2026-01-05', 10],
    ['East', '2026-02-10', 20],
    ['West', '2026-04-01', 5],
])) {
    let node = { type: { name: 'spreadsheet' }, attrs: { workbookData: workbook, height: 500, marker: 'keep' } }
    let dispatches = 0
    const state = {
        doc: {
            descendants: (visit: any) => visit(node, 0),
            nodeAt: () => node,
        },
        tr: { setNodeMarkup: (_pos: number, _type: unknown, attrs: any) => ({ attrs }) },
    }
    const editor: any = {
        isEditable: true,
        state,
        view: {
            state,
            dispatch: (transaction: any) => {
                node = { ...node, attrs: transaction.attrs }
                dispatches++
            },
        },
    }
    return {
        editor,
        get node() { return node },
        get workbook(): WorkbookData { return node.attrs.workbookData },
        get dispatches() { return dispatches },
    }
}

const baseParams = {
    index: 0,
    range: 'A1:C4',
    rows: ['Region'],
    values: [{ field: 'Amount' }],
    outputName: 'Summary',
}

test('pivot tool is registered, required by the skill, and serializable for discovery', () => {
    assert.ok(spreadsheetTools.includes(createPivotTableTool))
    assert.ok(spreadsheetExpertSkill.requiredTools.includes('createPivotTable'))
    assert.match(spreadsheetExpertSkill.description, /pivot/i)
    assert.ok(spreadsheetExpertSkill.tags.includes('pivot'))
    const schema = z.toJSONSchema(createPivotTableTool.inputSchema)
    assert.deepEqual(schema.required, ['index', 'values'])
    assert.equal(schema.properties.sources.minItems, 1)
    assert.equal(schema.properties.values.minItems, 1)
    assert.ok(getSpreadsheetInfoTool.readOnly)
    assert.ok(readSpreadsheetDataTool.readOnly)
})

test('agent creates a date-grouped pivot, discovers its config, and reads the result', async () => {
    const f = fixture()
    const source = structuredClone(f.workbook.sheets[0])
    const result = await createPivotTableTool.execute(f.editor)({
        ...baseParams,
        columns: [{ field: 'Date', dateGroup: 'quarter' }],
    })
    assert.equal(result.success, true)
    assert.equal(result.updated, false)
    assert.equal(result.sheetIndex, 1)
    assert.equal(result.range, 'A1:D4')
    assert.equal(f.dispatches, 1)
    assert.equal(f.node.attrs.marker, 'keep')
    assert.deepEqual(f.workbook.sheets[0], source)
    assert.equal(f.workbook.activeSheet, 1)
    assert.deepEqual(f.workbook.sheets[1].pivot?.columns, [{ field: 'Date', dateGroup: 'quarter' }])

    const info = await getSpreadsheetInfoTool.execute(f.editor)()
    assert.equal(info.spreadsheets?.[0].sheets[0].usedRange, 'A1:C4')
    const pivot = info.spreadsheets?.[0].sheets[1]
    assert.equal(pivot?.isPivot, true)
    assert.deepEqual(pivot?.pivot?.sources, [{ sheet: 'Sheet1', range: 'A1:C4' }])

    const read = await readSpreadsheetDataTool.execute(f.editor)({ index: 0, sheetName: 'Summary', range: result.range! })
    assert.deepEqual(read.data, [
        ['Region', '2026 Q1', '2026 Q2', 'Total'],
        ['East', 30, null, 30],
        ['West', null, 5, 5],
        ['Total', 30, 5, 35],
    ])
})

test('cross-sheet union accepts sources without a top-level range', async () => {
    const f = fixture()
    f.workbook.sheets.push(createSheetData('Q2', 4, 3, [
        ['Region', 'Date', 'Amount'],
        ['East', '2026-05-01', 7],
    ]))
    const params = {
        index: 0,
        sources: [{ sheet: 'Sheet1', range: 'A1:C4' }, { sheet: 'Q2', range: 'A1:C2' }],
        rows: ['Region'],
        values: [{ field: 'Amount' }],
        outputName: 'Summary',
    }
    assert.equal(createPivotTableTool.inputSchema.safeParse(params).success, true)
    const result = await createPivotTableTool.execute(f.editor)(params)
    assert.equal(result.success, true)
    assert.equal(result.sources, 2)
    assert.deepEqual(f.workbook.sheets[2].rows[1].slice(0, 2), ['East', 37])
})

test('same output name reconfigures an existing pivot without adding another sheet', async () => {
    const f = fixture()
    await createPivotTableTool.execute(f.editor)(baseParams)
    const result = await createPivotTableTool.execute(f.editor)({
        ...baseParams,
        values: [{ field: 'Amount', aggregate: 'average' }],
        showColumnTotals: false,
    })
    assert.equal(result.success, true)
    assert.equal(result.updated, true)
    assert.equal(f.workbook.sheets.length, 2)
    assert.deepEqual(f.workbook.sheets[1].rows[1].slice(0, 2), ['East', 15])
    assert.equal(f.workbook.sheets[1].pivot?.showColumnTotals, false)
})

test('pivot generation reads the live snapshot instead of stale node attributes', async (t) => {
    const f = fixture()
    const node = f.node
    const live = structuredClone(f.workbook)
    live.sheets[0].rows[1][2] = 100
    registerSpreadsheetLive(node, { getSnapshot: () => live, isEditable: () => true, setRangeValues: () => null })
    t.after(() => unregisterSpreadsheetLive(node))
    const result = await createPivotTableTool.execute(f.editor)(baseParams)
    assert.equal(result.success, true)
    assert.deepEqual(f.workbook.sheets[1].rows[1].slice(0, 2), ['East', 120])
    assert.equal(f.workbook.sheets[0].rows[1][2], 100)
})

test('no-header sources and duplicate field labels remain addressable', async () => {
    const f = fixture(createWorkbookFromRows([['East', 10, 3], ['East', 20, 4]]))
    const result = await createPivotTableTool.execute(f.editor)({
        ...baseParams, range: 'A1:C2', hasHeader: false, rows: ['A'], values: [{ field: 'C' }],
    })
    assert.equal(result.success, true)
    assert.deepEqual(f.workbook.sheets[1].rows[1].slice(0, 2), ['East', 7])

    const duplicate = fixture(createWorkbookFromRows([['Region', 'Amount', 'Amount'], ['East', 10, 3]]))
    const created = await createPivotTableTool.execute(duplicate.editor)({
        ...baseParams, range: 'A1:C2', values: [{ field: 'Amount (2)' }],
    })
    assert.equal(created.success, true)
    assert.deepEqual(duplicate.workbook.sheets[1].rows[1].slice(0, 2), ['East', 3])
})

for (const [name, changes, message] of [
    ['missing range', { range: undefined }, /Provide range/],
    ['empty sources', { sources: [] }, /Too small/],
    ['missing sheet', { sourceSheet: 'Missing' }, /Missing/],
    ['invalid range', { range: 'bad' }, /bad/],
    ['out-of-bounds range', { range: 'A1:C999999999' }, /Source ranges/],
    ['header-only range', { range: 'A1:C1' }, /data rows/],
    ['missing values', { values: [] }, /Too small/],
    ['blank field', { values: [{ field: ' ' }] }, /Too small/],
    ['invalid aggregate', { values: [{ field: 'Amount', aggregate: 'median' }] }, /Invalid option/],
    ['invalid date bucket', { rows: [{ field: 'Date', dateGroup: 'week' }] }, /Invalid/],
    ['unknown row field', { rows: ['Missing'] }, /Unknown pivot fields/],
    ['unknown column field', { columns: ['Missing'] }, /Unknown pivot fields/],
    ['unknown value field', { values: [{ field: 'Missing' }] }, /Unknown pivot fields/],
    ['regular output name collision', { outputName: 'Sheet1' }, /regular worksheet/],
] as const) {
    test(`invalid pivot request rejects ${name} without changing the document`, async () => {
        const f = fixture()
        const before = structuredClone(f.workbook)
        const result = await createPivotTableTool.execute(f.editor)({ ...baseParams, ...changes } as any)
        assert.equal(result.success, false)
        assert.match(result.error!, message)
        if (name.startsWith('unknown')) assert.deepEqual(result.availableFields, ['Region', 'Date', 'Amount'])
        assert.equal(f.dispatches, 0)
        assert.deepEqual(f.workbook, before)
    })
}

test('cross-sheet sources reject mismatched widths and reordered headers', async () => {
    for (const range of ['A1:B2', 'A1:C2']) {
        const f = fixture()
        f.workbook.sheets.push(createSheetData('Other', 2, 3, [['Amount', 'Date', 'Region'], [10, '2026-01-01', 'East']]))
        const result = await createPivotTableTool.execute(f.editor)({
            ...baseParams, sources: [{ range: 'A1:C4' }, { sheet: 'Other', range }],
        })
        assert.equal(result.success, false)
        assert.match(result.error!, /same number of columns|headers must match/)
        assert.equal(f.dispatches, 0)
    }
})

test('generated pivot sheets cannot be used as sources or edited directly', async () => {
    const f = fixture()
    await createPivotTableTool.execute(f.editor)(baseParams)
    const result = await createPivotTableTool.execute(f.editor)({ ...baseParams, sourceSheet: 'Summary', outputName: 'Second' })
    assert.equal(result.success, false)
    const write = await updateSpreadsheetDataTool.execute(f.editor)({ index: 0, sheetName: 'Summary', data: [['Overwrite']] })
    assert.equal(write.success, false)
    assert.match(write.error!, /generated/)
    assert.equal(f.dispatches, 1)
})

test('source updates refresh persisted pivots even without a mounted grid', async () => {
    const f = fixture()
    await createPivotTableTool.execute(f.editor)(baseParams)
    const result = await updateSpreadsheetDataTool.execute(f.editor)({ index: 0, startCell: 'C2', data: [[50]] })
    assert.equal(result.success, true)
    assert.deepEqual(f.workbook.sheets[1].rows[1].slice(0, 2), ['East', 70])
})

test('read-only editors and live grids reject pivot creation and source edits', async (t) => {
    for (const liveReadOnly of [false, true]) {
        const f = fixture()
        if (liveReadOnly) {
            const node = f.node
            registerSpreadsheetLive(node, { getSnapshot: () => f.workbook, isEditable: () => false, setRangeValues: () => null })
            t.after(() => unregisterSpreadsheetLive(node))
        } else {
            f.editor.isEditable = false
        }
        const result = await createPivotTableTool.execute(f.editor)(baseParams)
        assert.equal(result.success, false)
        assert.match(result.error!, /read-only/)
        const write = await updateSpreadsheetDataTool.execute(f.editor)({ index: 0, data: [['Overwrite']] })
        assert.equal(write.success, false)
        assert.equal(f.dispatches, 0)
    }
})

test('oversized cross-tab output fails before persisting a worksheet', async () => {
    const f = fixture(createWorkbookFromRows([
        ['Region', 'Date', 'Amount'],
        ...Array.from({ length: 260 }, (_, i) => ['East', `Category ${i}`, i]),
    ]))
    const result = await createPivotTableTool.execute(f.editor)({ ...baseParams, range: 'A1:C261', columns: ['Date'] })
    assert.equal(result.success, false)
    assert.match(result.error!, /Pivot output exceeds/)
    assert.equal(f.dispatches, 0)
})
