import { useEffect, useRef, useCallback, type RefObject } from "react"
import { createUniver, defaultTheme, LocaleType } from "@univerjs/presets"
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core"
import sheetsLocaleEnUS from "@univerjs/preset-sheets-core/locales/en-US"
import sheetsLocaleZhCN from "@univerjs/preset-sheets-core/locales/zh-CN"
import "@univerjs/preset-sheets-core/lib/index.css"
import { SAVE_THROTTLE_MS } from "./constants"
import { CustomMenuPlugin, type ICustomMenuPluginConfig } from "./univer-custom-menu-plugin"

interface UseUniverOptions {
    containerRef: RefObject<HTMLDivElement | null>
    workbookData: Record<string, any> | null
    readOnly: boolean
    darkMode: boolean
    onSave: (data: Record<string, any>) => void
    onImportExcel?: () => void
    onToggleFullscreen?: () => void
}

interface UseUniverReturn {
    importWorkbookData: (data: Record<string, any>) => void
}

export function useUniver({ containerRef, workbookData, readOnly, darkMode, onSave, onImportExcel, onToggleFullscreen }: UseUniverOptions): UseUniverReturn {
    const univerRef = useRef<any>(null)
    const univerAPIRef = useRef<any>(null)
    const disposeRef = useRef<(() => void) | null>(null)
    const initializedRef = useRef(false)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onSaveRef = useRef(onSave)
    onSaveRef.current = onSave
    const onImportExcelRef = useRef(onImportExcel)
    onImportExcelRef.current = onImportExcel
    const onToggleFullscreenRef = useRef(onToggleFullscreen)
    onToggleFullscreenRef.current = onToggleFullscreen

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
                onSaveRef.current(snapshot)
            }
        }, SAVE_THROTTLE_MS)
    }, [])

    useEffect(() => {
        const container = containerRef.current
        if (!container || initializedRef.current) return
        initializedRef.current = true

        const isZhCN = navigator.language.startsWith('zh')
        const pluginConfig: ICustomMenuPluginConfig = {
            onImportExcel: () => onImportExcelRef.current?.(),
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

        // Create workbook with saved data or empty
        univerAPI.createWorkbook(workbookData ?? {})

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

    const importWorkbookData = useCallback((data: Record<string, any>) => {
        const api = univerAPIRef.current
        if (!api) return

        // Dispose current workbook
        const currentWorkbook = api.getActiveWorkbook()
        if (currentWorkbook && typeof currentWorkbook.dispose === 'function') {
            currentWorkbook.dispose()
        }

        // Create new workbook with imported data
        api.createWorkbook(data)

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

        // Trigger immediate save of imported data
        const workbook = api.getActiveWorkbook()
        if (workbook) {
            const snapshot = workbook.getSnapshot()
            if (snapshot) {
                onSaveRef.current(snapshot)
            }
        }
    }, [readOnly, throttledSave])

    return { importWorkbookData }
}
