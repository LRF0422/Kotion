/**
 * Local-first store contract for Space / Page / Block / document data.
 *
 * The `SpacePageService` port (`./operations`) describes *what* the app can do
 * with spaces and pages. This module describes the second port that sits under
 * it on desktop: a durable local database (SQLite in the Electron main process)
 * that is the read path for the whole app and the write path whenever the cloud
 * is unreachable.
 *
 * Two rules make the whole design work, and every implementation must honour
 * them:
 *
 * 1. **A dirty row is never clobbered by a clean upsert.** A pull from the
 *    cloud must not silently throw away an edit that is still sitting in the
 *    outbox. `upsert*` therefore skips the payload of an existing row whose
 *    `dirty` flag is set when the incoming record is not itself dirty; the row
 *    keeps its local data and only refreshes `remoteUpdatedAt`.
 * 2. **The outbox is ordered and durable.** `enqueue` assigns monotonically
 *    increasing ids and `listOutbox` returns them in that order, so replays
 *    reach the cloud in the same order the user made them. Entries may declare
 *    a `coalesceKey` to supersede an older pending entry (renaming a page five
 *    times offline should produce one request, not five).
 *
 * Records are plain contract types (`Space`, `PageMetadata`, `BlockSummary`,
 * `PageDocument`) plus {@link LocalRecordMeta}, so a row round-trips through
 * the store without a translation layer and the renderer keeps working with the
 * exact shapes it already knows.
 */

import type {
    BlockSummary,
    PageDocument,
    PageMetadata,
    PageStatus,
    Revision,
    Space,
    SpaceType,
} from "./contracts";
import type { BlockId, PageId, SpaceId } from "./ids";

/** Which backend answered; `unavailable` means every call will reject. */
export type LocalStoreEngine = "sqlite" | "memory" | "unavailable";

/** Stable error codes so callers can degrade instead of parsing messages. */
export type LocalStoreErrorCode =
    | "LOCAL_STORE_UNAVAILABLE"
    | "LOCAL_STORE_INVALID"
    | "LOCAL_STORE_IO"
    | "LOCAL_STORE_CORRUPT";

export class LocalStoreError extends Error {
    readonly code: LocalStoreErrorCode;

    constructor(code: LocalStoreErrorCode, message: string) {
        super(message);
        this.name = "LocalStoreError";
        this.code = code;
    }
}

export interface LocalStoreInfo {
    engine: LocalStoreEngine;
    /** `true` when the data survives a restart. */
    durable: boolean;
    /** Absolute database path when the backend exposes one. */
    location?: string;
    schemaVersion: number;
    spaces: number;
    pages: number;
    blocks: number;
    documents: number;
    /** Entries still waiting to be pushed to the cloud. */
    pendingChanges: number;
}

/** Bookkeeping every cached row carries alongside its contract payload. */
export interface LocalRecordMeta {
    /**
     * Local write time (epoch ms). Set by the store when omitted. Deliberately
     * *not* named `updatedAt`: `PageMetadata`/`Space` already have
     * `updatedAt`/`updateTime` for the server's timestamp, and the two must not
     * be confused — conflict resolution compares the server value, list
     * ordering uses the local one only as a tie-breaker.
     */
    localUpdatedAt?: number;
    /** Server timestamp of the version this row was pulled from. */
    remoteUpdatedAt?: number | null;
    /** A local edit that the cloud has not accepted yet. */
    dirty?: boolean;
    /** Soft delete: the row stays so a queued delete can still be replayed. */
    deleted?: boolean;
    /**
     * The row came from a *summary* source (page tree, list, recent, search)
     * rather than from the full page endpoint, so fields only the full read
     * returns (`permission`, `legacyContent`, template metadata…) may be
     * missing. `getPage` treats a partial row as a cache miss and refreshes it
     * from the cloud, falling back to the partial row when offline.
     */
    partial?: boolean;
}

export type LocalSpaceRecord = Space & LocalRecordMeta & {
    /** Marks the user's personal space so `getPersonalSpace()` works offline. */
    personal?: boolean;
};

export type LocalPageRecord = PageMetadata & LocalRecordMeta & {
    /** Position among its siblings, so the tree keeps the server's order. */
    rank?: number;
};

export type LocalBlockRecord = BlockSummary & LocalRecordMeta;

export interface LocalDocumentRecord extends LocalRecordMeta {
    pageId: PageId;
    /** Canonical document payload (mirrors `PageDocument.doc`). */
    doc?: unknown;
    /** Permissive transport alias (mirrors `PageDocument.content`). */
    content?: unknown;
    rev?: Revision | null;
    metadata?: Record<string, unknown>;
}

export interface LocalSpaceQuery {
    search?: string;
    type?: SpaceType;
    archived?: boolean;
    favorite?: boolean;
    personal?: boolean;
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
}

export interface LocalPageQuery {
    spaceId?: SpaceId;
    /** `"root"` selects pages without a parent; `"*"` ignores the parent. */
    parentId?: PageId | "root" | "*" | null;
    status?: PageStatus;
    favorite?: boolean;
    pinned?: boolean;
    search?: string;
    includeDeleted?: boolean;
    /** Defaults to `order` (tree rank), then local write time. */
    orderBy?: "rank" | "updated" | "title";
    limit?: number;
    offset?: number;
}

export interface LocalBlockQuery {
    pageId?: PageId;
    spaceId?: SpaceId;
    parentId?: BlockId | "root" | "*" | null;
    type?: string;
    /** Case-insensitive substring match over the block text. */
    search?: string;
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
}

export type LocalOutboxState = "pending" | "inflight" | "failed";

export type LocalOutboxEntity = "space" | "page" | "block" | "document";

/**
 * One queued mutation. `kind` is a stable string the sync engine maps onto a
 * `SpacePageService` call (`"page.title"` → `pages.updatePageTitle`, …).
 */
export interface LocalOutboxEntry {
    id: number;
    kind: string;
    entity: LocalOutboxEntity;
    entityId: string;
    payload: Record<string, unknown>;
    state: LocalOutboxState;
    attempts: number;
    lastError?: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface LocalOutboxDraft {
    kind: string;
    entity: LocalOutboxEntity;
    entityId: string;
    payload: Record<string, unknown>;
    /**
     * Replaces an existing **pending** entry with the same key. Use it for
     * mutations that supersede each other (title, favorite, pin…); leave it
     * unset for appends that must all be replayed (document operations).
     */
    coalesceKey?: string;
}

export interface LocalOutboxQuery {
    state?: LocalOutboxState;
    entityId?: string;
    limit?: number;
}

/** Result of a soft delete / remap, so callers can report what actually moved. */
export interface LocalMutationCount {
    affected: number;
}

/**
 * The local database, as seen by the renderer.
 *
 * Every method is async because the real implementation crosses an IPC
 * boundary; the in-memory fake used by tests resolves immediately.
 */
export interface SpacePageLocalStore {
    /** `false` when writes will not survive a restart. */
    readonly durable: boolean;
    info(): Promise<LocalStoreInfo>;

    getSpace(spaceId: SpaceId): Promise<LocalSpaceRecord | null>;
    listSpaces(query?: LocalSpaceQuery): Promise<LocalSpaceRecord[]>;
    countSpaces(query?: LocalSpaceQuery): Promise<number>;
    upsertSpaces(records: LocalSpaceRecord[]): Promise<number>;
    deleteSpaces(spaceIds: SpaceId[]): Promise<number>;
    /** Re-key a locally created space onto the id the cloud assigned. */
    remapSpace(from: SpaceId, to: SpaceId): Promise<LocalMutationCount>;

    getPage(pageId: PageId): Promise<LocalPageRecord | null>;
    listPages(query?: LocalPageQuery): Promise<LocalPageRecord[]>;
    countPages(query?: LocalPageQuery): Promise<number>;
    upsertPages(records: LocalPageRecord[]): Promise<number>;
    deletePages(pageIds: PageId[]): Promise<number>;
    /** Re-key a page created offline (id, parent links, documents, outbox). */
    remapPage(from: PageId, to: PageId): Promise<LocalMutationCount>;

    getDocument(pageId: PageId): Promise<LocalDocumentRecord | null>;
    upsertDocument(record: LocalDocumentRecord): Promise<void>;

    getBlock(blockId: BlockId): Promise<LocalBlockRecord | null>;
    listBlocks(query?: LocalBlockQuery): Promise<LocalBlockRecord[]>;
    countBlocks(query?: LocalBlockQuery): Promise<number>;
    upsertBlocks(records: LocalBlockRecord[]): Promise<number>;
    deleteBlocks(blockIds: BlockId[]): Promise<number>;

    /** Returns the ids of the stored entries, in replay order. */
    enqueue(entries: LocalOutboxDraft[]): Promise<number[]>;
    listOutbox(query?: LocalOutboxQuery): Promise<LocalOutboxEntry[]>;
    countOutbox(state?: LocalOutboxState): Promise<number>;
    /** Remove entries the cloud has accepted. */
    ackOutbox(ids: number[]): Promise<number>;
    /** Mark one entry as permanently failed (a 4xx the cloud will never take). */
    failOutbox(id: number, error: string): Promise<void>;
    /** Move `failed` entries back to `pending` (retry from the UI). */
    retryOutbox(ids?: number[]): Promise<number>;
    /** Clear the dirty flag once the cloud has the row. */
    markSynced(entity: LocalOutboxEntity, ids: string[]): Promise<number>;

    getState<T = unknown>(key: string): Promise<T | null>;
    setState(key: string, value: unknown): Promise<void>;

    /** Drop every cached row. Used on logout and by tests. */
    clear(): Promise<void>;
}

/** `PageDocument` ↔ {@link LocalDocumentRecord} without losing either shape. */
export const toLocalDocumentRecord = (
    pageId: PageId,
    document: PageDocument,
    meta: LocalRecordMeta = {},
): LocalDocumentRecord => ({
    pageId,
    ...(document.doc === undefined ? {} : { doc: document.doc }),
    ...(document.content === undefined ? {} : { content: document.content }),
    rev: document.rev ?? null,
    ...(document.metadata ? { metadata: document.metadata } : {}),
    ...meta,
});

/** Rebuild the transport envelope the `SpacePageService` contract expects. */
export const fromLocalDocumentRecord = (record: LocalDocumentRecord): PageDocument => ({
    pageId: record.pageId,
    doc: record.doc ?? record.content ?? null,
    ...(record.content === undefined ? {} : { content: record.content }),
    rev: record.rev ?? null,
    ...(record.metadata ? { metadata: record.metadata } : {}),
});
