import { useEffect, useRef, useCallback, type RefObject } from "react"
import { createUniver, defaultTheme, LocaleType, UniverInstanceType } from "@univerjs/presets"
import { UniverDocsCorePreset } from "@univerjs/preset-docs-core"
import { UniverSlidesPlugin } from "@univerjs/slides"
import { UniverSlidesUIPlugin } from "@univerjs/slides-ui"
import docsLocaleEnUS from "@univerjs/preset-docs-core/locales/en-US"
import docsLocaleZhCN from "@univerjs/preset-docs-core/locales/zh-CN"
import slidesUILocaleEnUS from "@univerjs/slides-ui/locale/en-US"
import slidesUILocaleZhCN from "@univerjs/slides-ui/locale/zh-CN"
import "@univerjs/preset-docs-core/lib/index.css"
import "@univerjs/slides-ui/lib/index.css"
import { SAVE_THROTTLE_MS } from "./constants"


interface UseUniverSlideOptions {
    containerRef: RefObject<HTMLDivElement | null>
    slideData: Record<string, any> | null
    readOnly: boolean
    darkMode: boolean
    onSave: (data: Record<string, any>) => void
    onToggleFullscreen?: () => void
}

interface UseUniverSlideReturn {
    importSlideData: (data: Record<string, any>) => void
    /** Apply externally-changed data (e.g. AI tool edits) into the live instance. */
    applySlideData: (data: Record<string, any>) => void
    /** Read the current live snapshot. */
    getCurrentSnapshot: () => Record<string, any> | null
}

export function useUniverSlide({ containerRef, slideData, readOnly, darkMode, onSave, onToggleFullscreen }: UseUniverSlideOptions): UseUniverSlideReturn {
    const univerRef = useRef<any>(null)
    const univerAPIRef = useRef<any>(null)
    const unitModelRef = useRef<any>(null)
    const disposeRef = useRef<(() => void) | null>(null)
    const initializedRef = useRef(false)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Last snapshot this hook produced; lets the view distinguish our own save
    // echoes from genuine external (AI) edits that must be applied.
    const lastSyncedDataRef = useRef<Record<string, any> | null>(slideData)
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
                    lastSyncedDataRef.current = snapshot
                    onSaveRef.current(snapshot)
                }
            } catch (error) {
                console.error('Error getting presentation snapshot:', error)
            }
        }, SAVE_THROTTLE_MS)
    }, [])

    useEffect(() => {
        const container = containerRef.current
        if (!container || initializedRef.current) return
        initializedRef.current = true

        const isZhCN = navigator.language.startsWith('zh')

        const mergedLocaleEnUS = { ...docsLocaleEnUS, ...slidesUILocaleEnUS }
        const mergedLocaleZhCN = { ...docsLocaleZhCN, ...slidesUILocaleZhCN }

        // Initialize Univer with docs core preset (provides render engine, UI, docs)
        // plus slides plugins on top
        const univerInstance = createUniver({
            theme: defaultTheme,
            darkMode,
            locale: isZhCN ? LocaleType.ZH_CN : LocaleType.EN_US,
            locales: {
                [LocaleType.EN_US]: mergedLocaleEnUS,
                [LocaleType.ZH_CN]: mergedLocaleZhCN,
            },
            presets: [
                UniverDocsCorePreset({
                    container,
                }),
            ],
            plugins: [
                UniverSlidesPlugin as any,
                UniverSlidesUIPlugin as any,
            ],
        })

        univerRef.current = univerInstance.univer
        univerAPIRef.current = univerInstance.univerAPI

        // Create presentation with saved data or empty
        const slideUnitData = slideData || {}
        try {
            unitModelRef.current = univerInstance.univer.createUnit(UniverInstanceType.UNIVER_SLIDE, slideUnitData)
            lastSyncedDataRef.current = slideData ?? null
        } catch (error) {
            console.error('Failed to create slide unit:', error)
            try {
                unitModelRef.current = univerInstance.univer.createUnit(UniverInstanceType.UNIVER_SLIDE, {})
            } catch (e) {
                console.error('Failed to create empty slide unit:', e)
            }
        }

        // Set read-only if needed
        if (readOnly) {
            // For read-only mode, we could disable interaction in some way
            // This would depend on specific Univer slides API
        }

        // Listen for changes and throttle save
        if (!readOnly) {
            const disposable = univerInstance.univerAPI.onCommandExecuted(() => {
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

    const rebuildUnit = useCallback((data: Record<string, any>, triggerSave: boolean) => {
        const univer = univerRef.current
        const api = univerAPIRef.current
        if (!univer || !api) return

        try {
            // Dispose current unit and create new one with the supplied data
            const currentUnit = unitModelRef.current
            if (currentUnit && typeof currentUnit.getUnitId === 'function') {
                api.disposeUnit(currentUnit.getUnitId())
            }

            unitModelRef.current = univer.createUnit(UniverInstanceType.UNIVER_SLIDE, data)
            lastSyncedDataRef.current = data

            if (triggerSave) {
                const unit = unitModelRef.current
                const snapshot = unit?.getSnapshot?.()
                if (snapshot) {
                    onSaveRef.current(snapshot)
                }
            }
        } catch (error) {
            console.error('Error rebuilding slide unit:', error)
        }
    }, [])

    const importSlideData = useCallback((data: Record<string, any>) => {
        rebuildUnit(data, true)
    }, [rebuildUnit])

    const applySlideData = useCallback((data: Record<string, any>) => {
        if (data === lastSyncedDataRef.current) return
        rebuildUnit(data, false)
    }, [rebuildUnit])

    const getCurrentSnapshot = useCallback((): Record<string, any> | null => {
        try {
            return unitModelRef.current?.getSnapshot?.() ?? null
        } catch {
            return null
        }
    }, [])

    return { importSlideData, applySlideData, getCurrentSnapshot }
}