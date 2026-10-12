/**
 * Local-first domain store: rows, validation and error codes.
 *
 * The Electron **main process must not import `@kn/common`** (it is not a
 * dependency of `apps/desktop`, and the main bundle externalizes workspace
 * packages), so the shapes here mirror
 * `packages/common/src/domain/space-page/local-store.ts`. `@kn/common` is the
 * contract of record: change the contract first, then this file, then
 * `packages/core/src/desktop/space-page-bridge.ts` — the same three-way sync
 * rule that `storage/types.ts` already documents.
 *
 * The payload of every row is stored as JSON in a `data` column so a record
 * keeps every field the contract defines, including ones this process has no
 * business understanding (`icon`, `tags`, plugin-specific metadata). The
 * extracted columns next to it exist only so the app's list and tree queries
 * are index scans.
 */

/** Stable failure codes, mirrored in `@kn/common`'s `LocalStoreErrorCode`. */
export type DomainErrorCode =
    | 'LOCAL_STORE_UNAVAILABLE'
    | 'LOCAL_STORE_INVALID'
    | 'LOCAL_STORE_IO'
    | 'LOCAL_STORE_CORRUPT';

export class DomainError extends Error {
    readonly code: DomainErrorCode;

    constructor(code: DomainErrorCode, message: string) {
        super(message);
        this.name = 'DomainError';
        this.code = code;
    }
}

/** Anything that can be JSON-serialized as a record payload. */
export type JsonRecord = Record<string, unknown>;

const MAX_ID_LENGTH = 512;

/** Ids arrive from the renderer: treat them as input, not as trusted app state. */
export function assertId(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) {
        throw new DomainError('LOCAL_STORE_INVALID', `${label} must be a non-empty string (<= ${MAX_ID_LENGTH} chars)`);
    }
    if (/[\u0000-\u001f]/.test(value)) {
        throw new DomainError('LOCAL_STORE_INVALID', `${label} must not contain control characters`);
    }
    return value;
}

export function assertIdArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value)) {
        throw new DomainError('LOCAL_STORE_INVALID', `${label} must be an array`);
    }
    return value.map((item, index) => assertId(item, `${label}[${index}]`));
}

export function assertRecordArray(value: unknown, label: string): JsonRecord[] {
    if (!Array.isArray(value)) {
        throw new DomainError('LOCAL_STORE_INVALID', `${label} must be an array`);
    }
    return value.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new DomainError('LOCAL_STORE_INVALID', `${label}[${index}] must be an object`);
        }
        return item as JsonRecord;
    });
}

export function asFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

/**
 * Contract timestamps are `string | number` (ISO-8601 or epoch ms). Returns
 * `null` for anything else instead of a bogus `NaN` that would poison the
 * "recent pages" ordering.
 */
export function toEpoch(value: unknown): number | null {
    const direct = asFiniteNumber(value);
    if (direct !== undefined) {
        // Second-precision epochs show up in older rows; keep them comparable
        // with the milliseconds the rest of the schema stores.
        return direct > 0 && direct < 100_000_000_000 ? direct * 1000 : direct;
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

/** Pick the first timestamp the record carries, in contract preference order. */
export function recordEpoch(record: JsonRecord): number | null {
    for (const key of ['remoteUpdatedAt', 'updateTime', 'updatedAt', 'createTime', 'createdAt']) {
        const epoch = toEpoch(record[key]);
        if (epoch !== null) return epoch;
    }
    return null;
}

export function encodeJson(value: unknown): string {
    try {
        const encoded = JSON.stringify(value === undefined ? null : value);
        return encoded === undefined ? 'null' : encoded;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DomainError('LOCAL_STORE_INVALID', `payload is not JSON-serializable: ${message}`);
    }
}

export function decodeJson<T = JsonRecord>(value: unknown, label: string): T {
    if (typeof value !== 'string') {
        throw new DomainError('LOCAL_STORE_CORRUPT', `${label} is not stored as text`);
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        throw new DomainError('LOCAL_STORE_CORRUPT', `${label} is not valid JSON`);
    }
}

export function asBool(value: unknown): 0 | 1 {
    return value ? 1 : 0;
}

export function asText(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
}

/** Escape `%`/`_` so a user's search text is a literal LIKE pattern. */
export function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function clampLimit(value: unknown, fallback = 200, max = 2000): number {
    const parsed = asFiniteNumber(value);
    if (parsed === undefined) return fallback;
    return Math.min(Math.max(Math.floor(parsed), 1), max);
}

export function clampOffset(value: unknown): number {
    const parsed = asFiniteNumber(value);
    if (parsed === undefined) return 0;
    return Math.max(Math.floor(parsed), 0);
}

// ---------------------------------------------------------------------------
// Row shapes (as stored)
// ---------------------------------------------------------------------------

export interface SpaceRow {
    id: string;
    name: string;
    type: string | null;
    archived: number;
    favorite: number;
    personal: number;
    data: string;
    updated_at: number;
    remote_updated_at: number | null;
    deleted: number;
    dirty: number;
}

export interface PageRow {
    id: string;
    space_id: string | null;
    parent_id: string | null;
    title: string;
    page_type: string | null;
    status: string | null;
    favorite: number;
    pinned: number;
    rank: number;
    data: string;
    updated_at: number;
    remote_updated_at: number | null;
    deleted: number;
    dirty: number;
}

export interface BlockRow {
    id: string;
    page_id: string | null;
    space_id: string | null;
    parent_id: string | null;
    type: string | null;
    text: string | null;
    data: string;
    updated_at: number;
    remote_updated_at: number | null;
    deleted: number;
    dirty: number;
}

export interface DocumentRow {
    page_id: string;
    doc: string | null;
    rev: string | null;
    data: string;
    updated_at: number;
    remote_updated_at: number | null;
    dirty: number;
}

export interface OutboxRow {
    id: number;
    kind: string;
    entity: string;
    entity_id: string;
    coalesce_key: string | null;
    payload: string;
    state: string;
    attempts: number;
    last_error: string | null;
    created_at: number;
    updated_at: number;
}

export interface SyncStateRow {
    key: string;
    value: string;
    updated_at: number;
}

// ---------------------------------------------------------------------------
// Row <-> record projection
// ---------------------------------------------------------------------------

const bool = (value: number | null): boolean => value === 1;

/** Meta fields the local-first layer adds on top of the contract payload. */
type MetaFields = {
    localUpdatedAt: number;
    remoteUpdatedAt: number | null;
    dirty: boolean;
    deleted: boolean;
};

export type SpaceRecord = JsonRecord & MetaFields & { id: string; personal?: boolean };
export type PageRecord = JsonRecord & MetaFields & { id: string };
export type BlockRecord = JsonRecord & MetaFields & { id: string };
export type DocumentRecord = JsonRecord & MetaFields & { pageId: string };
export type OutboxEntry = {
    id: number;
    kind: string;
    entity: string;
    entityId: string;
    payload: JsonRecord;
    state: string;
    attempts: number;
    lastError: string | null;
    createdAt: number;
    updatedAt: number;
};

export const spaceFromRow = (row: SpaceRow): SpaceRecord => ({
    ...decodeJson<JsonRecord>(row.data, `spaces(${row.id}).data`),
    id: row.id,
    ...(row.personal ? { personal: true } : {}),
    localUpdatedAt: row.updated_at,
    remoteUpdatedAt: row.remote_updated_at,
    dirty: bool(row.dirty),
    deleted: bool(row.deleted),
});

export const pageFromRow = (row: PageRow): PageRecord => ({
    ...decodeJson<JsonRecord>(row.data, `pages(${row.id}).data`),
    id: row.id,
    localUpdatedAt: row.updated_at,
    remoteUpdatedAt: row.remote_updated_at,
    dirty: bool(row.dirty),
    deleted: bool(row.deleted),
});

export const blockFromRow = (row: BlockRow): BlockRecord => ({
    ...decodeJson<JsonRecord>(row.data, `blocks(${row.id}).data`),
    id: row.id,
    localUpdatedAt: row.updated_at,
    remoteUpdatedAt: row.remote_updated_at,
    dirty: bool(row.dirty),
    deleted: bool(row.deleted),
});

export const documentFromRow = (row: DocumentRow): DocumentRecord => ({
    ...decodeJson<JsonRecord>(row.data, `page_documents(${row.page_id}).data`),
    pageId: row.page_id,
    ...(row.doc === null ? {} : { doc: decodeJson(row.doc, `page_documents(${row.page_id}).doc`) }),
    ...(row.rev === null ? {} : { rev: row.rev }),
    localUpdatedAt: row.updated_at,
    remoteUpdatedAt: row.remote_updated_at,
    dirty: bool(row.dirty),
    deleted: false,
});

export interface HistoryRow {
    page_id: string;
    rev: string;
    kind: string;
    label: string | null;
    client_id: string | null;
    doc: string | null;
    data: string;
    remote_rev: string | null;
    current: number;
    created_at: number;
}

export interface HistoryRecord {
    pageId: string;
    rev: string;
    kind: string;
    label: string | null;
    clientId: string | null;
    /** Snapshot payload; absent for a checkpoint taken before any document read. */
    doc?: unknown;
    current: boolean;
    /** Cloud revision once the same checkpoint also exists upstream. */
    remoteRev: string | null;
    createdAt: number;
    /** History payload (label/actor/kind) for the version panel. */
    metadata: JsonRecord;
}

export const historyFromRow = (row: HistoryRow): HistoryRecord => ({
    pageId: row.page_id,
    rev: row.rev,
    kind: row.kind,
    label: row.label,
    clientId: row.client_id,
    ...(row.doc === null ? {} : { doc: decodeJson(row.doc, `page_history(${row.page_id}@${row.rev}).doc`) }),
    current: bool(row.current),
    remoteRev: row.remote_rev,
    createdAt: row.created_at,
    metadata: decodeJson<JsonRecord>(row.data, `page_history(${row.page_id}@${row.rev}).data`),
});

export const outboxFromRow = (row: OutboxRow): OutboxEntry => ({
    id: Number(row.id),
    kind: row.kind,
    entity: row.entity,
    entityId: row.entity_id,
    payload: decodeJson<JsonRecord>(row.payload, `outbox(${row.id}).payload`),
    state: row.state,
    attempts: Number(row.attempts),
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});
