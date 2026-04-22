import { useCallback, useEffect, useRef, useState } from 'react'
import { PluginConfigData, PluginConfigStore } from '../services/plugin-config-service'

export interface UsePluginConfigOptions<T extends PluginConfigData> {
    /** Unique plugin identifier (must match PluginSettingsConfig.key) */
    pluginKey: string
    /** Default values used before any saved config is loaded */
    defaultConfig: T
    /** Auto-save after changes with debounce (ms). Set 0 or omit to disable. Default: 800 */
    autoSaveDelay?: number
}

export interface UsePluginConfigResult<T extends PluginConfigData> {
    /** Current form state (may contain unsaved edits) */
    config: T
    /** True while loading from storage */
    loading: boolean
    /** True while persisting to storage */
    saving: boolean
    /** Error message from the last save attempt (null if save succeeded or not yet attempted) */
    saveError: string | null
    /** Merge a partial update into the local form state (does NOT persist) */
    updateConfig: (partial: Partial<T>) => void
    /** Persist the current form state to hybrid storage */
    saveConfig: () => Promise<void>
    /** Revert local form state to the last saved snapshot */
    resetConfig: () => void
    /** True when the form state differs from the last saved snapshot */
    isDirty: boolean
}

export function usePluginConfig<T extends PluginConfigData = PluginConfigData>(
    options: UsePluginConfigOptions<T>,
): UsePluginConfigResult<T> {
    const { pluginKey, defaultConfig, autoSaveDelay = 800 } = options
    const store = PluginConfigStore.getInstance()

    const [config, setConfig] = useState<T>(defaultConfig)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Last-saved snapshot for dirty detection and reset
    const savedRef = useRef<T>(defaultConfig)
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const loadedRef = useRef(false)

    // Load config on mount
    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            try {
                await store.initialize()
                const saved = await store.getConfig<T>(pluginKey)
                if (!cancelled) {
                    const merged = { ...defaultConfig, ...saved } as T
                    setConfig(merged)
                    savedRef.current = merged
                    loadedRef.current = true
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()

        // Subscribe to external changes (e.g. another tab)
        const unsub = store.subscribe(pluginKey, (updated) => {
            if (!cancelled) {
                const merged = { ...defaultConfig, ...updated } as T
                setConfig(merged)
                savedRef.current = merged
            }
        })

        return () => {
            cancelled = true
            unsub()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pluginKey])

    const updateConfig = useCallback((partial: Partial<T>) => {
        setConfig((prev) => ({ ...prev, ...partial }))
    }, [])

    const saveConfig = useCallback(async () => {
        setSaving(true)
        setSaveError(null)
        try {
            await store.saveConfig(pluginKey, config)
            savedRef.current = config
        } catch (error: any) {
            const msg = typeof error === 'string' ? error
                : error?.message || 'Failed to save config to server'
            setSaveError(msg)
        } finally {
            setSaving(false)
        }
    }, [store, pluginKey, config])

    // Debounced auto-save
    useEffect(() => {
        if (!loadedRef.current || autoSaveDelay <= 0) return
        const dirty = JSON.stringify(config) !== JSON.stringify(savedRef.current)
        if (!dirty) return

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(async () => {
            setSaving(true)
            setSaveError(null)
            try {
                await store.saveConfig(pluginKey, config)
                savedRef.current = config
            } catch (error: any) {
                const msg = typeof error === 'string' ? error
                    : error?.message || 'Failed to save config to server'
                setSaveError(msg)
            } finally {
                setSaving(false)
            }
        }, autoSaveDelay)

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        }
    }, [config, autoSaveDelay, store, pluginKey])

    const resetConfig = useCallback(() => {
        setConfig(savedRef.current)
    }, [])

    const isDirty = JSON.stringify(config) !== JSON.stringify(savedRef.current)

    return { config, loading, saving, saveError, updateConfig, saveConfig, resetConfig, isDirty }
}
