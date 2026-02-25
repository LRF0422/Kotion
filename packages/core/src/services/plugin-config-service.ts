/**
 * Plugin Configuration Storage Service
 *
 * Hybrid storage: API first, localStorage fallback.
 * Follows the same pattern as skill-registry.ts.
 */

import { APIS } from '../api'
import { useApi } from '../hooks/use-api'
import { logger } from '@kn/common'

// ─── Types ───────────────────────────────────────────────────

export interface PluginConfigData {
    [key: string]: unknown
}

export interface PluginConfigEntry {
    pluginKey: string
    config: PluginConfigData
    updatedAt: string
}

type ConfigChangeListener = (config: PluginConfigData) => void

// ─── Storage Adapters ────────────────────────────────────────

export interface PluginConfigStorageAdapter {
    load(pluginKey: string): Promise<PluginConfigData | null>
    loadAll(): Promise<Record<string, PluginConfigData>>
    save(pluginKey: string, config: PluginConfigData): Promise<void>
}

/** localStorage adapter – always available */
export class LocalPluginConfigStorage implements PluginConfigStorageAdapter {
    private storageKey: string

    constructor(storageKey: string = 'kn_plugin_configs') {
        this.storageKey = storageKey
    }

    private readAll(): Record<string, PluginConfigEntry> {
        try {
            const raw = localStorage.getItem(this.storageKey)
            return raw ? JSON.parse(raw) : {}
        } catch {
            return {}
        }
    }

    private writeAll(data: Record<string, PluginConfigEntry>) {
        localStorage.setItem(this.storageKey, JSON.stringify(data))
    }

    async load(pluginKey: string): Promise<PluginConfigData | null> {
        const all = this.readAll()
        return all[pluginKey]?.config ?? null
    }

    async loadAll(): Promise<Record<string, PluginConfigData>> {
        const all = this.readAll()
        const result: Record<string, PluginConfigData> = {}
        for (const [key, entry] of Object.entries(all)) {
            result[key] = entry.config
        }
        return result
    }

    async save(pluginKey: string, config: PluginConfigData): Promise<void> {
        const all = this.readAll()
        all[pluginKey] = {
            pluginKey,
            config,
            updatedAt: new Date().toISOString(),
        }
        this.writeAll(all)
    }
}

/** Remote API adapter – calls backend via useApi */
export class ApiPluginConfigStorage implements PluginConfigStorageAdapter {
    async load(pluginKey: string): Promise<PluginConfigData | null> {
        try {
            const res = await useApi(APIS.GET_PLUGIN_CONFIG, { pluginKey })
            return (res as any)?.data?.config ?? null
        } catch (error) {
            logger.warn('ApiPluginConfigStorage.load failed:', error)
            return null
        }
    }

    async loadAll(): Promise<Record<string, PluginConfigData>> {
        try {
            const res = await useApi(APIS.GET_ALL_PLUGIN_CONFIGS)
            const list: PluginConfigEntry[] = (res as any)?.data ?? []
            const result: Record<string, PluginConfigData> = {}
            for (const entry of list) {
                result[entry.pluginKey] = entry.config
            }
            return result
        } catch (error) {
            logger.warn('ApiPluginConfigStorage.loadAll failed:', error)
            return {}
        }
    }

    async save(pluginKey: string, config: PluginConfigData): Promise<void> {
        await useApi(
            APIS.SAVE_PLUGIN_CONFIG,
            { pluginKey },
            { config },
        )
    }
}

/** Hybrid adapter: try API first, fall back to localStorage */
export class HybridPluginConfigStorage implements PluginConfigStorageAdapter {
    private api: ApiPluginConfigStorage
    private local: LocalPluginConfigStorage

    constructor() {
        this.api = new ApiPluginConfigStorage()
        this.local = new LocalPluginConfigStorage()
    }

    async load(pluginKey: string): Promise<PluginConfigData | null> {
        try {
            const remote = await this.api.load(pluginKey)
            if (remote !== null) {
                // Sync remote → local
                await this.local.save(pluginKey, remote)
                return remote
            }
        } catch {
            // fall through
        }
        return this.local.load(pluginKey)
    }

    async loadAll(): Promise<Record<string, PluginConfigData>> {
        try {
            const remote = await this.api.loadAll()
            if (Object.keys(remote).length > 0) {
                // Sync each entry to local
                for (const [key, config] of Object.entries(remote)) {
                    await this.local.save(key, config)
                }
                return remote
            }
        } catch {
            // fall through
        }
        return this.local.loadAll()
    }

    async save(pluginKey: string, config: PluginConfigData): Promise<void> {
        // Always save to local first (immediate persistence)
        await this.local.save(pluginKey, config)
        // Then sync to remote – propagate errors so callers can show feedback
        await this.api.save(pluginKey, config)
    }
}

// ─── Singleton Store ─────────────────────────────────────────

export class PluginConfigStore {
    private static instance: PluginConfigStore | null = null

    private storage: PluginConfigStorageAdapter
    private cache = new Map<string, PluginConfigData>()
    private listeners = new Map<string, Set<ConfigChangeListener>>()
    private initialized = false

    private constructor(storage?: PluginConfigStorageAdapter) {
        this.storage = storage ?? new HybridPluginConfigStorage()
    }

    static getInstance(storage?: PluginConfigStorageAdapter): PluginConfigStore {
        if (!PluginConfigStore.instance) {
            PluginConfigStore.instance = new PluginConfigStore(storage)
        }
        return PluginConfigStore.instance
    }

    /** Reset singleton – useful for tests */
    static resetInstance() {
        PluginConfigStore.instance = null
    }

    /** Batch-load all configs into cache */
    async initialize(): Promise<void> {
        if (this.initialized) return
        try {
            const all = await this.storage.loadAll()
            for (const [key, config] of Object.entries(all)) {
                this.cache.set(key, config)
            }
            this.initialized = true
            logger.info(`PluginConfigStore initialized with ${this.cache.size} configs`)
        } catch (error) {
            logger.error('PluginConfigStore initialization failed:', error)
        }
    }

    /** Get config for a plugin. Returns cached value or fetches from storage. */
    async getConfig<T extends PluginConfigData = PluginConfigData>(
        pluginKey: string,
    ): Promise<T | null> {
        if (this.cache.has(pluginKey)) {
            return this.cache.get(pluginKey) as T
        }
        const config = await this.storage.load(pluginKey)
        if (config) {
            this.cache.set(pluginKey, config)
        }
        return config as T | null
    }

    /** Save config and notify subscribers */
    async saveConfig(pluginKey: string, config: PluginConfigData): Promise<void> {
        this.cache.set(pluginKey, config)
        await this.storage.save(pluginKey, config)
        this.notify(pluginKey, config)
    }

    /** Subscribe to changes for a specific plugin key */
    subscribe(pluginKey: string, listener: ConfigChangeListener): () => void {
        if (!this.listeners.has(pluginKey)) {
            this.listeners.set(pluginKey, new Set())
        }
        this.listeners.get(pluginKey)!.add(listener)
        return () => {
            this.listeners.get(pluginKey)?.delete(listener)
        }
    }

    private notify(pluginKey: string, config: PluginConfigData) {
        this.listeners.get(pluginKey)?.forEach((fn) => fn(config))
    }
}
