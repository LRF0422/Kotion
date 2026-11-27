/**
 * Degradation wrapper for a storage backend.
 *
 * Desktop storage is SQLite or nothing: writing plugin data to `localStorage`
 * on Electron was worse than failing, because it silently moved the data to a
 * different (and evictable) store while `durable` still said `true`.
 *
 * This decorator keeps the primary (SQLite-over-IPC) service as the only
 * durable target. If the host answers `STORAGE_UNAVAILABLE` — the database
 * could not be opened, was moved aside, or the disk is unreadable — the
 * service switches once to `fallback` (session memory) and retries the same
 * call there. From that moment:
 *
 *   - `engine` reports the fallback's engine (`memory`),
 *   - `durable` is `false`, so consumers can tell the user that the data will
 *     not survive a restart,
 *   - `degradedReason` carries the host's message for diagnostics.
 *
 * Only `STORAGE_UNAVAILABLE` degrades. Validation errors, revision conflicts
 * and quota errors are the caller's problem and must not silently move data to
 * another backend.
 */

import {
    StorageError,
    type StorageBatchOperation,
    type StorageBatchResult,
    type StorageEntry,
    type StorageInfo,
    type StorageListOptions,
    type StorageListResult,
    type StorageScope,
    type StorageService,
    type StorageSetOptions,
} from './types';

/** What callers can observe about a degraded service. */
export interface ResilientStorageService extends StorageService {
    /** Why the primary was abandoned; `undefined` while it is healthy. */
    readonly degradedReason?: string;
}

export interface ResilientStorageOptions {
    /** Called once, when the primary reports `STORAGE_UNAVAILABLE`. */
    onDegrade?: (error: StorageError) => void;
}

/** True for the one failure that means "this backend is gone". */
function isUnavailable(error: unknown): error is StorageError {
    return StorageError.is(error) && error.code === 'STORAGE_UNAVAILABLE';
}

/**
 * Wrap `primary` so a missing database degrades to `fallback` instead of
 * taking every caller down with it.
 *
 * `fallback` is usually `createMemoryStorage()`: it keeps the session working
 * while `durable` tells the truth. Never pass a `localStorage` service here on
 * desktop — that is the behaviour this wrapper exists to prevent.
 */
export function createResilientStorage(
    primary: StorageService,
    fallback: StorageService,
    options: ResilientStorageOptions = {},
): ResilientStorageService {
    let active: StorageService = primary;
    let degradation: StorageError | undefined;

    const degrade = (error: StorageError): void => {
        if (degradation) return;
        degradation = error;
        active = fallback;
        try {
            options.onDegrade?.(error);
        } catch {
            // A diagnostic callback must never break the retry.
        }
    };

    /** Run against the active backend, switching once on `STORAGE_UNAVAILABLE`. */
    const run = async <T>(operation: (target: StorageService) => Promise<T>): Promise<T> => {
        try {
            return await operation(active);
        } catch (error) {
            if (active !== primary || !isUnavailable(error)) throw error;
            degrade(error);
            return operation(active);
        }
    };

    const service: ResilientStorageService = {
        get engine() {
            return active.engine;
        },
        get durable() {
            return active.durable;
        },
        get degradedReason() {
            return degradation?.message;
        },

        info: (): Promise<StorageInfo> => run((target) => target.info()),

        get<T>(namespace: string, key: string): Promise<StorageEntry<T> | null> {
            return run((target) => target.get<T>(namespace, key));
        },

        getMany<T>(namespace: string, keys: string[]): Promise<Array<StorageEntry<T>>> {
            return run((target) => target.getMany<T>(namespace, keys));
        },

        set<T>(namespace: string, key: string, value: T, setOptions?: StorageSetOptions): Promise<StorageEntry<T>> {
            return run((target) => target.set<T>(namespace, key, value, setOptions));
        },

        delete(namespace: string, key: string): Promise<boolean> {
            return run((target) => target.delete(namespace, key));
        },

        keys(namespace: string, prefix?: string): Promise<string[]> {
            return run((target) => target.keys(namespace, prefix));
        },

        list<T>(listOptions: StorageListOptions): Promise<StorageListResult<T>> {
            return run((target) => target.list<T>(listOptions));
        },

        count(namespace: string, prefix?: string): Promise<number> {
            return run((target) => target.count(namespace, prefix));
        },

        clear(namespace: string, prefix?: string): Promise<number> {
            return run((target) => target.clear(namespace, prefix));
        },

        batch(operations: StorageBatchOperation[]): Promise<StorageBatchResult> {
            return run((target) => target.batch(operations));
        },

        namespaces(): Promise<string[]> {
            return run((target) => target.namespaces());
        },

        scope(namespace: string): StorageScope {
            // Bind through the wrapper, not through `active`: a write after a
            // degradation must go to the fallback, and a scope created while
            // healthy must keep working after it.
            return {
                namespace,
                get: (key) => service.get(namespace, key),
                getMany: (keys) => service.getMany(namespace, keys),
                set: (key, value, setOptions) => service.set(namespace, key, value, setOptions),
                delete: (key) => service.delete(namespace, key),
                keys: (prefix) => service.keys(namespace, prefix),
                list: (listOptions) => service.list({ namespace, ...(listOptions ?? {}) }),
                count: (prefix) => service.count(namespace, prefix),
                clear: (prefix) => service.clear(namespace, prefix),
            };
        },

        dispose: () => {
            try {
                active.dispose?.();
            } catch {
                // Shutdown must never throw.
            }
        },
    };

    return service;
}
