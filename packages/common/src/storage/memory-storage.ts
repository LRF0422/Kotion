/**
 * In-memory storage backend.
 *
 * Two jobs:
 *   1. **Fallback** — SSR, tests and a browser with `localStorage` disabled
 *      still get a working `StorageService` instead of a crash.
 *   2. **Reference implementation** — the semantics in `kv-engine.ts` are
 *      pinned by a self-test (`storage.check.ts`) running on this backend, so
 *      the SQLite implementation has something to be compared against.
 *
 * `durable: false` and `engine: 'memory'` make the degradation visible to
 * callers through `info()`.
 */

import { createKvStorage, type StorageApply, type StorageBackend, type StorageRow } from './kv-engine';
import { StorageError, type StorageService } from './types';

export interface MemoryStorageOptions {
    /** Injectable clock, for tests. */
    now?: () => number;
}

/** Row key that cannot collide: namespaces and keys never contain NUL. */
const rowId = (namespace: string, key: string): string => `${namespace}\u0000${key}`;

/**
 * Backend over a plain `Map`.
 *
 * `scan()` sorts the namespace's keys on every call — fine for the tens-to-
 * thousands of entries this backend is meant for, and it keeps the "no hidden
 * state" property that makes it useful as a reference.
 */
export function createMemoryBackend(): StorageBackend {
    const rows = new Map<string, StorageRow>();

    const keysOf = (namespace: string, prefix?: string): string[] => {
        const prefixWithSeparator = prefix ?? '';
        const keys: string[] = [];
        for (const row of rows.values()) {
            if (row.namespace !== namespace) continue;
            if (prefixWithSeparator && !row.key.startsWith(prefixWithSeparator)) continue;
            keys.push(row.key);
        }
        return keys.sort();
    };

    const isLive = (row: StorageRow, now: number): boolean => row.expiresAt === null || row.expiresAt > now;

    return {
        schemaVersion: 1,

        read(namespace, key) {
            return rows.get(rowId(namespace, key)) ?? null;
        },

        apply(changes: StorageApply) {
            // Validate every precondition before mutating anything, so a
            // rejected batch leaves the store untouched.
            for (const set of changes.sets) {
                const current = rows.get(rowId(set.namespace, set.key)) ?? null;
                if (set.expectedRev !== undefined && (current?.rev ?? null) !== set.expectedRev) {
                    throw new StorageError(
                        'STORAGE_REV_CONFLICT',
                        `storage rev conflict on ${set.namespace}/${set.key} (expected ${set.expectedRev}, found ${current?.rev ?? 'none'})`,
                    );
                }
            }
            for (const set of changes.sets) {
                rows.set(rowId(set.namespace, set.key), {
                    namespace: set.namespace,
                    key: set.key,
                    value: set.value,
                    rev: set.rev,
                    createdAt: set.createdAt,
                    updatedAt: set.updatedAt,
                    expiresAt: set.expiresAt,
                });
            }
            for (const ref of changes.deletes) {
                rows.delete(rowId(ref.namespace, ref.key));
            }
        },

        scan(namespace, options) {
            const keys = keysOf(namespace, options.prefix).filter((key) => !options.after || key > options.after);
            const page = keys.slice(0, options.limit);
            return page
                .map((key) => rows.get(rowId(namespace, key)))
                .filter((row): row is StorageRow => Boolean(row));
        },

        count(namespace, options) {
            return keysOf(namespace, options.prefix).filter((key) => {
                const row = rows.get(rowId(namespace, key));
                return row ? isLive(row, options.now) : false;
            }).length;
        },

        purge(namespace, prefix) {
            const keys = keysOf(namespace, prefix);
            for (const key of keys) rows.delete(rowId(namespace, key));
            return keys.length;
        },

        namespaces(now) {
            const found = new Set<string>();
            for (const row of rows.values()) {
                if (isLive(row, now)) found.add(row.namespace);
            }
            return [...found].sort();
        },

        stats(now) {
            const live = [...rows.values()].filter((row) => isLive(row, now));
            const namespaces = new Set(live.map((row) => row.namespace));
            return {
                namespaces: namespaces.size,
                entries: live.length,
                bytes: live.reduce((total, row) => total + row.value.length, 0),
            };
        },
    };
}

/** A non-durable {@link StorageService}; data dies with the page/process. */
export function createMemoryStorage(options: MemoryStorageOptions = {}): StorageService {
    return createKvStorage(createMemoryBackend(), {
        engine: 'memory',
        durable: false,
        location: 'memory',
        ...(options.now ? { now: options.now } : {}),
    });
}
