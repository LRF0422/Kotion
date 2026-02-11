import { useCallback, useEffect, useRef, useState } from 'react'
import { PluginConfigData, PluginConfigStore } from '../services/plugin-config-service'

export interface UsePluginConfigOptions<T extends PluginConfigData> {
    /** Unique plugin identifier (must match PluginSettingsConfig.key) */
    pluginKey: string
    /** Default values used before any saved config is loaded */
    defaultConfig: T
}

export interface UsePluginConfigResult<T extends PluginConfigData> {
    /** Current form state (may contain unsaved edits) */
    config: T
    /** True while loading from storage */
    loading: boolean
    /** True while persisting to storage */
    saving: boolean
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
    const { pluginKey, defaultConfig } = options
    const store = PluginConfigStore.getInstance()

    const [config, setConfig] = useState<T>(defaultConfig)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Last-saved snapshot for dirty detection and reset
    const savedRef = useRef<T>(defaultConfig)

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
        try {
            await store.saveConfig(pluginKey, config)
            savedRef.current = config
        } finally {
            setSaving(false)
        }
    }, [store, pluginKey, config])

    const resetConfig = useCallback(() => {
        setConfig(savedRef.current)
    }, [])

    const isDirty = JSON.stringify(config) !== JSON.stringify(savedRef.current)

    return { config, loading, saving, updateConfig, saveConfig, resetConfig, isDirty }
}
