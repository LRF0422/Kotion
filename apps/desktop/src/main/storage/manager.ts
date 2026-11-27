/**
 * Routes storage namespaces to per-owner SQLite databases.
 *
 *     <root>/app.db             app.* namespaces (the shell)
 *     <root>/plugins/<key>.db   plugin.<key>.* namespaces (one file per plugin)
 *
 * Why per owner: a single database meant a single schema version for everything.
 * A feature worktree that upgraded `kotion.db` to v4 made the main build's whole
 * storage channel `STORAGE_UNAVAILABLE`, and one unreadable file would have
 * taken every plugin with it. Now:
 *
 *  - a schema/version problem has a blast radius of one owner, not the channel;
 *  - an unusable file is discarded and recreated (see `openStorageDatabase`),
 *    so the app and the other plugins keep working;
 *  - a plugin's data can be reset or removed without touching anything else;
 *  - the app shell's KV and the local-first domain database are separate files,
 *    so branches with different migrations cannot collide.
 *
 * The contract above this layer does not change: `StorageService`, the
 * `storage.*` capabilities and `usePluginStorage()` keep the same shape.
 */

import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SCHEMA_VERSION } from './schema';
import { SqliteKvStore, openStorageDatabase, type BatchOperation } from './sqlite-store';
import {
    StorageError,
    assertNamespace,
    mapSqliteError,
    type StorageBatchResult,
    type StorageEntry,
    type StorageInfo,
    type StorageListOptions,
    type StorageSetOptions,
} from './types';

/** One storage owner: the shell, or one plugin. */
export interface StorageOwner {
    readonly kind: 'app' | 'plugin';
    /** `'app'` for the shell, the plugin key for a plugin. */
    readonly key: string;
}

export interface StorageManagerOptions {
    /** Directory holding `app.db` and `plugins/<key>.db`, or `':memory:'`. */
    root: string;
    /** Injectable clock, for tests. */
    now?: () => number;
    log?: (message: string) => void;
}

interface OpenDatabase {
    owner: StorageOwner;
    file: string;
    store: SqliteKvStore;
}

/**
 * Which database owns `namespace`.
 *
 * Only `app.*` and `plugin.<pluginKey>.*` are addressable. A namespace outside
 * those roots is rejected instead of silently landing in the app database.
 */
export function storageOwnerForNamespace(namespace: string): StorageOwner {
    const normalized = assertNamespace(namespace);
    const [root, second] = normalized.split('.');
    if (root === 'app') return { kind: 'app', key: 'app' };
    if (root === 'plugin' && second) return { kind: 'plugin', key: second };
    throw new StorageError(
        'STORAGE_INVALID_NAMESPACE',
        `storage namespace "${normalized}" must be app.* or plugin.<pluginKey>.*`,
    );
}

/** One database per owner, opened lazily and kept for the process lifetime. */
export class StorageManager {
    private readonly root: string;
    private readonly clock: () => number;
    private readonly log: (message: string) => void;
    private readonly databases = new Map<string, OpenDatabase>();
    private closed = false;

    constructor(options: StorageManagerOptions) {
        this.root = options.root;
        this.clock = options.now ?? (() => Date.now());
        this.log = options.log ?? (() => {});
        if (this.root !== ':memory:') {
            // Fail here (not on the first write) when the data directory is not
            // writable: the runtime then reports the whole channel unavailable
            // and the renderer degrades to session memory.
            mkdirSync(join(this.root, 'plugins'), { recursive: true });
        }
    }

    // ---- routing -----------------------------------------------------------

    private ownerId(owner: StorageOwner): string {
        return owner.kind === 'app' ? 'app' : `plugin.${owner.key}`;
    }

    private fileFor(owner: StorageOwner): string {
        if (this.root === ':memory:') return ':memory:';
        return owner.kind === 'app'
            ? join(this.root, 'app.db')
            : join(this.root, 'plugins', `${owner.key}.db`);
    }

    private storeFor(owner: StorageOwner): SqliteKvStore {
        if (this.closed) throw new StorageError('STORAGE_UNAVAILABLE', 'storage manager is closed');
        const id = this.ownerId(owner);
        const cached = this.databases.get(id);
        if (cached) return cached.store;

        const file = this.fileFor(owner);
        let store: SqliteKvStore;
        try {
            const opened = openStorageDatabase(file, this.log);
            store = new SqliteKvStore(opened.db, { location: file, now: this.clock });
            if (owner.kind === 'plugin') {
                // Plugin databases are opened on first use, not at startup: reclaim
                // their expired rows here instead of walking every file on boot
                // (which would also reset files from newer builds just by starting).
                try {
                    store.pruneExpired();
                } catch {
                    // Opportunistic; reads already hide expired rows.
                }
            }
        } catch (error) {
            const mapped = error instanceof StorageError ? error : mapSqliteError(error, `storage open ${id}`);
            // A failed owner must not make the renderer treat the *channel* as
            // gone (that would move every plugin to session memory). Report it
            // as an I/O failure scoped to this database.
            if (mapped.code === 'STORAGE_UNAVAILABLE') {
                throw new StorageError(
                    'STORAGE_IO',
                    `storage database ${id} is unavailable: ${mapped.message}`,
                    mapped.detail,
                );
            }
            throw mapped;
        }
        this.databases.set(id, { owner, file, store });
        return store;
    }

    /** The app database plus every plugin database that exists on disk. */
    private owners(): StorageOwner[] {
        const owners: StorageOwner[] = [{ kind: 'app', key: 'app' }];
        if (this.root === ':memory:') {
            for (const entry of this.databases.values()) {
                if (entry.owner.kind === 'plugin') owners.push(entry.owner);
            }
            return owners;
        }
        let files: string[] = [];
        try {
            files = readdirSync(join(this.root, 'plugins'));
        } catch {
            return owners;
        }
        for (const file of files) {
            if (!file.endsWith('.db')) continue;
            owners.push({ kind: 'plugin', key: basename(file, '.db') });
        }
        return owners;
    }

    private storeForNamespace(namespace: string): SqliteKvStore {
        return this.storeFor(storageOwnerForNamespace(namespace));
    }

    // ---- reads -------------------------------------------------------------

    get<T = unknown>(namespace: string, key: string): StorageEntry<T> | null {
        return this.storeForNamespace(namespace).get<T>(namespace, key);
    }

    getMany<T = unknown>(namespace: string, keys: string[]): Array<StorageEntry<T>> {
        return this.storeForNamespace(namespace).getMany<T>(namespace, keys);
    }

    keys(namespace: string, prefix?: string): string[] {
        return this.storeForNamespace(namespace).keys(namespace, prefix);
    }

    list<T = unknown>(options: StorageListOptions): { entries: Array<StorageEntry<T>>; cursor: string | null } {
        return this.storeForNamespace(options.namespace).list<T>(options);
    }

    count(namespace: string, prefix?: string): number {
        return this.storeForNamespace(namespace).count(namespace, prefix);
    }

    // ---- writes ------------------------------------------------------------

    set<T = unknown>(
        namespace: string,
        key: string,
        value: T,
        options: StorageSetOptions = {},
    ): StorageEntry<T> {
        return this.storeForNamespace(namespace).set<T>(namespace, key, value, options);
    }

    delete(namespace: string, key: string): boolean {
        return this.storeForNamespace(namespace).delete(namespace, key);
    }

    clear(namespace: string, prefix?: string): number {
        return this.storeForNamespace(namespace).clear(namespace, prefix);
    }

    /**
     * Apply writes/deletes atomically **inside one owner**.
     *
     * Cross-owner batches are rejected: the owners are separate database files,
     * so a single transaction cannot span them. The renderer's contract already
     * allows this ("atomic where the backend supports it"); plugins that need a
     * multi-namespace change should use their own namespace's keys.
     */
    batch(operations: BatchOperation[]): StorageBatchResult {
        if (!Array.isArray(operations) || operations.length === 0) return { written: 0, deleted: 0 };
        const owners = new Set<string>();
        for (const operation of operations) {
            if (!operation || typeof operation !== 'object') {
                throw new StorageError('STORAGE_INVALID_VALUE', 'storage batch entries must be objects');
            }
            owners.add(this.ownerId(storageOwnerForNamespace(operation.namespace)));
        }
        if (owners.size > 1) {
            throw new StorageError(
                'STORAGE_INVALID_VALUE',
                'storage batch cannot span the app database and plugin databases',
            );
        }
        return this.storeFor(storageOwnerForNamespace(operations[0].namespace)).batch(operations);
    }

    // ---- aggregates / lifecycle -------------------------------------------

    /** Diagnostics across every database that exists. */
    info(): StorageInfo {
        const namespaces = new Set<string>();
        let entries = 0;
        let bytes = 0;
        for (const owner of this.owners()) {
            try {
                const store = this.storeFor(owner);
                const stats = store.info();
                entries += stats.entries;
                bytes += stats.bytes ?? 0;
                for (const namespace of store.namespaces()) namespaces.add(namespace);
            } catch (error) {
                // A single broken owner must not break diagnostics for the rest.
                this.log(
                    `[storage] info: skipping ${this.ownerId(owner)}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
        return {
            engine: 'sqlite',
            durable: true,
            location: this.root,
            schemaVersion: SCHEMA_VERSION,
            namespaces: namespaces.size,
            entries,
            bytes,
        };
    }

    /** Every namespace with at least one live entry, across owners. */
    namespaces(): string[] {
        const found = new Set<string>();
        for (const owner of this.owners()) {
            try {
                for (const namespace of this.storeFor(owner).namespaces()) found.add(namespace);
            } catch (error) {
                this.log(
                    `[storage] namespaces: skipping ${this.ownerId(owner)}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
        return [...found].sort();
    }

    /**
     * Reclaim expired rows in the app database and in databases already opened
     * this session. Unexplored plugin databases are pruned when first opened, so
     * startup never has to walk (or reset) every plugin file.
     */
    pruneExpired(): number {
        // Opening/pruning the app database is the health check for the whole
        // channel: if this throws, the caller reports STORAGE_UNAVAILABLE and the
        // renderer degrades to session memory. Plugin databases stay scoped.
        let removed = this.storeFor({ kind: 'app', key: 'app' }).pruneExpired();
        for (const entry of this.databases.values()) {
            if (entry.owner.kind === 'app') continue;
            try {
                removed += entry.store.pruneExpired();
            } catch (error) {
                this.log(
                    `[storage] prune: skipping ${this.ownerId(entry.owner)}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
        return removed;
    }

    /** Close every open database; safe to call twice. */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const entry of this.databases.values()) {
            entry.store.close();
        }
        this.databases.clear();
    }
}