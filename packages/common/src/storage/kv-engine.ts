/**
 * Generic key-value engine over a minimal {@link StorageBackend}.
 *
 * All cross-implementation semantics live here — namespace/key validation, JSON
 * encoding, revision arithmetic, TTL, cursors, compare-and-set, error mapping —
 * so an implementation only has to move rows around. The browser
 * (`localStorage`) and in-memory services are thin backends on top of this
 * engine; the desktop main process implements the same semantics natively in
 * SQL (see `apps/desktop/src/main/storage/kv-store.ts`) because it can push
 * ordering, counting and compare-and-set into the database instead of reading
 * rows into JavaScript.
 */

import {
    STORAGE_DEFAULT_LIST_LIMIT,
    STORAGE_MAX_LIST_LIMIT,
    STORAGE_MAX_VALUE_BYTES,
    StorageError,
    assertStorageKey,
    assertStorageNamespace,
    type StorageBackendMeta,
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

/** One physical row, as the backend stores it. `value` is already JSON text. */
export interface StorageRow {
    namespace: string;
    key: string;
    value: string;
    rev: number;
    createdAt: number;
    updatedAt: number;
    /** Epoch ms, or `null` for "never expires". */
    expiresAt: number | null;
}

/** A row write plus the revision precondition the backend must enforce. */
export interface StorageSetChange extends StorageRow {
    /**
     * `null` = no physical row may exist yet, a number = the stored (physical)
     * revision must match, `undefined` = unconditional. The engine always sends
     * a precondition so a concurrent writer cannot cause a duplicate `rev`.
     *
     * Note "physical": an expired row still occupies its key, so a write that
     * logically restarts at `rev: 1` carries the *old* row's revision here.
     */
    expectedRev?: number | null;
}

/** One atomic unit of change handed to the backend. */
export interface StorageApply {
    sets: StorageSetChange[];
    deletes: Array<{ namespace: string; key: string }>;
}

/** Values a backend may return synchronously or as a promise. */
export type MaybePromise<T> = T | Promise<T>;

/** What {@link createKvStorage} needs from a backend. */
export interface StorageBackend {
    /** Format version of the backing store, surfaced by `info().schemaVersion`. */
    readonly schemaVersion: number;
    read(namespace: string, key: string): MaybePromise<StorageRow | null>;
    /**
     * Apply every set and delete, atomically where the backend can transact.
     * Must reject with a {@link StorageError} when an `expectedRev` precondition
     * fails, and must not apply *any* change in that case.
     */
    apply(changes: StorageApply): MaybePromise<void>;
    /** Rows in ascending key order, keys strictly greater than `after`. */
    scan(
        namespace: string,
        options: { prefix?: string; after?: string | null; limit: number; now: number },
    ): MaybePromise<StorageRow[]>;
    /** Live entry count (`now` filters expired rows). */
    count(namespace: string, options: { prefix?: string; now: number }): MaybePromise<number>;
    /** Delete every row matching the prefix; resolves the number removed. */
    purge(namespace: string, prefix?: string): MaybePromise<number>;
    /** Namespaces holding at least one live row. */
    namespaces(now: number): MaybePromise<string[]>;
    stats(now: number): MaybePromise<{ namespaces: number; entries: number; bytes: number | null }>;
    dispose?(): MaybePromise<void>;
}

/** Non-backend facts about the resulting service. */
export interface KvStorageOptions extends StorageBackendMeta {
    /** Injectable clock, for tests. */
    now?: () => number;
}

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/** UTF-8 byte length, without Buffer (this code also runs in the renderer). */
export function utf8ByteLength(text: string): number {
    if (encoder) return encoder.encode(text).length;
    // Every environment that matters has TextEncoder; this is a last resort.
    return unescape(encodeURIComponent(text)).length;
}

/** Reject anything JSON cannot round-trip, before it reaches the backend. */
function encodeValue(value: unknown): string {
    if (value === undefined) {
        throw new StorageError('STORAGE_INVALID_VALUE', 'storage value must not be undefined (delete the key instead)');
    }
    let json: string | undefined;
    try {
        json = JSON.stringify(value, (_key, entry: unknown) => {
            if (typeof entry === 'bigint') {
                throw new StorageError('STORAGE_INVALID_VALUE', 'storage value must not contain a bigint');
            }
            if (typeof entry === 'function' || typeof entry === 'symbol') {
                throw new StorageError('STORAGE_INVALID_VALUE', 'storage value must be JSON-serializable');
            }
            if (typeof entry === 'number' && !Number.isFinite(entry)) {
                throw new StorageError('STORAGE_INVALID_VALUE', 'storage value must not contain NaN or Infinity');
            }
            return entry;
        });
    } catch (error) {
        if (StorageError.is(error)) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new StorageError('STORAGE_INVALID_VALUE', 'storage value must be JSON-serializable', detail);
    }
    if (json === undefined) {
        throw new StorageError('STORAGE_INVALID_VALUE', 'storage value must be JSON-serializable');
    }
    const bytes = utf8ByteLength(json);
    if (bytes > STORAGE_MAX_VALUE_BYTES) {
        throw new StorageError(
            'STORAGE_INVALID_VALUE',
            `storage value is ${bytes} bytes, over the ${STORAGE_MAX_VALUE_BYTES} byte limit`,
        );
    }
    return json;
}

/** Turn a backend failure into a stable code without losing the detail. */
export function mapBackendError(error: unknown, context: string): StorageError {
    if (StorageError.is(error)) return error;
    const detail = error instanceof Error ? error.message : String(error);
    if (/quota|sqlite_full|enospc|no space/i.test(detail)) {
        return new StorageError('STORAGE_QUOTA_EXCEEDED', `${context}: storage is full`, detail);
    }
    if (/corrupt|not a database|malformed/i.test(detail)) {
        return new StorageError('STORAGE_CORRUPT', `${context}: storage data is unreadable`, detail);
    }
    return new StorageError('STORAGE_IO', `${context}: ${detail}`, detail);
}

function decodeRow<T>(row: StorageRow): StorageEntry<T> {
    let value: unknown;
    try {
        value = JSON.parse(row.value);
    } catch {
        throw new StorageError(
            'STORAGE_CORRUPT',
            `stored value for ${row.namespace}/${row.key} is not valid JSON`,
        );
    }
    const entry: StorageEntry<T> = {
        namespace: row.namespace,
        key: row.key,
        value: value as T,
        rev: row.rev,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
    if (row.expiresAt !== null) entry.expiresAt = row.expiresAt;
    return entry;
}

function resolveExpiry(options: StorageSetOptions, now: number): number | null {
    if (options.expiresAt !== undefined) {
        if (options.expiresAt === null) return null;
        if (!Number.isFinite(options.expiresAt)) {
            throw new StorageError('STORAGE_INVALID_VALUE', 'expiresAt must be an epoch timestamp or null');
        }
        return options.expiresAt;
    }
    if (options.ttlMs !== undefined) {
        if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
            throw new StorageError('STORAGE_INVALID_VALUE', 'ttlMs must be a positive number of milliseconds');
        }
        return now + options.ttlMs;
    }
    return null;
}

/**
 * Build a {@link StorageService} on top of `backend`.
 *
 * `meta.engine` / `meta.durable` / `meta.location` describe the backend for
 * `info()`; everything else is derived from the data.
 */
export function createKvStorage(backend: StorageBackend, meta: KvStorageOptions): StorageService {
    const now = meta.now ?? (() => Date.now());

    const readRow = async (namespace: string, key: string): Promise<StorageRow | null> => {
        try {
            return await backend.read(namespace, key);
        } catch (error) {
            throw mapBackendError(error, `storage read ${namespace}/${key}`);
        }
    };

    const isLive = (row: StorageRow, at: number): boolean => row.expiresAt === null || row.expiresAt > at;

    /** Shared by `set` and `batch`: validate, encode and compute the next row. */
    const prepareSet = async (
        namespace: string,
        key: string,
        value: unknown,
        options: StorageSetOptions,
        at: number,
    ): Promise<{ change: StorageSetChange; entry: StorageEntry }> => {
        const json = encodeValue(value);
        const current = await readRow(namespace, key);
        const liveCurrent = current && isLive(current, at) ? current : null;
        // An expired row is logically absent: its revision does not carry over,
        // so `ifRev: 0` (create-if-absent) succeeds after a TTL lapse.
        const currentRev = liveCurrent?.rev ?? 0;
        if (options.ifRev !== undefined && options.ifRev !== currentRev) {
            throw new StorageError(
                'STORAGE_REV_CONFLICT',
                `storage write ${namespace}/${key} expected rev ${options.ifRev} but found ${currentRev}`,
            );
        }
        const rev = currentRev + 1;
        const createdAt = liveCurrent?.createdAt ?? at;
        const change: StorageSetChange = {
            namespace,
            key,
            value: json,
            rev,
            createdAt,
            updatedAt: at,
            expiresAt: resolveExpiry(options, at),
            // The precondition always names the *physical* row revision, not
            // the logical one: backends enforce it without knowing about TTL,
            // and rev restarting after an expiry is the engine's business.
            expectedRev: current ? current.rev : null,
        };
        const entry: StorageEntry = {
            namespace,
            key,
            value,
            rev,
            createdAt,
            updatedAt: at,
            ...(change.expiresAt !== null ? { expiresAt: change.expiresAt } : {}),
        };
        return { change, entry };
    };

    const service: StorageService = {
        engine: meta.engine,
        durable: meta.durable,

        async info(): Promise<StorageInfo> {
            const at = now();
            try {
                const stats = await backend.stats(at);
                return {
                    engine: meta.engine,
                    durable: meta.durable,
                    ...(meta.location ? { location: meta.location } : {}),
                    schemaVersion: backend.schemaVersion,
                    namespaces: stats.namespaces,
                    entries: stats.entries,
                    bytes: stats.bytes,
                };
            } catch (error) {
                throw mapBackendError(error, 'storage info');
            }
        },

        async get<T>(namespace: string, key: string): Promise<StorageEntry<T> | null> {
            assertStorageNamespace(namespace);
            assertStorageKey(key);
            const row = await readRow(namespace, key);
            if (!row || !isLive(row, now())) return null;
            return decodeRow<T>(row);
        },

        async getMany<T>(namespace: string, keys: string[]): Promise<Array<StorageEntry<T>>> {
            assertStorageNamespace(namespace);
            if (!Array.isArray(keys)) {
                throw new StorageError('STORAGE_INVALID_KEY', 'storage getMany expects an array of keys');
            }
            const at = now();
            const entries: Array<StorageEntry<T>> = [];
            for (const key of keys) {
                assertStorageKey(key);
                const row = await readRow(namespace, key);
                if (row && isLive(row, at)) entries.push(decodeRow<T>(row));
            }
            return entries;
        },

        async set<T>(namespace: string, key: string, value: T, options: StorageSetOptions = {}): Promise<StorageEntry<T>> {
            assertStorageNamespace(namespace);
            assertStorageKey(key);
            const { change, entry } = await prepareSet(namespace, key, value, options, now());
            try {
                await backend.apply({ sets: [change], deletes: [] });
            } catch (error) {
                throw mapBackendError(error, `storage write ${namespace}/${key}`);
            }
            return entry as StorageEntry<T>;
        },

        async delete(namespace: string, key: string): Promise<boolean> {
            assertStorageNamespace(namespace);
            assertStorageKey(key);
            try {
                await backend.apply({ sets: [], deletes: [{ namespace, key }] });
            } catch (error) {
                throw mapBackendError(error, `storage delete ${namespace}/${key}`);
            }
            // The backend owns existence; re-reading would cost a second round
            // trip over IPC. Callers treat `false` as "nothing to do" anyway.
            return true;
        },

        async keys(namespace: string, prefix?: string): Promise<string[]> {
            assertStorageNamespace(namespace);
            const at = now();
            const rows = await scanAll(namespace, prefix, at);
            return rows.map((row) => row.key);
        },

        async list<T>(options: StorageListOptions): Promise<StorageListResult<T>> {
            assertStorageNamespace(options.namespace);
            const limit = clampLimit(options.limit);
            const at = now();
            try {
                const rows = await backend.scan(options.namespace, {
                    ...(options.prefix ? { prefix: options.prefix } : {}),
                    after: options.cursor ?? null,
                    limit,
                    now: at,
                });
                const entries = rows.filter((row) => isLive(row, at)).map((row) => decodeRow<T>(row));
                const last = rows[rows.length - 1];
                return {
                    entries,
                    cursor: rows.length === limit && last ? last.key : null,
                };
            } catch (error) {
                throw mapBackendError(error, `storage list ${options.namespace}`);
            }
        },

        async count(namespace: string, prefix?: string): Promise<number> {
            assertStorageNamespace(namespace);
            try {
                return await backend.count(namespace, { ...(prefix ? { prefix } : {}), now: now() });
            } catch (error) {
                throw mapBackendError(error, `storage count ${namespace}`);
            }
        },

        async clear(namespace: string, prefix?: string): Promise<number> {
            assertStorageNamespace(namespace);
            try {
                return await backend.purge(namespace, prefix);
            } catch (error) {
                throw mapBackendError(error, `storage clear ${namespace}`);
            }
        },

        async batch(operations: StorageBatchOperation[]): Promise<StorageBatchResult> {
            if (!Array.isArray(operations) || operations.length === 0) {
                return { written: 0, deleted: 0 };
            }
            const at = now();
            const sets: StorageSetChange[] = [];
            const deletes: Array<{ namespace: string; key: string }> = [];
            for (const operation of operations) {
                if (!operation || typeof operation !== 'object') {
                    throw new StorageError('STORAGE_INVALID_VALUE', 'storage batch entries must be objects');
                }
                assertStorageNamespace(operation.namespace);
                assertStorageKey(operation.key);
                if (operation.type === 'delete') {
                    deletes.push({ namespace: operation.namespace, key: operation.key });
                    continue;
                }
                if (operation.type !== 'set') {
                    // Untrusted callers (IPC) can send anything; keep the type
                    // check even though the union makes it unreachable in TS.
                    const unknownType = String((operation as { type?: unknown }).type);
                    throw new StorageError('STORAGE_INVALID_VALUE', `unknown storage batch operation "${unknownType}"`);
                }
                const { change } = await prepareSet(
                    operation.namespace,
                    operation.key,
                    operation.value,
                    operation,
                    at,
                );
                sets.push(change);
            }
            try {
                await backend.apply({ sets, deletes });
            } catch (error) {
                throw mapBackendError(error, 'storage batch');
            }
            return { written: sets.length, deleted: deletes.length };
        },

        async namespaces(): Promise<string[]> {
            try {
                return await backend.namespaces(now());
            } catch (error) {
                throw mapBackendError(error, 'storage namespaces');
            }
        },

        scope(namespace: string): StorageScope {
            const bound = assertStorageNamespace(namespace);
            return {
                namespace: bound,
                get: (key) => service.get(bound, key),
                getMany: (keys) => service.getMany(bound, keys),
                set: (key, value, options) => service.set(bound, key, value, options),
                delete: (key) => service.delete(bound, key),
                keys: (prefix) => service.keys(bound, prefix),
                list: (listOptions) => service.list({ namespace: bound, ...(listOptions ?? {}) }),
                count: (prefix) => service.count(bound, prefix),
                clear: (prefix) => service.clear(bound, prefix),
            };
        },

        dispose: backend.dispose
            ? () => {
                  try {
                      void backend.dispose?.();
                  } catch {
                      // Shutdown must never throw.
                  }
              }
            : undefined,
    };

    async function scanAll(namespace: string, prefix: string | undefined, at: number): Promise<StorageRow[]> {
        const rows: StorageRow[] = [];
        let after: string | null = null;
        for (;;) {
            let page: StorageRow[];
            try {
                page = await backend.scan(namespace, {
                    ...(prefix ? { prefix } : {}),
                    after,
                    limit: STORAGE_MAX_LIST_LIMIT,
                    now: at,
                });
            } catch (error) {
                throw mapBackendError(error, `storage keys ${namespace}`);
            }
            const live = page.filter((row) => isLive(row, at));
            rows.push(...live);
            if (page.length < STORAGE_MAX_LIST_LIMIT) return rows;
            const last = page[page.length - 1];
            if (!last || last.key === after) return rows;
            after = last.key;
        }
    }

    return service;
}

function clampLimit(limit: number | undefined): number {
    if (limit === undefined) return STORAGE_DEFAULT_LIST_LIMIT;
    if (!Number.isFinite(limit)) return STORAGE_DEFAULT_LIST_LIMIT;
    return Math.min(Math.max(Math.floor(limit), 1), STORAGE_MAX_LIST_LIMIT);
}
