/**
 * `StorageService` over the desktop capability bridge.
 *
 * The main process answers `storage.*` with a `{ok, value} | {ok, code,
 * message}` envelope (Electron flattens a thrown handler error into a string,
 * which would lose the code). This module translates the envelope back into
 * values and {@link StorageError}s, so callers see exactly the same contract as
 * the browser implementation.
 *
 * `createStorageBridge` returns `undefined` when the build exposes no storage
 * capabilities, so `@kn/core` can fall back to `localStorage`.
 */

import type {
    DesktopCapability,
    DesktopCapabilityContract,
    DesktopStorageEnvelope,
    StorageBatchOperation,
    StorageBatchResult,
    StorageEntry,
    StorageErrorCode,
    StorageInfo,
    StorageListOptions,
    StorageListResult,
    StorageScope,
    StorageService,
    StorageSetOptions,
} from '@kn/common'
import { StorageError } from '@kn/common'

/** The slice of the preload host this module needs. */
export interface StorageHostBridge {
    readonly capabilities: readonly string[]
    invoke(capability: string, params?: unknown): Promise<unknown>
}

/** Capabilities that must all be present for `desktop.storage` to exist. */
const STORAGE_CAPABILITIES: DesktopCapability[] = [
    'storage.info',
    'storage.get',
    'storage.getMany',
    'storage.set',
    'storage.delete',
    'storage.keys',
    'storage.list',
    'storage.count',
    'storage.clear',
    'storage.batch',
    'storage.namespaces',
]

/** Turn a failure envelope into the error the contract promises. */
function unwrap<T>(envelope: DesktopStorageEnvelope<T> | undefined, operation: string): T {
    if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
        if (envelope.ok) return envelope.value
        throw new StorageError(envelope.code as StorageErrorCode, envelope.message)
    }
    throw new StorageError('STORAGE_IO', `${operation}: malformed reply from the desktop main process`)
}

export function createStorageBridge(
    host: StorageHostBridge,
    capabilities: readonly string[],
): StorageService | undefined {
    if (!STORAGE_CAPABILITIES.every((capability) => capabilities.includes(capability))) return undefined

    const invoke = <C extends DesktopCapability>(
        capability: C,
        params?: DesktopCapabilityContract[C]['params'],
    ): Promise<DesktopCapabilityContract[C]['result']> =>
        host.invoke(capability, params) as Promise<DesktopCapabilityContract[C]['result']>

    // `info()` is the only call whose result is cached: it is what a settings
    // panel polls, it opens the database, and it cannot be made stale in a way
    // that matters (the descriptor does not change while the app runs).
    let cachedInfo: StorageInfo | undefined

    const service: StorageService = {
        engine: 'sqlite',
        durable: true,

        async info(): Promise<StorageInfo> {
            if (cachedInfo) return cachedInfo
            const info = unwrap(await invoke('storage.info'), 'storage.info')
            cachedInfo = info
            return info
        },

        async get<T>(namespace: string, key: string): Promise<StorageEntry<T> | null> {
            return unwrap(await invoke('storage.get', { namespace, key }), 'storage.get') as StorageEntry<T> | null
        },

        async getMany<T>(namespace: string, keys: string[]): Promise<Array<StorageEntry<T>>> {
            return unwrap(await invoke('storage.getMany', { namespace, keys }), 'storage.getMany') as Array<
                StorageEntry<T>
            >
        },

        async set<T>(namespace: string, key: string, value: T, options?: StorageSetOptions): Promise<StorageEntry<T>> {
            return unwrap(
                await invoke('storage.set', { namespace, key, value, ...(options ?? {}) }),
                'storage.set',
            ) as StorageEntry<T>
        },

        async delete(namespace: string, key: string): Promise<boolean> {
            return unwrap(await invoke('storage.delete', { namespace, key }), 'storage.delete')
        },

        async keys(namespace: string, prefix?: string): Promise<string[]> {
            return unwrap(await invoke('storage.keys', { namespace, ...(prefix ? { prefix } : {}) }), 'storage.keys')
        },

        async list<T>(options: StorageListOptions): Promise<StorageListResult<T>> {
            return unwrap(await invoke('storage.list', options), 'storage.list') as StorageListResult<T>
        },

        async count(namespace: string, prefix?: string): Promise<number> {
            return unwrap(
                await invoke('storage.count', { namespace, ...(prefix ? { prefix } : {}) }),
                'storage.count',
            )
        },

        async clear(namespace: string, prefix?: string): Promise<number> {
            return unwrap(
                await invoke('storage.clear', { namespace, ...(prefix ? { prefix } : {}) }),
                'storage.clear',
            )
        },

        async batch(operations: StorageBatchOperation[]): Promise<StorageBatchResult> {
            return unwrap(await invoke('storage.batch', { operations }), 'storage.batch')
        },

        async namespaces(): Promise<string[]> {
            return unwrap(await invoke('storage.namespaces'), 'storage.namespaces')
        },

        scope(namespace: string): StorageScope {
            return {
                namespace,
                get: (key) => service.get(namespace, key),
                getMany: (keys) => service.getMany(namespace, keys),
                set: (key, value, options) => service.set(namespace, key, value, options),
                delete: (key) => service.delete(namespace, key),
                keys: (prefix) => service.keys(namespace, prefix),
                list: (listOptions) => service.list({ namespace, ...(listOptions ?? {}) }),
                count: (prefix) => service.count(namespace, prefix),
                clear: (prefix) => service.clear(namespace, prefix),
            }
        },
        // No `dispose`: the main process owns the database handle, and a
        // renderer reload must not close it.
    }

    return service
}
