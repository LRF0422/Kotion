/**
 * Plugin Configuration Storage Service
 *
 * Hybrid storage: API first, localStorage fallback.
 * Follows the same pattern as skill-registry.ts.
 *
 * Secrets: plugin configs may carry credentials (`apiKey`,
 * `personalAccessToken`, `accessSecret`, …). Those are **never** persisted in
 * the clear:
 *
 * - the server encrypts them at rest and returns {@link SECRET_MASK} instead of
 *   the value (see `PluginConfigApplication` in knowledge-wiki);
 * - {@link PluginConfigStore} redacts every credential before handing a config
 *   to a storage adapter that keeps a client-side copy;
 * - plaintext credentials live only in a memory-only cache and are fetched on
 *   demand through {@link PluginConfigStore.getSecrets} / `getSecret`.
 *
 * Legacy records written before this change are migrated transparently on first
 * load: the plaintext is pushed to the server (which encrypts it) and the local
 * copy is rewritten with the mask. When the server is unreachable the local
 * copy is left untouched rather than silently dropping the user's credential.
 *
 * This module deliberately has no HTTP dependency: the API-backed adapters live
 * in `plugin-config-api-storage.ts`, which also installs the default storage via
 * {@link setDefaultPluginConfigStorage}.
 */

import { logger } from '../utils/logger'
import {
    cachePluginSecrets,
    clearCachedPluginSecrets,
    containsPlaintextSecret,
    hasSecretValue,
    readCachedPluginSecrets,
    redactSecretFields,
    removeCachedPluginSecrets,
    resolveSecretFields,
} from './plugin-secrets'

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

/** Identity of the writer that triggered a change, used to skip self-notify. */
export type ConfigChangeOrigin = symbol

interface Subscription {
    listener: ConfigChangeListener
    origin?: ConfigChangeOrigin
}

// ─── Storage Adapters ────────────────────────────────────────

export interface PluginConfigStorageAdapter {
    load(pluginKey: string): Promise<PluginConfigData | null>
    loadAll(): Promise<Record<string, PluginConfigData>>
    /**
     * Persist a config.
     *
     * `config` is the full value and goes to the durable store (the server
     * encrypts any credential it contains). `redacted` is the local-safe
     * projection — credentials replaced by the mask — and must be what any
     * client-side copy stores. When omitted the adapter redacts defensively.
     */
    save(
        pluginKey: string,
        config: PluginConfigData,
        redacted?: PluginConfigData,
    ): Promise<void>
    /**
     * Optional. Ship a legacy plaintext client-side copy to the durable store
     * without ever leaving plaintext behind: the durable write must happen
     * first and must throw (leaving the local copy untouched) when it fails, so
     * a failed migration never destroys the user's credential.
     */
    migratePlaintextSecret?(
        pluginKey: string,
        config: PluginConfigData,
        redacted: PluginConfigData,
    ): Promise<void>
    /** Optional. Fetch decrypted credentials for in-memory use. */
    reveal?(pluginKey: string): Promise<PluginConfigData | null>
}

/** localStorage adapter – always available, never holds a plaintext credential */
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

    async save(
        pluginKey: string,
        config: PluginConfigData,
        redacted?: PluginConfigData,
    ): Promise<void> {
        const all = this.readAll()
        // Never let a credential reach the client-side copy: fall back to the
        // name heuristic when the caller did not supply a projection.
        const safe = redacted ?? redactSecretFields(config, resolveSecretFields(config)).redacted
        all[pluginKey] = {
            pluginKey,
            config: safe,
            updatedAt: new Date().toISOString(),
        }
        this.writeAll(all)
    }
}

// ─── Default storage ─────────────────────────────────────────

/**
 * Resolver for the process-wide default storage. Installed by
 * `plugin-config-api-storage.ts` (which owns the HTTP transport); falls back to
 * localStorage-only when that module is not loaded.
 */
let defaultStorageResolver: (() => PluginConfigStorageAdapter) | null = null

/** Install the storage used by {@link PluginConfigStore.getInstance}. */
export function setDefaultPluginConfigStorage(
    resolver: (() => PluginConfigStorageAdapter) | null,
): void {
    defaultStorageResolver = resolver
}

// ─── Singleton Store ─────────────────────────────────────────

export class PluginConfigStore {
    private static instance: PluginConfigStore | null = null

    private storage: PluginConfigStorageAdapter
    private cache = new Map<string, PluginConfigData>()
    private listeners = new Map<string, Set<Subscription>>()
    /** Declared secret fields per plugin (see `usePluginConfig`). */
    private secretFields = new Map<string, Set<string>>()
    private initialized = false

    private constructor(storage?: PluginConfigStorageAdapter) {
        this.storage = storage ?? defaultStorageResolver?.() ?? new LocalPluginConfigStorage()
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

    // ─── Secrets ─────────────────────────────────────────────

    /**
     * Declare which config fields carry credentials. Unioned with the name
     * heuristic, so a forgotten declaration still gets redacted.
     */
    registerSecretFields(pluginKey: string, fields?: readonly string[]): void {
        if (!fields?.length) return
        const set = this.secretFields.get(pluginKey) ?? new Set<string>()
        for (const field of fields) if (field) set.add(field)
        this.secretFields.set(pluginKey, set)
    }

    /** Declared + heuristically detected secret fields for a config. */
    private fieldsFor(pluginKey: string, config?: PluginConfigData | null): string[] {
        return resolveSecretFields(config ?? null, [
            ...(this.secretFields.get(pluginKey) ?? []),
        ])
    }

    /** Move plaintext credentials into the memory cache and mask the config. */
    private redact(pluginKey: string, config: PluginConfigData): PluginConfigData {
        const fields = this.fieldsFor(pluginKey, config)
        const { redacted, secrets } = redactSecretFields(config, fields)
        cachePluginSecrets(pluginKey, secrets)

        // A cleared credential must not survive in the memory cache, otherwise a
        // later runtime read would keep using the value the user just removed.
        const cleared = fields.filter((field) => {
            const value = config[field]
            return value === '' || value === null || value === undefined
        })
        removeCachedPluginSecrets(pluginKey, cleared)

        return redacted
    }

    /**
     * Decrypted credentials for runtime use (calling GitHub, Zhihu, …).
     *
     * Returns whatever is already in the memory cache, fetching the rest from
     * the server's reveal endpoint. The values are never written to any storage
     * and never surface through {@link getConfig}.
     */
    async getSecrets(pluginKey: string, fields?: readonly string[]): Promise<Record<string, string>> {
        const wanted = fields ?? [...(this.secretFields.get(pluginKey) ?? [])]
        const cached = readCachedPluginSecrets(pluginKey)
        const missing = wanted.filter((field) => !cached[field])

        if (missing.length > 0 && this.storage.reveal) {
            try {
                const revealed = await this.storage.reveal(pluginKey)
                if (revealed) {
                    const merged: Record<string, string> = {}
                    for (const [field, value] of Object.entries(revealed)) {
                        if (hasSecretValue(value)) merged[field] = value
                    }
                    cachePluginSecrets(pluginKey, merged)
                }
            } catch (error) {
                logger.warn(`Failed to reveal plugin secrets for "${pluginKey}":`, error)
            }
        }

        const resolved = readCachedPluginSecrets(pluginKey)
        if (!fields) return { ...resolved }
        const out: Record<string, string> = {}
        for (const field of fields) if (resolved[field]) out[field] = resolved[field]
        return out
    }

    /** Single credential, `''` when unset/unavailable. */
    async getSecret(pluginKey: string, field: string): Promise<string> {
        return (await this.getSecrets(pluginKey, [field]))[field] ?? ''
    }

    /** Drop in-memory plaintext (logout, plugin uninstall). */
    clearSecrets(pluginKey?: string): void {
        clearCachedPluginSecrets(pluginKey)
    }

    // ─── Lifecycle ───────────────────────────────────────────

    /** Batch-load all configs into cache */
    async initialize(): Promise<void> {
        if (this.initialized) return
        try {
            const all = await this.storage.loadAll()
            for (const [key, config] of Object.entries(all)) {
                this.cache.set(key, await this.adoptLoadedConfig(key, config))
            }
            this.initialized = true
            logger.info(`PluginConfigStore initialized with ${this.cache.size} configs`)
        } catch (error) {
            logger.error('PluginConfigStore initialization failed:', error)
        }
    }

    /**
     * Normalize a config coming out of storage. A legacy copy may still hold
     * plaintext credentials: push them to the durable store (which encrypts
     * them) and hand back the redacted projection.
     */
    private async adoptLoadedConfig(
        pluginKey: string,
        config: PluginConfigData,
    ): Promise<PluginConfigData> {
        const fields = this.fieldsFor(pluginKey, config)
        if (!containsPlaintextSecret(config, fields)) return config

        const { redacted, secrets } = redactSecretFields(config, fields)
        cachePluginSecrets(pluginKey, secrets)

        try {
            if (this.storage.migratePlaintextSecret) {
                await this.storage.migratePlaintextSecret(pluginKey, config, redacted)
            } else {
                await this.storage.save(pluginKey, config, redacted)
            }
            logger.info(`Migrated legacy plaintext plugin secrets for "${pluginKey}"`)
            return redacted
        } catch (error) {
            // Keep the legacy local copy so the credential is not lost; the
            // migration is retried on the next load / save.
            logger.warn(`Deferred plugin secret migration for "${pluginKey}":`, error)
            return config
        }
    }

    /** Get config for a plugin. Returns cached value or fetches from storage. */
    async getConfig<T extends PluginConfigData = PluginConfigData>(
        pluginKey: string,
    ): Promise<T | null> {
        if (!this.cache.has(pluginKey)) {
            const loaded = await this.storage.load(pluginKey)
            if (loaded) {
                this.cache.set(pluginKey, await this.adoptLoadedConfig(pluginKey, loaded))
            } else {
                return null
            }
        }
        return (this.cache.get(pluginKey) ?? null) as T | null
    }

    /**
     * Save config and notify subscribers.
     *
     * Plaintext credentials are kept in memory only; both the cache and the
     * client-side copy receive the masked projection. Pass `origin` to skip the
     * notification for the caller that triggered the save.
     */
    async saveConfig(
        pluginKey: string,
        config: PluginConfigData,
        origin?: ConfigChangeOrigin,
    ): Promise<void> {
        const redacted = this.redact(pluginKey, config)
        this.cache.set(pluginKey, redacted)
        await this.storage.save(pluginKey, config, redacted)
        this.notify(pluginKey, redacted, origin)
    }

    /** Subscribe to changes for a specific plugin key */
    subscribe(
        pluginKey: string,
        listener: ConfigChangeListener,
        origin?: ConfigChangeOrigin,
    ): () => void {
        if (!this.listeners.has(pluginKey)) {
            this.listeners.set(pluginKey, new Set())
        }
        const subscription: Subscription = { listener, origin }
        this.listeners.get(pluginKey)!.add(subscription)
        return () => {
            this.listeners.get(pluginKey)?.delete(subscription)
        }
    }

    private notify(pluginKey: string, config: PluginConfigData, origin?: ConfigChangeOrigin) {
        this.listeners.get(pluginKey)?.forEach((subscription) => {
            if (origin && subscription.origin === origin) return
            subscription.listener(config)
        })
    }
}
