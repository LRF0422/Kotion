import { useEffect, useRef, useCallback } from "react"
import { createUniver, defaultTheme, FUniver, LocaleType } from "@univerjs/presets"
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core"
import sheetsLocaleEnUS from "@univerjs/preset-sheets-core/locales/en-US"
import sheetsLocaleZhCN from "@univerjs/preset-sheets-core/locales/zh-CN"
import "@univerjs/preset-sheets-core/lib/index.css"
import { SAVE_THROTTLE_MS } from "./constants"

interface UseUniverOptions {
    container: HTMLDivElement | null
    workbookData: Record<string, any> | null
    readOnly: boolean
    darkMode: boolean
    onSave: (data: Record<string, any>) => void
}

export function useUniver({ container, workbookData, readOnly, darkMode, onSave }: UseUniverOptions) {
    const univerRef = useRef<any>(null)
    const univerAPIRef = useRef<any>(null)
    const disposeRef = useRef<(() => void) | null>(null)
    const initializedRef = useRef(false)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onSaveRef = useRef(onSave)
    onSaveRef.current = onSave

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
        if (!container || initializedRef.current) return
        initializedRef.current = true

        const isZhCN = navigator.language.startsWith('zh')
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
                        disposable()
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
    }, [container]) // eslint-disable-line react-hooks/exhaustive-deps

    // Toggle dark mode dynamically when theme changes
    useEffect(() => {
        const api = univerAPIRef.current
        if (api && initializedRef.current) {
            api.toggleDarkMode(darkMode)
        }
    }, [darkMode])
}
