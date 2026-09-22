/**
 * Flat Y.Doc-backed workbook store.
 *
 * Drives the store with a tiny fake map implementing the same slice yjs does, so
 * the load/seed/diff/observe contract is covered without a browser or a real
 * collaboration server.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyWorkbookData, createSheetData, type WorkbookData } from '../src/spreadsheet/workbook-data.ts'
import { diffWorkbook } from '../src/spreadsheet/workbook-diff.ts'
import {
    applyWorkbookDiff,
    clearWorkbook,
    hasWorkbook,
    loadWorkbook,
    observeWorkbook,
    seedWorkbook,
    type StoreDoc,
    type StoreMap,
} from '../src/spreadsheet/workbook-store.ts'

class FakeMap implements StoreMap {
    data = new Map<string, unknown>()
    observers = new Set<(event: unknown, transaction: { origin: unknown }) => void>()
    private changes: Set<string> | null = null

    get(key: string): unknown { return this.data.get(key) }
    set(key: string, value: unknown): void { this.data.set(key, value); this.changes?.add(key) }
    delete(key: string): void { this.data.delete(key); this.changes?.add(key) }
    has(key: string): boolean { return this.data.has(key) }
    forEach(cb: (value: unknown, key: string) => void): void { for (const [key, value] of this.data) cb(value, key) }
    observe(cb: (event: unknown, transaction: { origin: unknown }) => void): void { this.observers.add(cb) }
    unobserve(cb: (event: unknown, transaction: { origin: unknown }) => void): void { this.observers.delete(cb) }
    begin(changes: Set<string>): void { this.changes = changes }
    end(): void { this.changes = null }
    emit(keys: Set<string>, origin: unknown): void {
        for (const cb of this.observers) cb({ keysChanged: keys }, { origin })
    }
}

class FakeDoc implements StoreDoc {
    map = new FakeMap()
    getMap(): StoreMap { return this.map }
    transact<T>(fn: () => T, origin?: unknown): T {
        const changes = new Set<string>()
        this.map.begin(changes)
        try {
            return fn()
        } finally {
            this.map.end()
            if (changes.size > 0) this.map.emit(changes, origin)
        }
    }
}

function workbook(): WorkbookData {
    const sheet = createSheetData('Data', 3, 3, [
        [1, 2, null],
        [null, 3, null],
        [null, null, null],
    ])
    sheet.styles = { A1: 'font-weight: bold' }
    sheet.numberFormats = { B2: 'percent' }
    sheet.rawValues = { B2: 0.25 }
    sheet.columnWidths = { '0': 140 }
    sheet.rowHeights = { '1': 44 }
    sheet.merges = [[0, 0, 0, 1]]
    return { ...createEmptyWorkbookData(3, 3), sheets: [sheet], activeSheet: 0 }
}

test('seeding and loading round-trips the workbook', () => {
    const doc = new FakeDoc()
    const source = workbook()
    assert.equal(hasWorkbook(doc, 'ref-1'), false)
    seedWorkbook(doc, 'ref-1', source)
    assert.equal(hasWorkbook(doc, 'ref-1'), true)
    const loaded = loadWorkbook(doc, 'ref-1')
    assert.ok(loaded)
    assert.equal(loaded!.id, source.id)
    assert.equal(loaded!.sheets[0].name, 'Data')
    assert.equal(loaded!.sheets[0].rows[0][0], 1)
    assert.equal(loaded!.sheets[0].rows[1][1], 3)
    assert.equal(loaded!.sheets[0].styles?.A1, 'font-weight: bold')
    assert.equal(loaded!.sheets[0].numberFormats?.B2, 'percent')
    assert.equal(loaded!.sheets[0].rawValues?.B2, 0.25)
    assert.equal(loaded!.sheets[0].columnWidths?.['0'], 140)
    assert.equal(loaded!.sheets[0].rowHeights?.['1'], 44)
    assert.deepEqual(loaded!.sheets[0].merges, [[0, 0, 0, 1]])
})

test('a cell edit stores a single key', () => {
    const doc = new FakeDoc()
    const before = workbook()
    seedWorkbook(doc, 'ref-2', before)
    const after = workbook()
    after.sheets[0].rows[0][0] = 42
    const operations = applyWorkbookDiff(doc, 'ref-2', diffWorkbook(before, after))
    assert.equal(operations, 1)
    assert.equal(loadWorkbook(doc, 'ref-2')!.sheets[0].rows[0][0], 42)
})

test('an unchanged save writes nothing', () => {
    const doc = new FakeDoc()
    const before = workbook()
    seedWorkbook(doc, 'ref-3', before)
    assert.equal(applyWorkbookDiff(doc, 'ref-3', diffWorkbook(before, workbook())), 0)
})

test('remote writes notify the observer, local writes do not', () => {
    const doc = new FakeDoc()
    seedWorkbook(doc, 'ref-4', workbook())
    const seen: number[] = []
    const stop = observeWorkbook(doc, 'ref-4', (next) => seen.push(next.sheets[0].rows[0][0] as number))

    // Local store write: suppressed by the origin marker.
    const next = workbook()
    next.sheets[0].rows[0][0] = 7
    applyWorkbookDiff(doc, 'ref-4', diffWorkbook(workbook(), next))
    assert.deepEqual(seen, [])

    // A write from another client: delivered.
    doc.transact(() => {
        doc.getMap('x').set('ref-4|d:value:0:0:0', 7)
    }, { remote: true })
    stop()
    assert.deepEqual(seen, [7])

    // After unsubscribing, no further delivery.
    doc.transact(() => {
        doc.getMap('x').set('ref-4|d:value:0:0:0', 8)
    }, { remote: true })
    assert.deepEqual(seen, [7])
})

test('a structure change rewrites the whole workbook', () => {
    const doc = new FakeDoc()
    const before = workbook()
    seedWorkbook(doc, 'ref-5', before)
    const after = workbook()
    after.sheets.push(createSheetData('Second', 2, 2, [[9, 9], [9, 9]]))
    const diff = diffWorkbook(before, after)
    assert.equal(diff.structureChanged, true)
    clearWorkbook(doc, 'ref-5')
    seedWorkbook(doc, 'ref-5', after)
    const loaded = loadWorkbook(doc, 'ref-5')
    assert.equal(loaded!.sheets.length, 2)
    assert.equal(loaded!.sheets[1].name, 'Second')
    assert.equal(loaded!.sheets[1].rows[0][0], 9)
})

test('clearing removes every entry for the ref', () => {
    const doc = new FakeDoc()
    seedWorkbook(doc, 'ref-6', workbook())
    assert.equal(hasWorkbook(doc, 'ref-6'), true)
    clearWorkbook(doc, 'ref-6')
    assert.equal(hasWorkbook(doc, 'ref-6'), false)
    assert.equal(loadWorkbook(doc, 'ref-6'), null)
})

test('applyWorkbookDiff reports zero for an empty diff', () => {
    const doc = new FakeDoc()
    seedWorkbook(doc, 'ref-7', workbook())
    const before = workbook()
    assert.equal(applyWorkbookDiff(doc, 'ref-7', diffWorkbook(before, workbook())), 0)
})
