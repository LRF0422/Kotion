/**
 * Flat, cell-level workbook store on top of a shared Y.Doc (L3).
 *
 * Why: embedding the whole workbook in a ProseMirror node attribute meant every
 * autosave re-serialised and CRDT-replicated the entire table. L3 keeps only a
 * workbook ref in the node and stores the data here, so a cell edit touches one
 * Y.Map key instead of the document.
 *
 * Layout (one flat Y.Map, keys prefixed by ref so no nested Y types are needed):
 *
 *   <ref>|meta                 EncodedMeta (sheet names/dims/pivot, active index)
 *   <ref>|v:<sheet>:<row>:<col>  cell value (only non-empty cells are stored)
 *   <ref>|s:<sheet>:<row>:<col>  style cssText
 *   <ref>|nf:<sheet>:<row>:<col> number format kind
 *   <ref>|rv:<sheet>:<row>:<col> raw value behind a number format
 *   <ref>|cw:<sheet>:<col>       column width override
 *   <ref>|rh:<sheet>:<row>       row height override
 *   <ref>|mg:<sheet>:<index>     merge range
 *
 * The module types the Y.Doc structurally instead of importing yjs, and keeps
 * every relative import type-only, so the Node test runner can load it (relative
 * runtime imports are resolved without extension guessing there). The tests
 * drive it with a small fake map.
 */
import type { CellValue, NumberFormatKind, SheetData, WorkbookData } from './workbook-data'
import type { WorkbookDiff } from './workbook-diff'

/** The shared Y.Map name the office plugin reserves for spreadsheet data. */
export const WORKBOOK_STORE = 'kn-spreadsheets'

/** Origin marker so the store can ignore the observer firing for its own writes. */
export const LOCAL_ORIGIN = Object.freeze({ kn: 'office-spreadsheet-local' })

/** The slice of Y.Map this module uses. */
export interface StoreMap {
    get(key: string): unknown
    set(key: string, value: unknown): void
    delete(key: string): void
    has(key: string): boolean
    forEach(callback: (value: unknown, key: string) => void): void
    observe(callback: (event: unknown, transaction: { origin: unknown }) => void): void
    unobserve(callback: (event: unknown, transaction: { origin: unknown }) => void): void
}

/** The slice of Y.Doc this module uses. */
export interface StoreDoc {
    getMap(name: string): StoreMap
    transact?<T>(fn: () => T, origin?: unknown): T
}

interface EncodedSheetMeta {
    name: string
    rowCount: number
    columnCount: number
    pivot?: SheetData['pivot']
}

interface EncodedMeta {
    id: string
    activeSheet: number
    sheets: EncodedSheetMeta[]
}

/** Inline A1 helpers: see the note at the top about Node's literal resolution. */
function parseA1(ref: string): { row: number; column: number } | null {
    const match = String(ref ?? '').trim().match(/^([A-Za-z]+)(\d+)$/)
    if (!match) return null
    let column = 0
    const letters = match[1]!.toUpperCase()
    for (let i = 0; i < letters.length; i += 1) column = column * 26 + (letters.charCodeAt(i) - 64)
    column -= 1
    const row = Number.parseInt(match[2]!, 10) - 1
    if (row < 0 || column < 0) return null
    return { row, column }
}

function formatA1(row: number, column: number): string {
    let label = ''
    let value = column
    while (value >= 0) {
        label = String.fromCharCode((value % 26) + 65) + label
        value = Math.floor(value / 26) - 1
    }
    return label + (row + 1)
}

function prefix(ref: string): string {
    return ref + '|'
}

function run(doc: StoreDoc, fn: () => void): void {
    if (typeof doc.transact === 'function') doc.transact(fn, LOCAL_ORIGIN)
    else fn()
}

function hasOperations(diff: WorkbookDiff): boolean {
    return (
        diff.grid.length > 0 ||
        diff.dimensions.length > 0 ||
        diff.merges.length > 0 ||
        diff.meta.length > 0 ||
        diff.activeSheet !== null ||
        diff.structureChanged
    )
}

/** True when the store already holds a workbook for this ref. */
export function hasWorkbook(doc: StoreDoc, ref: string): boolean {
    return doc.getMap(WORKBOOK_STORE).has(prefix(ref) + 'meta')
}

/** Read a workbook back into the persisted model, or null when absent. */
export function loadWorkbook(doc: StoreDoc, ref: string): WorkbookData | null {
    const map = doc.getMap(WORKBOOK_STORE)
    const meta = map.get(prefix(ref) + 'meta') as EncodedMeta | undefined
    if (!meta || !Array.isArray(meta.sheets) || meta.sheets.length === 0) return null

    // Rows start sparse so loading costs O(non-empty cells); the adapter pads
    // them to the declared extent when it mounts the engine.
    const sheets: SheetData[] = meta.sheets.map((sheet) => ({
        name: sheet.name,
        rows: [],
        rowCount: Math.max(1, Math.floor(sheet.rowCount) || 1),
        columnCount: Math.max(1, Math.floor(sheet.columnCount) || 1),
        ...(sheet.pivot ? { pivot: sheet.pivot } : {}),
    }))

    const base = prefix(ref)
    map.forEach((value, key) => {
        if (!key.startsWith(base)) return
        const rest = key.slice(base.length)
        if (rest === 'meta') return
        const parts = rest.split(':')
        const kind = parts[0]
        const sheet = sheets[Number(parts[1])]
        if (!sheet) return
        if (kind === 'v' || kind === 's' || kind === 'nf' || kind === 'rv') {
            const row = Number(parts[2])
            const column = Number(parts[3])
            if (!Number.isFinite(row) || !Number.isFinite(column)) return
            if (kind === 'v') writeCell(sheet, row, column, value as CellValue)
            else setRefEntry(sheet, kind, row, column, value)
        } else if (kind === 'cw' || kind === 'rh') {
            const index = Number(parts[2])
            if (!Number.isFinite(index)) return
            const target = kind === 'cw' ? (sheet.columnWidths ??= {}) : (sheet.rowHeights ??= {})
            target[String(index)] = Number(value)
        } else if (kind === 'mg') {
            const index = Number(parts[2])
            if (!Number.isFinite(index)) return
            if (!sheet.merges) sheet.merges = []
            ;(sheet.merges as unknown[])[index] = value
        }
    })
    sheets.forEach((sheet) => {
        if (sheet.merges) sheet.merges = sheet.merges.filter(Boolean)
        if (sheet.columnWidths && Object.keys(sheet.columnWidths).length === 0) delete sheet.columnWidths
        if (sheet.rowHeights && Object.keys(sheet.rowHeights).length === 0) delete sheet.rowHeights
    })

    return {
        id: meta.id || ref,
        sheets,
        activeSheet: Math.min(Math.max(Number(meta.activeSheet) || 0, 0), sheets.length - 1),
        version: 2,
    }
}

function writeCell(sheet: SheetData, row: number, column: number, value: CellValue): void {
    const line = (sheet.rows[row] ??= [])
    line[column] = value
}

function setRefEntry(sheet: SheetData, kind: string, row: number, column: number, value: unknown): void {
    const ref = formatA1(row, column)
    if (kind === 's') (sheet.styles ??= {})[ref] = String(value)
    else if (kind === 'nf') (sheet.numberFormats ??= {})[ref] = value as NumberFormatKind
    else if (kind === 'rv') (sheet.rawValues ??= {})[ref] = value as CellValue
}

/** Seed (or replace) the whole workbook for a ref. */
export function seedWorkbook(doc: StoreDoc, ref: string, workbook: WorkbookData): void {
    const map = doc.getMap(WORKBOOK_STORE)
    const base = prefix(ref)
    run(doc, () => {
        map.set(base + 'meta', encodeMeta(workbook))
        writeGridSet(map, ref, workbook)
        writeRefMaps(map, ref, workbook)
        writeDimensions(map, ref, workbook)
        writeMerges(map, ref, workbook)
    })
}

/** Delete every entry for a ref. */
export function clearWorkbook(doc: StoreDoc, ref: string): void {
    const map = doc.getMap(WORKBOOK_STORE)
    const base = prefix(ref)
    const doomed: string[] = []
    map.forEach((_value, key) => {
        if (key.startsWith(base)) doomed.push(key)
    })
    run(doc, () => {
        for (const key of doomed) map.delete(key)
    })
}

/**
 * Persist the difference between the last snapshot and the live one.
 *
 * Returns the number of Y.Map operations applied. A structure change is reported
 * by the diff, not applied here: the caller rewrites the workbook with
 * {@link clearWorkbook} + {@link seedWorkbook} instead.
 */
export function applyWorkbookDiff(doc: StoreDoc, ref: string, diff: WorkbookDiff): number {
    if (!hasOperations(diff)) return 0
    const map = doc.getMap(WORKBOOK_STORE)
    const base = prefix(ref)
    let operations = 0
    run(doc, () => {
        for (const change of diff.grid) {
            const key = base + gridKey(change.kind, change.sheet, change.row, change.column)
            if (change.value === null) {
                if (map.has(key)) map.delete(key)
            } else {
                map.set(key, change.value)
            }
            operations += 1
        }
        for (const change of diff.dimensions) {
            const key = base + (change.axis === 'column' ? 'cw:' : 'rh:') + change.sheet + ':' + change.index
            if (change.size === null) {
                if (map.has(key)) map.delete(key)
            } else {
                map.set(key, change.size)
            }
            operations += 1
        }
        for (const change of diff.merges) {
            const mergeBase = base + 'mg:' + change.sheet + ':'
            const doomed: string[] = []
            map.forEach((_value, key) => {
                if (key.startsWith(mergeBase)) doomed.push(key)
            })
            for (const key of doomed) map.delete(key)
            ;(change.merges ?? []).forEach((merge, index) => map.set(mergeBase + index, merge))
            operations += 1
        }
        if (diff.meta.length > 0 || diff.activeSheet !== null) {
            const meta = map.get(base + 'meta') as EncodedMeta | undefined
            if (meta) {
                const next: EncodedMeta = {
                    id: meta.id,
                    activeSheet: diff.activeSheet ?? meta.activeSheet,
                    sheets: meta.sheets.slice(),
                }
                for (const change of diff.meta) {
                    if (next.sheets[change.sheet]) {
                        next.sheets[change.sheet] = {
                            ...next.sheets[change.sheet],
                            name: change.name,
                            rowCount: change.rowCount,
                            columnCount: change.columnCount,
                        }
                    }
                }
                map.set(base + 'meta', next)
                operations += 1
            }
        }
    })
    return operations
}

/**
 * Observe remote changes to a workbook.
 *
 * Local writes carry {@link LOCAL_ORIGIN} and are skipped so the live grid is not
 * rebuilt from its own save. Returns an unsubscribe function.
 */
export function observeWorkbook(
    doc: StoreDoc,
    ref: string,
    callback: (workbook: WorkbookData) => void,
): () => void {
    const map = doc.getMap(WORKBOOK_STORE)
    const base = prefix(ref)
    const handler = (event: unknown, transaction: { origin: unknown }) => {
        if (transaction?.origin === LOCAL_ORIGIN) return
        const keys = (event as { keysChanged?: Set<string> } | undefined)?.keysChanged
        if (keys && ![...keys].some((key) => key.startsWith(base))) return
        const workbook = loadWorkbook(doc, ref)
        if (workbook) callback(workbook)
    }
    map.observe(handler)
    return () => map.unobserve(handler)
}

// ── encoding helpers ─────────────────────────────────────────────────────

function gridKey(kind: string, sheet: number, row: number, column: number): string {
    const head = kind === 'value' ? 'v' : kind === 'style' ? 's' : kind === 'numberFormat' ? 'nf' : 'rv'
    return head + ':' + sheet + ':' + row + ':' + column
}

function encodeMeta(workbook: WorkbookData): EncodedMeta {
    return {
        id: workbook.id,
        activeSheet: workbook.activeSheet,
        sheets: workbook.sheets.map((sheet) => ({
            name: sheet.name,
            rowCount: sheet.rowCount,
            columnCount: sheet.columnCount,
            ...(sheet.pivot ? { pivot: sheet.pivot } : {}),
        })),
    }
}

function writeGridSet(map: StoreMap, ref: string, workbook: WorkbookData): void {
    const base = prefix(ref)
    workbook.sheets.forEach((sheet, sheetIndex) => {
        sheet.rows.forEach((row, rowIndex) => {
            row?.forEach((value, columnIndex) => {
                if (value === null || value === undefined) return
                map.set(base + 'v:' + sheetIndex + ':' + rowIndex + ':' + columnIndex, value)
            })
        })
    })
}

function writeRefMaps(map: StoreMap, ref: string, workbook: WorkbookData): void {
    const base = prefix(ref)
    workbook.sheets.forEach((sheet, sheetIndex) => {
        for (const [cellRef, text] of Object.entries(sheet.styles ?? {})) {
            const position = parseA1(cellRef)
            if (position) map.set(base + 's:' + sheetIndex + ':' + position.row + ':' + position.column, text)
        }
        for (const [cellRef, kind] of Object.entries(sheet.numberFormats ?? {})) {
            const position = parseA1(cellRef)
            if (position) map.set(base + 'nf:' + sheetIndex + ':' + position.row + ':' + position.column, kind)
        }
        for (const [cellRef, value] of Object.entries(sheet.rawValues ?? {})) {
            const position = parseA1(cellRef)
            if (position) map.set(base + 'rv:' + sheetIndex + ':' + position.row + ':' + position.column, value)
        }
    })
}

function writeDimensions(map: StoreMap, ref: string, workbook: WorkbookData): void {
    const base = prefix(ref)
    workbook.sheets.forEach((sheet, sheetIndex) => {
        for (const [column, width] of Object.entries(sheet.columnWidths ?? {})) {
            map.set(base + 'cw:' + sheetIndex + ':' + column, width)
        }
        for (const [row, height] of Object.entries(sheet.rowHeights ?? {})) {
            map.set(base + 'rh:' + sheetIndex + ':' + row, height)
        }
    })
}

function writeMerges(map: StoreMap, ref: string, workbook: WorkbookData): void {
    const base = prefix(ref)
    workbook.sheets.forEach((sheet, sheetIndex) => {
        ;(sheet.merges ?? []).forEach((merge, index) => {
            map.set(base + 'mg:' + sheetIndex + ':' + index, merge)
        })
    })
}
