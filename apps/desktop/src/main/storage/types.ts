/**
 * Storage domain types for the desktop main process.
 *
 * This is a deliberate **structural mirror** of the renderer-side contract in
 * `packages/common/src/storage/types.ts`: `apps/desktop/src/main` never imports
 * a workspace package (every other file here is self-contained too), and the
 * main process must not trust the renderer — it re-validates namespaces, keys
 * and values before they reach SQL.
 *
 * Both sides are pinned to the same semantics by tests:
 *   - `packages/common/src/storage/storage.check.ts` (memory + localStorage)
 *   - `apps/desktop/src/main/storage/sqlite-store.test.mjs` (this store)
 * Keep the two lists of cases in step when the contract changes.
 */

export const STORAGE_NAMESPACE_MAX_LENGTH = 120;
export const STORAGE_KEY_MAX_LENGTH = 512;
export const STORAGE_MAX_VALUE_BYTES = 2 * 1024 * 1024;

const NAMESPACE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

/** Stable failure codes, identical to the renderer's `StorageErrorCode`. */
export type StorageErrorCode =
    | 'STORAGE_UNAVAILABLE'
    | 'STORAGE_INVALID_NAMESPACE'
    | 'STORAGE_INVALID_KEY'
    | 'STORAGE_INVALID_VALUE'
    | 'STORAGE_REV_CONFLICT'
    | 'STORAGE_QUOTA_EXCEEDED'
    | 'STORAGE_CORRUPT'
    | 'STORAGE_IO';

/** Error carrying a code the renderer can branch on across the IPC boundary. */
export class StorageError extends Error {
    readonly code: StorageErrorCode;
    readonly detail?: string;

    constructor(code: StorageErrorCode, message: string, detail?: string) {
        super(message);
        this.name = 'StorageError';
        this.code = code;
        this.detail = detail;
    }
}

/** One row as stored; `value` is JSON text. */
export interface StorageRow {
    namespace: string;
    key: string;
    value: string;
    rev: number;
    createdAt: number;
    updatedAt: number;
    expiresAt: number | null;
}

/** One row as returned to the renderer; `value` is decoded. */
export interface StorageEntry<T = unknown> {
    namespace: string;
    key: string;
    value: T;
    rev: number;
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
}

/** What `set` accepts. */
export interface StorageSetOptions {
    ttlMs?: number;
    expiresAt?: number | null;
    ifRev?: number;
}

/** Options shared by the read/list capabilities. */
export interface StorageListOptions {
    namespace: string;
    prefix?: string;
    limit?: number;
    cursor?: string | null;
}

/** Outcome of `batch`. */
export interface StorageBatchResult {
    written: number;
    deleted: number;
}

/** Diagnostics surfaced by `storage.info`. */
export interface StorageInfo {
    engine: 'sqlite';
    durable: true;
    location: string;
    schemaVersion: number;
    namespaces: number;
    entries: number;
    bytes: number | null;
}

/** Validate a namespace; throws {@link StorageError} with a stable code. */
export function assertNamespace(namespace: unknown): string {
    if (typeof namespace !== 'string' || !namespace) {
        throw new StorageError('STORAGE_INVALID_NAMESPACE', 'storage namespace must be a non-empty string');
    }
    if (namespace.length > STORAGE_NAMESPACE_MAX_LENGTH) {
        throw new StorageError(
            'STORAGE_INVALID_NAMESPACE',
            `storage namespace exceeds ${STORAGE_NAMESPACE_MAX_LENGTH} characters`,
        );
    }
    if (!NAMESPACE_PATTERN.test(namespace)) {
        throw new StorageError('STORAGE_INVALID_NAMESPACE', `invalid storage namespace "${namespace}"`);
    }
    return namespace;
}

/** Validate a key; throws {@link StorageError} with a stable code. */
export function assertKey(key: unknown): string {
    if (typeof key !== 'string' || !key) {
        throw new StorageError('STORAGE_INVALID_KEY', 'storage key must be a non-empty string');
    }
    if (key.length > STORAGE_KEY_MAX_LENGTH) {
        throw new StorageError('STORAGE_INVALID_KEY', `storage key exceeds ${STORAGE_KEY_MAX_LENGTH} characters`);
    }
    for (let index = 0; index < key.length; index += 1) {
        const code = key.charCodeAt(index);
        if (code < 0x20 || code === 0x7f) {
            throw new StorageError('STORAGE_INVALID_KEY', 'storage key must not contain control characters');
        }
    }
    return key;
}

/** Encode a renderer value, rejecting anything JSON cannot round-trip. */
export function encodeValue(value: unknown): string {
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
        if (error instanceof StorageError) throw error;
        throw new StorageError(
            'STORAGE_INVALID_VALUE',
            'storage value must be JSON-serializable',
            error instanceof Error ? error.message : String(error),
        );
    }
    if (json === undefined) {
        throw new StorageError('STORAGE_INVALID_VALUE', 'storage value must be JSON-serializable');
    }
    const bytes = Buffer.byteLength(json, 'utf8');
    if (bytes > STORAGE_MAX_VALUE_BYTES) {
        throw new StorageError(
            'STORAGE_INVALID_VALUE',
            `storage value is ${bytes} bytes, over the ${STORAGE_MAX_VALUE_BYTES} byte limit`,
        );
    }
    return json;
}

/** Decode a stored row for the renderer. */
export function decodeRow<T = unknown>(row: StorageRow): StorageEntry<T> {
    let value: unknown;
    try {
        value = JSON.parse(row.value);
    } catch (error) {
        throw new StorageError(
            'STORAGE_CORRUPT',
            `stored value for ${row.namespace}/${row.key} is not valid JSON`,
            error instanceof Error ? error.message : undefined,
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

/** Map a SQLite failure onto a stable code, keeping the driver text as detail. */
export function mapSqliteError(error: unknown, context: string): StorageError {
    if (error instanceof StorageError) return error;
    const detail = error instanceof Error ? error.message : String(error);
    if (/SQLITE_FULL|database or disk is full|ENOSPC|quota/i.test(detail)) {
        return new StorageError('STORAGE_QUOTA_EXCEEDED', `${context}: storage is full`, detail);
    }
    if (/SQLITE_CORRUPT|SQLITE_NOTADB|file is not a database|malformed/i.test(detail)) {
        return new StorageError('STORAGE_CORRUPT', `${context}: storage data is unreadable`, detail);
    }
    return new StorageError('STORAGE_IO', `${context}: ${detail}`, detail);
}

/** Escape `%`, `_` and the escape character itself for a LIKE prefix. */
export function escapeLikePrefix(prefix: string): string {
    return prefix.replace(/[\\%_]/g, (match) => `\\${match}`);
}
