import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '@kn/common'
import { translate } from '../i18n'
import { SAVE_THROTTLE_MS } from './constants'
import {
    ensureValidWorkbookData,
    formatCellRef,
    parseCellRef,
    workbookContentKey,
    type CellValue,
    type NumberFormatKind,
    type SheetData,
    type WorkbookData,
} from './workbook-data'
import {
    MAX_COLUMNS,
    MAX_ROWS,
    clampMatrix,
    formatNumeric,
    numericValue,
    payloadHasContent,
    sheetNumberMeta,
    type NumberMeta,
} from './grid-utils'
import { captureNumberFormats, formatCellDisplay } from './number-format'
import {
    decideExternalData,
    prepareMatrixWrite,
    readCellFrom,
    readRangeFrom,
} from './grid-range-ops'
import { lockTableForEditing, unlockTableForEditing } from './vtable-lock'
import {
    fromVTableMerges,
    normalizeSavedConfig,
    workbookToSheetDefines,
    type VTableSheetDefine,
} from './vtable-config'
import { clampBounds, forEachCell, fromVTableRange } from './vtable-selection'
import { fromVTableStyle, mergeStyleText, toVTableStyle, toVTableStylePatch } from './vtable-style'
import { captureTrackedStyles, MAX_STYLED_CELLS, seedTrackedSets, styleIdForRef, trackedSetFor } from './style-capture'
import {
    buildSheetTheme,
    CONTEXT_MENU_ICONS,
    fallbackTokens,
    isDarkColor,
    prefersDarkMode,
    readThemeTokens,
    themeContextMenuStyles,
    type ContextMenuStyles,
    type SheetTheme,
    type ThemeTokens,
} from './vtable-theme'
import { formatResult, recalculate, restoreFormulas, type RecalcSheet } from './formula'
import type { GridApi, GridSelection } from './grid-api'

/**
 * The VTableSheet adapter: the only implementation of the grid contract.
 *
 * It implements the same {@link GridApi} contract, so the toolbar, formula bar,
 * pivot dialogs, AI tools and node persistence need no changes. All translation
 * between our model and the engine lives in the pure modules this hook composes
 * (`vtable-config`, `vtable-selection`, `vtable-style`, `grid-range-ops`,
 * `vtable-lock`, `style-capture`, `number-format`), which are unit-tested; what
 * remains here is lifecycle and event wiring.
 *
 * Engine constraints this hook works around (verified at runtime, see
 * docs/VTABLE_MIGRATION.md §3.1 and §6):
 *
 * - **No per-sheet read-only** → generated sheets are locked via `vtable-lock`.
 * - **No number-format API** → formats are rendered into the stored cell values,
 *   and the `numberFormats`/`rawValues` bookkeeping keeps them reversible.
 * - **No style option on a sheet definition** → styles are applied after mount,
 *   one registered custom style per cell, arranged onto that cell.
 * - **`getCellStyle` resolves a default style for every cell** → style capture
 *   follows the cells this adapter arranged rather than sweeping the sheet.
 * - **Formulas do not recalculate**: the engine keeps its own `sheetData` copy
 *   that cell edits never reach, so a formula cell keeps showing its text. See
 *   the formula section in the migration plan.
 * - `WorkSheet` accessors are `(col, row)`; ours are `(row, column)`.
 */

/** VTable's own event names (see TABLE_EVENT_TYPE). */
const CHANGE_CELL_VALUE = 'change_cell_value'
const PASTED_DATA = 'pasted_data'
const MERGE_CELLS = 'merge_cells'
const UNMERGE_CELLS = 'unmerge_cells'
const SELECTED_CHANGED = 'selected_changed'

/**
 * The slice of the engine this adapter drives.
 *
 * Typed loosely on purpose: the public package ships no vendor types we depend
 * on, and every engine call is funnelled through these interfaces so a vendor
 * change is a single-file fix.
 */
interface EngineSheet {
    getData?: () => CellValue[][]
    getCellValue?: (col: number, row: number, considerFormula?: boolean) => CellValue
    getCellValueConsiderFormula?: (col: number, row: number) => CellValue
    setCellValue?: (col: number, row: number, value: CellValue) => void
    setCellFormula?: (col: number, row: number, formula: string) => void
    getSelection?: () => unknown
    getRowCount?: () => number
    getColumnCount?: () => number
    getKey?: () => string
    getTitle?: () => string
    tableInstance?: EngineTable | null
    resize?: () => void
    release?: () => void
}

interface EngineTable {
    getEditor?: (col: number, row: number) => unknown
    isHasEditorDefine?: (col: number, row: number) => boolean
    options?: Record<string, unknown>
    changeCellValue?: (
        col: number,
        row: number,
        value: CellValue,
        isFormula?: boolean,
        triggerEvent?: boolean,
    ) => void
    changeCellValues?: (
        startCol: number,
        startRow: number,
        values: CellValue[][],
        workOnEditableCell?: boolean,
        triggerEvent?: boolean,
    ) => void
    addRecords?: (records: unknown[], index?: number) => void
    getCellValue?: (col: number, row: number) => CellValue
    registerCustomCellStyle?: (id: string, style: Record<string, unknown> | null) => void
    arrangeCustomCellStyle?: (
        target: { col?: number; row?: number; range?: unknown },
        styleId: string,
    ) => void
    getCellStyle?: (col: number, row: number) => Record<string, unknown> | undefined
    mergeCells?: (startCol: number, startRow: number, endCol: number, endRow: number) => void
    unmergeCells?: (startCol: number, startRow: number, endCol: number, endRow: number) => void
    /** The engine keeps merges here; `mergeCells`/`unmergeCells` edit it. */
    customMergeCell?: unknown
    getMergeCells?: () => unknown[]
}

interface EngineSpreadsheet {
    getActiveSheet?: () => EngineSheet | null
    getWorkSheetByKey?: (key: string) => EngineSheet | null
    getSheetCount?: () => number
    getAllSheets?: () => VTableSheetDefine[]
    activateSheet?: (key: string) => void
    getSheetTabElement?: () => HTMLElement | null
    /** Unified VTableSheet event bus (sheet_activated, ...). */
    on?: (type: string, callback: (event: unknown) => void) => void
    off?: (type: string, callback?: (event: unknown) => void) => void
    undo?: () => void
    redo?: () => void
    startHistoryTransaction?: () => void
    endHistoryTransaction?: () => void
    onTableEvent?: (type: string, callback: (event: unknown) => void) => void
    offTableEvent?: (type: string, callback?: (event: unknown) => void) => void
    updateOption?: (next: Record<string, unknown>) => void
    saveToConfig?: () => VTableSheetDefine[] | { sheets?: VTableSheetDefine[] }
    release?: () => void
    resize?: () => void
}

interface EngineModule {
    VTableSheet: new (container: HTMLElement, options: Record<string, unknown>) => EngineSpreadsheet
}

/**
 * Options for the VTableSheet adapter.
 *
 * The shape mirrors {@link GridApi}'s needs: the view hands over a container,
 * the payload and the mode, and receives the engine-agnostic grid contract back.
 */
export interface UseVTableSheetOptions {
    container: HTMLDivElement | null
    /** Initial payload. Later changes are applied through `applyExternalData`. */
    workbookData: WorkbookData | null
    readOnly: boolean
    darkMode: boolean
    /** Persist the whole workbook after edits (throttled). */
    onSave: (data: WorkbookData) => void
    /**
     * Accepted for interface parity. The engine's own menus are switched off
     * (the host owns the toolbar), so nothing in the grid calls these;
     * `SheetToolbar` drives import/export directly.
     */
    onImportExcel?: () => void
    /** @see onImportExcel */
    onExportExcel?: () => void
    /** Called whenever the selection or its style may have changed. */
    onSelectionChange?: () => void
    /**
     * Accepted for parity. The engine has no built-in pivot drill-down, so the
     * host reaches source rows through `PivotDetailsDialog` instead.
     */
    onPivotDrillDown?: (target: { sheetIndex: number; row: number; column: number }) => void
}

let enginePromise: Promise<EngineModule> | null = null

/**
 * The engine currently mounted on each container.
 *
 * A container can only hold one. React's development double-invoke, a hot reload
 * or two payload swaps in quick succession would otherwise construct a second
 * engine over the first without releasing it, and the two corrupt each other —
 * observed as an engine that reports zero sheets while rendering nothing.
 * Registering here makes the replacement explicit: release, then mount.
 */
const enginesByContainer = new WeakMap<HTMLElement, EngineSpreadsheet>()

/** Release whatever engine is on `container` and forget it. */
function releaseContainerEngine(container: HTMLElement | null): void {
    if (!container) return
    const existing = enginesByContainer.get(container)
    if (existing) {
        enginesByContainer.delete(container)
        safeRelease(existing)
    }
}

/** Mount a fresh engine on `container`, replacing any engine already there. */
function mountEngine(
    module: EngineModule,
    container: HTMLElement,
    options: Record<string, unknown>,
): EngineSpreadsheet {
    releaseContainerEngine(container)
    const engine = new module.VTableSheet(container, options)
    enginesByContainer.set(container, engine)
    return engine
}

/**
 * Load the engine on demand: a page with no spreadsheet never downloads it.
 *
 * Also registers VTable's custom-cell-style plugin. Without it
 * `registerCustomCellStyle` / `arrangeCustomCellStyle` are **silent no-ops**:
 * the table only instantiates the plugin when `Factory` knows the component, so
 * every `applyStyle` would update our bookkeeping while the cell keeps rendering
 * its default style — and the saved payload would come back empty.
 * `vtable-sheet` does not register it for us (checked in 1.26.8).
 */
async function loadEngine(): Promise<EngineModule> {
    if (!enginePromise) {
        enginePromise = (async () => {
            const mod = (await import('@visactor/vtable-sheet')) as unknown as EngineModule
            if (typeof mod?.VTableSheet !== 'function') {
                throw new Error('@visactor/vtable-sheet did not export VTableSheet')
            }
            try {
                const vtable = (await import('@visactor/vtable')) as unknown as {
                    register?: { registerCustomCellStylePlugin?: () => void }
                    registerCustomCellStylePlugin?: () => void
                }
                const register =
                    vtable.register?.registerCustomCellStylePlugin ?? vtable.registerCustomCellStylePlugin
                register?.()
            } catch (error) {
                logger.warn('[office/spreadsheet] could not register the custom-cell-style plugin', error)
            }
            return mod
        })()
    }
    return enginePromise
}

export function useVTableSheet(options: UseVTableSheetOptions): GridApi {
    const {
        container,
        workbookData,
        readOnly,
        darkMode,
        onSave,
        onSelectionChange,
    } = options
    // Parity-only callbacks are intentionally not destructured; see the option
    // docs above for why nothing in this adapter calls them.

    const [isReady, setIsReady] = useState(false)

    const engineRef = useRef<EngineSpreadsheet | null>(null)
    /** The loaded engine module, kept so `replaceAll` can rebuild the instance. */
    const engineModuleRef = useRef<EngineModule | null>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    /** The grid changed since the last save; a throttled save is a no-op otherwise. */
    const dirtyRef = useRef(false)
    const dataRef = useRef<WorkbookData | null>(null)
    const appliedRef = useRef<WorkbookData | null>(null)
    /** Fingerprint of the last payload this view applied or persisted. */
    const appliedKeyRef = useRef('')
    /**
     * The exact object last handed to `onSave`.
     *
     * The rendered view stores it and React gives that same object back, so
     * identity is the reliable way to recognise our own save — see
     * `decideExternalData`.
     */
    const persistedRef = useRef<WorkbookData | null>(null)
    const numberMetaRef = useRef<NumberMeta[]>([])
    /** Last live selection: the toolbar's mousedown can clear the engine's own. */
    const lastSelectionRef = useRef<GridSelection | null>(null)
    /**
     * Cells this adapter has arranged a style on, as A1 refs, **per sheet**.
     *
     * Capture reads from here rather than sweeping the sheet: the engine resolves
     * a default style for every cell, so an extent-based sweep would mark the
     * whole sheet as styled, spend the payload cap on defaults, and drop the
     * user's actual formatting.
     *
     * Keyed by sheet index because an A1 ref alone is ambiguous across sheets —
     * a single flat set made every sheet report the same styled cells, which
     * copied one sheet's formatting onto all of them at save time.
     */
    const styledCellsRef = useRef<Array<Set<string>>>([])
    /**
     * Merges this adapter has created, per sheet.
     *
     * `toggleMerge` needs to know whether the selection is already merged, and
     * asking the engine proved unreliable: `saveToConfig()` reports the merge, yet
     * a merge followed by a payload round-trip merged again instead of unmerging.
     * Tracking it here makes the decision deterministic, and it is seeded from the
     * payload so a reload is consistent.
     */
    const mergedRangesRef = useRef<MergeRange[][]>([])
    /**
     * The engine sheet key for each logical sheet index.
     *
     * VTableSheet names the sheets it creates itself sheetN, so the initial
     * String(index) keys stop matching once the user adds a sheet. This map is
     * what lets a structural change be read back into the persisted order.
     */
    const sheetKeysRef = useRef<string[]>([])
    /** Re-entrancy guard for reconcileFromEngine. */
    const reconcilingRef = useRef(false)
    const structureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    /** Set to the live reconciler; read by the wrappers installed on the engine. */
    const structureChangeRef = useRef<() => void>(() => {})
    /** Written by the engine's events; read by queued callbacks. */
    const onSaveRef = useRef(onSave)
    onSaveRef.current = onSave
    const onSelectionChangeRef = useRef(onSelectionChange)
    onSelectionChangeRef.current = onSelectionChange

    // Seed refs once, synchronously, from the initial payload.
    if (dataRef.current === null && workbookData) {
        const initial = ensureValidWorkbookData(workbookData)
        dataRef.current = initial
        numberMetaRef.current = initial.sheets.map(sheetNumberMeta)
        styledCellsRef.current = seedTrackedSets(initial.sheets)
        mergedRangesRef.current = seedMergeRanges(initial.sheets)
        sheetKeysRef.current = initial.sheets.map((_, index) => String(index))
    }

    // ── Engine calls ─────────────────────────────────────────────────────

    const withSheet = useCallback(<T,>(
        sheetIndex: number,
        fn: (sheet: EngineSheet, table: EngineTable | null) => T,
        fallback: T,
    ): T => {
        const engine = engineRef.current
        if (!engine) return fallback
        try {
            const key = String(sheetIndex)
            // Instances are created lazily: a sheet the user has never opened has
            // no `WorkSheet` yet, so `getWorkSheetByKey` returns null and every
            // read/write against it would silently no-op. Activate it first, then
            // put the user back where they were.
            const restoreKey = engine.getActiveSheet?.()?.getKey?.()
            if (restoreKey !== key) engine.activateSheet?.(key)
            const sheet = engine.getWorkSheetByKey?.(key) ?? null
            if (!sheet) return fallback
            // The table may not exist yet during construction; hand callers a null
            // table rather than refusing outright, so reads that only need the
            // sheet (values) still work while table-only operations no-op.
            try {
                return fn(sheet, (sheet.tableInstance as EngineTable | null) ?? null)
            } finally {
                if (restoreKey !== undefined && restoreKey !== key) engine.activateSheet?.(restoreKey)
            }
        } catch (error) {
            logger.warn('[office/spreadsheet] grid operation failed', error)
            return fallback
        }
    }, [])

    const activeSheetIndex = useCallback((): number => {
        const engine = engineRef.current
        if (!engine) return 0
        try {
            const key = engine.getActiveSheet?.()?.getKey?.()
            if (key !== undefined) {
                const index = Number(key)
                if (Number.isFinite(index) && index >= 0) return index
            }
            // Fall back to the stored index, clamped to the sheets we know about.
            const count = Math.max(dataRef.current?.sheets.length ?? 1, 1)
            return Math.min(Math.max(dataRef.current?.activeSheet ?? 0, 0), count - 1)
        } catch {
            return dataRef.current?.activeSheet ?? 0
        }
    }, [])

    /**
     * Read the live grid back into the persisted shape.
     *
     * Values come from the engine; the layout half (merges, sizes) comes from
     * `saveToConfig()`, because the engine tracks user resizes internally and
     * only materialises them there.
     */
    const snapshot = useCallback((): WorkbookData | null => {
        const engine = engineRef.current
        const base = dataRef.current
        if (!engine || !base) return base

        try {
            // `saveToConfig()` hands back the whole options object; see
            // `normalizeSavedConfig` for why that distinction mattered.
            const config = normalizeSavedConfig(engine.saveToConfig?.())
            // Sheet instances are created lazily — `getWorkSheetByKey` returns null
            // for a sheet the user has never opened, which would save that sheet as
            // empty. Activate each one to force its instance, then put the user back
            // where they were.
            const restoreKey = engine.getActiveSheet?.()?.getKey?.()
            const sheets: SheetData[] = base.sheets.map((previous, index) => {
                const key = String(index)
                const define = config.find((entry) => entry.sheetKey === key)
                if (restoreKey !== undefined && restoreKey !== key) engine.activateSheet?.(key)
                const sheet = engine.getWorkSheetByKey?.(key) ?? null

                // `getData()` returns the raw matrix, so `=FORMULA` text survives.
                const rows = clampMatrix((sheet?.getData?.() ?? previous.rows) as CellValue[][])
                // The engine holds the *computed* value for a formula cell (the
                // adapter writes it there for display), but the document must keep
                // the formula so it round-trips and collaborators receive the
                // formula rather than a frozen snapshot. Put the source text back.
                restoreFormulas(rows, previous.rows)
                const columnCount = Math.max(
                    rows.reduce((max, row) => Math.max(max, row.length), 0),
                    previous.columnCount,
                    1,
                )

                // Generated sheets are recomputed by `refreshPivots` from their
                // config, so their stored style map is kept rather than read back.
                const styles = previous.pivot
                    ? previous.styles
                    : captureStyles(sheet, styledCellsRef.current[index])
                const numberMeta = captureNumberFormats(rows, numberMetaRef.current[index])
                numberMetaRef.current[index] = numberMeta
                // Merges come from our own tracked list, which is the source of
                // truth for what this adapter merged and unmerged. Reading the
                // engine instead was unreliable: after `unmergeCells` the saved
                // payload still carried the merge (the engine appears to serve a
                // cached merge set), so an unmerge looked like it did nothing.
                // The tracked list is seeded from the payload, so a reload agrees.
                const tracked = mergedRangesRef.current[index]
                const merges = tracked && tracked.length > 0
                    ? tracked
                    : (define?.cellMerge
                        ? fromVTableMerges(define.cellMerge)
                        : captureMergesFromTable((sheet?.tableInstance as EngineTable | null) ?? null))

                const columnWidths = widthsFromConfig(define)
                const rowHeights = heightsFromConfig(define)

                return {
                    ...previous,
                    rows,
                    rowCount: Math.max(rows.length, 1),
                    columnCount,
                    ...(styles ? { styles } : {}),
                    ...(Object.keys(numberMeta.numberFormats).length > 0
                        ? { numberFormats: numberMeta.numberFormats }
                        : {}),
                    ...(Object.keys(numberMeta.rawValues).length > 0
                        ? { rawValues: numberMeta.rawValues }
                        : {}),
                    ...(columnWidths ? { columnWidths } : {}),
                    ...(rowHeights ? { rowHeights } : {}),
                    ...(merges ? { merges } : {}),
                }
            })

            if (restoreKey !== undefined) engine.activateSheet?.(restoreKey)
            return { ...base, sheets, activeSheet: activeSheetIndex() }
        } catch (error) {
            logger.warn('[office/spreadsheet] failed to read grid data', error)
            return base
        }
    }, [activeSheetIndex])

    /** Persist the live grid now, cancelling the pending throttle. */
    const flush = useCallback(() => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
        }
        // Nothing changed: skip the read-back, the style sweep and the
        // fingerprint. A large sheet makes those cost real time.
        if (!dirtyRef.current) return
        const data = snapshot()
        if (!data) return
        // Never persist a grid that has not rendered yet.
        if (!engineHasContent(engineRef.current) && payloadHasContent(dataRef.current)) {
            logger.warn('[office/spreadsheet] skipped saving an empty grid snapshot')
            return
        }
        const persisted = ensureValidWorkbookData(data)
        dataRef.current = persisted
        appliedRef.current = persisted
        appliedKeyRef.current = workbookContentKey(persisted)
        persistedRef.current = persisted
        dirtyRef.current = false
        try {
            onSaveRef.current(persisted)
        } catch (error) {
            logger.warn('[office/spreadsheet] failed to persist spreadsheet', error)
        }
    }, [snapshot])

    const scheduleSaveAfter = useCallback((delay: number) => {
        dirtyRef.current = true
        if (saveTimerRef.current) return
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null
            flush()
        }, delay)
    }, [flush])

    /** Trailing-throttled save for engine change events. */
    const scheduleSave = useCallback(() => {
        if (readOnly) return
        scheduleSaveAfter(SAVE_THROTTLE_MS)
    }, [readOnly, scheduleSaveAfter])

    /** Persist on the next tick, for host writes the engine reports no event for. */
    const push = useCallback(() => {
        if (readOnly) return
        scheduleSaveAfter(0)
    }, [readOnly, scheduleSaveAfter])

    // ── Create / destroy ─────────────────────────────────────────────────

    useEffect(() => {
        if (!container) return
        let cancelled = false
        let engine: EngineSpreadsheet | null = null

        void (async () => {
            let module: EngineModule
            try {
                module = await loadEngine()
            } catch (error) {
                logger.error('[office/spreadsheet] failed to load the grid engine', error)
                return
            }
            if (cancelled) return

            const initial = ensureValidWorkbookData(workbookData)
            dataRef.current = initial
            appliedRef.current = initial
            appliedKeyRef.current = workbookContentKey(initial)
            numberMetaRef.current = initial.sheets.map(sheetNumberMeta)
            styledCellsRef.current = seedTrackedSets(initial.sheets)
        mergedRangesRef.current = seedMergeRanges(initial.sheets)
            sheetKeysRef.current = initial.sheets.map((_, index) => String(index))

            try {
                engine = mountEngine(
                    module,
                    container,
                    buildEngineOptions(initial, readOnly, container, darkMode ? true : undefined),
                )
            } catch (error) {
                logger.error('[office/spreadsheet] failed to mount the grid engine', error)
                return
            }
            if (cancelled) {
                safeRelease(engine)
                return
            }
            engineRef.current = engine
            engineModuleRef.current = module

            // Styles and formats are applied after mount: the engine has no style
            // option on a sheet definition and no number-format API at all.
            applyPersistedPresentation(engine, initial, styledCellsRef.current)
            applyFormulas(engine, initial)
            lockGeneratedSheets(engine, initial)
            applyReadOnly(engine, readOnly, initial)
            wireEvents(engine, {
                scheduleSave,
                onSelectionChange: onSelectionChangeRef,
                lastSelectionRef,
                onStructureChange: () => structureChangeRef.current(),
            })
            applyContextMenuTheme(engine, initial, resolveThemeTokens(container, darkMode ? true : undefined))
            setIsReady(true)
        })()

        return () => {
            cancelled = true
            // Persist before tearing the DOM down so a fast unmount cannot lose
            // the last edit.
            flush()
            engineRef.current = null
            setIsReady(false)
            // Releases whichever engine actually owns the container, including one
            // a later mount installed.
            releaseContainerEngine(container)
        }
        // The engine is created once per container; payload changes go through
        // `applyExternalData` so the grid is not rebuilt underneath the user.
    }, [container]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Read-only toggle ─────────────────────────────────────────────────

    useEffect(() => {
        const engine = engineRef.current
        if (!engine) return
        applyReadOnly(engine, readOnly, dataRef.current)
    }, [readOnly, isReady])

    // ── Payload that changed outside this view ───────────────────────────

    useEffect(() => {
        const engine = engineRef.current
        if (!engine || !workbookData) return
        const incoming = ensureValidWorkbookData(workbookData)
        const decision = decideExternalData(
            incoming,
            workbookContentKey(incoming),
            persistedRef.current,
            appliedKeyRef.current,
        )
        // `echo` is our own save coming back; applying it would remount the engine
        // and re-seed tracked state, which reverted an unmerge.
        if (decision !== 'apply') return

        dataRef.current = incoming
        appliedRef.current = incoming
        appliedKeyRef.current = workbookContentKey(incoming)
        numberMetaRef.current = incoming.sheets.map(sheetNumberMeta)
        // Re-seeds the tracked style/merge state from the incoming payload. Note
        // this only runs for a payload we did **not** produce: re-seeding from our
        // own save was reverting an unmerge, because the payload React held was
        // still the pre-unmerge one.
        styledCellsRef.current = seedTrackedSets(incoming.sheets)
        mergedRangesRef.current = seedMergeRanges(incoming.sheets)
        const rebuilt = remountSheets(engine, container, engineModuleRef.current, incoming, readOnly, darkMode)
        if (!rebuilt) return
        engineRef.current = rebuilt
        applyPersistedPresentation(rebuilt, incoming, styledCellsRef.current)
        applyFormulas(rebuilt, incoming)
        lockGeneratedSheets(rebuilt, incoming)
        wireEvents(rebuilt, {
            scheduleSave,
            onSelectionChange: onSelectionChangeRef,
            lastSelectionRef,
            onStructureChange: () => structureChangeRef.current(),
        })
        applyContextMenuTheme(rebuilt, incoming, resolveThemeTokens(container, darkMode))
        rebuilt.resize?.()
    }, [container, darkMode, workbookData, readOnly, scheduleSave])

    // Theme switches update the engine in place. Rebuilding would be correct but
    // throws away scroll position, selection and the grid's own undo history for
    // what is a paint-level change.
    useEffect(() => {
        const engine = engineRef.current
        if (!engine) return
        const dark = darkMode || prefersDarkMode(container)
        try {
            const workbook = dataRef.current
            engine.updateOption?.({
                // `updateOption` realigns the sheet list whenever it considers the
                // theme changed: it calls `updateSheets(options)` and that reads
                // `options.sheets || []`, so a theme-only call **removes every
                // sheet**. Passing the current definitions keeps the sheets while
                // the theme changes.
                ...(workbook ? { sheets: workbookToSheetDefines(workbook) } : {}),
                theme: resolveSheetTheme(container, dark),
            })
            applyContextMenuTheme(engine, workbook, resolveThemeTokens(container, dark))
            engine.resize?.()
        } catch (error) {
            logger.warn('[office/spreadsheet] failed to apply the theme', error)
        }
    }, [darkMode, isReady, container])

    // ── GridApi ──────────────────────────────────────────────────────────

    const getSelection = useCallback((): GridSelection | null => {
        const engine = engineRef.current
        if (!engine) return null
        try {
            // A `WorkSheet` is constructed before its `ListTable` exists, so during
            // mount these accessors can be reached while `tableInstance` is null.
            const active = engine.getActiveSheet?.()
            if (!active?.tableInstance) return lastSelectionRef.current
            const fromEngine = fromVTableRange(active.getSelection?.() as never)
            if (fromEngine) {
                lastSelectionRef.current = fromEngine
                return fromEngine
            }
        } catch {
            // Fall through to the remembered range.
        }
        return lastSelectionRef.current
    }, [])

    const selectedBounds = useCallback((): GridSelection | null => {
        const selection = getSelection()
        if (!selection) return null
        const sheet = engineRef.current?.getActiveSheet?.()
        let rowCount = MAX_ROWS
        let columnCount = MAX_COLUMNS
        try {
            // Guarded because `getRowCount` dereferences `tableInstance`, which does
            // not exist yet while the sheet is being constructed.
            if (sheet?.tableInstance) {
                rowCount = sheet.getRowCount?.() ?? MAX_ROWS
                columnCount = sheet.getColumnCount?.() ?? MAX_COLUMNS
            }
        } catch {
            // Fall back to the ceilings.
        }
        return clampBounds(selection, rowCount, columnCount)
    }, [getSelection])

    const applyStyle = useCallback((style: Record<string, string | null>) => {
        const bounds = selectedBounds()
        if (!bounds) return
        if (!toVTableStylePatch(style)) return
        const sheetIndex = activeSheetIndex()

        withSheet(sheetIndex, (_sheet, table) => {
            if (!table) return
            const tracked = trackedSetFor(styledCellsRef.current, sheetIndex)
            forEachCell(bounds, (row, column) => {
                const ref = formatCellRef(row, column)
                // The engine replaces an arranged style wholesale, so merge the
                // cell's existing declarations in first — but only when we
                // arranged them, otherwise the resolved default would be baked in.
                const current = tracked.has(ref) ? currentStyleText(table, column, row) : undefined
                const next = toVTableStyle(mergeStyleText(current, style))
                const id = styleIdForRef(ref)
                table.registerCustomCellStyle?.(id, next ?? null)
                table.arrangeCustomCellStyle?.({ col: column, row }, id)
                tracked.add(ref)
            })
            push()
        }, undefined)
        onSelectionChangeRef.current?.()
    }, [activeSheetIndex, push, selectedBounds, withSheet])

    const getSelectionStyle = useCallback((): Record<string, string> => {
        const bounds = selectedBounds()
        if (!bounds) return {}
        return withSheet(activeSheetIndex(), (_sheet, table) => {
            if (!table) return {}
            const ref = formatCellRef(bounds.startRow, bounds.startColumn)
            // Report only what we arranged; the engine's resolved default would
            // otherwise make the toolbar claim an unformatted cell is formatted.
            if (!trackedSetFor(styledCellsRef.current, activeSheetIndex()).has(ref)) return {}
            const css = fromVTableStyle(toVTableStyle(currentStyleText(table, bounds.startColumn, bounds.startRow)))
            return parseDeclarationsSafe(css)
        }, {})
    }, [activeSheetIndex, selectedBounds, withSheet])

    const applyNumberFormat = useCallback((kind: NumberFormatKind) => {
        const bounds = selectedBounds()
        if (!bounds) return
        const sheetIndex = activeSheetIndex()
        const meta = numberMetaRef.current[sheetIndex] ?? { numberFormats: {}, rawValues: {} }
        const numberFormats = { ...meta.numberFormats }
        const rawValues = { ...meta.rawValues }

        withSheet(sheetIndex, (sheet, table) => {
            let changed = 0
            forEachCell(bounds, (row, column) => {
                const ref = formatCellRef(row, column)
                const current = (sheet.getCellValue?.(column, row) ?? null) as CellValue
                const storedRaw = rawValues[ref]
                const source = storedRaw !== undefined ? storedRaw : current
                const numeric = numericValue(source)

                if (kind === 'general') {
                    if (storedRaw !== undefined) {
                        // Reversible: put the number back.
                        writeCell(table, sheet, column, row, storedRaw)
                        delete rawValues[ref]
                    }
                    delete numberFormats[ref]
                    changed += 1
                    return
                }

                if (numeric === null) return
                if (storedRaw === undefined) rawValues[ref] = current
                numberFormats[ref] = kind
                writeCell(table, sheet, column, row, formatNumeric(numeric, kind))
                changed += 1
            })
            numberMetaRef.current[sheetIndex] = { numberFormats, rawValues }
            // The rewrites above are silent, so no engine event fires: mark the
            // grid dirty and persist on the next tick.
            if (changed > 0) push()
        }, undefined)
        onSelectionChangeRef.current?.()
    }, [activeSheetIndex, push, selectedBounds, withSheet])

    const toggleMerge = useCallback(() => {
        const bounds = selectedBounds()
        if (!bounds) return
        const sheetIndex = activeSheetIndex()
        withSheet(sheetIndex, (_sheet, table) => {
            if (!table) return
            const tracked = mergedRangesFor(mergedRangesRef.current, sheetIndex)
            const existing = findTrackedMerge(tracked, bounds)
            if (existing) {
                // `unmergeCells` matches the stored range exactly, so pass back the
                // merge that was found rather than the (possibly smaller) selection.
                table.unmergeCells?.(existing[0], existing[1], existing[2], existing[3])
                const at = tracked.indexOf(existing)
                if (at >= 0) tracked.splice(at, 1)
            } else {
                table.mergeCells?.(bounds.startColumn, bounds.startRow, bounds.endColumn, bounds.endRow)
                tracked.push([bounds.startColumn, bounds.startRow, bounds.endColumn, bounds.endRow])
            }
            // The tracked list is authoritative, so write it straight into the
            // working payload. Relying on the engine's own merge storage lost the
            // unmerge: `saveToConfig()` kept reporting the merge, and the payload
            // then re-seeded the tracked list back to the merged state.
            writeMergesInto(dataRef.current, sheetIndex, tracked)
            push()
        }, undefined)
        onSelectionChangeRef.current?.()
    }, [activeSheetIndex, push, selectedBounds, withSheet])

    const selectRange = useCallback((
        startRow: number,
        startColumn: number,
        endRow: number,
        endColumn: number,
    ) => {
        lastSelectionRef.current = { startRow, startColumn, endRow, endColumn }
        try {
            const target = engineRef.current?.getActiveSheet?.() as unknown as {
                updateSelectionFromCoords?: (c1: number, r1: number, c2: number, r2: number) => void
            }
            target?.updateSelectionFromCoords?.(startColumn, startRow, endColumn, endRow)
        } catch {
            // Presentation only.
        }
        onSelectionChangeRef.current?.()
    }, [])

    const readRange = useCallback((
        sheetIndex: number,
        startRow: number,
        startColumn: number,
        endRow: number,
        endColumn: number,
    ): CellValue[][] => withSheet(sheetIndex, (sheet) => {
        const rows = (sheet.getData?.() ?? []) as CellValue[][]
        return readRangeFrom(rows, startRow, startColumn, endRow, endColumn)
    }, []), [withSheet])

    const writeRange = useCallback((
        sheetIndex: number,
        startRow: number,
        startColumn: number,
        matrix: CellValue[][],
        options?: { show?: boolean },
    ): number | null => {
        const engine = engineRef.current
        if (!engine || !engine.getWorkSheetByKey?.(String(sheetIndex))) return null
        const prepared = prepareMatrixWrite(matrix, startRow, startColumn, MAX_ROWS, MAX_COLUMNS)
        if (prepared.written === 0) return 0

        return withSheet(sheetIndex, (sheet, table) => {
            growTo(sheet, table, prepared.requiredRows, prepared.requiredColumns)
            for (let rowOffset = 0; rowOffset < prepared.matrix.length; rowOffset += 1) {
                writeRow(table, sheet, startColumn, startRow + rowOffset, prepared.matrix[rowOffset] ?? [])
            }
            // Formula results depend on the cells just written, so recompute before
            // the save that follows.
            if (dataRef.current) applyFormulas(engineRef.current, dataRef.current)
            // `show` only decides whether the view follows the write; the values
            // are written either way.
            if (options?.show !== false) selectRange(startRow, startColumn, startRow, startColumn)
            push()
            return prepared.written
        }, null)
    }, [push, selectRange, withSheet])

    const readCell = useCallback((sheetIndex: number, row: number, column: number): CellValue =>
        withSheet(sheetIndex, (sheet) => {
            const rows = (sheet.getData?.() ?? []) as CellValue[][]
            return readCellFrom(rows, row, column)
        }, null), [withSheet])

    const undo = useCallback(() => {
        engineRef.current?.undo?.()
        scheduleSave()
        onSelectionChangeRef.current?.()
    }, [scheduleSave])

    const redo = useCallback(() => {
        engineRef.current?.redo?.()
        scheduleSave()
        onSelectionChangeRef.current?.()
    }, [scheduleSave])

    /** Replace everything (Excel import, external data). Keeps the container. */
    const replaceAll = useCallback((next: WorkbookData) => {
        const engine = engineRef.current
        const normalized = ensureValidWorkbookData(next)
        dataRef.current = normalized
        appliedRef.current = normalized
        appliedKeyRef.current = workbookContentKey(normalized)
        numberMetaRef.current = normalized.sheets.map(sheetNumberMeta)
        styledCellsRef.current = seedTrackedSets(normalized.sheets)
        mergedRangesRef.current = seedMergeRanges(normalized.sheets)
        lastSelectionRef.current = null
        if (!engine) return
        const rebuilt = remountSheets(engine, container, engineModuleRef.current, normalized, readOnly, darkMode)
        if (!rebuilt) return
        engineRef.current = rebuilt
        sheetKeysRef.current = normalized.sheets.map((_, index) => String(index))
        applyPersistedPresentation(rebuilt, normalized, styledCellsRef.current)
        applyFormulas(rebuilt, normalized)
        lockGeneratedSheets(rebuilt, normalized)
        applyReadOnly(rebuilt, readOnly, normalized)
        wireEvents(rebuilt, {
            scheduleSave,
            onSelectionChange: onSelectionChangeRef,
            lastSelectionRef,
            onStructureChange: () => structureChangeRef.current(),
        })
        // A whole-workbook swap is not an edit, so the engine fires no change
        // event: persist the mounted payload explicitly.
        push()
        applyContextMenuTheme(rebuilt, normalized, resolveThemeTokens(container, darkMode))
        rebuilt.resize?.()
    }, [container, darkMode, push, readOnly])

    /**
     * Read the engine tab bar sheet list back into the persisted workbook.
     *
     * Called after the engine adds, removes or renames a sheet. It maps each
     * engine sheet to the previously persisted data by key, reads the live
     * values, then rebuilds through replaceAll. The rebuild also returns the
     * engine keys to the index form the rest of the adapter assumes.
     */
    const reconcileFromEngine = useCallback(() => {
        if (reconcilingRef.current) return
        const engine = engineRef.current
        const base = dataRef.current
        if (!engine || !base) return
        reconcilingRef.current = true
        try {
            const all = engine.getAllSheets?.() ?? []
            if (all.length === 0) return
            const previousByKey = new Map<string, number>()
            sheetKeysRef.current.forEach((key, index) => previousByKey.set(key, index))
            const restoreKey = engine.getActiveSheet?.()?.getKey?.()
            const nextSheets: SheetData[] = []
            const nextNumberMeta: NumberMeta[] = []
            const nextStyled: Array<Set<string>> = []
            const nextMerged: MergeRange[][] = []
            all.forEach((define, index) => {
                const key = define.sheetKey
                const prevIndex = previousByKey.get(key)
                const previous = prevIndex === undefined ? undefined : base.sheets[prevIndex]
                if (restoreKey !== undefined && restoreKey !== key) engine.activateSheet?.(key)
                const instance = engine.getWorkSheetByKey?.(key) ?? null
                const rows = clampMatrix((instance?.getData?.() ?? previous?.rows ?? []) as CellValue[][])
                if (previous) restoreFormulas(rows, previous.rows)
                const columnCount = Math.max(
                    rows.reduce((max, row) => Math.max(max, row.length), 0),
                    previous?.columnCount ?? 0,
                    1,
                )
                const sheet: SheetData = previous
                    ? {
                          ...previous,
                          name: define.sheetTitle || previous.name,
                          rows,
                          rowCount: Math.max(rows.length, 1),
                          columnCount,
                      }
                    : {
                          name: define.sheetTitle || 'Sheet ' + (index + 1),
                          rows,
                          rowCount: Math.max(rows.length, 1),
                          columnCount,
                      }
                nextSheets.push(sheet)
                nextNumberMeta.push(
                    prevIndex === undefined
                        ? sheetNumberMeta(sheet)
                        : numberMetaRef.current[prevIndex] ?? sheetNumberMeta(sheet),
                )
                nextStyled.push(
                    prevIndex === undefined
                        ? new Set(Object.keys(sheet.styles ?? {}))
                        : styledCellsRef.current[prevIndex] ?? new Set(),
                )
                nextMerged.push(
                    prevIndex === undefined
                        ? sheet.merges ?? []
                        : mergedRangesRef.current[prevIndex] ?? sheet.merges ?? [],
                )
            })
            if (restoreKey !== undefined) engine.activateSheet?.(restoreKey)
            const activeKey = restoreKey ?? engine.getActiveSheet?.()?.getKey?.()
            const activeIndex = all.findIndex((define) => define.sheetKey === activeKey)
            replaceAll({
                ...base,
                sheets: nextSheets,
                activeSheet: activeIndex < 0 ? 0 : activeIndex,
            })
        } catch (error) {
            logger.warn('[office/spreadsheet] failed to reconcile sheets', error)
        } finally {
            reconcilingRef.current = false
        }
    }, [replaceAll])

    /** Let the engine finish its own sheet operation before reading it back. */
    const scheduleStructureReconcile = useCallback(() => {
        if (structureTimerRef.current) clearTimeout(structureTimerRef.current)
        structureTimerRef.current = setTimeout(() => {
            structureTimerRef.current = null
            reconcileFromEngine()
        }, 0)
    }, [reconcileFromEngine])

    structureChangeRef.current = scheduleStructureReconcile

    const applyExternalData = useCallback((incoming: WorkbookData) => {
        const normalized = ensureValidWorkbookData(incoming)
        const decision = decideExternalData(
            normalized,
            workbookContentKey(normalized),
            appliedRef.current,
            appliedKeyRef.current,
        )
        if (decision !== 'apply') return
        replaceAll(normalized)
    }, [replaceAll])

    const api: GridApi & { __probe?: { tables: () => unknown } } = {
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
    Object.defineProperty(api, '__probe', {
        value: { tables: () => inspectEditingGates(engineRef.current, dataRef.current?.sheets.length ?? 0) },
        enumerable: false,
    })
    return api
}

/**
 * The editing state of each sheet, for verification.
 *
 * Read-only mode and the generated-sheet lock have no engine support — they work
 * by overriding the table's editor predicates, so the only way to confirm they
 * took effect is to ask the tables.
 */
export function inspectEditingGates(engine: unknown, sheetCount: number): Array<{
    key: string
    locked: boolean
    editor: boolean
    hasEditorDefine: boolean
}> {
    const e = engine as EngineSpreadsheet | null
    const out: Array<{ key: string; locked: boolean; editor: boolean; hasEditorDefine: boolean }> = []
    if (!e) return out
    for (let index = 0; index < sheetCount; index += 1) {
        const key = String(index)
        const table = (e.getWorkSheetByKey?.(key)?.tableInstance as EngineTable | null) ?? null
        if (!table) continue
        let editor = false
        let hasEditorDefine = false
        try {
            editor = Boolean(table.getEditor?.(0, 0))
        } catch {
            editor = false
        }
        try {
            hasEditorDefine = Boolean(table.isHasEditorDefine?.(0, 0))
        } catch {
            hasEditorDefine = false
        }
        out.push({
            key,
            locked: (table as { __knEditingLocked?: boolean }).__knEditingLocked === true,
            editor,
            hasEditorDefine,
        })
    }
    return out
}

/** The theme the adapter would resolve for a container, for diagnostics. */


// ─── Engine helpers (module scope: no React state to close over) ─────────

function buildEngineOptions(
    workbook: WorkbookData,
    readOnly: boolean,
    container: HTMLElement | null,
    darkOverride?: boolean,
): Record<string, unknown> {
    return {
        sheets: workbookToSheetDefines(workbook),
        // The host owns the toolbar, formula bar and history buttons.
        showFormulaBar: false,
        showSheetTab: true,
        mainMenu: { show: false },
        undoRedo: { show: false },
        defaultRowHeight: 23,
        defaultColWidth: 96,
        // The engine has no read-only option; `applyReadOnly` locks the tables
        // instead.
        readonly: readOnly,
        // The canvas paints its own colours, so the block's CSS palette has to be
        // handed over explicitly — see vtable-theme.ts.
        theme: resolveSheetTheme(container, darkOverride),
    }
}

/**
 * The VTableSheet theme for the container's current mode.
 *
 * Reads the computed `--kn-sheet-*` tokens, which `sheet.css` defines separately
 * for light and dark, so the canvas — and the Excel-style row/column headers the
 * engine renders through `TableSeriesNumber` — match the block instead of using
 * the engine's bundled palette.
 */
function resolveSheetTheme(
    container: HTMLElement | null,
    darkOverride?: boolean,
): SheetTheme {
    return buildSheetTheme(resolveThemeTokens(container, darkOverride))
}

/** The block's resolved palette for the container's current mode. */
function resolveThemeTokens(
    container: HTMLElement | null,
    darkOverride?: boolean,
): ThemeTokens {
    const dark = darkOverride ?? prefersDarkMode(container)
    if (!container || typeof getComputedStyle !== 'function') {
        return fallbackTokens(dark)
    }
    const computed = getComputedStyle(container)
    const tokens = readThemeTokens(
        (name) => computed.getPropertyValue(name) || undefined,
        dark,
    )
    // The host applies `.dark` in its own effect, which can land after ours when
    // the mode is switched at runtime. Reading the tokens then returns the mode
    // we just left, so a light grid would stay light in a dark app (or the
    // reverse). Trust the explicit mode whenever the DOM tokens contradict it.
    if (isDarkColor(tokens.cellBg) !== dark) {
        return fallbackTokens(dark)
    }
    return tokens
}

/**
 * Re-theme the engine's right-click menu.
 *
 * `ContextMenuPlugin`/`MenuManager` apply their palette as **inline** styles from
 * a bundled light map and draw their icons as emoji, so neither a stylesheet nor
 * the VTable theme reaches them. This walks the live plugins, rewrites the menu
 * style map and gives every item an SVG `customIcon`.
 */
function applyContextMenuTheme(
    engine: EngineSpreadsheet | null,
    workbook: WorkbookData | null,
    tokens: ThemeTokens,
): void {
    if (!engine || !workbook) return
    workbook.sheets.forEach((_, index) => {
        const table = engine.getWorkSheetByKey?.(String(index))?.tableInstance as
            | (EngineTable & { pluginManager?: { plugins?: unknown } })
            | null
        const plugins = table?.pluginManager?.plugins
        if (!plugins || typeof (plugins as { forEach?: unknown }).forEach !== 'function') return
        ;(plugins as { forEach: (visit: (plugin: unknown) => void) => void }).forEach((plugin) => {
            const contextMenu = plugin as {
                menuManager?: { styles?: ContextMenuStyles }
                pluginOptions?: Record<string, unknown>
            }
            if (!contextMenu?.menuManager?.styles) return
            themeContextMenuStyles(contextMenu.menuManager.styles, tokens)
            applyContextMenuIcons(contextMenu.pluginOptions)
            translateContextMenuOnOpen(
                contextMenu as { showContextMenu?: (...args: unknown[]) => void; pluginOptions?: Record<string, unknown> },
            )
        })
    })
}

/** Menu lists the engine's `ContextMenuPlugin` exposes. */
const CONTEXT_MENU_ITEM_LISTS = [
    'bodyCellMenuItems',
    'headerCellMenuItems',
    'columnSeriesNumberMenuItems',
    'rowSeriesNumberMenuItems',
    'cornerSeriesNumberMenuItems',
] as const

function applyContextMenuIcons(pluginOptions: Record<string, unknown> | undefined): void {
    if (!pluginOptions) return
    for (const key of CONTEXT_MENU_ITEM_LISTS) {
        const items = pluginOptions[key]
        if (Array.isArray(items)) applyMenuIcons(items)
    }
}

/** The engine's `iconName`, its `menuKey`, or a family fallback, as an SVG. */
function contextMenuIconFor(entry: { iconName?: string; menuKey?: string }): string | undefined {
    if (entry.iconName && CONTEXT_MENU_ICONS[entry.iconName]) {
        return CONTEXT_MENU_ICONS[entry.iconName]
    }
    const menuKey = entry.menuKey ?? ''
    if (CONTEXT_MENU_ICONS[menuKey]) return CONTEXT_MENU_ICONS[menuKey]
    // Submenu items carry only a key; group them onto one icon.
    if (menuKey.startsWith('delete_')) return CONTEXT_MENU_ICONS.delete
    if (menuKey === 'unfreeze' || menuKey.startsWith('freeze_')) return CONTEXT_MENU_ICONS.freeze
    if (menuKey === 'set_filter' || menuKey === 'cancel_filter') return CONTEXT_MENU_ICONS.filter
    if (menuKey.indexOf('first_row_as_header') >= 0) return CONTEXT_MENU_ICONS.row
    return undefined
}

/**
 * Translate the menu labels to the app language when the menu opens.
 *
 * The bundled items ship hardcoded Chinese. `translate` resolves the current
 * i18next language, so wrapping `showContextMenu` also covers a live language
 * switch without reloading the page. The wrapper is installed once per plugin.
 */
function translateContextMenuOnOpen(plugin: {
    showContextMenu?: (...args: unknown[]) => void
    pluginOptions?: Record<string, unknown>
}): void {
    const original = plugin.showContextMenu
    if (!original) return
    const marker = plugin as { __knTranslatesMenu?: boolean }
    if (marker.__knTranslatesMenu) return
    marker.__knTranslatesMenu = true
    plugin.showContextMenu = function (this: unknown, ...args: unknown[]): void {
        const items = args[0]
        if (Array.isArray(items)) translateContextMenuItems(items)
        return original.apply(this, args)
    }
}

/** Apply the current language to every menu item, recursing into submenus. */
function translateContextMenuItems(items: unknown[]): void {
    for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const entry = item as {
            menuKey?: string
            iconName?: string
            text?: string
            children?: unknown[]
        }
        const key = contextMenuTranslationKey(entry.menuKey, entry.iconName)
        if (key) {
            const translated = translate(key)
            // `translate` echoes the key when it has no entry; keep the engine text then.
            if (translated !== key) entry.text = translated
        }
        if (Array.isArray(entry.children)) translateContextMenuItems(entry.children)
    }
}

function contextMenuTranslationKey(menuKey?: string, iconName?: string): string | undefined {
    const key = menuKey || iconName
    return key ? `spreadsheet.contextMenu.${key}` : undefined
}

/** Replace any emoji icon with the matching SVG, recursively through submenus. */
function applyMenuIcons(items: unknown[]): void {
    for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const entry = item as {
            iconName?: string
            menuKey?: string
            customIcon?: unknown
            children?: unknown[]
        }
        if (!entry.customIcon) {
            const svg = contextMenuIconFor(entry)
            if (svg) entry.customIcon = { svg, width: 16, height: 16 }
        }
        if (Array.isArray(entry.children)) applyMenuIcons(entry.children)
    }
}

/** Apply styles and number formats, which have no place in the sheet definition. */
function applyPersistedPresentation(
    engine: EngineSpreadsheet,
    workbook: WorkbookData,
    styledCells: Array<Set<string>>,
): void {
    workbook.sheets.forEach((sheet, index) => {
        const key = String(index)
        const instance = engine.getWorkSheetByKey?.(key)
        const table = (instance?.tableInstance as EngineTable | null) ?? null
        if (!instance || !table) return
        applySheetStyles(table, sheet.styles, trackedSetFor(styledCells, index))
        applySheetNumberFormats(instance, sheet)
    })
}

/** Register + arrange one custom style per styled cell. */
function applySheetStyles(
    table: EngineTable,
    styles: Record<string, string> | undefined,
    styledCells: Set<string>,
): void {
    if (!styles) return
    for (const [ref, cssText] of Object.entries(styles)) {
        const style = toVTableStyle(typeof cssText === 'string' ? cssText : '')
        if (!style) continue
        const position = parseCellRef(ref)
        if (!position) continue
        const id = styleIdForRef(ref)
        table.registerCustomCellStyle?.(id, style)
        table.arrangeCustomCellStyle?.({ col: position.column, row: position.row }, id)
        styledCells.add(ref)
    }
}

/**
 * Evaluate every formula and show the result, keeping the formula text stored.
 *
 * The engine cannot do this: its recalculation entry point is an empty function
 * and its data copy never sees edits, so a formula cell rendered its own text and
 * never updated. `formula.ts` computes against the sheet values we already hold,
 * and only the *displayed* value is replaced — `dataRef` keeps `=SUM(...)` so the
 * document round-trips and collaborators receive the formula, not a snapshot.
 */
function applyFormulas(engine: EngineSpreadsheet | null, workbook: WorkbookData): void {
    if (!engine) return
    const sheets: RecalcSheet[] = workbook.sheets.map((sheet) => ({
        name: sheet.name,
        rows: sheet.rows as unknown[][],
        rowCount: Math.max(sheet.rowCount, sheet.rows.length),
        columnCount: sheet.columnCount,
    }))
    const { computed, errors } = recalculate(sheets)
    if (computed.size === 0 && errors.size === 0) return

    const bySheet = new Map<number, Array<{ row: number; column: number; text: string }>>()
    const push = (sheetName: string, row: number, column: number, text: string): void => {
        const index = workbook.sheets.findIndex((sheet) => sheet.name === sheetName)
        if (index < 0) return
        const list = bySheet.get(index) ?? []
        list.push({ row, column, text })
        bySheet.set(index, list)
    }
    for (const [key, value] of computed) {
        const [sheetName, position] = key.split('!')
        const [row, column] = position!.split(':').map(Number)
        push(sheetName!, row!, column!, formatResult(value))
    }
    for (const [key, code] of errors) {
        const [sheetName, position] = key.split('!')
        const [row, column] = position!.split(':').map(Number)
        push(sheetName!, row!, column!, code)
    }

    for (const [index, cells] of bySheet) {
        const sheet = engine.getWorkSheetByKey?.(String(index))
        const table = (sheet?.tableInstance as EngineTable | null) ?? null
        if (!table) continue
        for (const cell of cells) {
            try {
                table.changeCellValues?.(cell.column, cell.row, [[cell.text]], false, false)
            } catch {
                // A cell outside the grid: the row list grows on write, so skip.
            }
        }
    }
}

/** Render stored number formats into the display values the engine will show. */
function applySheetNumberFormats(instance: EngineSheet, sheet: SheetData): void {
    const formats = sheet.numberFormats
    if (!formats || Object.keys(formats).length === 0) return
    const rows = (instance.getData?.() ?? []) as CellValue[][]
    for (const [ref, kind] of Object.entries(formats)) {
        const position = parseCellRef(ref)
        if (!position) continue
        const current = rows[position.row]?.[position.column] as CellValue
        const display = formatCellDisplay(current, kind)
        if (display === current) continue
        instance.setCellValue?.(position.column, position.row, display)
    }
}

/**
 * Lock generated (pivot) sheets.
 *
 * VTable has no per-sheet read-only, so this is the only way to stop a user
 * editing cells that `refreshPivots` will overwrite. Host writes are unaffected.
 */
function lockGeneratedSheets(engine: EngineSpreadsheet, workbook: WorkbookData | null): void {
    if (!workbook) return
    workbook.sheets.forEach((sheet, index) => {
        if (!sheet.pivot) return
        const table = (engine.getWorkSheetByKey?.(String(index))?.tableInstance as EngineTable | null) ?? null
        if (table) lockTableForEditing(table)
    })
}

function wireEvents(
    engine: EngineSpreadsheet,
    deps: {
        scheduleSave: () => void
        onSelectionChange: React.MutableRefObject<(() => void) | undefined>
        lastSelectionRef: React.MutableRefObject<GridSelection | null>
        onStructureChange: () => void
    },
): void {
    const { scheduleSave, onSelectionChange, lastSelectionRef, onStructureChange } = deps
    for (const type of [CHANGE_CELL_VALUE, PASTED_DATA, MERGE_CELLS, UNMERGE_CELLS]) {
        engine.onTableEvent?.(type, () => scheduleSave())
    }
    engine.onTableEvent?.(SELECTED_CHANGED, (event: unknown) => {
        const range = (event as { range?: unknown })?.range
        const selection = fromVTableRange(range as never)
        if (selection) lastSelectionRef.current = selection
        onSelectionChange.current?.()
    })
    // Switching the active tab changes which sheet persists as active. The engine
    // emits this one, but not add/remove/rename/move, so those are wrapped below.
    engine.on?.('sheet_activated', () => scheduleSave())
    wrapSheetStructure(engine, onStructureChange)
    localizeSheetTabs(engine)
}

/**
 * Mirror the engine tab bar structural actions back into the document.
 *
 * VTableSheet 1.26.8 emits sheet_activated but not sheet_added / removed /
 * renamed / moved, so the adapter wraps the methods the tab bar calls and lets
 * the reconciler read the new sheet list back out. undo/redo are wrapped only to
 * notice a sheet-count change, so an ordinary cell-edit undo does not rebuild.
 */
function wrapSheetStructure(engine: EngineSpreadsheet, onStructureChange: () => void): void {
    const target = engine as EngineSpreadsheet & {
        _addNewSheet?: () => void
        removeSheet?: (key: string) => void
        renameSheet?: (key: string, title: string) => void
        __knStructureWired?: boolean
    }
    if (target.__knStructureWired) return
    target.__knStructureWired = true
    for (const name of ['_addNewSheet', 'removeSheet', 'renameSheet'] as const) {
        const original = target[name]
        if (typeof original !== 'function') continue
        target[name] = function (this: unknown, ...args: unknown[]): unknown {
            const result = (original as (...params: unknown[]) => unknown).apply(this, args)
            onStructureChange()
            return result
        } as never
    }
    for (const name of ['undo', 'redo'] as const) {
        const original = target[name]
        if (typeof original !== 'function') continue
        target[name] = function (this: unknown, ...args: unknown[]): unknown {
            const before = engine.getSheetCount?.() ?? -1
            const result = (original as (...params: unknown[]) => unknown).apply(this, args)
            if ((engine.getSheetCount?.() ?? -1) !== before) onStructureChange()
            return result
        } as never
    }
}

/** The engine hardcodes Chinese tooltips on its tab bar; retitle them. */
function localizeSheetTabs(engine: EngineSpreadsheet): void {
    const root = engine.getSheetTabElement?.()
    if (!root) return
    const setTitle = (selector: string, key: string) => {
        const element = root.querySelector(selector)
        if (element) element.setAttribute('title', translate(key))
    }
    setTitle('.vtable-sheet-add-button', 'spreadsheet.sheet.add')
    setTitle('.vtable-sheet-menu-button', 'spreadsheet.sheet.menu')
    const scrollButtons = root.querySelectorAll('.vtable-sheet-scroll-button')
    scrollButtons[0]?.setAttribute('title', translate('spreadsheet.sheet.scrollLeft'))
    scrollButtons[1]?.setAttribute('title', translate('spreadsheet.sheet.scrollRight'))
}

/**
 * Apply the block's read-only mode to every sheet.
 *
 * The lock is reversible on purpose: the read-only flag is toggled by the
 * editor, so a one-way lock would leave the sheet uneditable for the rest of its
 * life. Generated sheets are re-locked afterwards, since lifting the block-level
 * lock must not open a pivot's cells to editing.
 */
function applyReadOnly(
    engine: EngineSpreadsheet,
    readOnly: boolean,
    workbook: WorkbookData | null,
): void {
    // Iterates the workbook rather than `engine.getAllSheets()`, which was observed
    // returning an empty list against a live engine (two sheets rendered, the
    // accessor still reported none). Relying on it made read-only mode and the
    // generated-sheet lock no-ops.
    const sheetCount = Math.max(workbook?.sheets.length ?? 0, engine.getSheetCount?.() ?? 0)
    for (let index = 0; index < sheetCount; index += 1) {
        const table = (engine.getWorkSheetByKey?.(String(index))?.tableInstance as EngineTable | null) ?? null
        if (!table) continue
        if (readOnly) lockTableForEditing(table)
        else unlockTableForEditing(table)
    }
    lockGeneratedSheets(engine, workbook)
}

/**
 * Rebuild the whole workbook, replacing the engine instance.
 *
 * The engine's `updateOption` cannot be used for this: it swaps the options
 * without creating the per-sheet `WorkSheet` instances, so after a payload swap
 * every sheet except the first reads back empty. Releasing and re-mounting is the
 * only supported way to change the sheet set — and it is also what regenerates
 * the formula/history state that a new payload implies.
 *
 * @returns the new engine, or null when the rebuild failed (the caller keeps the
 *          old one so the block does not go blank).
 */
function remountSheets(
    engine: EngineSpreadsheet | null,
    container: HTMLElement | null,
    module: EngineModule | null,
    workbook: WorkbookData,
    readOnly: boolean,
    darkMode: boolean,
): EngineSpreadsheet | null {
    if (!container || !module) {
        logger.warn('[office/spreadsheet] no container or engine module; payload swap skipped')
        return engine
    }
    try {
        return mountEngine(
            module,
            container,
            buildEngineOptions(workbook, readOnly, container, darkMode ? true : undefined),
        )
    } catch (error) {
        logger.warn('[office/spreadsheet] failed to replace spreadsheet data', error)
        return null
    }
}

function safeRelease(engine: EngineSpreadsheet | null): void {
    try {
        engine?.release?.()
    } catch {
        // Best effort: the DOM is going away anyway.
    }
}

/** True when any live sheet holds a value. */
function engineHasContent(engine: EngineSpreadsheet | null): boolean {
    if (!engine) return false
    try {
        // Scan every sheet, not just the active one: a newly added (empty) sheet
        // becomes active, and an active-only check made the whole grid look empty
        // and skipped persisting the structural change.
        for (const define of engine.getAllSheets?.() ?? []) {
            const sheet = engine.getWorkSheetByKey?.(define.sheetKey)
            const rows = (sheet?.getData?.() ?? []) as CellValue[][]
            if (rows.some((row) => row?.some((value) => value !== null && value !== undefined && value !== ''))) {
                return true
            }
        }
        return false
    } catch {
        return true
    }
}

/** Grow a sheet so a write reaching `requiredRows`/`requiredColumns` fits. */
function growTo(
    sheet: EngineSheet,
    table: EngineTable | null,
    requiredRows: number,
    requiredColumns: number,
): void {
    try {
        const rows = (sheet.getData?.() ?? []) as CellValue[][]
        const currentRows = rows.length
        if (requiredRows <= currentRows) return
        const currentColumns = rows.reduce((max, row) => Math.max(max, row?.length ?? 0), 0)
        const width = Math.max(currentColumns, requiredColumns)
        table?.addRecords?.(
            Array.from({ length: requiredRows - currentRows }, () => Array.from({ length: width }, () => '')),
        )
    } catch {
        // Best effort: the write loop tolerates a short grid.
    }
}

/**
 * Write one row of a matrix, skipping `null` cells.
 *
 * `null` means "leave this cell alone" — the fill handle and the AI tools rely on
 * it — but the engine writes whatever it is handed, so a passed-through null would
 * **clear** the cell. The written cells of a row are usually contiguous (the fill
 * handle and a paste both produce a solid span), so this writes the whole span in
 * one engine call and only falls back to per-cell writes when there are holes.
 * A hole keeps its current value, which is what makes the write a patch.
 */
function writeRow(
    table: EngineTable | null,
    sheet: EngineSheet,
    startColumn: number,
    row: number,
    values: CellValue[],
): void {
    const targets: Array<{ column: number; value: CellValue }> = []
    values.forEach((value, offset) => {
        if (value === null || value === undefined) return
        targets.push({ column: startColumn + offset, value })
    })
    if (targets.length === 0) return

    const from = targets[0]!.column
    const to = targets[targets.length - 1]!.column
    const contiguous = to - from + 1 === targets.length

    if (!table?.changeCellValues) {
        targets.forEach(({ column, value }) => sheet.setCellValue?.(column, row, value))
        return
    }

    if (contiguous) {
        table.changeCellValues(from, row, [targets.map((entry) => entry.value)], false, true)
        return
    }

    // Holes present: keep each skipped cell's current value so the span write
    // leaves it untouched.
    const span: CellValue[] = []
    for (let column = from; column <= to; column += 1) {
        const hit = targets.find((entry) => entry.column === column)
        span.push(hit ? hit.value : readCurrentCell(table, sheet, column, row))
    }
    table.changeCellValues(from, row, [span], false, true)
}

/** The cell's current value, from the engine or the sheet data. */
function readCurrentCell(
    table: EngineTable | null,
    sheet: EngineSheet,
    column: number,
    row: number,
): CellValue {
    const viaTable = table?.getCellValue?.(column, row)
    if (viaTable !== undefined) return viaTable ?? ''
    return (sheet.getData?.() ?? [])[row]?.[column] ?? ''
}

function writeCell(
    table: EngineTable | null,
    sheet: EngineSheet,
    column: number,
    row: number,
    value: CellValue,
): void {
    if (table?.changeCellValues) {
        table.changeCellValues(column, row, [[value]], false, true)
        return
    }
    sheet.setCellValue?.(column, row, value)
}

/** The cell's current declarations, as CSS text. */
function currentStyleText(table: EngineTable, column: number, row: number): string {
    try {
        return fromVTableStyle(table.getCellStyle?.(column, row))
    } catch {
        return ''
    }
}

/** Inclusive merge bounds, ordered as our model stores them. */
type MergeRange = [startColumn: number, startRow: number, endColumn: number, endRow: number]

/** Every merge the table holds, as our tuples, when it exposes them. */
function captureMergesFromTable(table: EngineTable | null): SheetData['merges'] {
    if (!table) return undefined
    const raw = table.customMergeCell ?? table.options?.customMergeCell
    if (!Array.isArray(raw) || raw.length === 0) return undefined
    const out: MergeRange[] = []
    for (const entry of raw) {
        const range = (entry as {
            range?: { start?: { col?: number; row?: number }; end?: { col?: number; row?: number } }
        })?.range
        const startColumn = range?.start?.col
        const startRow = range?.start?.row
        const endColumn = range?.end?.col
        const endRow = range?.end?.row
        if (typeof startColumn !== 'number' || typeof startRow !== 'number') continue
        if (typeof endColumn !== 'number' || typeof endRow !== 'number') continue
        out.push([startColumn, startRow, endColumn, endRow])
    }
    return out.length > 0 ? out : undefined
}

/**
 * The tracked merge containing the selection, or null.
 *
 * Detecting a *containing* merge rather than an exact match is what lets a second
 * toggle unmerge when the user re-selects only part of the merged block.
 */
function findTrackedMerge(tracked: MergeRange[], bounds: GridSelection): MergeRange | null {
    for (const range of tracked) {
        const [startColumn, startRow, endColumn, endRow] = range
        if (
            startColumn <= bounds.startColumn && endColumn >= bounds.endColumn
            && startRow <= bounds.startRow && endRow >= bounds.endRow
        ) {
            return range
        }
    }
    return null
}

/**
 * Reflect a sheet's tracked merges into the working payload.
 *
 * The engine's merge storage was not a reliable read-back source (`saveToConfig`
 * kept reporting an unmerged range), so the payload is updated from the tracked
 * list instead — which makes the next snapshot authoritative rather than stale.
 */
function writeMergesInto(
    workbook: WorkbookData | null,
    sheetIndex: number,
    merges: MergeRange[],
): void {
    const sheet = workbook?.sheets[sheetIndex]
    if (!sheet) return
    if (merges.length > 0) sheet.merges = [...merges]
    else delete sheet.merges
}

/** Merges already present in a payload, per sheet. */
function seedMergeRanges(sheets: ReadonlyArray<{ merges?: SheetData['merges'] }>): MergeRange[][] {
    return sheets.map((sheet) => (sheet.merges ? [...sheet.merges] : []))
}

/** The tracked merge list for a sheet, created on demand so indices stay aligned. */
function mergedRangesFor(lists: MergeRange[][], sheetIndex: number): MergeRange[] {
    const index = Math.max(0, sheetIndex)
    while (lists.length <= index) lists.push([])
    return lists[index]!
}

/**
 * Styled cells captured from the live grid.
 *
 * Only cells this adapter arranged a style on are read: the engine resolves a
 * default style for every cell, so sweeping by extent would report the whole
 * sheet as styled and spend the payload cap on defaults.
 */
function captureStyles(
    sheet: EngineSheet | null,
    styledCells: Set<string> | undefined,
): Record<string, string> | undefined {
    const table = (sheet?.tableInstance as EngineTable | null) ?? null
    if (!table?.getCellStyle || !styledCells || styledCells.size === 0) return undefined
    const { styles, truncated } = captureTrackedStyles(styledCells, (ref) => {
        const position = parseCellRef(ref)
        if (!position) return undefined
        return currentStyleText(table, position.column, position.row) || undefined
    })
    if (truncated) {
        logger.warn(
            `[office/spreadsheet] reached the ${MAX_STYLED_CELLS}-cell style limit; extra formatting was not saved`,
        )
    }
    return styles
}

/** Column widths come from the engine's saved config. */
function widthsFromConfig(define: VTableSheetDefine | undefined): Record<string, number> | undefined {
    if (!define?.columnWidthConfig?.length) return undefined
    const out: Record<string, number> = {}
    for (const entry of define.columnWidthConfig) out[String(entry.key)] = entry.width
    return Object.keys(out).length > 0 ? out : undefined
}

/** Row heights come from the engine's saved config. */
function heightsFromConfig(define: VTableSheetDefine | undefined): Record<string, number> | undefined {
    if (!define?.rowHeightConfig?.length) return undefined
    const out: Record<string, number> = {}
    for (const entry of define.rowHeightConfig) out[String(entry.key)] = entry.height
    return Object.keys(out).length > 0 ? out : undefined
}

/** Parse `"a: b; c: d"` into a plain object. */
function parseDeclarationsSafe(cssText: string): Record<string, string> {
    const out: Record<string, string> = {}
    if (!cssText) return out
    cssText.split(';').forEach((part) => {
        const index = part.indexOf(':')
        if (index <= 0) return
        const key = part.slice(0, index).trim()
        const value = part.slice(index + 1).trim()
        if (key && value) out[key] = value
    })
    return out
}
