/**
 * `localStorage` storage backend — the web fallback.
 *
 * Layout: one physical `localStorage` entry per logical entry, keyed
 * `<prefix><namespace>/<key>`. The `/` separator is unambiguous because the
 * namespace grammar (`assertStorageNamespace`) forbids it, and the suffix is the
 * raw storage key (which may itself contain `/`, hence split-on-first-slash).
 *
 * Envelope: `{"v":<value>,"r":rev,"c":createdAt,"u":updatedAt,"e":expiresAt}`.
 *
 * This backend is *not* transactional, so `apply()` re-checks every
 * `expectedRev` precondition before the first write and applies the writes
 * synchronously afterwards — the whole call runs in one task, so a concurrent
 * writer cannot interleave in a browser.
 *
 * A physical entry that is not valid JSON rejects with `STORAGE_CORRUPT` — on
 * `get()` *and* on enumeration (`list`/`keys`/`namespaces`/`info`). Corrupt data
 * is reported rather than silently skipped: a namespace that looks empty
 * because its rows were dropped is worse than a loud failure.
 */

import { createKvStorage, type StorageApply, type StorageBackend, type StorageRow } from './kv-engine';
import { StorageError, type StorageService } from './types';

/** The `localStorage` surface this backend needs (so tests can inject a fake). */
export interface WebStorageLike {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface LocalStorageServiceOptions {
    /** Override the store; defaults to `globalThis.localStorage`. */
    storage?: WebStorageLike;
    /** Injectable clock, for tests. */
    now?: () => number;
}

/** Physical key prefix; versioned so a future layout change cannot collide. */
const PREFIX = 'kn.storage.v1.';

interface Envelope {
    v: unknown;
    r: number;
    c: number;
    u: number;
    e: number | null;
}

/** True when a usable `localStorage` exists (false in SSR/private-mode-denied). */
export function isLocalStorageAvailable(): boolean {
    try {
        const storage = (globalThis as { localStorage?: WebStorageLike }).localStorage;
        if (!storage) return false;
        const probe = '__kn_probe__';
        storage.setItem(probe, '1');
        storage.removeItem(probe);
        return true;
    } catch {
        return false;
    }
}

/** Resolve the store to use, or throw {@link StorageError}. */
function resolveStorage(explicit?: WebStorageLike): WebStorageLike {
    if (explicit) return explicit;
    try {
        const storage = (globalThis as { localStorage?: WebStorageLike }).localStorage;
        if (storage) return storage;
    } catch (error) {
        throw new StorageError(
            'STORAGE_UNAVAILABLE',
            'localStorage is not accessible in this context',
            error instanceof Error ? error.message : undefined,
        );
    }
    throw new StorageError('STORAGE_UNAVAILABLE', 'localStorage is not available in this context');
}

function createLocalStorageBackend(storage: WebStorageLike): StorageBackend {
    const physicalKey = (namespace: string, key: string): string => `${PREFIX}${namespace}/${key}`;

    /** `[namespace, key]` for a physical key that belongs to this backend. */
    const parsePhysicalKey = (raw: string): [string, string] | null => {
        if (!raw.startsWith(PREFIX)) return null;
        const rest = raw.slice(PREFIX.length);
        const separator = rest.indexOf('/');
        if (separator <= 0) return null;
        return [rest.slice(0, separator), rest.slice(separator + 1)];
    };

    const readRow = (namespace: string, key: string): StorageRow | null => {
        const raw = storage.getItem(physicalKey(namespace, key));
        if (raw === null) return null;
        try {
            const envelope = JSON.parse(raw) as Envelope;
            return {
                namespace,
                key,
                value: JSON.stringify(envelope.v),
                rev: Number(envelope.r) || 0,
                createdAt: Number(envelope.c) || 0,
                updatedAt: Number(envelope.u) || 0,
                expiresAt: envelope.e === null || envelope.e === undefined ? null : Number(envelope.e),
            };
        } catch (error) {
            throw new StorageError(
                'STORAGE_CORRUPT',
                `stored value for ${namespace}/${key} is not valid JSON`,
                error instanceof Error ? error.message : undefined,
            );
        }
    };

    const isLive = (row: StorageRow, now: number): boolean => row.expiresAt === null || row.expiresAt > now;

    const allRows = (namespace: string, prefix?: string): StorageRow[] => {
        const rows: StorageRow[] = [];
        for (let index = 0; index < storage.length; index += 1) {
            const raw = storage.key(index);
            if (!raw) continue;
            const parsed = parsePhysicalKey(raw);
            if (!parsed || parsed[0] !== namespace) continue;
            if (prefix && !parsed[1].startsWith(prefix)) continue;
            const row = readRow(namespace, parsed[1]);
            if (row) rows.push(row);
        }
        return rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    };

    const enforce = (changes: StorageApply): void => {
        for (const set of changes.sets) {
            if (set.expectedRev === undefined) continue;
            const current = readRow(set.namespace, set.key);
            if ((current?.rev ?? null) !== set.expectedRev) {
                throw new StorageError(
                    'STORAGE_REV_CONFLICT',
                    `storage rev conflict on ${set.namespace}/${set.key} (expected ${set.expectedRev}, found ${current?.rev ?? 'none'})`,
                );
            }
        }
    };

    return {
        schemaVersion: 1,

        read: readRow,

        apply(changes) {
            enforce(changes);
            for (const set of changes.sets) {
                const envelope: Envelope = {
                    v: JSON.parse(set.value),
                    r: set.rev,
                    c: set.createdAt,
                    u: set.updatedAt,
                    e: set.expiresAt,
                };
                storage.setItem(physicalKey(set.namespace, set.key), JSON.stringify(envelope));
            }
            for (const ref of changes.deletes) {
                storage.removeItem(physicalKey(ref.namespace, ref.key));
            }
        },

        scan(namespace, options) {
            return allRows(namespace, options.prefix)
                .filter((row) => !options.after || row.key > options.after)
                .slice(0, options.limit);
        },

        count(namespace, options) {
            return allRows(namespace, options.prefix).filter((row) => isLive(row, options.now)).length;
        },

        purge(namespace, prefix) {
            const keys = allRows(namespace, prefix).map((row) => row.key);
            for (const key of keys) storage.removeItem(physicalKey(namespace, key));
            return keys.length;
        },

        namespaces(now) {
            const found = new Set<string>();
            for (let index = 0; index < storage.length; index += 1) {
                const raw = storage.key(index);
                if (!raw) continue;
                const parsed = parsePhysicalKey(raw);
                if (!parsed) continue;
                const row = readRow(parsed[0], parsed[1]);
                if (row && isLive(row, now)) found.add(parsed[0]);
            }
            return [...found].sort();
        },

        stats(now) {
            const namespaces = new Set<string>();
            let entries = 0;
            let bytes = 0;
            for (let index = 0; index < storage.length; index += 1) {
                const raw = storage.key(index);
                if (!raw) continue;
                const parsed = parsePhysicalKey(raw);
                if (!parsed) continue;
                const row = readRow(parsed[0], parsed[1]);
                if (!row || !isLive(row, now)) continue;
                namespaces.add(parsed[0]);
                entries += 1;
                bytes += row.value.length;
            }
            return { namespaces: namespaces.size, entries, bytes };
        },
    };
}

/**
 * A durable {@link StorageService} over `localStorage`.
 *
 * Throws `STORAGE_UNAVAILABLE` when no store is reachable — callers should fall
 * back to {@link createMemoryStorage} rather than propagate.
 */
export function createLocalStorageService(options: LocalStorageServiceOptions = {}): StorageService {
    const storage = resolveStorage(options.storage);
    let origin: string | undefined;
    try {
        origin = typeof globalThis.location !== 'undefined' ? globalThis.location.origin : undefined;
    } catch {
        origin = undefined;
    }
    return createKvStorage(createLocalStorageBackend(storage), {
        engine: 'local-storage',
        durable: true,
        ...(origin ? { location: origin } : {}),
        ...(options.now ? { now: options.now } : {}),
    });
}
