import { useCallback, useEffect, useRef, useState } from 'react'
// Grid styles ship with the widget; the library itself is still code-split
// (see loadJssFactory).
import 'jspreadsheet-ce/dist/jspreadsheet.css'
import 'jspreadsheet-ce/dist/jspreadsheet.themes.css'
import { logger } from '@kn/common'
import { SAVE_THROTTLE_MS } from './constants'
import { translate } from '../i18n'
import {
    cloneRows,
    ensureValidWorkbookData,
    formatCellRef,
    parseCellRef,
    workbookContentKey,
    type CellStyles,
    type CellValue,
    type NumberFormatKind,
    type SheetData,
    type SheetMerges,
    type WorkbookData,
} from './workbook-data'
import { computePivot, type PivotLabels } from './pivot'
import {
    clampMatrix,
    formatNumeric,
    numericValue,
    payloadHasContent,
    pivotSourceIndices,
    sameMatrix,
    sheetNumberMeta,
    styleToText,
    textToStyle,
    MAX_COLUMNS,
    MAX_ROWS,
    type NumberMeta,
} from './grid-utils'
import { captureNumberFormats } from './number-format'
import type { GridApi, GridSelection } from './grid-api'

// The engine-agnostic contract and helpers live in their own modules so the
// engine can be replaced without touching consumers. Re-exported here because
// the toolbar, formula bar and pivot dialogs historically imported `GridApi`
// from this hook module.
export type { GridApi, GridSelection, NumberMeta }
// Number-format semantics moved to their own module; re-exported so existing
// importers keep working.
export { captureNumberFormats }

/**
 * Owns one jspreadsheet grid for a spreadsheet block.
 *
 * jspreadsheet is a plain DOM library (no React tree of its own), so this hook is
 * deliberately simple: create on mount, destroy on unmount. Nothing is pooled
 * across mounts, because rebuilding here is cheap and leaves no state behind.
 *
 * This module is the *jspreadsheet adapter*: it implements the engine-agnostic
 * {@link GridApi} and is the only file that talks to the widget. See
 * docs/VTABLE_MIGRATION.md for the replacement path.
 */

/** Compact spreadsheet density: rows must not stretch to fill the block. */
const ROW_HEIGHT = 23
const COLUMN_WIDTH = 96
/** Styles of at most this many cells are persisted, bounding the payload size. */
const MAX_STYLED_CELLS = 2_000

/**
 * Rows per page — a *worksheet* option (see buildOptions; putting it in the
 * spreadsheet config is silently ignored).
 *
 * jspreadsheet builds one `<tr>` (and one `<td>` per column) for every row of the
 * data, then attaches only the current page to the `<tbody>`. Measured on a
 * 9,000-row × 12-column sheet: without this the tbody holds 9,000 rows and every
 * scroll, selection and style recalculation pays for all of them; with it the
 * tbody holds {@link ROWS_PER_PAGE}.
 *
 * Two limits worth knowing, both measured against the library's own code:
 *
 * 1. It does **not** reduce element *creation*. `updateResult` runs
 *    `createRow` for `options.data.length` rows regardless and only skips the
 *    append, so heap and mount time stay flat (~127 MB and ~155 ms at 9,000 × 12)
 *    while the live DOM drops from ~117k cell elements to the page's worth.
 *    Cutting that further means windowing the *data*, which this library cannot
 *    do — see the note in `updateResult`, which rebuilds `records` wholesale.
 * 2. Nothing else changes: `getData`, `getStyle`, `getHeight` and the record
 *    matrix still cover every row, so reads, saves, ranges, formulas, undo and
 *    off-page formatting keep working. Only *attachment* is paged.
 */
const ROWS_PER_PAGE = 200

/** Page index that contains 0-based `row`. */
function pageOfRow(row: number): number {
    return Math.max(0, Math.floor(row / ROWS_PER_PAGE))
}

/**
 * Border formatting is the one case that has to travel through an inline custom
 * property: sheet.css pins the cell borders with `!important` (to keep the
 * editor's document-table rules out), so an ordinary inline `border` would lose
 * to those declarations. The custom property is consumed by the `!important`
 * rule instead (see sheet.css). Everything else is written as a plain inline
 * declaration, which is what lets the grid's own undo history track it.
 *
 * STYLE_VAR_TO_PROP still understands the old `--kn-cell-*` properties so
 * documents saved by the previous colour/background/font-size mapping keep
 * rendering and keep their toolbar state.
 */
const STYLE_PROP_TO_VAR: Record<string, string> = {
    border: '--kn-cell-border',
}
const STYLE_VAR_TO_PROP: Record<string, string> = {
    '--kn-cell-fg': 'color',
    '--kn-cell-bg': 'background-color',
    '--kn-cell-font-size': 'font-size',
    '--kn-cell-line-height': 'line-height',
    '--kn-cell-border': 'border',
}

interface UseJspreadsheetOptions {
    container: HTMLDivElement | null
    /** Initial payload. Later changes are applied through `applyExternalData`. */
    workbookData: WorkbookData | null
    readOnly: boolean
    darkMode: boolean
    /** Persist the whole workbook after edits (throttled). */
    onSave: (data: WorkbookData) => void
    onImportExcel?: () => void
    onExportExcel?: () => void
    /** Called whenever the selection or its style may have changed. */
    onSelectionChange?: () => void
    /** Right-click on a generated pivot value cell -> show its source rows. */
    onPivotDrillDown?: (target: { sheetIndex: number; row: number; column: number }) => void
}

/** The parts of a jspreadsheet worksheet we use. */
interface JssWorksheet {
    getData(highlighted?: boolean, processed?: boolean): CellValue[][]
    setData?(data?: CellValue[][]): void
    getValueFromCoords(x: number, y: number, processed?: boolean): CellValue | null
    setValueFromCoords(x: number, y: number, value: CellValue, force?: boolean): void
    getStyle(cell?: string | [number, number], key?: string): string | Record<string, string>
    setStyle(o: string, k: string, v: string, force?: boolean, skipHistory?: boolean): void
    getCell?(cell: string): HTMLTableCellElement | null
    getCellFromCoords?(x: number, y: number): HTMLTableCellElement | null
    getSelection(): [number, number, number, number]
    getMerge(cellName?: string): Record<string, [number, number]> | [number, number] | null
    setMerge(cellName?: string, colspan?: number, rowspan?: number): null | undefined
    removeMerge(cellName: string, data?: CellValue[]): void
    getWidth?(column?: number): number | (number | string)[]
    setWidth?(column: number, width: number): void
    getHeight?(row?: number): string | string[]
    setHeight?(row: number, height: number): void
    getConfig?(): Record<string, any>
    setConfig?(config: Record<string, any>, spreadsheetLevel?: boolean): void
    insertRow?(mixed?: number | CellValue[], rowNumber?: number, insertBefore?: number): void
    insertColumn?(mixed?: number | CellValue[], columnNumber?: number, insertBefore?: boolean): void
    openWorksheet?(index: number): void
    /** Go to a page (0-based). Requires `pagination`. */
    page?(pageNumber: number): void
    /** Current page (0-based) — only meaningful with `pagination`. */
    pageNumber?: number
    undo(): void
    redo(): void
    updateSelectionFromCoords?(x1: number, y1: number, x2: number, y2: number): void
    getWorksheetActive?(): number
    destroy?(): void
}

interface JssFactory {
    (element: HTMLElement, options: Record<string, any>): JssWorksheet[]
    destroy?(element: HTMLElement, destroyEventHandlers?: boolean): void
}

/** Mutable holder for the options the widget was created with. */
interface OptionsRef {
    current: { readOnly: boolean }
}
interface CallbacksRef {
    current: {
        onImportExcel?: () => void
        onExportExcel?: () => void
        onSelectionChange?: () => void
        /** Source data changed: recompute generated pivot sheets before saving. */
        onGridChange?: () => void
        onPivotDrillDown?: (target: { sheetIndex: number; row: number; column: number }) => void
    }
}

let factoryPromise: Promise<JssFactory> | null = null

/** Load jspreadsheet on demand: a page with no spreadsheet never downloads it. */
async function loadJssFactory(): Promise<JssFactory> {
    if (!factoryPromise) {
        factoryPromise = (async () => {
            const mod: any = await import('jspreadsheet-ce')
            const resolved: any = mod?.default ?? mod
            const factory = (resolved?.jspreadsheet ?? resolved) as JssFactory
            if (typeof factory !== 'function') {
                throw new Error('jspreadsheet-ce did not export a factory function')
            }
            return factory
        })()
    }
    return factoryPromise
}

/** Re-apply a stored style map to a sheet without touching its undo history. */
function applySheetStyles(sheet: JssWorksheet, styles?: CellStyles): void {
    if (!styles) return
    Object.entries(styles).forEach(([ref, text]) => {
        const declarations = textToStyle(typeof text === 'string' ? text : '')
        Object.entries(declarations).forEach(([property, value]) => {
            try {
                sheet.setStyle(ref, property, value, true, true)
            } catch {
                // Presentation only; a stale ref must not break the refresh.
            }
        })
    })
}

/**
 * Collect the styles a sheet actually uses.
 *
 * `getStyle()` with no argument returns every cell that carries an inline style
 * (a DOM style attribute), including *empty* styled cells, so fills and borders
 * on blank cells survive a save. Bounded by {@link MAX_STYLED_CELLS}.
 */
function captureStyles(sheet: JssWorksheet): CellStyles | undefined {
    let raw: unknown
    try {
        raw = sheet.getStyle?.()
    } catch {
        return undefined
    }
    if (!raw || typeof raw !== 'object' || typeof raw === 'string') return undefined
    const styles: CellStyles = {}
    let count = 0
    let truncated = false
    for (const [ref, value] of Object.entries(raw as Record<string, any>)) {
        if (!/^[A-Z]+\d+$/.test(ref)) continue
        const text = typeof value === 'string' ? value.trim() : (value ? styleToText(value) : '')
        if (!text) continue
        if (count >= MAX_STYLED_CELLS) {
            truncated = true
            break
        }
        styles[ref] = text
        count += 1
    }
    if (truncated) {
        logger.warn(`[office/spreadsheet] reached the ${MAX_STYLED_CELLS}-cell style limit; extra formatting was not saved`)
    }
    return count > 0 ? styles : undefined
}

/** Persisted column widths, minus the defaults (so a plain sheet stays tiny). */
function captureColumnWidths(sheet: JssWorksheet, columnCount: number): Record<string, number> | undefined {
    let widths: unknown
    try {
        widths = sheet.getWidth?.()
    } catch {
        return undefined
    }
    if (!Array.isArray(widths)) return undefined
    const out: Record<string, number> = {}
    for (let column = 0; column < columnCount; column++) {
        const width = Number(widths[column])
        if (Number.isFinite(width) && width > 0 && Math.abs(width - COLUMN_WIDTH) > 0.5) {
            out[String(column)] = Math.round(width)
        }
    }
    return Object.keys(out).length > 0 ? out : undefined
}

/** Persisted row heights, minus the defaults. */
function captureRowHeights(sheet: JssWorksheet, rowCount: number): Record<string, number> | undefined {
    let heights: unknown
    try {
        heights = sheet.getHeight?.()
    } catch {
        return undefined
    }
    if (!Array.isArray(heights)) return undefined
    const out: Record<string, number> = {}
    for (let row = 0; row < rowCount; row++) {
        const height = Number.parseInt(String(heights[row] ?? ''), 10)
        if (Number.isFinite(height) && height > 0 && Math.abs(height - ROW_HEIGHT) > 0.5) {
            out[String(row)] = height
        }
    }
    return Object.keys(out).length > 0 ? out : undefined
}

/** Persisted merged ranges, decoded from the grid's anchor → span map. */
function captureMerges(sheet: JssWorksheet): SheetMerges | undefined {
    let raw: unknown
    try {
        raw = sheet.getMerge?.()
    } catch {
        return undefined
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const merges: SheetMerges = []
    for (const [anchor, span] of Object.entries(raw as Record<string, [number, number]>)) {
        const from = parseCellRef(anchor)
        if (!from || !Array.isArray(span)) continue
        const colspan = Number(span[0])
        const rowspan = Number(span[1])
        if (!Number.isFinite(colspan) || !Number.isFinite(rowspan) || colspan < 1 || rowspan < 1) continue
        merges.push([from.column, from.row, from.column + colspan - 1, from.row + rowspan - 1])
    }
    return merges.length > 0 ? merges : undefined
}

function readWorksheetName(sheet: JssWorksheet): string {
    try {
        const name = sheet.getConfig?.()?.worksheetName
        return typeof name === 'string' && name.trim() ? name.trim() : ''
    } catch {
        return ''
    }
}

/** Make sure the grid has at least `rows` × `columns` cells before a write. */
function ensureDimensions(sheet: JssWorksheet, rows: number, columns: number): void {
    try {
        const data = sheet.getData?.(false, false) as CellValue[][] | undefined
        const currentRows = data?.length ?? 0
        const currentColumns = data?.reduce((max, row) => Math.max(max, row?.length ?? 0), 0) ?? 0
        if (rows > currentRows) sheet.insertRow?.(rows - currentRows)
        if (columns > currentColumns) sheet.insertColumn?.(columns - currentColumns)
    } catch {
        // Best effort; the write loop tolerates a short grid.
    }
}

export function useJspreadsheet({
    container,
    workbookData,
    readOnly,
    darkMode,
    onSave,
    onImportExcel,
    onExportExcel,
    onSelectionChange,
    onPivotDrillDown,
}: UseJspreadsheetOptions): GridApi {
    const [isReady, setIsReady] = useState(false)
    // Bumped by the widget's own `onload`, i.e. the first moment it can take styles.
    const [loadedRevision, setLoadedRevision] = useState(0)
    // Bumped when payload arrives that this view did not produce.
    const [externalRevision, setExternalRevision] = useState(0)

    const factoryRef = useRef<JssFactory | null>(null)
    const sheetsRef = useRef<JssWorksheet[]>([])
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // The grid changed since the last successful save. A throttled save is a
    // no-op while this is false, so an idle grid never pays for a snapshot.
    const dirtyRef = useRef(false)
    const dataRef = useRef<WorkbookData | null>(null)
    const appliedRef = useRef<WorkbookData | null>(null)
    // Fingerprint of the last payload this view applied/persisted. A new object
    // with the same key is an echo; a different key is a real external update.
    const appliedKeyRef = useRef('')
    const numberMetaRef = useRef<NumberMeta[]>([])
    // Last live selection. Clicking the toolbar (or formula bar) makes
    // jspreadsheet treat the mousedown as landing outside the grid and clear the
    // selection, so grid actions need this to keep targeting the range the user
    // had selected instead of falling back to A1.
    const lastSelectionRef = useRef<GridSelection | null>(null)

    // Seed refs once, synchronously, from the initial payload.
    if (dataRef.current === null && workbookData) {
        const initial = ensureValidWorkbookData(workbookData)
        dataRef.current = initial
        numberMetaRef.current = initial.sheets.map(sheetNumberMeta)
    }

    const optionsRef: OptionsRef = useRef({ readOnly })
    optionsRef.current = { readOnly }
    const callbacksRef: CallbacksRef = useRef({ onImportExcel, onExportExcel, onSelectionChange, onPivotDrillDown })
    callbacksRef.current = { onImportExcel, onExportExcel, onSelectionChange, onPivotDrillDown }
    const saveRef = useRef(onSave)
    saveRef.current = onSave

    /** True when the live sheets currently hold any value. */
    const gridHasContent = useCallback((): boolean => sheetsRef.current.some((sheet) => {
        try {
            const data = sheet.getData?.(false, false) as CellValue[][] | undefined
            return Array.isArray(data)
                && data.some((row) => row?.some((value) => value !== null && value !== undefined && value !== ''))
        } catch {
            return true
        }
    }), [])

    /** Read the whole grid back into the persisted shape. */
    const snapshot = useCallback((): WorkbookData | null => {
        const sheets = sheetsRef.current
        const base = dataRef.current
        if (!sheets.length || !base) return base
        try {
            // processed=false reads the raw cell data, which keeps =FORMULA text.
            // processed=true would read the computed display value and silently
            // flatten every formula on save.
            const rawRows = sheets.map((sheet) =>
                clampMatrix((sheet.getData?.(false, false) ?? []) as CellValue[][]),
            )
            // Pivot aggregation needs computed values so a source formula contributes
            // its result; source sheets are still persisted raw, so the formula text
            // round-trips in the document.
            const sourceIndices = pivotSourceIndices(base)
            const sourceSheets = base.sheets.map((sheet, index) => ({
                ...sheet,
                rows: sourceIndices.has(index)
                    ? clampMatrix((sheets[index]?.getData?.(false, true) ?? []) as CellValue[][])
                    : rawRows[index] ?? [],
            }))
            const labels: PivotLabels = {
                total: translate('spreadsheet.pivot.total'),
                source: translate('spreadsheet.pivot.source'),
                aggregate: (kind) => translate('spreadsheet.pivot.aggregate.' + kind),
            }
            const captured = sheets.map((sheet, index) => {
                const previous = base.sheets[index]
                // A pivot sheet's rows are generated, so recompute them here
                // instead of trusting a possibly-stale DOM write order.
                const rows = previous?.pivot
                    ? computePivot(sourceSheets, previous.pivot, labels).rows
                    : rawRows[index] ?? []
                const columnCount = Math.max(
                    rows.reduce((max, row) => Math.max(max, row.length), 0),
                    previous?.columnCount ?? 0,
                    1,
                )
                // Generated pivot styling is rebuilt from the config, so keep the
                // stored map rather than reading back whatever is in the DOM.
                const styles = previous?.pivot ? previous.styles : captureStyles(sheet)
                const numberMeta = captureNumberFormats(rows, numberMetaRef.current[index])
                numberMetaRef.current[index] = numberMeta
                const name = readWorksheetName(sheet) || previous?.name || `Sheet${index + 1}`
                const columnWidths = captureColumnWidths(sheet, columnCount)
                const rowHeights = captureRowHeights(sheet, rows.length)
                const merges = captureMerges(sheet)
                return {
                    name,
                    rows,
                    rowCount: Math.max(rows.length, 1),
                    columnCount,
                    ...(styles ? { styles } : {}),
                    ...(previous?.pivot ? { pivot: previous.pivot } : {}),
                    ...(Object.keys(numberMeta.numberFormats).length > 0 ? { numberFormats: numberMeta.numberFormats } : {}),
                    ...(Object.keys(numberMeta.rawValues).length > 0 ? { rawValues: numberMeta.rawValues } : {}),
                    ...(columnWidths ? { columnWidths } : {}),
                    ...(rowHeights ? { rowHeights } : {}),
                    ...(merges ? { merges } : {}),
                } satisfies SheetData
            })
            return {
                ...base,
                sheets: captured,
                activeSheet: sheets[0]?.getWorksheetActive?.() ?? base.activeSheet,
            }
        } catch (error) {
            logger.warn('[office/spreadsheet] failed to read grid data', error)
            return base
        }
    }, [])

    /** Persist the live grid now, cancelling the pending throttle. */
    const flush = useCallback(() => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
        }
        // Nothing changed since the last save: skip the snapshot, the style sweep
        // and the content fingerprint entirely. A large sheet makes those three
        // steps cost real time, and an idle grid must not pay them.
        if (!dirtyRef.current) return
        // Keep the flag set across the work: an edit that lands while we read (a
        // formula recompute, a pivot refresh) then still schedules its own save
        // instead of being swallowed by this one.
        const data = snapshot()
        if (!data) return
        // Never persist a grid that has not rendered yet. A freshly mounted widget
        // reports empty data until its table is built (its `onload`), and saving
        // that would wipe the payload the document already holds.
        if (!gridHasContent() && payloadHasContent(dataRef.current)) {
            logger.warn('[office/spreadsheet] skipped saving an empty grid snapshot')
            return
        }
        // Remember what we wrote: it is the baseline for style capture and for
        // telling our own echo apart from payload that came from elsewhere. Store
        // the normalised shape so the fingerprint matches what the view sends
        // back (padRows may widen a hand-created worksheet).
        const persisted = ensureValidWorkbookData(data)
        dataRef.current = persisted
        appliedRef.current = persisted
        appliedKeyRef.current = workbookContentKey(persisted)
        dirtyRef.current = false
        try {
            saveRef.current(persisted)
        } catch (error) {
            logger.warn('[office/spreadsheet] failed to persist spreadsheet', error)
        }
    }, [snapshot, gridHasContent])

    /**
     * Reopen the stored active sheet once the widget has reported `onload` (the
     * first moment its tables exist). Styles, merges and sizing are applied by
     * the creation config instead, so this does not touch the undo history.
     */
    const restoreActiveSheet = useCallback(() => {
        const sheets = sheetsRef.current
        const base = dataRef.current
        if (!sheets.length || !base) return
        activateInitialSheet(sheets, base.activeSheet ?? 0)
        // Creation applies the persisted styles/merges through the config, which
        // still lands one entry in the grid's own undo stack. This runs on a fresh
        // mount before any user edit, so clearing it just gives the user a clean
        // first Ctrl+Z instead of one that wipes restored formatting.
        sheets.forEach((sheet) => {
            try {
                ;(sheet as any).history = []
                ;(sheet as any).historyIndex = -1
            } catch {
                // Widget internals moved; undo then simply starts dirty.
            }
        })
    }, [])

    // ── Pivot refresh ─────────────────────────────────────────────────────
    // A pivot sheet's rows are a pure function of its source range + config.
    // Recompute whenever the source changes and write the result back with
    // setData. setData clears the worksheet's undo stack, so it is saved and
    // restored around the write, and applyingPivotRef fences the write out of
    // the change pipeline (a generated refresh must not schedule its own save).
    const applyingPivotRef = useRef(false)

    const readLiveRows = useCallback((computedSheets: Set<number> = new Set()): CellValue[][][] =>
        sheetsRef.current.map((sheet, index) =>
            clampMatrix((sheet.getData?.(false, computedSheets.has(index)) ?? []) as CellValue[][])), [])

    const refreshPivots = useCallback(() => {
        if (applyingPivotRef.current) return
        const sheets = sheetsRef.current
        const base = dataRef.current
        if (!sheets.length || !base) return
        // No generated sheet in this workbook: nothing to recompute. This runs on
        // every grid change, and `readLiveRows` reads every sheet in full, so the
        // common (pivot-free) workbook must not pay for it.
        if (!base.sheets.some((sheet) => sheet.pivot)) return
        const rawRows = readLiveRows(pivotSourceIndices(base))
        const sourceSheets = base.sheets.map((sheet, index) => ({ ...sheet, rows: rawRows[index] ?? [] }))
        const labels: PivotLabels = {
            total: translate('spreadsheet.pivot.total'),
            source: translate('spreadsheet.pivot.source'),
            aggregate: (kind) => translate('spreadsheet.pivot.aggregate.' + kind),
        }
        sheets.forEach((sheet, index) => {
            const config = base.sheets[index]?.pivot
            if (!config) return
            const result = computePivot(sourceSheets, config, labels)
            if (sameMatrix(rawRows[index] ?? [], result.rows)) return
            const history = (sheet as any).history
            const historyIndex = (sheet as any).historyIndex
            applyingPivotRef.current = true
            try {
                // The generated table can grow (a new column/row category), so make
                // sure the worksheet actually has the cells before writing.
                ensureDimensions(sheet, result.rows.length, result.columnCount)
                sheet.setData?.(cloneRows(result.rows))
            } catch (error) {
                logger.warn('[office/spreadsheet] failed to refresh a pivot sheet', error)
            } finally {
                applyingPivotRef.current = false
                ;(sheet as any).history = history
                ;(sheet as any).historyIndex = historyIndex
            }
            applySheetStyles(sheet, base.sheets[index]?.styles)
        })
    }, [readLiveRows])

    // buildOptions runs outside React, so hand the refresh through the callback
    // ref instead of recreating the grid when it changes.
    callbacksRef.current.onGridChange = refreshPivots

    /**
     * Schedule a save after `delay` ms, keeping the grid marked dirty until it
     * runs. Existing pending work is left alone: whatever the earlier caller asked
     * for still happens, and `flush()` snapshots the grid as it is then.
     */
    const scheduleSaveAfter = useCallback((delay: number) => {
        if (optionsRef.current.readOnly) return
        dirtyRef.current = true
        if (saveTimerRef.current) return
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null
            flush()
        }, delay)
    }, [flush])

    /**
     * Trailing-throttled save — the grid fires a change per keystroke, and every
     * save reads and fingerprints the whole workbook.
     *
     * Trailing-only is deliberate: each save costs O(rows × columns) no matter
     * how little changed, so persisting the *leading* edit of a burst bought the
     * editor a 2000 ms-earlier look at a payload it re-reads from the node anyway,
     * at the price of one extra full snapshot per window. Batching the burst
     * halves that work with no visible difference. Callers that genuinely need
     * the payload right now (an explicit action, a teardown) call `flush()`.
     */
    const scheduleSave = useCallback(() => scheduleSaveAfter(SAVE_THROTTLE_MS), [scheduleSaveAfter])

    /**
     * Persist on the next tick instead of at the end of the throttle window.
     * For actions the grid reports no change event for (a number-format rewrite,
     * an explicit write) but whose result should be durable right away.
     */
    const push = useCallback(() => scheduleSaveAfter(0), [scheduleSaveAfter])

    // ── Create / destroy the grid ─────────────────────────────────────────
    useEffect(() => {
        if (!container) return
        let cancelled = false
        let created: JssWorksheet[] = []
        let factory: JssFactory | null = null

        void (async () => {
            try {
                factory = await loadJssFactory()
            } catch (error) {
                logger.error('[office/spreadsheet] failed to load the grid library', error)
                return
            }
            if (cancelled || !factory) return

            const initial = ensureValidWorkbookData(workbookData)
            dataRef.current = initial
            appliedRef.current = initial
            appliedKeyRef.current = workbookContentKey(initial)
            numberMetaRef.current = initial.sheets.map(sheetNumberMeta)
            created = mountGrid(
                factory,
                container,
                initial,
                optionsRef,
                callbacksRef,
                lastSelectionRef,
                scheduleSave,
                () => {
                    restoreActiveSheet()
                    setLoadedRevision((revision) => revision + 1)
                    refreshPivots()
                },
            )
            if (cancelled) {
                destroyGrid(factory, container, created)
                return
            }
            factoryRef.current = factory
            sheetsRef.current = created
            setIsReady(true)
        })()

        return () => {
            cancelled = true
            // Persist before tearing the DOM down, so a fast unmount cannot lose
            // the last edit.
            flush()
            sheetsRef.current = []
            setIsReady(false)
            if (factory) destroyGrid(factory, container, created)
        }
    }, [container]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Restore styling and layout ────────────────────────────────────────
    // Runs once the widget has reported `onload` (the first moment it accepts
    // styles/merges) and again whenever a workbook is swapped in. Applying is
    // cheap and idempotent, so it does not try to detect "already applied".
    useEffect(() => {
        const timer = setTimeout(restoreActiveSheet, 0)
        return () => clearTimeout(timer)
    }, [restoreActiveSheet, loadedRevision, externalRevision])

    // ── Theme ─────────────────────────────────────────────────────────────
    useEffect(() => {
        container?.classList.toggle('jss-dark', darkMode)
    }, [container, darkMode])

    // ── Read-only ─────────────────────────────────────────────────────────
    useEffect(() => {
        const element = container
        if (!element) return
        element.querySelectorAll('td').forEach((cell) => {
            if (readOnly) cell.setAttribute('contenteditable', 'false')
            else cell.removeAttribute('contenteditable')
        })
        element.classList.toggle('kn-sheet--readonly', readOnly)
        // Update the widget's own option too: the contenteditable pass alone does
        // not stop the editor opening on double-click, or pastes inserting cells.
        sheetsRef.current.forEach((sheet) => {
            try {
                sheet.setConfig?.({ editable: !readOnly })
            } catch {
                // A widget that does not expose setConfig keeps the mount-time value.
            }
        })
    }, [container, readOnly, isReady])

    const withSheet = useCallback(<T,>(sheetIndex: number, fn: (sheet: JssWorksheet) => T, fallback: T): T => {
        const sheet = sheetsRef.current[sheetIndex] ?? sheetsRef.current[0]
        if (!sheet) return fallback
        try {
            return fn(sheet)
        } catch (error) {
            logger.warn('[office/spreadsheet] grid operation failed', error)
            return fallback
        }
    }, [])

    /** Index of the worksheet the user is looking at (0-based). */
    const activeSheetIndex = useCallback((): number => {
        const list = sheetsRef.current
        if (!list.length) return 0
        const index = list[0]?.getWorksheetActive?.()
        if (typeof index === 'number' && index >= 0 && index < list.length) return index
        const stored = dataRef.current?.activeSheet ?? 0
        return Math.min(Math.max(stored, 0), list.length - 1)
    }, [])

    const withActiveSheet = useCallback(<T,>(
        fn: (sheet: JssWorksheet) => T,
        fallback: T,
    ): T => withSheet(activeSheetIndex(), fn, fallback), [withSheet, activeSheetIndex])

    const selectedBounds = useCallback((sheet: JssWorksheet): GridSelection => {
        const live = sheet.getSelection?.()
        if (live) {
            const [a, b, c, d] = live
            return {
                startRow: Math.min(b, d),
                endRow: Math.max(b, d),
                startColumn: Math.min(a, c),
                endColumn: Math.max(a, c),
            }
        }
        // The widget cleared its selection because the interaction started
        // outside the grid (e.g. a toolbar click). Fall back to the last range
        // the user selected so the action still lands where they expect.
        return lastSelectionRef.current ?? { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }
    }, [])

    const getSelection = useCallback((): GridSelection | null =>
        withActiveSheet((sheet) => selectedBounds(sheet), null), [withActiveSheet, selectedBounds])

    const applyStyle = useCallback((style: Record<string, string | null>) => {
        withActiveSheet((sheet) => {
            const bounds = selectedBounds(sheet)
            for (let row = bounds.startRow; row <= bounds.endRow; row++) {
                for (let column = bounds.startColumn; column <= bounds.endColumn; column++) {
                    const ref = formatCellRef(row, column)
                    Object.entries(style).forEach(([key, value]) => {
                        const property = STYLE_PROP_TO_VAR[key] ?? key
                        if (property.startsWith('--')) {
                            // jspreadsheet's setStyle assigns through element.style[prop],
                            // which silently drops a custom property: the assignment becomes
                            // a plain JS property and never reaches the cascade. Write those
                            // declarations on the cell directly instead.
                            const element = sheet.getCellFromCoords?.(column, row) ?? sheet.getCell?.(ref)
                            if (!element) return
                            if (value === null || value === '') element.style.removeProperty(property)
                            else element.style.setProperty(property, value)
                        } else {
                            // An empty string clears the property. Going through setStyle
                            // keeps the change in the grid's undo history.
                            sheet.setStyle(ref, property, value === null ? '' : value, true)
                        }
                    })
                }
            }
            scheduleSave()
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [scheduleSave, withActiveSheet, selectedBounds])

    const toggleMerge = useCallback(() => {
        withActiveSheet((sheet) => {
            const bounds = selectedBounds(sheet)
            const anchor = formatCellRef(bounds.startRow, bounds.startColumn)
            const existing = sheet.getMerge?.(anchor)
            if (existing) sheet.removeMerge?.(anchor)
            else {
                sheet.setMerge?.(
                    anchor,
                    bounds.endColumn - bounds.startColumn + 1,
                    bounds.endRow - bounds.startRow + 1,
                )
            }
            scheduleSave()
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [scheduleSave, withActiveSheet, selectedBounds])

    /**
     * Apply a number format to the selection.
     *
     * The grid stores plain values, so a format is rendered to a display string —
     * but the unformatted value and the format kind are remembered, which makes
     * the operation reversible (`general`) and idempotent (percentage is never
     * applied twice).
     */
    const applyNumberFormat = useCallback((kind: NumberFormatKind) => {
        withActiveSheet((sheet) => {
            const sheetIndex = activeSheetIndex()
            const meta = numberMetaRef.current[sheetIndex] ?? { numberFormats: {}, rawValues: {} }
            const numberFormats = { ...meta.numberFormats }
            const rawValues = { ...meta.rawValues }
            const bounds = selectedBounds(sheet)
            let changed = 0
            for (let row = bounds.startRow; row <= bounds.endRow; row++) {
                for (let column = bounds.startColumn; column <= bounds.endColumn; column++) {
                    const ref = formatCellRef(row, column)
                    const current = sheet.getValueFromCoords?.(column, row, false) ?? null
                    const raw = rawValues[ref]
                    const source = raw !== undefined ? raw : current
                    const numeric = numericValue(source)
                    if (numeric === null) {
                        if (kind === 'general' && raw !== undefined) {
                            sheet.setValueFromCoords?.(column, row, raw, true)
                            delete rawValues[ref]
                            delete numberFormats[ref]
                            changed += 1
                        }
                        continue
                    }
                    if (kind === 'general') {
                        if (raw !== undefined) {
                            sheet.setValueFromCoords?.(column, row, raw, true)
                            delete rawValues[ref]
                        }
                        delete numberFormats[ref]
                        changed += 1
                        continue
                    }
                    if (raw === undefined) rawValues[ref] = current
                    numberFormats[ref] = kind
                    sheet.setValueFromCoords?.(column, row, formatNumeric(numeric, kind), true)
                    changed += 1
                }
            }
            numberMetaRef.current[sheetIndex] = { numberFormats, rawValues }
            // The value rewrite above is a silent write, so the grid never fired a
            // change event: mark it pending and save on the next tick. Calling
            // `flush()` directly would be a no-op, because nothing has marked the
            // grid dirty yet.
            if (changed > 0) push()
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [withActiveSheet, activeSheetIndex, selectedBounds, push])

    const selectRange = useCallback((
        startRow: number,
        startColumn: number,
        endRow: number,
        endColumn: number,
    ) => {
        withActiveSheet((sheet) => {
            // The target row may live on another page: switch first, or the
            // selection would be painted on a row that is not attached.
            const page = pageOfRow(startRow)
            if (sheet.pageNumber !== page) sheet.page?.(page)
            sheet.updateSelectionFromCoords?.(startColumn, startRow, endColumn, endRow)
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [withActiveSheet])

    const getSelectionStyle = useCallback((): Record<string, string> => withActiveSheet((sheet) => {
        const bounds = selectedBounds(sheet)
        const raw = sheet.getStyle?.([bounds.startColumn, bounds.startRow])
        if (!raw) return {}
        const parsed = typeof raw === 'string' ? textToStyle(raw) : { ...raw }
        // Present the toolbar with the property names it knows about, not the
        // internal custom properties.
        const out: Record<string, string> = {}
        Object.entries(parsed).forEach(([key, value]) => {
            out[STYLE_VAR_TO_PROP[key] ?? key] = value
        })
        return out
    }, {}), [withActiveSheet, selectedBounds])

    const readRange = useCallback((
        sheetIndex: number,
        startRow: number,
        startColumn: number,
        endRow: number,
        endColumn: number,
    ): CellValue[][] => withSheet(sheetIndex, (sheet) => {
        const out: CellValue[][] = []
        for (let row = startRow; row <= endRow; row++) {
            const line: CellValue[] = []
            for (let column = startColumn; column <= endColumn; column++) {
                const value = sheet.getValueFromCoords?.(column, row, false)
                line.push(value === undefined ? null : (value as CellValue))
            }
            out.push(line)
        }
        return out
    }, []), [withSheet])

    const writeRange = useCallback((
        sheetIndex: number,
        startRow: number,
        startColumn: number,
        matrix: CellValue[][],
        options?: { show?: boolean },
    ): number | null => {
        const sheet = sheetsRef.current[sheetIndex]
        if (!sheet) return null
        try {
            const width = matrix.reduce((max, row) => Math.max(max, row?.length ?? 0), 0)
            if (width === 0) return 0
            ensureDimensions(sheet, startRow + matrix.length, startColumn + width)
            let written = 0
            matrix.forEach((row, rowOffset) => {
                (row ?? []).forEach((value, columnOffset) => {
                    if (value === null || value === undefined) return
                    const rowIndex = startRow + rowOffset
                    const columnIndex = startColumn + columnOffset
                    if (rowIndex >= MAX_ROWS || columnIndex >= MAX_COLUMNS) return
                    sheet.setValueFromCoords?.(columnIndex, rowIndex, value, true)
                    written += 1
                })
            })
            if (written > 0) {
                // The values are written either way — this only decides whether the
                // view follows them. Paging is skipped when the range starts on the
                // page already shown, so a same-page edit never re-renders the tbody
                // mid-write. A bulk write (AI, paste) passes `show: false` and leaves
                // the user where they were looking.
                const show = options?.show !== false
                const targetPage = pageOfRow(startRow)
                if (show && sheet.pageNumber !== targetPage) sheet.page?.(targetPage)
                push()
            }
            return written
        } catch (error) {
            logger.warn('[office/spreadsheet] failed to write cells', error)
            return null
        }
    }, [push])

    const readCell = useCallback((sheetIndex: number, row: number, column: number): CellValue =>
        withSheet(sheetIndex, (sheet) => {
            const value = sheet.getValueFromCoords?.(column, row, false)
            return value === undefined ? null : (value as CellValue)
        }, null), [withSheet])

    const undo = useCallback(() => {
        withActiveSheet((sheet) => {
            sheet.undo?.()
            scheduleSave()
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [scheduleSave, withActiveSheet])

    const redo = useCallback(() => {
        withActiveSheet((sheet) => {
            sheet.redo?.()
            scheduleSave()
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [scheduleSave, withActiveSheet])

    /** Replace everything (Excel import, AI write). Keeps the grid element. */
    const replaceAll = useCallback((next: WorkbookData) => {
        const normalized = ensureValidWorkbookData(next)
        dataRef.current = normalized
        appliedRef.current = normalized
        appliedKeyRef.current = workbookContentKey(normalized)
        numberMetaRef.current = normalized.sheets.map(sheetNumberMeta)
        lastSelectionRef.current = null
        const factory = factoryRef.current
        const element = container
        if (!factory || !element) return
        try {
            // Sheet count can change and jspreadsheet has no "set sheets" call, so
            // recreate the widget in place. It is a cheap DOM library — there is no
            // per-instance cost worth pooling.
            destroyGrid(factory, element, sheetsRef.current)
            const mounted = mountGrid(
                factory,
                element,
                normalized,
                optionsRef,
                callbacksRef,
                lastSelectionRef,
                scheduleSave,
                () => {
                    restoreActiveSheet()
                    setLoadedRevision((revision) => revision + 1)
                    refreshPivots()
                    // A whole-workbook swap (import, AI write, pivot create) is not
                    // an edit, so jspreadsheet fires no change event for it: persist
                    // the mounted payload explicitly.
                    flush()
                },
            )
            sheetsRef.current = mounted
            setIsReady(true)
            setExternalRevision((revision) => revision + 1)
        } catch (error) {
            logger.error('[office/spreadsheet] failed to replace spreadsheet data', error)
        }
    }, [container, scheduleSave, flush, restoreActiveSheet])

    /**
     * Apply payload that changed outside this view (AI tool, undo, sync).
     *
     * A content fingerprint tells an echo of our own save apart from a real
     * update: the same workbook id with different content is a genuine change, so
     * remote collaboration and editor undo now reach the live grid.
     */
    const applyExternalData = useCallback((incoming: WorkbookData) => {
        const normalized = ensureValidWorkbookData(incoming)
        if (normalized === appliedRef.current) return
        if (workbookContentKey(normalized) === appliedKeyRef.current) return
        replaceAll(normalized)
    }, [replaceAll])

    return {
        getSnapshot: snapshot,
        getSelection,
        getActiveSheetIndex: activeSheetIndex,
        applyStyle,
        toggleMerge,
        applyNumberFormat,
        selectRange,
        getSelectionStyle,
        undo,
        redo,
        readRange,
        writeRange,
        readCell,
        flush,
        replaceAll,
        applyExternalData,
        isReady,
    }
}

/**
 * jspreadsheet only paints the selection once the user interacts with the grid,
 * which leaves a freshly mounted block with no visible active cell. Paint the
 * active cell (and reopen the stored sheet) so the block looks right from the
 * first frame.
 */
function activateInitialSheet(sheets: JssWorksheet[], activeSheet: number): void {
    const index = Math.min(Math.max(activeSheet, 0), Math.max(sheets.length - 1, 0))
    try {
        if (index > 0) sheets[0]?.openWorksheet?.(index)
    } catch {
        // Presentation only.
    }
    try {
        ;(sheets[index] ?? sheets[0])?.updateSelectionFromCoords?.(0, 0, 0, 0)
    } catch {
        // Presentation only: the grid still works without a painted selection.
    }
}

/** Create the widget inside `container` and hand the sheets back. */
function mountGrid(
    factory: JssFactory,
    container: HTMLElement,
    workbook: WorkbookData,
    optionsRef: OptionsRef,
    callbacksRef: CallbacksRef,
    lastSelectionRef: { current: GridSelection | null },
    scheduleSave: () => void,
    onLoaded: () => void,
): JssWorksheet[] {
    container.replaceChildren()
    const host = document.createElement('div')
    host.className = 'h-full w-full'
    container.appendChild(host)
    // jspreadsheet's destroy() looks up `element.spreadsheet`, and that element
    // is the host we hand to the factory — remember it so teardown targets the
    // right node instead of the React-owned wrapper.
    ;(container as any).__knHost = host
    const sheets = factory(host, buildOptions(workbook, optionsRef, callbacksRef, lastSelectionRef, scheduleSave, onLoaded))
    // jspreadsheet sizes itself from its content (40 rows ≈ 950px) and ignores the
    // host height, which leaves the widget taller than the block so its body is
    // clipped away. Pin the widget to the host box; the content area then scrolls.
    // sheet.css owns the flex chain that keeps the pagination bar from being
    // squeezed by `.jss_content`; this only pins the widget to the host box.
    try {
        const widget = host.querySelector<HTMLElement>('.jss_container')
        if (widget) {
            widget.style.height = '100%'
            widget.style.maxHeight = '100%'
            widget.style.overflow = 'hidden'
        }
    } catch {
        // Presentation only: the grid still works without it.
    }
    // jspreadsheet creates its context menu asynchronously (after
    // `await createWorksheets`) and appends it inside the grid element. The grid
    // lives inside the editor, and a transformed/contained ancestor there becomes
    // the containing block for `position: fixed`, so the menu opens offset from
    // the cursor. Move it to <body> as soon as it appears, so its coordinates are
    // viewport-based, and remember it for teardown.
    let menuObserver: MutationObserver | null = null
    const relocateContextMenu = () => {
        const menu = container.querySelector<HTMLElement>('.jss_contextmenu')
        if (menu && menu.parentElement !== document.body) {
            ;(container as any).__knContextMenu = menu
            document.body.appendChild(menu)
            menuObserver?.disconnect()
        }
    }
    relocateContextMenu()
    menuObserver = new MutationObserver(relocateContextMenu)
    menuObserver.observe(container, { childList: true, subtree: true })
    ;(container as any).__knMenuObserver = menuObserver
    return sheets
}

/** Build the jspreadsheet options for a workbook payload. */
function buildOptions(
    workbook: WorkbookData,
    optionsRef: OptionsRef,
    callbacksRef: CallbacksRef,
    lastSelectionRef: { current: GridSelection | null },
    scheduleSave: () => void,
    onLoaded: () => void,
): Record<string, any> {
    const sheets = workbook.sheets.length ? workbook.sheets : ensureValidWorkbookData(null).sheets
    const notifySelection = () => callbacksRef.current.onSelectionChange?.()
    const save = () => scheduleSave()
    // Source data changed: refresh the generated pivot sheets, then persist.
    const change = () => {
        callbacksRef.current.onGridChange?.()
        scheduleSave()
    }

    return {
        // Always show the sheet tabs: they are the Excel-like "Sheet1 / +" strip
        // and the only way to add a second sheet.
        tabs: true,
        toolbar: false,
        // Formula engine. Explicit so a library default change cannot silently
        // turn =SUM(...) into plain text.
        parseFormulas: true,
        // Fired once the table exists: the first moment styles can be applied.
        onload: () => onLoaded(),
        // Compact rows that scroll inside the block instead of stretching to fill it.
        tableOverflow: true,
        tableHeight: '100%',
        allowExport: false,
        allowImport: false,
        // Drop jspreadsheet's default "About" entry from the cell context menu.
        about: false,
        columnSorting: true,
        columnResize: true,
        rowResize: true,
        editable: !optionsRef.current.readOnly,
        contextMenu: (instance: any, column: number, row: number, _event: MouseEvent, items: any[]) => {
            const extra: any[] = []
            // On a generated pivot sheet, offer drill-down on a value cell.
            const sheetName = instance?.getConfig?.()?.worksheetName ?? instance?.options?.worksheetName
            const sheetIndex = workbook.sheets.findIndex((entry) => entry.name === sheetName)
            const pivot = sheetIndex >= 0 ? workbook.sheets[sheetIndex]?.pivot : undefined
            if (pivot && row > 0 && column >= Math.max(pivot.rows.length, 1)) {
                extra.push({
                    title: translate('spreadsheet.pivot.details'),
                    onclick: () => callbacksRef.current.onPivotDrillDown?.({ sheetIndex, row, column }),
                })
            }
            extra.push(
                { title: translate('spreadsheet.contextImport'), onclick: () => callbacksRef.current.onImportExcel?.() },
                { title: translate('spreadsheet.contextExport'), onclick: () => callbacksRef.current.onExportExcel?.() },
            )
            if (optionsRef.current.readOnly) return extra
            // jspreadsheet draws separators from `{ type: 'line' }`, not a title.
            return items && items.length ? [...items, { type: 'line' }, ...extra] : extra
        },
        worksheets: sheets.map((sheet, index) => {
            const columnCount = Math.max(sheet.columnCount, 1)
            const rowCount = Math.max(sheet.rowCount, sheet.rows.length, 1)
            const mergeCells: Record<string, [number, number]> = {}
            sheet.merges?.forEach(([startColumn, startRow, endColumn, endRow]) => {
                mergeCells[formatCellRef(startRow, startColumn)] = [
                    Math.max(endColumn - startColumn + 1, 1),
                    Math.max(endRow - startRow + 1, 1),
                ]
            })
            // Styles go through the creation config too: applying them afterwards
            // with setStyle would record undo entries, so the first Ctrl+Z would
            // clear a cell's formatting.
            const style: Record<string, string> = {}
            Object.entries(sheet.styles ?? {}).forEach(([ref, cssText]) => {
                const declarations = textToStyle(typeof cssText === 'string' ? cssText : '')
                const text = Object.entries(declarations)
                    .map(([property, value]) => `${property}:${value}`)
                    .join(';')
                if (text) style[ref] = text
            })
            return {
                data: cloneRows(sheet.rows),
                minDimensions: [columnCount, rowCount],
                worksheetName: sheet.name || `Sheet${index + 1}`,
                // `pagination` is a *worksheet* option, not a spreadsheet-config
                // one: the library reads `worksheet.options.pagination`, so setting
                // it next to `tabs`/`toolbar` is silently ignored and every row is
                // attached to the tbody (see ROWS_PER_PAGE).
                pagination: ROWS_PER_PAGE,
                // The page swap re-parents rows, so the painted selection has
                // moved: let the toolbar and formula bar re-read their state.
                onchangepage: () => notifySelection(),
                columns: Array.from({ length: columnCount }, (_, column) => ({
                    width: sheet.columnWidths?.[String(column)] ?? COLUMN_WIDTH,
                    // A generated pivot sheet is not editable by hand: it is
                    // rewritten from its config whenever the source changes.
                    ...(sheet.pivot ? { readOnly: true } : {}),
                })),
                rows: Array.from({ length: rowCount }, (_, row) => {
                    const height = sheet.rowHeights?.[String(row)]
                    return height !== undefined ? { height } : {}
                }),
                defaultColWidth: COLUMN_WIDTH,
                defaultRowHeight: ROW_HEIGHT,
                ...(Object.keys(mergeCells).length > 0 ? { mergeCells } : {}),
                ...(Object.keys(style).length > 0 ? { style } : {}),
            }
        }),
        onchange: change,
        onpaste: change,
        oninsertrow: change,
        oninsertcolumn: change,
        ondeleterow: change,
        ondeletecolumn: change,
        onundo: change,
        onredo: change,
        onchangeworksheet: save,
        oncreateworksheet: save,
        ondeleteworksheet: save,
        onselection: (_instance: any, x1: number, y1: number, x2: number, y2: number) => {
            // Remember the range: the toolbar's mousedown makes jspreadsheet clear
            // its own selection, so later actions need this to stay on target.
            lastSelectionRef.current = {
                startRow: Math.min(y1, y2),
                endRow: Math.max(y1, y2),
                startColumn: Math.min(x1, x2),
                endColumn: Math.max(x1, x2),
            }
            notifySelection()
        },
        oneditionend: () => {
            // Editing finished: refresh dependents. The grid fires `onchange`
            // before this, so the throttled save is already scheduled.
            callbacksRef.current.onGridChange?.()
            notifySelection()
        },
    }
}

/** Tear down a grid instance. */
function destroyGrid(factory: JssFactory, container: HTMLElement, sheets: JssWorksheet[]): void {
    const menuObserver = (container as any).__knMenuObserver as MutationObserver | undefined
    if (menuObserver) {
        delete (container as any).__knMenuObserver
        menuObserver.disconnect()
    }
    // Remove the context menu we re-parented to <body>; the widget teardown no
    // longer owns it.
    const contextMenu = (container as any).__knContextMenu as HTMLElement | undefined
    if (contextMenu) {
        delete (container as any).__knContextMenu
        if (contextMenu.parentElement === document.body) contextMenu.remove()
    }
    const host = (container as any).__knHost as HTMLElement | undefined
    delete (container as any).__knHost
    try {
        if (host && typeof factory.destroy === 'function') factory.destroy(host, true)
        else sheets.forEach((sheet) => sheet?.destroy?.())
    } catch (error) {
        logger.warn('[office/spreadsheet] failed to destroy the grid', error)
    }
}
