/**
 * Pagination contract for the spreadsheet grid.
 *
 * Why this test exists: `pagination` is a **worksheet** option in jspreadsheet,
 * not a spreadsheet-config one. Setting it next to `tabs`/`toolbar` is accepted
 * silently and does nothing — `updateResult` then appends every row of the data
 * to the `tbody`, which is exactly the 9,000-row lag this was meant to fix. That
 * mistake shipped once, so it is pinned here at the level the library actually
 * observes: the number of rows attached to the `tbody`.
 *
 * These run the real library through a minimal DOM shim (see helpers/dom-shim).
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { installDom, type ShimNode } from './helpers/dom-shim.ts'

const ROWS = 900
const COLUMNS = 6

interface JssWorksheet {
    options: Record<string, any>
    tbody: ShimNode
    rows: unknown[]
    pageNumber?: number
    page?: (page: number) => void
}

type JssFactory = (element: ShimNode, options: Record<string, any>) => JssWorksheet[]

let factory: JssFactory

before(async () => {
    installDom()
    // Imported only after the globals exist: the UMD bundle touches `document`
    // at module scope.
    const mod: any = await import('jspreadsheet-ce')
    factory = (mod?.default ?? mod)?.jspreadsheet ?? mod?.default ?? mod
    assert.equal(typeof factory, 'function', 'jspreadsheet factory did not resolve')
})

/** The worksheet shape `buildOptions` produces, with pagination where it belongs. */
function mountWorksheet(pagination: number | undefined): JssWorksheet {
    const data = Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLUMNS }, (_, c) => r * COLUMNS + c),
    )
    const host = (globalThis as any).document.createElement('div')
    ;(globalThis as any).document.body.appendChild(host)
    const sheets = factory(host, {
        tabs: true,
        toolbar: false,
        tableOverflow: true,
        tableHeight: '100%',
        worksheets: [{
            data,
            minDimensions: [COLUMNS, ROWS],
            worksheetName: 'Sheet1',
            ...(pagination ? { pagination } : {}),
            columns: Array.from({ length: COLUMNS }, () => ({ width: 96 })),
        }],
    })
    const sheet = sheets[0]
    assert.ok(sheet, 'no worksheet was created')
    return sheet
}

test('a worksheet-level pagination bounds the rows attached to the tbody', () => {
    const sheet = mountWorksheet(200)
    assert.equal(sheet.options.pagination, 200)
    assert.equal(sheet.tbody.childNodes.length, 200, 'tbody should hold exactly one page')
})

test('the whole dataset stays addressable regardless of the page', () => {
    const sheet = mountWorksheet(200)
    // Only *attachment* is paged. Everything the save/read paths use must still
    // cover every row, otherwise pagination would silently truncate the document.
    assert.equal(sheet.rows.length, ROWS)
    assert.equal(sheet.options.data.length, ROWS)
})

test('without pagination every row is attached — the failure this guards against', () => {
    const sheet = mountWorksheet(undefined)
    assert.equal(sheet.tbody.childNodes.length, ROWS, 'control: unpaged grid keeps all rows')
})

test('page() moves the attached window and reports the new page', () => {
    const sheet = mountWorksheet(200)
    sheet.page?.(1)
    assert.equal(sheet.pageNumber, 1)
    assert.equal(sheet.tbody.childNodes.length, 200)
    // The second page's first row is the dataset's row 200, not row 0.
    const firstCell = sheet.tbody.childNodes[0]?.children[1] as ShimNode | undefined
    assert.equal(firstCell?.textContent, String(200 * COLUMNS))
})

test('lazyLoading is not an alternative: tableOverflow turns it off', () => {
    // The reasoning behind choosing pagination, pinned so a future change does
    // not "simplify" it into lazyLoading. `prepareTable` disables lazyLoading
    // unless `tableOverflow` (or fullscreen) is on, and `tableOverflow` is what
    // makes the grid scroll inside its block. Conversely `setData` disables
    // pagination — with a console.error — when lazyLoading *is* live. The two
    // never coexist, so with tableOverflow required, pagination is the only
    // switch left that bounds the attached row count.
    const data = Array.from({ length: 50 }, (_, r) => [r])
    const host = (globalThis as any).document.createElement('div')
    ;(globalThis as any).document.body.appendChild(host)
    const sheets = factory(host, {
        tabs: false,
        tableOverflow: true,
        worksheets: [{
            data,
            minDimensions: [1, 50],
            worksheetName: 'S',
            pagination: 20,
            lazyLoading: true,
            columns: [{ width: 96 }],
        }],
    })
    const sheet = sheets[0]!
    assert.equal(sheet.options.lazyLoading, false, 'tableOverflow forces lazyLoading off')
    assert.equal(sheet.options.pagination, 20, 'pagination survives and is what bounds the tbody')
    assert.equal(sheet.tbody.childNodes.length, 20)
})
