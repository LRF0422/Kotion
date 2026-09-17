import { useCallback, useEffect, useRef, useState } from 'react'
import { PluginConfigData, PluginConfigStore } from '../services/plugin-config-service'
import { hasSecretValue, isSecretMask } from '../services/plugin-secrets'

export interface UsePluginConfigOptions<T extends PluginConfigData> {
    /** Unique plugin identifier (must match PluginSettingsConfig.key) */
    pluginKey: string
    /** Default values used before any saved config is loaded */
    defaultConfig: T
    /** Auto-save after changes with debounce (ms). Set 0 or omit to disable. Default: 800 */
    autoSaveDelay?: number
    /**
     * Config fields that hold credentials. They are never written to
     * localStorage and never returned by the server in the clear: the loaded
     * value is the redaction mask, the typed value stays in form state, and
     * runtime callers read the real value through `getSecret`.
     *
     * Declare this for any plugin whose config carries an API key/token so the
     * UI can tell "configured but hidden" apart from "not configured".
     */
    secretFields?: readonly string[]
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
    /**
     * Resolve a credential field for runtime use: prefers the value typed into
     * the form, otherwise fetches the decrypted value from the server. Never
     * persisted. Returns `''` when the field is unset.
     */
    getSecret: (field: string) => Promise<string>
    /**
     * Whether the field is masked, i.e. a value exists but is not held here.
     * Use it to render "configured, leave blank to keep" affordances.
     */
    isConfigured: (field: string) => boolean
}

export function usePluginConfig<T extends PluginConfigData = PluginConfigData>(
    options: UsePluginConfigOptions<T>,
): UsePluginConfigResult<T> {
    const { pluginKey, defaultConfig, autoSaveDelay = 800, secretFields } = options
    const store = PluginConfigStore.getInstance()

    const [config, setConfig] = useState<T>(defaultConfig)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Last-saved snapshot for dirty detection and reset
    const savedRef = useRef<T>(defaultConfig)
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const loadedRef = useRef(false)
    // Stable identity so this hook never receives its own change notifications
    // (which would replace the credential being typed with the mask).
    const originRef = useRef<symbol>(Symbol('usePluginConfig'))
    const configRef = useRef<T>(defaultConfig)

    // `secretFields` is typically an inline array literal; key it so the
    // registration effect does not re-run on every render.
    const secretFieldsKey = (secretFields ?? []).join('\u0000')

    useEffect(() => {
        configRef.current = config
    }, [config])

    // Tell the store which fields are credentials before any config is read.
    useEffect(() => {
        const fields = secretFieldsKey ? secretFieldsKey.split('\u0000') : []
        store.registerSecretFields(pluginKey, fields)
    }, [store, pluginKey, secretFieldsKey])

    // Load config on mount
    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            try {
                const fields = secretFieldsKey ? secretFieldsKey.split('\u0000') : []
                store.registerSecretFields(pluginKey, fields)
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
        }, originRef.current)

        return () => {
            cancelled = true
            unsub()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pluginKey])

    const updateConfig = useCallback((partial: Partial<T>) => {
        setConfig((prev) => ({ ...prev, ...partial }))
    }, [])

    const persist = useCallback(async (next: T) => {
        setSaving(true)
        setSaveError(null)
        try {
            await store.saveConfig(pluginKey, next, originRef.current)
            savedRef.current = next
        } catch (error: any) {
            const msg = typeof error === 'string' ? error
                : error?.message || 'Failed to save config to server'
            setSaveError(msg)
        } finally {
            setSaving(false)
        }
    }, [store, pluginKey])

    const saveConfig = useCallback(async () => {
        await persist(config)
    }, [persist, config])

    // Debounced auto-save
    useEffect(() => {
        if (!loadedRef.current || autoSaveDelay <= 0) return
        const dirty = JSON.stringify(config) !== JSON.stringify(savedRef.current)
        if (!dirty) return

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(() => {
            void persist(config)
        }, autoSaveDelay)

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        }
    }, [config, autoSaveDelay, persist])

    const resetConfig = useCallback(() => {
        setConfig(savedRef.current)
    }, [])

    /**
     * Credential resolution for runtime callers. A value typed into the form
     * wins; otherwise the store reveals the stored one into memory.
     */
    const getSecret = useCallback(async (field: string): Promise<string> => {
        const local = (configRef.current as Record<string, unknown>)[field]
        if (hasSecretValue(local)) return local
        return store.getSecret(pluginKey, field)
    }, [store, pluginKey])

    const isConfigured = useCallback((field: string): boolean => {
        const current = (configRef.current as Record<string, unknown>)[field]
        return hasSecretValue(current) || isSecretMask(current)
    }, [])

    const isDirty = JSON.stringify(config) !== JSON.stringify(savedRef.current)

    return {
        config,
        loading,
        saving,
        saveError,
        updateConfig,
        saveConfig,
        resetConfig,
        isDirty,
        getSecret,
        isConfigured,
    }
}
