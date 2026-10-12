/**
 * SQLite-backed key-value store for the desktop main process.
 *
 * Implements the storage contract's semantics natively in SQL — revision
 * arithmetic, compare-and-set, TTL filtering, ordered prefix scans and atomic
 * batches — rather than loading rows into JavaScript. The renderer-side
 * reference implementation lives in `@kn/common` (`storage/kv-engine.ts`);
 * `sqlite-store.test.mjs` and `packages/common/src/storage/storage.check.ts`
 * assert the same behaviours on both sides.
 *
 * Every entry point re-validates namespace/key/value: the renderer is a trusted
 * app shell, but IPC input is still input.
 */

import Database from 'better-sqlite3';
import { mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_VERSION, readSchemaVersion, runMigrations } from './schema';
import {
    StorageError,
    assertKey,
    assertNamespace,
    decodeRow,
    encodeValue,
    escapeLikePrefix,
    mapSqliteError,
    type StorageBatchResult,
    type StorageEntry,
    type StorageInfo,
    type StorageListOptions,
    type StorageRow,
    type StorageSetOptions,
} from './types';

/** Default page size when walking a large namespace. */
const DEFAULT_PAGE_SIZE = 500;

/** Safety valve for `keys()`/`namespaces()` on a runaway namespace. */
const MAX_SCAN_ROWS = 100_000;

/** A `set` or `delete` inside `batch`. */
export type BatchOperation =
    | ({ type: 'set'; namespace: string; key: string; value: unknown } & StorageSetOptions)
    | { type: 'delete'; namespace: string; key: string };

export interface SqliteKvStoreOptions {
    /** Path of the database file, surfaced by `info()`; `':memory:'` in tests. */
    location: string;
    /** Injectable clock, for tests. */
    now?: () => number;
    /** Rows fetched per page by `keys()`. */
    pageSize?: number;
}

interface RawRow {
    namespace: string;
    key: string;
    value: string;
    rev: number;
    created_at: number;
    updated_at: number;
    expires_at: number | null;
}

function toRow(raw: RawRow): StorageRow {
    return {
        namespace: raw.namespace,
        key: raw.key,
        value: raw.value,
        rev: raw.rev,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        expiresAt: raw.expires_at === null ? null : Number(raw.expires_at),
    };
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

function clampLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit)) return 100;
    return Math.min(Math.max(Math.floor(limit), 1), 1000);
}

export interface OpenStorageDatabaseResult {
    db: Database.Database;
    /** Path of the previous file when a corrupt database was moved aside. */
    recoveredFrom?: string;
    /** Non-fatal notes worth logging (migration steps, recovery). */
    notes: string[];
}

/**
 * Open (or create) the storage database and bring it to the current schema.
 *
 * A file that exists but is not a database — a truncated write after a crash, a
 * failed sync, a restored backup — is moved aside and recreated instead of
 * blocking app startup: losing local cache beats refusing to launch. The stale
 * file is kept next to the database so it can be inspected or salvaged.
 */
export function openStorageDatabase(
    filePath: string,
    log: (message: string) => void = () => {},
): OpenStorageDatabaseResult {
    const notes: string[] = [];
    const inMemory = filePath === ':memory:';
    if (!inMemory) mkdirSync(dirname(filePath), { recursive: true });

    const openOnce = (): Database.Database => {
        const db = new Database(filePath);
        // WAL keeps readers from blocking the single writer and survives crashes;
        // NORMAL is the documented durability/fast pairing for WAL.
        if (!inMemory) db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('busy_timeout = 5000');
        db.pragma('temp_store = MEMORY');
        return db;
    };

    let db: Database.Database;
    let recoveredFrom: string | undefined;
    try {
        db = openOnce();
        try {
            const result = runMigrations(db, undefined, (message) => {
                notes.push(message);
                log(message);
            });
            if (result.applied.length) notes.push(`[storage] schema v${result.from} -> v${result.to}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // A version from the future is a deliberate refusal, not corruption.
            if (/newer than this build/.test(message)) {
                db.close();
                throw new StorageError('STORAGE_UNAVAILABLE', message);
            }
            throw error;
        }
    } catch (error) {
        const mapped = mapSqliteError(error, 'storage open');
        if (mapped.code !== 'STORAGE_CORRUPT' || inMemory) throw mapped;
        recoveredFrom = `${filePath}.corrupt-${Date.now()}`;
        try {
            renameSync(filePath, recoveredFrom);
        } catch (renameError) {
            throw new StorageError(
                'STORAGE_CORRUPT',
                'storage database is unreadable and could not be moved aside',
                renameError instanceof Error ? renameError.message : undefined,
            );
        }
        const note = `[storage] database was unreadable; moved to ${recoveredFrom} and recreated`;
        notes.push(note);
        log(note);
        db = openOnce();
        runMigrations(db, undefined, log);
    }

    const version = readSchemaVersion(db);
    if (version !== SCHEMA_VERSION) {
        db.close();
        throw new StorageError(
            'STORAGE_UNAVAILABLE',
            `storage schema is v${version}, expected v${SCHEMA_VERSION}`,
        );
    }

    return { db, ...(recoveredFrom ? { recoveredFrom } : {}), notes };
}

/** Key-value store over an open {@link Database.Database}. */
export class SqliteKvStore {
    private readonly db: Database.Database;
    private readonly clock: () => number;
    private readonly location: string;
    private readonly pageSize: number;
    private readonly scanCache = new Map<string, Database.Statement>();
    private closed = false;

    constructor(db: Database.Database, options: SqliteKvStoreOptions) {
        this.db = db;
        this.clock = options.now ?? (() => Date.now());
        this.location = options.location;
        this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    }

    // ---- internals ---------------------------------------------------------

    private get isLiveSql(): string {
        return '(expires_at IS NULL OR expires_at > ?)';
    }

    private statement(sql: string): Database.Statement {
        const cached = this.scanCache.get(sql);
        if (cached) return cached;
        const prepared = this.db.prepare(sql);
        // `getMany` varies its SQL with the key count, so the cache is bounded.
        if (this.scanCache.size > 64) this.scanCache.clear();
        this.scanCache.set(sql, prepared);
        return prepared;
    }

    private readPhysical(namespace: string, key: string): StorageRow | null {
        const raw = this.statement(
            'SELECT namespace, key, value, rev, created_at, updated_at, expires_at FROM kv WHERE namespace = ? AND key = ?',
        ).get(namespace, key) as RawRow | undefined;
        return raw ? toRow(raw) : null;
    }

    private isLive(row: StorageRow, at: number): boolean {
        return row.expiresAt === null || row.expiresAt > at;
    }

    /**
     * Validate + encode one write and enforce its revision precondition.
     * Must be called inside a transaction when used by `batch`.
     */
    private stageSet<T>(
        namespace: string,
        key: string,
        value: T,
        options: StorageSetOptions,
        at: number,
    ): StorageEntry<T> {
        const ns = assertNamespace(namespace);
        const k = assertKey(key);
        const json = encodeValue(value);

        const current = this.readPhysical(ns, k);
        const live = current && this.isLive(current, at) ? current : null;
        const currentRev = live?.rev ?? 0;
        if (options.ifRev !== undefined && options.ifRev !== currentRev) {
            throw new StorageError(
                'STORAGE_REV_CONFLICT',
                `storage write ${ns}/${k} expected rev ${options.ifRev} but found ${currentRev}`,
            );
        }

        const row: StorageRow = {
            namespace: ns,
            key: k,
            value: json,
            rev: currentRev + 1,
            createdAt: live?.createdAt ?? at,
            updatedAt: at,
            expiresAt: resolveExpiry(options, at),
        };

        if (current && live) {
            this.statement(
                'UPDATE kv SET value = ?, rev = ?, created_at = ?, updated_at = ?, expires_at = ? WHERE namespace = ? AND key = ?',
            ).run(row.value, row.rev, row.createdAt, row.updatedAt, row.expiresAt, ns, k);
        } else {
            // Covers both "no row" and "expired row": the expired row's revision
            // does not carry over, so `rev` restarts at 1.
            this.statement(
                `INSERT INTO kv (namespace, key, value, rev, created_at, updated_at, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (namespace, key) DO UPDATE SET
                     value = excluded.value,
                     rev = excluded.rev,
                     created_at = excluded.created_at,
                     updated_at = excluded.updated_at,
                     expires_at = excluded.expires_at`,
            ).run(ns, k, row.value, row.rev, row.createdAt, row.updatedAt, row.expiresAt);
        }

        // The entry echoes the caller's value (JSON round-tripping it here
        // would be wasted work and would turn `undefined`-adjacent values into
        // surprises); reads decode from the stored text.
        const entry: StorageEntry<T> = {
            namespace: ns,
            key: k,
            value,
            rev: row.rev,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
        if (row.expiresAt !== null) entry.expiresAt = row.expiresAt;
        return entry;
    }

    // ---- public API --------------------------------------------------------

    /** Rows whose TTL has elapsed; returns how many were removed. */
    pruneExpired(): number {
        const at = this.clock();
        return this.statement('DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at <= ?').run(at)
            .changes;
    }

    info(): StorageInfo {
        const at = this.clock();
        const stats = this.statement(
            `SELECT COUNT(*) AS entries,
                    COUNT(DISTINCT namespace) AS namespaces,
                    COALESCE(SUM(LENGTH(CAST(value AS BLOB))), 0) AS bytes
               FROM kv WHERE ${this.isLiveSql}`,
        ).get(at) as { entries: number; namespaces: number; bytes: number };

        return {
            engine: 'sqlite',
            durable: true,
            location: this.location,
            schemaVersion: readSchemaVersion(this.db),
            namespaces: Number(stats.namespaces) || 0,
            entries: Number(stats.entries) || 0,
            bytes: Number(stats.bytes) || 0,
        };
    }

    get<T = unknown>(namespace: string, key: string): StorageEntry<T> | null {
        const ns = assertNamespace(namespace);
        const k = assertKey(key);
        const row = this.readPhysical(ns, k);
        if (!row || !this.isLive(row, this.clock())) return null;
        return decodeRow<T>(row);
    }

    getMany<T = unknown>(namespace: string, keys: string[]): Array<StorageEntry<T>> {
        const ns = assertNamespace(namespace);
        if (!Array.isArray(keys) || keys.length === 0) return [];
        const at = this.clock();
        const validated = keys.map((key) => assertKey(key));
        const placeholders = validated.map(() => '?').join(', ');
        const rows = this.statement(
            `SELECT namespace, key, value, rev, created_at, updated_at, expires_at
               FROM kv
              WHERE namespace = ? AND key IN (${placeholders}) AND ${this.isLiveSql}
              ORDER BY key`,
        ).all(ns, ...validated, at) as RawRow[];
        return rows.map(toRow).map((row) => decodeRow<T>(row));
    }

    set<T = unknown>(namespace: string, key: string, value: T, options: StorageSetOptions = {}): StorageEntry<T> {
        try {
            const at = this.clock();
            const run = this.db.transaction(() => this.stageSet(namespace, key, value, options, at));
            return run();
        } catch (error) {
            throw mapSqliteError(error, `storage write ${namespace}/${key}`);
        }
    }

    delete(namespace: string, key: string): boolean {
        try {
            const ns = assertNamespace(namespace);
            const k = assertKey(key);
            return this.statement('DELETE FROM kv WHERE namespace = ? AND key = ?').run(ns, k).changes > 0;
        } catch (error) {
            throw mapSqliteError(error, `storage delete ${namespace}/${key}`);
        }
    }

    list<T = unknown>(options: StorageListOptions): { entries: Array<StorageEntry<T>>; cursor: string | null } {
        try {
            const ns = assertNamespace(options.namespace);
            const limit = clampLimit(options.limit);
            const at = this.clock();
            const prefix = options.prefix ?? '';
            const after = options.cursor ?? '';
            const sql = prefix
                ? `SELECT namespace, key, value, rev, created_at, updated_at, expires_at
                     FROM kv
                    WHERE namespace = ? AND key > ? AND key LIKE ? ESCAPE '\\' AND ${this.isLiveSql}
                    ORDER BY key LIMIT ?`
                : `SELECT namespace, key, value, rev, created_at, updated_at, expires_at
                     FROM kv
                    WHERE namespace = ? AND key > ? AND ${this.isLiveSql}
                    ORDER BY key LIMIT ?`;
            const rows = (
                prefix
                    ? this.statement(sql).all(ns, after, `${escapeLikePrefix(prefix)}%`, at, limit)
                    : this.statement(sql).all(ns, after, at, limit)
            ) as RawRow[];
            const entries = rows.map(toRow).map((row) => decodeRow<T>(row));
            const last = rows[rows.length - 1];
            return { entries, cursor: rows.length === limit && last ? last.key : null };
        } catch (error) {
            throw mapSqliteError(error, `storage list ${options.namespace}`);
        }
    }

    /** Live keys matching `prefix`, ascending; walks pages up to {@link MAX_SCAN_ROWS}. */
    keys(namespace: string, prefix?: string): string[] {
        const collected: string[] = [];
        let cursor: string | null = null;
        for (;;) {
            // Annotated because `cursor` is assigned from `page` inside the
            // loop; inference would otherwise chase its own tail.
            const page: { entries: Array<StorageEntry<unknown>>; cursor: string | null } = this.list({
                namespace,
                ...(prefix ? { prefix } : {}),
                limit: this.pageSize,
                cursor,
            });
            collected.push(...page.entries.map((entry) => entry.key));
            if (!page.cursor || collected.length >= MAX_SCAN_ROWS) return collected;
            cursor = page.cursor;
        }
    }

    count(namespace: string, prefix?: string): number {
        try {
            const ns = assertNamespace(namespace);
            const at = this.clock();
            const sql = prefix
                ? `SELECT COUNT(*) AS n FROM kv WHERE namespace = ? AND key LIKE ? ESCAPE '\\' AND ${this.isLiveSql}`
                : `SELECT COUNT(*) AS n FROM kv WHERE namespace = ? AND ${this.isLiveSql}`;
            const row = (
                prefix
                    ? this.statement(sql).get(ns, `${escapeLikePrefix(prefix)}%`, at)
                    : this.statement(sql).get(ns, at)
            ) as { n: number };
            return Number(row.n) || 0;
        } catch (error) {
            throw mapSqliteError(error, `storage count ${namespace}`);
        }
    }

    clear(namespace: string, prefix?: string): number {
        try {
            const ns = assertNamespace(namespace);
            const sql = prefix
                ? `DELETE FROM kv WHERE namespace = ? AND key LIKE ? ESCAPE '\\'`
                : 'DELETE FROM kv WHERE namespace = ?';
            return (
                prefix
                    ? this.statement(sql).run(ns, `${escapeLikePrefix(prefix)}%`)
                    : this.statement(sql).run(ns)
            ).changes;
        } catch (error) {
            throw mapSqliteError(error, `storage clear ${namespace}`);
        }
    }

    batch(operations: BatchOperation[]): StorageBatchResult {
        if (!Array.isArray(operations) || operations.length === 0) return { written: 0, deleted: 0 };
        try {
            const at = this.clock();
            const run = this.db.transaction(() => {
                let written = 0;
                let deleted = 0;
                for (const operation of operations) {
                    if (!operation || typeof operation !== 'object') {
                        throw new StorageError('STORAGE_INVALID_VALUE', 'storage batch entries must be objects');
                    }
                    if (operation.type === 'delete') {
                        const ns = assertNamespace(operation.namespace);
                        const k = assertKey(operation.key);
                        this.statement('DELETE FROM kv WHERE namespace = ? AND key = ?').run(ns, k);
                        deleted += 1;
                        continue;
                    }
                    if (operation.type !== 'set') {
                        throw new StorageError(
                            'STORAGE_INVALID_VALUE',
                            `unknown storage batch operation "${String((operation as { type?: unknown }).type)}"`,
                        );
                    }
                    this.stageSet(operation.namespace, operation.key, operation.value, operation, at);
                    written += 1;
                }
                return { written, deleted };
            });
            return run();
        } catch (error) {
            throw mapSqliteError(error, 'storage batch');
        }
    }

    namespaces(): string[] {
        try {
            const at = this.clock();
            const rows = this.statement(
                `SELECT DISTINCT namespace FROM kv WHERE ${this.isLiveSql} ORDER BY namespace`,
            ).all(at) as Array<{ namespace: string }>;
            return rows.map((row) => row.namespace);
        } catch (error) {
            throw mapSqliteError(error, 'storage namespaces');
        }
    }

    /** Close the database; safe to call repeatedly. */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.scanCache.clear();
        try {
            this.db.close();
        } catch {
            // Shutdown must not throw; a failed close only leaks a handle.
        }
    }
}
