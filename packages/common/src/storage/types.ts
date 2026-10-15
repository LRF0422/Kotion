/**
 * Durable key-value storage contract.
 *
 * ## Why a contract
 *
 * The app shell, its plugins and the desktop main process all need to persist
 * small structured data (agent crash-recovery journals, plugin config, UI
 * drafts). Today each caller writes `localStorage` directly, which means:
 *   - data can vanish with a cache clear, and is capped at ~5 MB,
 *   - the desktop app — which owns a real database — cannot offer anything
 *     better without every caller learning about Electron,
 *   - a plugin's keys are indistinguishable from the shell's.
 *
 * `StorageService` is the single interface every caller codes against. The host
 * picks the implementation: SQLite through the desktop capability bridge on
 * Electron, `localStorage` in a browser, in-memory for SSR/tests.
 *
 * ## Semantics every implementation must honour
 *
 * - **Namespaces** group keys. `app.*` belongs to the shell, `plugin.<key>.*`
 *   to one plugin; see {@link assertStorageNamespace} and
 *   {@link pluginStorageNamespace}.
 * - **Values are JSON-serializable.** `undefined` is not storable (it means
 *   "absent"); `NaN`/`Infinity`/`BigInt`/functions are rejected on write.
 * - **`rev`** starts at `1` and increments on every successful write of that
 *   entry. `ifRev` turns a write into a compare-and-set.
 * - **TTL**: an entry whose `expiresAt` has passed is *absent* — reads return
 *   `null`, scans/counts skip it. Reclaiming the bytes is the backend's
 *   business (lazy, e.g. on the next write).
 * - **Ordering**: `list()`/`keys()` return keys in ascending, stable order for
 *   a given backend; `cursor` is opaque and only valid against the same
 *   implementation. Do not persist cursors.
 * - **`batch()` is all-or-nothing** where the backend can transact (SQLite,
 *   memory). `localStorage` is single-threaded, so its implementation simply
 *   applies the changes in order.
 * - **Corrupt data is surfaced, not hidden**: a value that cannot be decoded
 *   rejects with `STORAGE_CORRUPT` on `get()`. Aggregates (`count`, `info`)
 *   may still succeed, because they read metadata rather than values — a
 *   backend that must decode to enumerate (localStorage) reports corruption
 *   there instead.
 * - Failures reject with a {@link StorageError} carrying a stable
 *   {@link StorageErrorCode} — never a raw backend error, because callers must
 *   be able to degrade (e.g. fall back to memory) without parsing messages.
 */

/** Which implementation is answering. */
export type StorageEngine = 'sqlite' | 'local-storage' | 'memory';

/** Stable failure codes; callers branch on these, not on messages. */
export type StorageErrorCode =
    /** No backend could be created (feature missing, DB unopenable). */
    | 'STORAGE_UNAVAILABLE'
    /** Namespace failed {@link assertStorageNamespace}. */
    | 'STORAGE_INVALID_NAMESPACE'
    /** Key failed {@link assertStorageKey}. */
    | 'STORAGE_INVALID_KEY'
    /** Value is not JSON-serializable, or exceeds {@link STORAGE_MAX_VALUE_BYTES}. */
    | 'STORAGE_INVALID_VALUE'
    /** `ifRev` precondition failed: someone else wrote first. */
    | 'STORAGE_REV_CONFLICT'
    /** Backend is full (localStorage quota, disk full). */
    | 'STORAGE_QUOTA_EXCEEDED'
    /** Backend data is unreadable/corrupt; the host may need to recover it. */
    | 'STORAGE_CORRUPT'
    /** Anything else the backend reported. */
    | 'STORAGE_IO';

/** Longest accepted namespace, in characters. */
export const STORAGE_NAMESPACE_MAX_LENGTH = 120;

/** Longest accepted key, in characters. */
export const STORAGE_KEY_MAX_LENGTH = 512;

/**
 * Largest accepted encoded value (2 MiB).
 *
 * Deliberately small: this layer is for structured app state, not blobs. Both
 * `localStorage` (≈5 MB total) and the renderer↔main IPC hop make larger writes
 * a symptom of the wrong tool — files belong in the `fs.*` capabilities.
 */
export const STORAGE_MAX_VALUE_BYTES = 2 * 1024 * 1024;

/** Default page size for {@link StorageService.list}. */
export const STORAGE_DEFAULT_LIST_LIMIT = 100;

/** Hard cap for {@link StorageService.list}, so one call cannot stream a DB. */
export const STORAGE_MAX_LIST_LIMIT = 1000;

/** Namespace grammar: dot-separated alphanumeric/hyphen segments. */
const NAMESPACE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

/** Namespace prefix reserved for the application shell. */
export const APP_NAMESPACE_ROOT = 'app';

/** Namespace prefix reserved for plugins. */
export const PLUGIN_NAMESPACE_ROOT = 'plugin';

/** Error thrown by every storage implementation. */
export class StorageError extends Error {
    readonly code: StorageErrorCode;
    /** Backend detail, kept out of `message` so callers never parse it. */
    readonly detail?: string;

    constructor(code: StorageErrorCode, message: string, detail?: string) {
        super(message);
        this.name = 'StorageError';
        this.code = code;
        this.detail = detail;
    }

    static is(error: unknown): error is StorageError {
        return error instanceof StorageError;
    }

    /** True when the operation is worth retrying unchanged. */
    get retryable(): boolean {
        return this.code === 'STORAGE_QUOTA_EXCEEDED' || this.code === 'STORAGE_IO';
    }
}

/** One stored entry, as returned by reads. */
export interface StorageEntry<T = unknown> {
    namespace: string;
    key: string;
    value: T;
    /** Monotonic per-entry revision, starting at 1. */
    rev: number;
    /** Epoch ms of the first write of this key. */
    createdAt: number;
    /** Epoch ms of the last write. */
    updatedAt: number;
    /** Epoch ms after which the entry counts as absent; absent means "forever". */
    expiresAt?: number;
}

/** Options accepted by {@link StorageService.set}. */
export interface StorageSetOptions {
    /** Entry expires this many ms after the write. */
    ttlMs?: number;
    /** Absolute expiry (epoch ms). Wins over `ttlMs`; `null` clears a TTL. */
    expiresAt?: number | null;
    /**
     * Optimistic concurrency: the write only applies when the stored revision
     * equals this value. `0` means "must not exist yet" (create-if-absent).
     */
    ifRev?: number;
}

/** Options accepted by {@link StorageService.list}. */
export interface StorageListOptions {
    namespace: string;
    /** Only keys starting with this string. */
    prefix?: string;
    /** Page size; defaults to {@link STORAGE_DEFAULT_LIST_LIMIT}. */
    limit?: number;
    /** Cursor from the previous page; `null`/absent starts at the beginning. */
    cursor?: string | null;
}

/** One page of {@link StorageService.list}. */
export interface StorageListResult<T = unknown> {
    entries: Array<StorageEntry<T>>;
    /** Pass to the next `list()` call; `null` when the page was the last one. */
    cursor: string | null;
}

/** A write or delete inside {@link StorageService.batch}. */
export type StorageBatchOperation =
    | ({ type: 'set'; namespace: string; key: string; value: unknown } & StorageSetOptions)
    | { type: 'delete'; namespace: string; key: string };

/** Outcome of {@link StorageService.batch}. */
export interface StorageBatchResult {
    written: number;
    deleted: number;
}

/** Non-data facts about a backend: what it is, and whether it survives. */
export interface StorageBackendMeta {
    engine: StorageEngine;
    /** True when the data survives a reload/restart on this platform. */
    durable: boolean;
    /** Where the data lives (DB path, origin, `'memory'`); absent if unknown. */
    location?: string;
}

/** Diagnostics for the settings UI and bug reports. */
export interface StorageInfo extends StorageBackendMeta {
    /** Format version of the backing store; `0` when not versioned. */
    schemaVersion: number;
    /** Distinct namespaces with at least one live entry. */
    namespaces: number;
    /** Live entries (expired rows may still occupy space). */
    entries: number;
    /** Live bytes of encoded values, when the backend can measure them. */
    bytes: number | null;
}

/** A namespace-bound view, so callers stop repeating their namespace. */
export interface StorageScope {
    readonly namespace: string;
    get<T = unknown>(key: string): Promise<StorageEntry<T> | null>;
    getMany<T = unknown>(keys: string[]): Promise<Array<StorageEntry<T>>>;
    set<T = unknown>(key: string, value: T, options?: StorageSetOptions): Promise<StorageEntry<T>>;
    delete(key: string): Promise<boolean>;
    keys(prefix?: string): Promise<string[]>;
    list<T = unknown>(options?: Omit<StorageListOptions, 'namespace'>): Promise<StorageListResult<T>>;
    count(prefix?: string): Promise<number>;
    clear(prefix?: string): Promise<number>;
}

/**
 * The storage service registered as `storage` in the service registry.
 *
 * Every method is async because the desktop implementation crosses IPC; the
 * browser implementation resolves immediately.
 */
export interface StorageService {
    readonly engine: StorageEngine;
    /** True when data survives a reload; false for in-memory backends. */
    readonly durable: boolean;
    /** Backend diagnostics. */
    info(): Promise<StorageInfo>;
    /** Read one entry; `null` when absent or expired. */
    get<T = unknown>(namespace: string, key: string): Promise<StorageEntry<T> | null>;
    /** Read several entries at once; missing/expired keys are simply omitted. */
    getMany<T = unknown>(namespace: string, keys: string[]): Promise<Array<StorageEntry<T>>>;
    /** Write one entry; resolves with the stored entry including its new `rev`. */
    set<T = unknown>(
        namespace: string,
        key: string,
        value: T,
        options?: StorageSetOptions,
    ): Promise<StorageEntry<T>>;
    /** Delete one entry; resolves `true` when something was removed. */
    delete(namespace: string, key: string): Promise<boolean>;
    /** Keys matching `prefix`, in ascending order. */
    keys(namespace: string, prefix?: string): Promise<string[]>;
    /** One ordered page of entries. */
    list<T = unknown>(options: StorageListOptions): Promise<StorageListResult<T>>;
    /** Number of live entries matching `prefix`. */
    count(namespace: string, prefix?: string): Promise<number>;
    /** Delete every entry matching `prefix`; resolves the number removed. */
    clear(namespace: string, prefix?: string): Promise<number>;
    /** Apply writes and deletes as one unit where the backend supports it. */
    batch(operations: StorageBatchOperation[]): Promise<StorageBatchResult>;
    /** Every namespace holding at least one live entry. */
    namespaces(): Promise<string[]>;
    /** A namespace-bound view of this service. */
    scope(namespace: string): StorageScope;
    /** Release the backend (closes the DB on desktop); safe to call twice. */
    dispose?(): void;
}

/** Validate a namespace, returning it unchanged. Throws {@link StorageError}. */
export function assertStorageNamespace(namespace: unknown): string {
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
        throw new StorageError(
            'STORAGE_INVALID_NAMESPACE',
            `storage namespace "${namespace}" must be dot-separated alphanumeric segments (a-z, 0-9, -)`,
        );
    }
    return namespace;
}

/** Validate a key, returning it unchanged. Throws {@link StorageError}. */
export function assertStorageKey(key: unknown): string {
    if (typeof key !== 'string' || !key) {
        throw new StorageError('STORAGE_INVALID_KEY', 'storage key must be a non-empty string');
    }
    if (key.length > STORAGE_KEY_MAX_LENGTH) {
        throw new StorageError('STORAGE_INVALID_KEY', `storage key exceeds ${STORAGE_KEY_MAX_LENGTH} characters`);
    }
    // Control characters break nothing structurally, but they make keys
    // invisible in logs and impossible to type in a debugger.
    for (let index = 0; index < key.length; index += 1) {
        const code = key.charCodeAt(index);
        if (code < 0x20 || code === 0x7f) {
            throw new StorageError('STORAGE_INVALID_KEY', 'storage key must not contain control characters');
        }
    }
    return key;
}

/** `app.<area>` — the application shell's namespace root. */
export function appStorageNamespace(area: string): string {
    return assertStorageNamespace(`${APP_NAMESPACE_ROOT}.${area || 'default'}`);
}

/** `<plugin namespace root>.<pluginKey>` — the only namespace a plugin may use. */
export function pluginStorageNamespace(pluginKey: string): string {
    const slug = String(pluginKey || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!slug) {
        throw new StorageError('STORAGE_INVALID_NAMESPACE', 'plugin key must contain at least one alphanumeric character');
    }
    return assertStorageNamespace(`${PLUGIN_NAMESPACE_ROOT}.${slug}`);
}

/**
 * True when `namespace` belongs to `pluginKey`'s subtree.
 *
 * The capability bridge cannot see which plugin made a call (plugins are
 * trusted), so isolation is a convention enforced by the `StorageScope` handed
 * to each plugin — not a security boundary.
 */
export function isPluginStorageNamespace(namespace: string, pluginKey?: string): boolean {
    if (!namespace.startsWith(`${PLUGIN_NAMESPACE_ROOT}.`)) return false;
    if (pluginKey === undefined) return true;
    return namespace === pluginStorageNamespace(pluginKey) || namespace.startsWith(`${pluginStorageNamespace(pluginKey)}.`);
}

/**
 * Join key parts with `/`.
 *
 * Collections map onto flat keys: `key('doc', id, 'body')` → `doc/<id>/body`,
 * so a prefix scan is the collection query.
 *
 * `null`/`undefined`/empty parts are dropped by the filter below, so the
 * signature accepts them: callers routinely pass an optional id straight through
 * (`key('doc', maybeId, 'body')`), and narrowing the type to `string | number`
 * made that a compile error while the runtime had always tolerated it.
 */
export function storageKey(...parts: Array<string | number | null | undefined>): string {
    return parts
        .filter((part) => part !== undefined && part !== null && `${part}`.length > 0)
        .map((part) => String(part))
        .join('/');
}
