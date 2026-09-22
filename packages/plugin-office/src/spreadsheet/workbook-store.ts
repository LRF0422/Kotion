/**
 * Workbook store on top of a shared Y.Doc (L3).
 *
 * Layout per workbook ref (one flat Y.Map, so no nested Y types are needed):
 *
 *   <ref>|snap                 the whole workbook as ONE sparse JSON string
 *   <ref>|active               active sheet override (number)
 *   <ref>|d:<kind>:<sheet>:..  small per-cell/per-sheet deltas since the snapshot
 *
 * Why snapshot + delta: a per-cell Y.Map entry per cell turned a large workbook
 * into millions of Yjs items, and every full encode/apply had to walk all of
 * them — which made the collaboration document slow to open once the room server
 * persisted it. One snapshot value encodes/loads in one item; edits still write
 * only the changed cells, and the delta is compacted back into the snapshot once
 * it grows past a threshold.
 *
 * The module is import-free apart from type-only relative imports so the Node
 * test runner can load it (see workbook-diff.ts for the note).
 */
import type { CellValue, NumberFormatKind, SheetData, WorkbookData } from './workbook-data'
import type { WorkbookDiff } from './workbook-diff'

/** The shared Y.Map name the office plugin reserves for spreadsheet data. */
export const WORKBOOK_STORE = 'kn-spreadsheets'

/** Origin marker so the store can ignore the observer firing for its own writes. */
export const LOCAL_ORIGIN = Object.freeze({ kn: 'office-spreadsheet-local' })

/** Compact the delta back into the snapshot once it holds this many entries. */
export const DELTA_COMPACT_THRESHOLD = 2000

const SNAPSHOT_KEY = 'snap'
const ACTIVE_KEY = 'active'
const DELTA_PREFIX = 'd:'

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

interface EncodedSheet {
    name: string
    rowCount: number
    columnCount: number
    pivot?: SheetData['pivot']
    cells?: Record<string, CellValue>
    styles?: Record<string, string>
    numberFormats?: Record<string, NumberFormatKind>
    rawValues?: Record<string, CellValue>
    columnWidths?: Record<string, number>
    rowHeights?: Record<string, number>
    merges?: SheetData['merges']
}

interface EncodedWorkbook {
    id: string
    activeSheet: number
    sheets: EncodedSheet[]
}

/** Inline A1 helper: see the note at the top about Node's literal resolution. */
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

function keysWithPrefix(map: StoreMap, base: string): string[] {
    const keys: string[] = []
    map.forEach((_value, key) => {
        if (key.startsWith(base)) keys.push(key)
    })
    return keys
}

/** True when the store already holds a workbook for this ref. */
export function hasWorkbook(doc: StoreDoc, ref: string): boolean {
    return doc.getMap(WORKBOOK_STORE).has(prefix(ref) + SNAPSHOT_KEY)
}

/** Number of delta entries currently held for the ref (drives compaction). */
export function countDeltaKeys(doc: StoreDoc, ref: string): number {
    const base = prefix(ref) + DELTA_PREFIX
    let count = 0
    doc.getMap(WORKBOOK_STORE).forEach((_value, key) => {
        if (key.startsWith(base)) count += 1
    })
    return count
}

/**
 * Read a workbook back into the persisted model.
 *
 * Rows stay sparse (only written cells exist); the adapter pads them to the
 * declared extent when it mounts the engine.
 */
export function loadWorkbook(doc: StoreDoc, ref: string): WorkbookData | null {
    const map = doc.getMap(WORKBOOK_STORE)
    const base = prefix(ref)
    const snapshot = map.get(base + SNAPSHOT_KEY)
    // Older rooms persisted the pre-snapshot layout (a meta entry plus one entry
    // per cell). Read it so an existing document is not loaded empty; the first
    // save then rewrites it as a snapshot.
    if (typeof snapshot !== 'string') return loadLegacyWorkbook(map, base)
    let decoded: WorkbookData
    try {
        decoded = decodeSnapshot(snapshot)
    } catch {
        return null
    }

    map.forEach((value, key) => {
        if (!key.startsWith(base) || key === base + SNAPSHOT_KEY) return
        applyDelta(decoded, key.slice(base.length), value)
    })
    decoded.activeSheet = Math.min(Math.max(Number(decoded.activeSheet) || 0, 0), decoded.sheets.length - 1)
    return decoded
}

/** Read the pre-snapshot layout: one meta entry + one entry per cell. */
function loadLegacyWorkbook(map: StoreMap, base: string): WorkbookData | null {
    const meta = map.get(base + 'meta') as
        | { id?: string; activeSheet?: number; sheets?: EncodedSheet[] }
        | undefined
    if (!meta || !Array.isArray(meta.sheets) || meta.sheets.length === 0) return null
    const workbook: WorkbookData = {
        id: typeof meta.id === 'string' && meta.id ? meta.id : base,
        sheets: meta.sheets.map((sheet) => ({
            name: sheet.name,
            rows: [],
            rowCount: Math.max(1, Math.floor(sheet.rowCount) || 1),
            columnCount: Math.max(1, Math.floor(sheet.columnCount) || 1),
            ...(sheet.pivot ? { pivot: sheet.pivot } : {}),
        })),
        activeSheet: Number(meta.activeSheet) || 0,
        version: 2,
    }
    map.forEach((value, key) => {
        if (!key.startsWith(base) || key === base + 'meta') return
        applyLegacyEntry(workbook, key.slice(base.length), value)
    })
    return workbook
}

function applyLegacyEntry(workbook: WorkbookData, rest: string, value: unknown): void {
    const parts = rest.split(':')
    const kind = parts[0]
    const sheet = workbook.sheets[Number(parts[1])]
    if (!sheet) return
    if (kind === 'cw' || kind === 'rh') {
        const index = Number(parts[2])
        if (!Number.isFinite(index)) return
        const target = kind === 'cw' ? (sheet.columnWidths ??= {}) : (sheet.rowHeights ??= {})
        target[String(index)] = Number(value)
        return
    }
    if (kind === 'mg') {
        const index = Number(parts[2])
        if (!Number.isFinite(index)) return
        if (!sheet.merges) sheet.merges = []
        ;(sheet.merges as unknown[])[index] = value
        return
    }
    const row = Number(parts[2])
    const column = Number(parts[3])
    if (!Number.isFinite(row) || !Number.isFinite(column)) return
    if (kind === 'v') writeCell(sheet, row, column, (value ?? null) as CellValue)
    else if (kind === 's') (sheet.styles ??= {})[formatA1(row, column)] = String(value)
    else if (kind === 'nf') (sheet.numberFormats ??= {})[formatA1(row, column)] = value as NumberFormatKind
    else if (kind === 'rv') (sheet.rawValues ??= {})[formatA1(row, column)] = value as CellValue
}

function writeCell(sheet: SheetData, row: number, column: number, value: CellValue): void {
    const line = (sheet.rows[row] ??= [])
    line[column] = value
}

/** Apply one delta entry (the part after <ref>|) to a decoded workbook. */
function applyDelta(workbook: WorkbookData, rest: string, value: unknown): void {
    if (rest === ACTIVE_KEY) {
        workbook.activeSheet = Number(value) || 0
        return
    }
    if (!rest.startsWith(DELTA_PREFIX)) return
    const parts = rest.slice(DELTA_PREFIX.length).split(':')
    const kind = parts[0]
    const sheet = workbook.sheets[Number(parts[1])]
    if (kind === 'merges') {
        if (sheet) sheet.merges = Array.isArray(value) ? (value as SheetData['merges']) : undefined
        return
    }
    if (kind === 'name') {
        if (sheet) sheet.name = typeof value === 'string' ? value : sheet.name
        return
    }
    if (kind === 'dims') {
        if (sheet && Array.isArray(value)) {
            sheet.rowCount = Math.max(1, Number(value[0]) || 1)
            sheet.columnCount = Math.max(1, Number(value[1]) || 1)
        }
        return
    }
    if (!sheet) return

    if (kind === 'column' || kind === 'row') {
        const index = Number(parts[2])
        if (!Number.isFinite(index)) return
        const target = kind === 'column' ? (sheet.columnWidths ??= {}) : (sheet.rowHeights ??= {})
        if (value === null || value === undefined) delete target[String(index)]
        else target[String(index)] = Number(value)
        return
    }

    const row = Number(parts[2])
    const column = Number(parts[3])
    if (!Number.isFinite(row) || !Number.isFinite(column)) return
    if (kind === 'value') {
        writeCell(sheet, row, column, (value ?? null) as CellValue)
    } else if (kind === 'style') {
        const ref = formatA1(row, column)
        if (value === null || value === undefined) delete sheet.styles?.[ref]
        else (sheet.styles ??= {})[ref] = String(value)
    } else if (kind === 'numberFormat') {
        const ref = formatA1(row, column)
        if (value === null || value === undefined) delete sheet.numberFormats?.[ref]
        else (sheet.numberFormats ??= {})[ref] = value as NumberFormatKind
    } else if (kind === 'rawValue') {
        const ref = formatA1(row, column)
        if (value === null || value === undefined) delete sheet.rawValues?.[ref]
        else (sheet.rawValues ??= {})[ref] = value as CellValue
    }
}

/** Seed (or replace) the whole workbook for a ref and drop its delta. */
export function seedWorkbook(doc: StoreDoc, ref: string, workbook: WorkbookData): void {
    const map = doc.getMap(WORKBOOK_STORE)
    const base = prefix(ref)
    const snapshot = encodeSnapshot(workbook)
    run(doc, () => {
        map.set(base + SNAPSHOT_KEY, snapshot)
        for (const key of keysWithPrefix(map, base)) {
            if (key !== base + SNAPSHOT_KEY) map.delete(key)
        }
    })
}

/** Delete every entry for a ref. */
export function clearWorkbook(doc: StoreDoc, ref: string): void {
    const map = doc.getMap(WORKBOOK_STORE)
    const base = prefix(ref)
    run(doc, () => {
        for (const key of keysWithPrefix(map, base)) map.delete(key)
    })
}

/**
 * Persist the difference between the last snapshot and the live one.
 *
 * Only the changed cells are written, so a normal edit touches a handful of
 * Y.Map keys. Structural changes are reported by the diff and handled by the
 * caller (a full rewrite).
 */
export function applyWorkbookDiff(doc: StoreDoc, ref: string, diff: WorkbookDiff): number {
    const map = doc.getMap(WORKBOOK_STORE)
    const base = prefix(ref)
    let operations = 0
    run(doc, () => {
        for (const change of diff.grid) {
            map.set(base + DELTA_PREFIX + gridKind(change.kind) + ':' + change.sheet + ':' + change.row + ':' + change.column, change.value)
            operations += 1
        }
        for (const change of diff.dimensions) {
            map.set(
                base + DELTA_PREFIX + (change.axis === 'column' ? 'column' : 'row') + ':' + change.sheet + ':' + change.index,
                change.size,
            )
            operations += 1
        }
        for (const change of diff.merges) {
            map.set(base + DELTA_PREFIX + 'merges:' + change.sheet, change.merges ?? null)
            operations += 1
        }
        for (const change of diff.meta) {
            map.set(base + DELTA_PREFIX + 'name:' + change.sheet, change.name)
            map.set(base + DELTA_PREFIX + 'dims:' + change.sheet, [change.rowCount, change.columnCount])
            operations += 2
        }
        if (diff.activeSheet !== null) {
            map.set(base + ACTIVE_KEY, diff.activeSheet)
            operations += 1
        }
    })
    return operations
}

/**
 * Observe remote changes to a workbook.
 *
 * Local writes carry {@link LOCAL_ORIGIN} and are skipped. Returns an
 * unsubscribe function.
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

// ── encoding ─────────────────────────────────────────────────────────────

function gridKind(kind: string): string {
    return kind === 'value' ? 'value' : kind === 'style' ? 'style' : kind === 'numberFormat' ? 'numberFormat' : 'rawValue'
}

/** Sparse JSON: only non-empty cells are written. */
function encodeSnapshot(workbook: WorkbookData): string {
    const sheets: EncodedSheet[] = workbook.sheets.map((sheet) => {
        const cells: Record<string, CellValue> = {}
        sheet.rows.forEach((row, rowIndex) => {
            row?.forEach((value, columnIndex) => {
                if (value === null || value === undefined) return
                cells[rowIndex + ':' + columnIndex] = value
            })
        })
        return {
            name: sheet.name,
            rowCount: sheet.rowCount,
            columnCount: sheet.columnCount,
            ...(sheet.pivot ? { pivot: sheet.pivot } : {}),
            ...(Object.keys(cells).length > 0 ? { cells } : {}),
            ...(sheet.styles && Object.keys(sheet.styles).length > 0 ? { styles: sheet.styles } : {}),
            ...(sheet.numberFormats && Object.keys(sheet.numberFormats).length > 0 ? { numberFormats: sheet.numberFormats } : {}),
            ...(sheet.rawValues && Object.keys(sheet.rawValues).length > 0 ? { rawValues: sheet.rawValues } : {}),
            ...(sheet.columnWidths && Object.keys(sheet.columnWidths).length > 0 ? { columnWidths: sheet.columnWidths } : {}),
            ...(sheet.rowHeights && Object.keys(sheet.rowHeights).length > 0 ? { rowHeights: sheet.rowHeights } : {}),
            ...(sheet.merges && sheet.merges.length > 0 ? { merges: sheet.merges } : {}),
        }
    })
    const encoded: EncodedWorkbook = { id: workbook.id, activeSheet: workbook.activeSheet, sheets }
    return JSON.stringify(encoded)
}

function decodeSnapshot(snapshot: string): WorkbookData {
    const parsed = JSON.parse(snapshot) as EncodedWorkbook
    const sheets: SheetData[] = (parsed.sheets ?? []).map((sheet) => {
        const rows: CellValue[][] = []
        for (const [key, value] of Object.entries(sheet.cells ?? {})) {
            const separator = key.indexOf(':')
            const row = Number(key.slice(0, separator))
            const column = Number(key.slice(separator + 1))
            if (!Number.isFinite(row) || !Number.isFinite(column)) continue
            const line = (rows[row] ??= [])
            line[column] = value
        }
        return {
            name: sheet.name,
            rows,
            rowCount: Math.max(1, Math.floor(sheet.rowCount) || 1),
            columnCount: Math.max(1, Math.floor(sheet.columnCount) || 1),
            ...(sheet.pivot ? { pivot: sheet.pivot } : {}),
            ...(sheet.styles ? { styles: sheet.styles } : {}),
            ...(sheet.numberFormats ? { numberFormats: sheet.numberFormats } : {}),
            ...(sheet.rawValues ? { rawValues: sheet.rawValues } : {}),
            ...(sheet.columnWidths ? { columnWidths: sheet.columnWidths } : {}),
            ...(sheet.rowHeights ? { rowHeights: sheet.rowHeights } : {}),
            ...(sheet.merges ? { merges: sheet.merges } : {}),
        }
    })
    if (sheets.length === 0) {
        sheets.push({ name: 'Sheet1', rows: [], rowCount: 1, columnCount: 1 })
    }
    return {
        id: parsed.id || 'workbook',
        sheets,
        activeSheet: Number(parsed.activeSheet) || 0,
        version: 2,
    }
}
