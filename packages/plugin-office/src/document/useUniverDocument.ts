import { useEffect, useRef, useCallback, type RefObject } from "react"
import { createUniver, defaultTheme, LocaleType, UniverInstanceType } from "@univerjs/presets"
import { UniverDocsCorePreset } from "@univerjs/preset-docs-core"
import docsLocaleEnUS from "@univerjs/preset-docs-core/locales/en-US"
import docsLocaleZhCN from "@univerjs/preset-docs-core/locales/zh-CN"
import "@univerjs/preset-docs-core/lib/index.css"
import { SAVE_THROTTLE_MS } from "./constants"

interface UseUniverDocumentOptions {
    containerRef: RefObject<HTMLDivElement | null>
    documentData: Record<string, any> | null
    readOnly: boolean
    darkMode: boolean
    onSave: (data: Record<string, any>) => void
    onToggleFullscreen?: () => void
}

interface UseUniverDocumentReturn {
    importDocumentData: (data: Record<string, any>) => void
}

export function useUniverDocument({ containerRef, documentData, readOnly, darkMode, onSave, onToggleFullscreen }: UseUniverDocumentOptions): UseUniverDocumentReturn {
    const univerRef = useRef<any>(null)
    const univerAPIRef = useRef<any>(null)
    const unitModelRef = useRef<any>(null)
    const disposeRef = useRef<(() => void) | null>(null)
    const initializedRef = useRef(false)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onSaveRef = useRef(onSave)
    onSaveRef.current = onSave
    const onToggleFullscreenRef = useRef(onToggleFullscreen)
    onToggleFullscreenRef.current = onToggleFullscreen

    const throttledSave = useCallback(() => {
        if (saveTimerRef.current) return
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null
            const unit = unitModelRef.current
            if (!unit) return
            try {
                const snapshot = unit.getSnapshot?.()
                if (snapshot) {
                    onSaveRef.current(snapshot)
                }
            } catch (error) {
                console.error('Error getting document snapshot:', error)
            }
        }, SAVE_THROTTLE_MS)
    }, [])

    useEffect(() => {
        const container = containerRef.current
        if (!container || initializedRef.current) return
        initializedRef.current = true

        const isZhCN = navigator.language.startsWith('zh')

        const { univer, univerAPI } = createUniver({
            theme: defaultTheme,
            darkMode,
            locale: isZhCN ? LocaleType.ZH_CN : LocaleType.EN_US,
            locales: {
                [LocaleType.EN_US]: docsLocaleEnUS,
                [LocaleType.ZH_CN]: docsLocaleZhCN,
            },
            presets: [
                UniverDocsCorePreset({
                    container,
                }),
            ],
        })

        univerRef.current = univer
        univerAPIRef.current = univerAPI

        // Create document with saved data or empty
        const docData = documentData || {}
        try {
            unitModelRef.current = univer.createUnit(UniverInstanceType.UNIVER_DOC, docData)
        } catch (error) {
            console.error('Failed to load document data:', error)
            try {
                unitModelRef.current = univer.createUnit(UniverInstanceType.UNIVER_DOC, {})
            } catch (e) {
                console.error('Failed to create empty document:', e)
            }
        }

        // Listen for changes and throttle save
        if (!readOnly) {
            const disposable = univerAPI.onCommandExecuted(() => {
                throttledSave()
            })
            disposeRef.current = () => {
                if (typeof disposable === 'function') {
                    (disposable as Function)()
                } else if (disposable && typeof (disposable as any).dispose === 'function') {
                    (disposable as any).dispose()
                }
            }
        }

        return () => {
            // Final save before cleanup
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current)
                saveTimerRef.current = null
            }
            const unit = unitModelRef.current
            if (unit) {
                try {
                    const snapshot = unit.getSnapshot?.()
                    if (snapshot) {
                        onSaveRef.current(snapshot)
                    }
                } catch (error) {
                    console.error('Error saving before cleanup:', error)
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
                unitModelRef.current = null
            }
            initializedRef.current = false
        }
    }, [containerRef, readOnly]) // eslint-disable-line react-hooks/exhaustive-deps

    // Toggle dark mode dynamically — only fires when theme actually changes
    useEffect(() => {
        const api = univerAPIRef.current
        if (api && initializedRef.current) {
            api.toggleDarkMode(darkMode)
        }
    }, [darkMode])

    const importDocumentData = useCallback((data: Record<string, any>) => {
        const univer = univerRef.current
        const api = univerAPIRef.current
        if (!univer || !api) return

        // Dispose current document unit
        try {
            const currentUnit = unitModelRef.current
            if (currentUnit && typeof currentUnit.getUnitId === 'function') {
                api.disposeUnit(currentUnit.getUnitId())
            }
        } catch (error) {
            console.error('Error disposing current document:', error)
        }

        // Create new document with imported data
        try {
            unitModelRef.current = univer.createUnit(UniverInstanceType.UNIVER_DOC, data)
        } catch (error) {
            console.error('Error creating document with imported data:', error)
        }

        // Re-attach change listener for auto-save
        if (!readOnly) {
            if (disposeRef.current) {
                disposeRef.current()
                disposeRef.current = null
            }
            const disposable = api.onCommandExecuted(() => {
                throttledSave()
            })
            disposeRef.current = () => {
                if (typeof disposable === 'function') {
                    disposable()
                } else if (disposable && typeof (disposable as any).dispose === 'function') {
                    (disposable as any).dispose()
                }
            }
        }

        // Trigger immediate save of imported data
        try {
            const unit = unitModelRef.current
            if (unit) {
                const snapshot = unit.getSnapshot?.()
                if (snapshot) {
                    onSaveRef.current(snapshot)
                }
            }
        } catch (error) {
            console.error('Error saving imported data:', error)
        }
    }, [readOnly, throttledSave])

    return { importDocumentData }
}