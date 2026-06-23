import { useEffect, useRef, useCallback, type RefObject } from "react"
import { createUniver, defaultTheme, LocaleType } from "@univerjs/presets"
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core"
import sheetsLocaleEnUS from "@univerjs/preset-sheets-core/locales/en-US"
import sheetsLocaleZhCN from "@univerjs/preset-sheets-core/locales/zh-CN"
import "@univerjs/preset-sheets-core/lib/index.css"
import { SAVE_THROTTLE_MS, LARGE_DATA_CONFIG } from "./constants"
import { CustomMenuPlugin, type ICustomMenuPluginConfig } from "./univer-custom-menu-plugin"

/** Build a minimal-but-valid empty workbook so the grid never renders blank. */
function createEmptyWorkbookData(): Record<string, any> {
    const sheetId = 'sheet-0'
    return {
        id: `workbook-${Date.now()}`,
        sheetOrder: [sheetId],
        sheets: {
            [sheetId]: {
                id: sheetId,
                name: 'Sheet1',
                rowCount: 100,
                columnCount: 26,
                cellData: {},
                defaultColumnWidth: 88,
                defaultRowHeight: 24,
            },
        },
        appVersion: '1.0.0',
    }
}

/** Ensure workbook data has at least one sheet; otherwise fall back to a default. */
function ensureValidWorkbookData(data: Record<string, any> | null | undefined): Record<string, any> {
    if (data && data.sheets && Object.keys(data.sheets).length > 0) return data
    return createEmptyWorkbookData()
}

// 计算工作簿数据中的单元格数量
function countCells(data: Record<string, any> | null): number {
    if (!data || !data.sheets) return 0
    let count = 0
    for (const sheet of Object.values(data.sheets) as any[]) {
        if (sheet?.cellData) {
            for (const row of Object.values(sheet.cellData) as any[]) {
                if (row) {
                    count += Object.keys(row).length
                }
            }
        }
    }
    return count
}

interface UseUniverOptions {
    containerRef: RefObject<HTMLDivElement | null>
    workbookData: Record<string, any> | null
    readOnly: boolean
    darkMode: boolean
    onSave: (data: Record<string, any>) => void
    onImportExcel?: () => void
    onExportExcel?: () => void
    onToggleFullscreen?: () => void
}

interface UseUniverReturn {
    importWorkbookData: (data: Record<string, any>) => void
    /** Apply externally-changed workbook data (e.g. AI tool edits) into the live Univer instance. */
    applyWorkbookData: (data: Record<string, any>) => void
    /** Read the current live snapshot from the active workbook (post-edit). */
    getCurrentSnapshot: () => Record<string, any> | null
}

export function useUniver({ containerRef, workbookData, readOnly, darkMode, onSave, onImportExcel, onExportExcel, onToggleFullscreen }: UseUniverOptions): UseUniverReturn {
    const univerRef = useRef<any>(null)
    const univerAPIRef = useRef<any>(null)
    const disposeRef = useRef<(() => void) | null>(null)
    const initializedRef = useRef(false)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Tracks the last snapshot this hook itself produced (saved out or applied in),
    // so the view can tell whether an incoming attr change is our own echo or a
    // genuine external edit (e.g. from an AI tool) that must be applied.
    const lastSyncedDataRef = useRef<Record<string, any> | null>(workbookData)
    const onSaveRef = useRef(onSave)
    onSaveRef.current = onSave
    const onImportExcelRef = useRef(onImportExcel)
    onImportExcelRef.current = onImportExcel
    const onExportExcelRef = useRef(onExportExcel)
    onExportExcelRef.current = onExportExcel
    const onToggleFullscreenRef = useRef(onToggleFullscreen)
    onToggleFullscreenRef.current = onToggleFullscreen

    // 检测是否为大数据量
    const isLargeData = countCells(workbookData) > LARGE_DATA_CONFIG.virtualScrollThreshold

    // 大数据量时增加节流时间，减少保存频率
    const saveThrottleMs = isLargeData ? SAVE_THROTTLE_MS * 2 : SAVE_THROTTLE_MS

    const throttledSave = useCallback(() => {
        if (saveTimerRef.current) return
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null
            const api = univerAPIRef.current
            if (!api) return
            const workbook = api.getActiveWorkbook()
            if (!workbook) return
            const snapshot = workbook.getSnapshot()
            if (snapshot) {
                lastSyncedDataRef.current = snapshot
                onSaveRef.current(snapshot)
            }
        }, saveThrottleMs)
    }, [saveThrottleMs])

    useEffect(() => {
        const container = containerRef.current
        if (!container || initializedRef.current) return
        initializedRef.current = true

        const isZhCN = navigator.language.startsWith('zh')
        const pluginConfig: ICustomMenuPluginConfig = {
            onImportExcel: () => onImportExcelRef.current?.(),
            onExportExcel: () => onExportExcelRef.current?.(),
            onToggleFullscreen: () => onToggleFullscreenRef.current?.(),
        }

        const { univer, univerAPI } = createUniver({
            theme: defaultTheme,
            darkMode,
            locale: isZhCN ? LocaleType.ZH_CN : LocaleType.EN_US,
            locales: {
                [LocaleType.EN_US]: sheetsLocaleEnUS,
                [LocaleType.ZH_CN]: sheetsLocaleZhCN,
            },
            presets: [
                UniverSheetsCorePreset({
                    container,
                }),
            ],
            plugins: [
                [CustomMenuPlugin, pluginConfig],
            ],
        })

        univerRef.current = univer
        univerAPIRef.current = univerAPI

        // Create workbook with saved data, or a valid empty workbook (a bare {}
        // can render a blank grid with no usable sheet in some Univer builds).
        const initialData = ensureValidWorkbookData(workbookData)
        univerAPI.createWorkbook(initialData)
        lastSyncedDataRef.current = initialData

        // Set read-only if needed
        if (readOnly) {
            const workbook = univerAPI.getActiveWorkbook()
            if (workbook && typeof workbook.setEditable === 'function') {
                workbook.setEditable(false)
            }
        }

        // Listen for changes and throttle save
        if (!readOnly) {
            const workbook = univerAPI.getActiveWorkbook()
            if (workbook && typeof workbook.onCommandExecuted === 'function') {
                const disposable = workbook.onCommandExecuted(() => {
                    throttledSave()
                })
                disposeRef.current = () => {
                    if (typeof disposable === 'function') {
                        (disposable as Function)()
                    } else if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose()
                    }
                }
            }
        }

        return () => {
            // Final save before cleanup
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current)
                saveTimerRef.current = null
            }
            const api = univerAPIRef.current
            if (api) {
                const workbook = api.getActiveWorkbook()
                if (workbook) {
                    const snapshot = workbook.getSnapshot()
                    if (snapshot) {
                        onSaveRef.current(snapshot)
                    }
                }
            }
            // Dispose listener
            if (disposeRef.current) {
                disposeRef.current()
                disposeRef.current = null
            }
            // Dispose Univer
            if (univerRef.current) {
                univerRef.current.dispose()
                univerRef.current = null
                univerAPIRef.current = null
            }
            initializedRef.current = false
        }
    }, [containerRef]) // eslint-disable-line react-hooks/exhaustive-deps

    // Toggle dark mode dynamically — only fires when theme actually changes
    useEffect(() => {
        const api = univerAPIRef.current
        if (api && initializedRef.current) {
            api.toggleDarkMode(darkMode)
        }
    }, [darkMode])

    // Rebuild the active workbook from a full data snapshot. Used both for
    // explicit imports (triggerSave=true → persist back to the node) and for
    // applying external/AI edits (triggerSave=false → just reflect the data).
    const rebuildWorkbook = useCallback((data: Record<string, any>, triggerSave: boolean) => {
        const api = univerAPIRef.current
        if (!api) return

        // Dispose current workbook
        const currentWorkbook = api.getActiveWorkbook()
        if (currentWorkbook && typeof currentWorkbook.dispose === 'function') {
            currentWorkbook.dispose()
        }

        // Create new workbook with the supplied data
        api.createWorkbook(data)
        lastSyncedDataRef.current = data

        // Re-attach change listener for auto-save
        if (!readOnly) {
            if (disposeRef.current) {
                disposeRef.current()
                disposeRef.current = null
            }
            const workbook = api.getActiveWorkbook()
            if (workbook && typeof workbook.onCommandExecuted === 'function') {
                const disposable = workbook.onCommandExecuted(() => {
                    throttledSave()
                })
                disposeRef.current = () => {
                    if (typeof disposable === 'function') {
                        disposable()
                    } else if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose()
                    }
                }
            }
        }

        if (triggerSave) {
            const workbook = api.getActiveWorkbook()
            if (workbook) {
                const snapshot = workbook.getSnapshot()
                if (snapshot) {
                    onSaveRef.current(snapshot)
                }
            }
        }
    }, [readOnly, throttledSave])

    const importWorkbookData = useCallback((data: Record<string, any>) => {
        rebuildWorkbook(data, true)
    }, [rebuildWorkbook])

    const applyWorkbookData = useCallback((data: Record<string, any>) => {
        // Skip if this is just an echo of what we already have live.
        if (data === lastSyncedDataRef.current) return
        rebuildWorkbook(data, false)
    }, [rebuildWorkbook])

    const getCurrentSnapshot = useCallback((): Record<string, any> | null => {
        const api = univerAPIRef.current
        if (!api) return null
        const workbook = api.getActiveWorkbook()
        if (!workbook) return null
        try {
            return workbook.getSnapshot() ?? null
        } catch {
            return null
        }
    }, [])

    return { importWorkbookData, applyWorkbookData, getCurrentSnapshot }
}
