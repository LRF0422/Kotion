import { useEffect, useRef, useCallback, type RefObject } from "react"
import { createUniver, defaultTheme, LocaleType, UniverInstanceType } from "@univerjs/presets"
import { UniverDocsCorePreset } from "@univerjs/preset-docs-core"
import docsLocaleEnUS from "@univerjs/preset-docs-core/locales/en-US"
import docsLocaleZhCN from "@univerjs/preset-docs-core/locales/zh-CN"
import "@univerjs/preset-docs-core/lib/index.css"
import { SAVE_THROTTLE_MS } from "./constants"

/** Minimal valid empty Univer document ("\r\n" = one empty paragraph + section). */
function createEmptyDocumentData(): Record<string, any> {
    return {
        id: `doc-${Date.now()}`,
        body: {
            dataStream: '\r\n',
            textRuns: [],
            paragraphs: [{ startIndex: 0 }],
            sectionBreaks: [{ startIndex: 1 }],
        },
        documentStyle: {},
    }
}

/** Ensure document data has a usable body; otherwise fall back to an empty doc. */
function ensureValidDocumentData(data: Record<string, any> | null | undefined): Record<string, any> {
    if (data && data.body && typeof data.body.dataStream === 'string') return data
    return createEmptyDocumentData()
}

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
    /** Apply externally-changed data (e.g. AI tool edits) into the live instance. */
    applyDocumentData: (data: Record<string, any>) => void
    /** Read the current live snapshot. */
    getCurrentSnapshot: () => Record<string, any> | null
}

export function useUniverDocument({ containerRef, documentData, readOnly, darkMode, onSave, onToggleFullscreen }: UseUniverDocumentOptions): UseUniverDocumentReturn {
    const univerRef = useRef<any>(null)
    const univerAPIRef = useRef<any>(null)
    const unitModelRef = useRef<any>(null)
    const disposeRef = useRef<(() => void) | null>(null)
    const initializedRef = useRef(false)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Last snapshot this hook produced; lets the view distinguish our own save
    // echoes from genuine external (AI) edits that must be applied.
    const lastSyncedDataRef = useRef<Record<string, any> | null>(documentData)
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

        // Create document with saved data or a valid empty document.
        const docData = ensureValidDocumentData(documentData)
        try {
            unitModelRef.current = univer.createUnit(UniverInstanceType.UNIVER_DOC, docData)
            lastSyncedDataRef.current = docData
        } catch (error) {
            console.error('Failed to load document data:', error)
            try {
                const empty = createEmptyDocumentData()
                unitModelRef.current = univer.createUnit(UniverInstanceType.UNIVER_DOC, empty)
                lastSyncedDataRef.current = empty
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

    const rebuildUnit = useCallback((data: Record<string, any>, triggerSave: boolean) => {
        const univer = univerRef.current
        const api = univerAPIRef.current
        if (!univer || !api) return

        const docData = ensureValidDocumentData(data)

        // Dispose current document unit
        try {
            const currentUnit = unitModelRef.current
            if (currentUnit && typeof currentUnit.getUnitId === 'function') {
                api.disposeUnit(currentUnit.getUnitId())
            }
        } catch (error) {
            console.error('Error disposing current document:', error)
        }

        // Create new document with the supplied data
        try {
            unitModelRef.current = univer.createUnit(UniverInstanceType.UNIVER_DOC, docData)
            lastSyncedDataRef.current = docData
        } catch (error) {
            console.error('Error creating document with new data:', error)
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

        if (triggerSave) {
            try {
                const unit = unitModelRef.current
                const snapshot = unit?.getSnapshot?.()
                if (snapshot) {
                    onSaveRef.current(snapshot)
                }
            } catch (error) {
                console.error('Error saving new data:', error)
            }
        }
    }, [readOnly, throttledSave])

    const importDocumentData = useCallback((data: Record<string, any>) => {
        rebuildUnit(data, true)
    }, [rebuildUnit])

    const applyDocumentData = useCallback((data: Record<string, any>) => {
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

    return { importDocumentData, applyDocumentData, getCurrentSnapshot }
}