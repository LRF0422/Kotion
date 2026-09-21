import { useCallback, useEffect, useRef, useState } from 'react'
// Grid styles ship with the widget; the library itself is still code-split
// (see loadJssFactory).
import 'jspreadsheet-ce/dist/jspreadsheet.css'
import 'jspreadsheet-ce/dist/jspreadsheet.themes.css'
import { logger } from '@kn/common'
import { SAVE_THROTTLE_MS } from './constants'
import {
    cloneRows,
    ensureValidWorkbookData,
    type CellStyles,
    type CellValue,
    type WorkbookData,
} from './workbook-data'

/**
 * Owns one jspreadsheet grid for a spreadsheet block.
 *
 * jspreadsheet is a plain DOM library (no React tree of its own), so this hook is
 * deliberately simple: create on mount, destroy on unmount. Nothing is pooled
 * across mounts, because rebuilding here is cheap and leaves no state behind —
 * which is exactly what the previous engine got wrong.
 */

/** Row/column ceiling for a single grid, so a stray paste cannot hang the tab. */
const MAX_ROWS = 10_000
const MAX_COLUMNS = 256

/** Compact spreadsheet density: rows must not stretch to fill the block. */
const ROW_HEIGHT = 23
const COLUMN_WIDTH = 96
/** Styles of at most this many cells are persisted, bounding the payload size. */
const MAX_STYLED_CELLS = 2_000

export interface GridSelection {
    startRow: number
    startColumn: number
    endRow: number
    endColumn: number
}

export interface GridApi {
    /** Full workbook snapshot, always current (values + styles). */
    getSnapshot(): WorkbookData | null
    /** Current selection in 0-based coordinates, or null before the grid exists. */
    getSelection(): GridSelection | null
    /** Apply CSS declarations (e.g. `{ 'font-weight': 'bold' }`) to the selection. */
    applyStyle(style: Record<string, string | null>): void
    /** Merge / unmerge the current selection. */
    toggleMerge(): void
    /** Rewrite the selection's numbers in the given format. */
    applyNumberFormat(kind: 'general' | 'decimal' | 'percent' | 'currency'): void
    /** Styles of the selection's anchor cell, for toolbar state. */
    getSelectionStyle(): Record<string, string>
    /** History. */
    undo(): void
    redo(): void
    /** Read a rectangular block of values. */
    readRange(sheetIndex: number, startRow: number, startColumn: number, endRow: number, endColumn: number): CellValue[][]
    /** Write a rectangular block, growing the grid when needed. @returns cells written. */
    writeRange(sheetIndex: number, startRow: number, startColumn: number, matrix: CellValue[][]): number
    /** Read a single cell. */
    readCell(sheetIndex: number, row: number, column: number): CellValue
    /** Persist the live grid into node attributes, right now. */
    flush(): void
    /** Replace everything (Excel import, external/AI data). */
    replaceAll(next: WorkbookData): void
    /** Apply payload that changed outside this view; ignores echoes by id. */
    applyExternalData(incoming: WorkbookData): void
    /** False until the grid exists. */
    isReady: boolean
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
}

/** The parts of a jspreadsheet worksheet we use. */
interface JssWorksheet {
    getData(highlighted?: boolean, processed?: boolean): CellValue[][]
    getValueFromCoords(x: number, y: number, processed?: boolean): CellValue | null
    setValueFromCoords(x: number, y: number, value: CellValue, force?: boolean): void
    getStyle(cell?: string | [number, number], key?: string): string | Record<string, string>
    setStyle(o: string, k: string, v: string, force?: boolean): void
    getSelection(): [number, number, number, number]
    setMerge(cellName?: string, colspan?: number, rowspan?: number): null | undefined
    removeMerge(cellName: string, data?: CellValue[]): void
    getMerge(cellName?: string): Record<string, [number, number]> | [number, number] | null
    undo(): void
    redo(): void
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

function clampMatrix(matrix: CellValue[][]): CellValue[][] {
    return matrix.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS))
}

/** Column index (0-based) → label, e.g. 0→A, 26→AA. */
function columnLabel(index: number): string {
    let label = ''
    let value = index
    while (value >= 0) {
        label = String.fromCharCode((value % 26) + 65) + label
        value = Math.floor(value / 26) - 1
    }
    return label
}

/** CSS declaration object → `"a: b; c: d"` text. */
function styleToText(style: Record<string, string>): string {
    return Object.entries(style)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ')
}

/** `"a: b; c: d"` text → CSS declaration object. */
function textToStyle(text: string): Record<string, string> {
    const out: Record<string, string> = {}
    String(text).split(';').forEach((part) => {
        const index = part.indexOf(':')
        if (index <= 0) return
        const key = part.slice(0, index).trim()
        const value = part.slice(index + 1).trim()
        if (key && value) out[key] = value
    })
    return out
}

/** Collect the styles a sheet actually uses, bounded by MAX_STYLED_CELLS. */
function captureStyles(sheet: JssWorksheet, rows: CellValue[][]): CellStyles | undefined {
    const styles: CellStyles = {}
    let count = 0
    for (let row = 0; row < rows.length && count < MAX_STYLED_CELLS; row++) {
        const line = rows[row]
        for (let column = 0; column < line.length && count < MAX_STYLED_CELLS; column++) {
            const value = line[column]
            if (value === null || value === undefined || value === '') continue
            try {
                const style = sheet.getStyle([column, row])
                const text = typeof style === 'string' ? style.trim() : (style ? styleToText(style) : '')
                if (text) {
                    // Key by A1 reference: self-describing in the saved document and
                    // immune to a row/column mix-up in any reader.
                    styles[`${columnLabel(column)}${row + 1}`] = text
                    count += 1
                }
            } catch {
                // One unreadable cell must not abort the snapshot.
            }
        }
    }
    return count > 0 ? styles : undefined
}

/** True when a payload already carries values or styles worth keeping. */
function payloadHasContent(workbook: WorkbookData | null): boolean {
    if (!workbook) return false
    return workbook.sheets.some((sheet) => {
        if (sheet.styles && Object.keys(sheet.styles).length > 0) return true
        return sheet.rows.some((row) => row.some((value) => value !== null && value !== undefined && value !== ''))
    })
}

/** Accept the several shapes a persisted style value can take. */
function declarationMap(value: unknown): Record<string, string> {
    if (!value) return {}
    if (typeof value === 'string') return textToStyle(value)
    if (typeof value === 'object') {
        const out: Record<string, string> = {}
        Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
            if (raw === undefined || raw === null || raw === '') return
            out[key] = String(raw)
        })
        return out
    }
    return {}
}

/** Paint persisted styles back onto a sheet. Idempotent and bounded. */
function applyPersistedStyles(sheet: JssWorksheet, styles: CellStyles | undefined): void {
    if (!styles) return
    Object.entries(styles).forEach(([ref, value]) => {
        if (!/^[A-Z]+\d+$/.test(ref)) return
        Object.entries(declarationMap(value)).forEach(([property, declaration]) => {
            try {
                sheet.setStyle(ref, property, declaration, true)
            } catch {
                // A single bad declaration must not abort restore.
            }
        })
    })
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
}: UseJspreadsheetOptions): GridApi {
    const [isReady, setIsReady] = useState(false)
    // Bumped by the widget's own `onload`, i.e. the first moment it can take styles.
    const [loadedRevision, setLoadedRevision] = useState(0)
    // Bumped when payload arrives that this view did not produce.
    const [externalRevision, setExternalRevision] = useState(0)

    const factoryRef = useRef<JssFactory | null>(null)
    const sheetsRef = useRef<JssWorksheet[]>([])
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const dataRef = useRef<WorkbookData | null>(workbookData ? ensureValidWorkbookData(workbookData) : null)
    const appliedRef = useRef<WorkbookData | null>(null)

    const optionsRef: OptionsRef = useRef({ readOnly })
    optionsRef.current = { readOnly }
    const callbacksRef: CallbacksRef = useRef({ onImportExcel, onExportExcel, onSelectionChange })
    callbacksRef.current = { onImportExcel, onExportExcel, onSelectionChange }
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
            const captured = sheets.map((sheet, index) => {
                const rows = clampMatrix((sheet.getData?.(false, true) ?? []) as CellValue[][])
                const previous = base.sheets[index]
                const styles = captureStyles(sheet, rows)
                return {
                    name: previous?.name ?? `Sheet${index + 1}`,
                    rows,
                    rowCount: Math.max(rows.length, 1),
                    columnCount: Math.max(rows.reduce((max, row) => Math.max(max, row.length), 0), 1),
                    ...(styles ? { styles } : {}),
                }
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
        // telling our own echo apart from payload that came from elsewhere.
        dataRef.current = data
        appliedRef.current = data
        try {
            saveRef.current(data)
        } catch (error) {
            logger.warn('[office/spreadsheet] failed to persist spreadsheet', error)
        }
    }, [snapshot])

    /** Paint persisted styles onto the current sheets. Idempotent. */
    const restoreStyles = useCallback(() => {
        const sheets = sheetsRef.current
        const base = dataRef.current
        if (!sheets.length || !base) return
        sheets.forEach((sheet, index) => applyPersistedStyles(sheet, base.sheets[index]?.styles))
    }, [])

    /** Throttled save — the grid fires a change per keystroke. */
    const scheduleSave = useCallback(() => {
        if (optionsRef.current.readOnly) return
        if (saveTimerRef.current) return
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null
            flush()
        }, SAVE_THROTTLE_MS)
    }, [flush])

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
            created = mountGrid(
                factory,
                container,
                initial,
                optionsRef,
                callbacksRef,
                scheduleSave,
                () => {
                    restoreStyles()
                    setLoadedRevision((revision) => revision + 1)
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

    // ── Restore styling ───────────────────────────────────────────────────
    // Runs once the widget has reported `onload` (the first moment it accepts
    // styles) and again whenever a workbook is swapped in. Applying is cheap and
    // idempotent, so it does not try to detect "already applied".
    useEffect(() => {
        const timer = setTimeout(restoreStyles, 0)
        return () => clearTimeout(timer)
    }, [restoreStyles, loadedRevision, externalRevision])

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

    const selectedBounds = useCallback((sheet: JssWorksheet) => {
        const [a, b, c, d] = sheet.getSelection?.() ?? [0, 0, 0, 0]
        return {
            startRow: Math.min(b, d),
            endRow: Math.max(b, d),
            startColumn: Math.min(a, c),
            endColumn: Math.max(a, c),
        }
    }, [])

    const getSelection = useCallback((): GridSelection | null =>
        withSheet(0, (sheet) => selectedBounds(sheet), null), [withSheet, selectedBounds])

    const applyStyle = useCallback((style: Record<string, string | null>) => {
        withSheet(0, (sheet) => {
            const bounds = selectedBounds(sheet)
            for (let row = bounds.startRow; row <= bounds.endRow; row++) {
                for (let column = bounds.startColumn; column <= bounds.endColumn; column++) {
                    const ref = `${columnLabel(column)}${row + 1}`
                    Object.entries(style).forEach(([key, value]) => {
                        // An empty string clears the property.
                        sheet.setStyle(ref, key, value === null ? '' : value, true)
                    })
                }
            }
            scheduleSave()
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [scheduleSave, withSheet, selectedBounds])

    const toggleMerge = useCallback(() => {
        withSheet(0, (sheet) => {
            const bounds = selectedBounds(sheet)
            const anchor = `${columnLabel(bounds.startColumn)}${bounds.startRow + 1}`
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
    }, [scheduleSave, withSheet, selectedBounds])

    /**
     * Apply a number format to the selection.
     *
     * The grid stores plain values, so formatting rewrites the numbers — Excel's
     * "format cells" semantics, minus a stored format code.
     */
    const applyNumberFormat = useCallback((kind: 'general' | 'decimal' | 'percent' | 'currency') => {
        withSheet(0, (sheet) => {
            const bounds = selectedBounds(sheet)
            const currency = typeof navigator !== 'undefined' && navigator.language?.startsWith('zh') ? '¥' : '$'
            let changed = 0
            for (let row = bounds.startRow; row <= bounds.endRow; row++) {
                for (let column = bounds.startColumn; column <= bounds.endColumn; column++) {
                    const current = sheet.getValueFromCoords?.(column, row, false)
                    if (current === null || current === undefined || current === '') continue
                    const number = typeof current === 'number'
                        ? current
                        : Number(String(current).replace(/[^0-9eE.+-]/g, ''))
                    if (!Number.isFinite(number)) continue
                    const formatted = kind === 'decimal'
                        ? number.toFixed(2)
                        : kind === 'percent'
                            ? `${(number * 100).toFixed(2)}%`
                            : kind === 'currency'
                                ? `${currency}${number.toFixed(2)}`
                                : String(number)
                    sheet.setValueFromCoords?.(column, row, formatted, true)
                    changed += 1
                }
            }
            if (changed > 0) scheduleSave()
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [scheduleSave, withSheet, selectedBounds])

    const getSelectionStyle = useCallback((): Record<string, string> => withSheet(0, (sheet) => {
        const [startColumn, startRow] = sheet.getSelection?.() ?? [0, 0, 0, 0]
        const raw = sheet.getStyle?.([startColumn, startRow])
        if (!raw) return {}
        if (typeof raw === 'string') return textToStyle(raw)
        return { ...raw }
    }, {}), [withSheet])

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
    ): number => withSheet(sheetIndex, (sheet) => {
        let written = 0
        matrix.forEach((row, rowOffset) => {
            row.forEach((value, columnOffset) => {
                if (value === null || value === undefined) return
                const rowIndex = startRow + rowOffset
                const columnIndex = startColumn + columnOffset
                if (rowIndex >= MAX_ROWS || columnIndex >= MAX_COLUMNS) return
                sheet.setValueFromCoords?.(columnIndex, rowIndex, value, true)
                written += 1
            })
        })
        if (written > 0) scheduleSave()
        return written
    }, 0), [scheduleSave, withSheet])

    const readCell = useCallback((sheetIndex: number, row: number, column: number): CellValue =>
        withSheet(sheetIndex, (sheet) => {
            const value = sheet.getValueFromCoords?.(column, row, false)
            return value === undefined ? null : (value as CellValue)
        }, null), [withSheet])

    const undo = useCallback(() => {
        withSheet(0, (sheet) => {
            sheet.undo?.()
            scheduleSave()
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [scheduleSave, withSheet])

    const redo = useCallback(() => {
        withSheet(0, (sheet) => {
            sheet.redo?.()
            scheduleSave()
            callbacksRef.current.onSelectionChange?.()
        }, undefined)
    }, [scheduleSave, withSheet])

    /** Replace everything (Excel import, AI write). Keeps the grid element. */
    const replaceAll = useCallback((next: WorkbookData) => {
        const normalized = ensureValidWorkbookData(next)
        dataRef.current = normalized
        appliedRef.current = normalized
        const factory = factoryRef.current
        const element = container
        if (!factory || !element) return
        try {
            // Sheet count can change and jspreadsheet has no "set sheets" call, so
            // recreate the widget in place. It is a cheap DOM library — there is no
            // per-instance cost worth pooling.
            destroyGrid(factory, element, sheetsRef.current)
            sheetsRef.current = mountGrid(
                factory,
                element,
                normalized,
                optionsRef,
                callbacksRef,
                scheduleSave,
                () => {
                    restoreStyles()
                    setLoadedRevision((revision) => revision + 1)
                },
            )
            setIsReady(true)
        } catch (error) {
            logger.error('[office/spreadsheet] failed to replace spreadsheet data', error)
        }
    }, [container, scheduleSave])

    /** Apply payload that changed outside this view (AI tool, undo, sync). */
    const applyExternalData = useCallback((incoming: WorkbookData) => {
        let normalized = ensureValidWorkbookData(incoming)
        // Echoes of our own save keep the same workbook id.
        if (normalized.id === appliedRef.current?.id) return
        // A payload for the same workbook that lost its styling (an editor that
        // rebuilt itself, a migration) keeps the styling we already hold: losing
        // formatting is never what the user asked for.
        const previous = appliedRef.current
        if (previous && previous.id === normalized.id) {
            const merged = normalized.sheets.map((sheet, index) => {
                const before = previous.sheets[index]
                if (!before?.styles || Object.keys(before.styles).length === 0) return sheet
                if (sheet.styles && Object.keys(sheet.styles).length > 0) return sheet
                return { ...sheet, styles: before.styles }
            })
            normalized = { ...normalized, sheets: merged }
        }
        replaceAll(normalized)
        setExternalRevision((revision) => revision + 1)
    }, [replaceAll])

    return {
        getSnapshot: snapshot,
        getSelection,
        applyStyle,
        toggleMerge,
        applyNumberFormat,
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

/** Create the widget inside `container` and hand the sheets back. */
function mountGrid(
    factory: JssFactory,
    container: HTMLElement,
    workbook: WorkbookData,
    optionsRef: OptionsRef,
    callbacksRef: CallbacksRef,
    scheduleSave: () => void,
    onLoaded: () => void,
): JssWorksheet[] {
    container.replaceChildren()
    const host = document.createElement('div')
    host.className = 'h-full w-full'
    container.appendChild(host)
    const sheets = factory(host, buildOptions(workbook, optionsRef, callbacksRef, scheduleSave, onLoaded))
    // jspreadsheet sizes itself from its content (40 rows ≈ 950px) and ignores the
    // host height, which leaves the widget taller than the block so its body is
    // clipped away. Pin the widget to the host box; the content area then scrolls.
    try {
        const widget = host.querySelector<HTMLElement>('.jss_container')
        if (widget) {
            widget.style.height = '100%'
            widget.style.maxHeight = '100%'
            widget.style.overflow = 'hidden'
            const content = host.querySelector<HTMLElement>('.jss_content')
            if (content) {
                content.style.height = '100%'
                content.style.maxHeight = '100%'
                content.style.overflow = 'auto'
            }
        }
    } catch {
        // Presentation only: the grid still works without it.
    }
    return sheets
}

/** Build the jspreadsheet options for a workbook payload. */
function buildOptions(
    workbook: WorkbookData,
    optionsRef: OptionsRef,
    callbacksRef: CallbacksRef,
    scheduleSave: () => void,
    onLoaded: () => void,
): Record<string, any> {
    const sheets = workbook.sheets.length ? workbook.sheets : ensureValidWorkbookData(null).sheets
    const notifySelection = () => callbacksRef.current.onSelectionChange?.()
    const save = () => scheduleSave()

    return {
        tabs: sheets.length > 1,
        toolbar: false,
        // Fired once the table exists: the first moment styles can be applied.
        onload: () => onLoaded(),
        // Compact rows that scroll inside the block instead of stretching to fill it.
        tableOverflow: true,
        tableHeight: '100%',
        allowExport: false,
        allowImport: false,
        columnSorting: true,
        columnResize: true,
        rowResize: false,
        editable: !optionsRef.current.readOnly,
        contextMenu: (_instance: any, _column: number, _row: number, _event: MouseEvent, items: any[]) => {
            const extra = [
                { title: 'Import Excel', onclick: () => callbacksRef.current.onImportExcel?.() },
                { title: 'Export Excel', onclick: () => callbacksRef.current.onExportExcel?.() },
            ]
            return optionsRef.current.readOnly ? extra : [...items, { title: '---' }, ...extra]
        },
        worksheets: sheets.map((sheet, index) => ({
            data: cloneRows(sheet.rows),
            minDimensions: [Math.max(sheet.columnCount, 1), Math.max(sheet.rowCount, 1)],
            worksheetName: sheet.name || `Sheet${index + 1}`,
            columns: Array.from({ length: Math.max(sheet.columnCount, 1) }, () => ({ width: COLUMN_WIDTH })),
            defaultColWidth: COLUMN_WIDTH,
            defaultRowHeight: ROW_HEIGHT,
        })),
        onchange: save,
        onpaste: save,
        oninsertrow: save,
        oninsertcolumn: save,
        ondeleterow: save,
        ondeletecolumn: save,
        onundo: save,
        onredo: save,
        onchangeworksheet: save,
        onselection: notifySelection,
        oneditionend: () => {
            save()
            notifySelection()
        },
    }
}

/** Tear down a grid instance. */
function destroyGrid(factory: JssFactory, container: HTMLElement, sheets: JssWorksheet[]): void {
    try {
        if (typeof factory.destroy === 'function') factory.destroy(container, true)
        else sheets.forEach((sheet) => sheet?.destroy?.())
    } catch (error) {
        logger.warn('[office/spreadsheet] failed to destroy the grid', error)
    }
}
