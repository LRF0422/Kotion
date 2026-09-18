/**
 * API-backed plugin-config storage adapters.
 *
 * Split out of `plugin-config-service.ts` so the store core has no dependency on
 * the HTTP transport (the axios/`import.meta` chain) — that keeps the store
 * importable from the plain-Node runtime checks.
 *
 * Importing this module installs {@link HybridPluginConfigStorage} as the
 * process-wide default for {@link PluginConfigStore}. `services/index.ts`
 * re-exports it, so any consumer of `@kn/common` gets the API-backed default;
 * constructing a store with an explicit adapter (tests) bypasses it.
 */

import { APIS } from '../api'
import { useApi } from '../api/use-api'
import { logger } from '../utils/logger'
import { redactSecretFields, resolveSecretFields } from './plugin-secrets'
import {
    LocalPluginConfigStorage,
    PluginConfigData,
    PluginConfigEntry,
    PluginConfigStorageAdapter,
    setDefaultPluginConfigStorage,
} from './plugin-config-service'

/** Redact a config with no declaration available (name heuristic only). */
export function safeLocalCopy(config: PluginConfigData): PluginConfigData {
    return redactSecretFields(config, resolveSecretFields(config)).redacted
}

/** Remote API adapter – the only place plaintext credentials may be sent */
export class ApiPluginConfigStorage implements PluginConfigStorageAdapter {
    async load(pluginKey: string): Promise<PluginConfigData | null> {
        try {
            // A missing config is the normal first-use state, not an error:
            // keep the 404 out of the global toast.
            const res = await useApi(APIS.GET_PLUGIN_CONFIG, { pluginKey }, undefined, undefined, true)
            return (res as any)?.data?.config ?? null
        } catch (error) {
            logger.warn('ApiPluginConfigStorage.load failed:', error)
            return null
        }
    }

    async loadAll(): Promise<Record<string, PluginConfigData>> {
        try {
            // An empty config set is the normal first-use state: never toast it.
            const res = await useApi(APIS.GET_ALL_PLUGIN_CONFIGS, undefined, undefined, undefined, true)
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

    async reveal(pluginKey: string): Promise<PluginConfigData | null> {
        try {
            const res = await useApi(APIS.REVEAL_PLUGIN_CONFIG, { pluginKey })
            return (res as any)?.data?.secrets ?? null
        } catch (error) {
            logger.warn('ApiPluginConfigStorage.reveal failed:', error)
            return null
        }
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
                // Sync remote → local. The server already masks credentials, but
                // redact defensively so an older server cannot leak into the
                // client-side copy.
                await this.local.save(pluginKey, remote, safeLocalCopy(remote))
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
                    await this.local.save(key, config, safeLocalCopy(config))
                }
                return remote
            }
        } catch {
            // fall through
        }
        return this.local.loadAll()
    }

    async save(
        pluginKey: string,
        config: PluginConfigData,
        redacted?: PluginConfigData,
    ): Promise<void> {
        // Always save to local first (immediate persistence) — but only the
        // redacted projection ever reaches the client-side copy.
        await this.local.save(pluginKey, config, redacted ?? safeLocalCopy(config))
        // Then sync to remote – propagate errors so callers can show feedback
        await this.api.save(pluginKey, config)
    }

    async migratePlaintextSecret(
        pluginKey: string,
        config: PluginConfigData,
        redacted: PluginConfigData,
    ): Promise<void> {
        // Durable write first: if the server is unreachable, the caller keeps
        // the legacy local copy instead of losing the credential.
        await this.api.save(pluginKey, config)
        await this.local.save(pluginKey, config, redacted)
    }

    reveal(pluginKey: string): Promise<PluginConfigData | null> {
        return this.api.reveal(pluginKey)
    }
}

setDefaultPluginConfigStorage(() => new HybridPluginConfigStorage())
