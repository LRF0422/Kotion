/**
 * Desktop storage capabilities.
 *
 * Owns the SQLite database — the single writer for it — and exposes it to the
 * renderer as the `storage.*` capability group. Handlers never throw: they
 * answer with a discriminated envelope so the failure *code* survives the IPC
 * boundary (Electron would flatten a thrown Error into a string), letting the
 * renderer rethrow a proper `StorageError` and degrade deliberately.
 *
 * When the database cannot be opened at all, the app still starts: every
 * capability answers `STORAGE_UNAVAILABLE` and the renderer falls back to
 * `localStorage`. A broken disk must not brick the app.
 */

import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { SqliteKvStore, openStorageDatabase } from './sqlite-store';
import { StorageError, type StorageErrorCode } from './types';

/** What a capability resolves with: a value, or a coded failure. */
export type StorageEnvelope<T> =
    | { ok: true; value: T }
    | { ok: false; code: StorageErrorCode; message: string };

export interface StorageRuntime {
    /** The live store, or `null` when the database could not be opened. */
    readonly store: SqliteKvStore | null;
    /**
     * The raw connection, shared with the local-first domain repository
     * (`../domain`). `null` whenever `store` is.
     */
    readonly db: Database.Database | null;
    /** Absolute path of the database file (or `':memory:'`). */
    readonly location: string;
    /** Why `store` is null; absent on success. */
    readonly failure?: string;
    /** Close the database; safe to call twice. */
    dispose(): void;
}

export interface SetupStorageOptions {
    /** Override the database path (diagnostics/tests). */
    filePath?: string;
    log?: (message: string) => void;
}

/** `<userData>/storage/kotion.db`, unless overridden by `KN_STORAGE_DB`. */
export function resolveStoragePath(): string {
    const override = process.env.KN_STORAGE_DB;
    if (override && override.trim()) return override.trim();
    return join(app.getPath('userData'), 'storage', 'kotion.db');
}

/** Open the database and prune expired rows. Never throws. */
export function createStorageRuntime(options: SetupStorageOptions = {}): StorageRuntime {
    const log = options.log ?? ((message: string) => console.log(message));
    const location = options.filePath ?? resolveStoragePath();

    let db: Database.Database;
    let recoveredFrom: string | undefined;
    try {
        const opened = openStorageDatabase(location, log);
        db = opened.db;
        recoveredFrom = opened.recoveredFrom;
        if (recoveredFrom) log(`[storage] previous database preserved at ${recoveredFrom}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[storage] unavailable:', message);
        return {
            store: null,
            db: null,
            location,
            failure: message,
            dispose: () => {},
        };
    }

    const store = new SqliteKvStore(db, { location });
    try {
        const pruned = store.pruneExpired();
        if (pruned > 0) log(`[storage] pruned ${pruned} expired entries`);
    } catch (error) {
        // Pruning is opportunistic; a failure here must not block startup.
        console.warn('[storage] prune failed:', error);
    }
    log(`[storage] sqlite ready at ${location}`);

    return {
        store,
        db,
        location,
        dispose: () => store.close(),
    };
}

/** Wrap a store call into the success/failure envelope. */
function run<T>(runtime: StorageRuntime, operation: string, fn: (store: SqliteKvStore) => T): StorageEnvelope<T> {
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
