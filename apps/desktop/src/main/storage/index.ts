/**
 * Desktop storage capabilities.
 *
 * Owns the per-owner SQLite databases (see `./manager`) and exposes them to the
 * renderer as the `storage.*` capability group. Handlers never throw: they
 * answer with a discriminated envelope so the failure *code* survives the IPC
 * boundary (Electron would flatten a thrown Error into a string), letting the
 * renderer rethrow a proper `StorageError` and degrade deliberately.
 *
 * Layout: `<userData>/storage/v2/app.db` + `.../v2/plugins/<pluginKey>.db`.
 * The pre-v2 `storage/kotion.db` is ignored; a newer/corrupt file is discarded
 * and recreated inside its owner (local data is a cache).
 *
 * When the directory cannot be opened at all, the app still starts: every
 * capability answers `STORAGE_UNAVAILABLE`, and the renderer's storage service
 * degrades to session memory (`durable: false`). Desktop never falls back to
 * `localStorage` — plugin data must not silently move to an evictable store.
 */

import { app, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { StorageManager } from './manager';
import { StorageError, type StorageErrorCode } from './types';

/** What a capability resolves with: a value, or a coded failure. */
export type StorageEnvelope<T> =
    | { ok: true; value: T }
    | { ok: false; code: StorageErrorCode; message: string };

export interface StorageRuntime {
    /** The live manager, or `null` when its directory could not be created. */
    readonly store: StorageManager | null;
    /** Absolute storage root (or `':memory:'`). */
    readonly location: string;
    /** Why `store` is null; absent on success. */
    readonly failure?: string;
    /** Close every database; safe to call twice. */
    dispose(): void;
}

export interface SetupStorageOptions {
    /** Override the storage root (diagnostics/tests). */
    rootDir?: string;
    log?: (message: string) => void;
}

/** `<userData>/storage/v2`, unless overridden by `KN_STORAGE_DIR`. */
export function resolveStorageRoot(): string {
    const override = process.env.KN_STORAGE_DIR;
    if (override && override.trim()) return override.trim();
    return join(app.getPath('userData'), 'storage', 'v2');
}

/** Create the manager and prune expired rows. Never throws. */
export function createStorageRuntime(options: SetupStorageOptions = {}): StorageRuntime {
    const log = options.log ?? ((message: string) => console.log(message));
    const location = options.rootDir ?? resolveStorageRoot();

    let created: StorageManager | null = null;
    try {
        created = new StorageManager({ root: location, log });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[storage] unavailable:', message);
        return { store: null, location, failure: message, dispose: () => {} };
    }
    const manager = created;

    try {
        const pruned = manager.pruneExpired();
        if (pruned > 0) log(`[storage] pruned ${pruned} expired entries`);
    } catch (error) {
        // The app database could not be opened: report the whole channel as
        // unavailable so the renderer degrades to session memory with a reason.
        const message = error instanceof Error ? error.message : String(error);
        console.error('[storage] unavailable:', message);
        manager.close();
        return { store: null, location, failure: message, dispose: () => {} };
    }

    if (location !== ':memory:') {
        const legacy = join(dirname(location), 'kotion.db');
        if (existsSync(legacy)) {
            log(`[storage] legacy database at ${legacy} is ignored by the per-owner layout; it can be deleted`);
        }
    }
    log(`[storage] sqlite ready at ${location} (app.db + plugins/*.db)`);

    return {
        store: manager,
        location,
        dispose: () => manager.close(),
    };
}

/** Wrap a manager call into the success/failure envelope. */
function run<T>(runtime: StorageRuntime, operation: string, fn: (store: StorageManager) => T): StorageEnvelope<T> {
    if (!runtime.store) {
        return {
            ok: false,
            code: 'STORAGE_UNAVAILABLE',
            message: runtime.failure ?? 'desktop storage is unavailable',
        };
    }
    try {
        return { ok: true, value: fn(runtime.store) };
    } catch (error) {
        if (error instanceof StorageError) {
            return { ok: false, code: error.code, message: error.message };
        }
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[storage] ${operation} failed:`, message);
        return { ok: false, code: 'STORAGE_IO', message: `${operation}: ${message}` };
    }
}

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asOptionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;

/** Read `ttlMs`/`expiresAt`/`ifRev` off an IPC payload. */
function readSetOptions(params: Record<string, unknown>): { ttlMs?: number; expiresAt?: number | null; ifRev?: number } {
    const options: { ttlMs?: number; expiresAt?: number | null; ifRev?: number } = {};
    if (typeof params.ttlMs === 'number') options.ttlMs = params.ttlMs;
    if (params.expiresAt === null) options.expiresAt = null;
    else if (typeof params.expiresAt === 'number') options.expiresAt = params.expiresAt;
    if (typeof params.ifRev === 'number') options.ifRev = params.ifRev;
    return options;
}

/** Register every `storage.*` capability against `runtime`. */
export function setupStorageHandlers(options: SetupStorageOptions = {}): StorageRuntime {
    const runtime = createStorageRuntime(options);

    const handle = <T>(capability: string, fn: (params: Record<string, unknown>) => StorageEnvelope<T>): void => {
        ipcMain.handle('desktop:' + capability, (_event, raw) => fn(asRecord(raw)));
    };

    handle('storage.info', () => run(runtime, 'storage.info', (store) => store.info()));

    handle('storage.get', (params) =>
        run(runtime, 'storage.get', (store) =>
            store.get(String(params.namespace ?? ''), String(params.key ?? '')),
        ),
    );

    handle('storage.getMany', (params) =>
        run(runtime, 'storage.getMany', (store) =>
            store.getMany(String(params.namespace ?? ''), Array.isArray(params.keys) ? (params.keys as string[]) : []),
        ),
    );

    handle('storage.set', (params) =>
        run(runtime, 'storage.set', (store) =>
            store.set(
                String(params.namespace ?? ''),
                String(params.key ?? ''),
                params.value,
                readSetOptions(params),
            ),
        ),
    );

    handle('storage.delete', (params) =>
        run(runtime, 'storage.delete', (store) =>
            store.delete(String(params.namespace ?? ''), String(params.key ?? '')),
        ),
    );

    handle('storage.keys', (params) =>
        run(runtime, 'storage.keys', (store) =>
            store.keys(String(params.namespace ?? ''), asOptionalString(params.prefix)),
        ),
    );

    handle('storage.list', (params) =>
        run(runtime, 'storage.list', (store) =>
            store.list({
                namespace: String(params.namespace ?? ''),
                ...(asOptionalString(params.prefix) ? { prefix: params.prefix as string } : {}),
                ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
                cursor: typeof params.cursor === 'string' ? params.cursor : null,
            }),
        ),
    );

    handle('storage.count', (params) =>
        run(runtime, 'storage.count', (store) =>
            store.count(String(params.namespace ?? ''), asOptionalString(params.prefix)),
        ),
    );

    handle('storage.clear', (params) =>
        run(runtime, 'storage.clear', (store) =>
            store.clear(String(params.namespace ?? ''), asOptionalString(params.prefix)),
        ),
    );

    handle('storage.batch', (params) =>
        run(runtime, 'storage.batch', (store) =>
            store.batch(Array.isArray(params.operations) ? (params.operations as never) : []),
        ),
    );

    handle('storage.namespaces', () => run(runtime, 'storage.namespaces', (store) => store.namespaces()));

    console.log('[storage] capability handlers ready' + (runtime.store ? '' : ' (degraded)'));
    return runtime;
}

/** Every capability this module registers. Kept in sync with the preload list. */
export const STORAGE_CAPABILITIES = [
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
] as const;