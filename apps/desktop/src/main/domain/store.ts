/**
 * SQLite repository for the local-first domain data (spaces / pages / blocks /
 * documents) plus the outbox that carries queued edits to the cloud.
 *
 * The main process is the single writer for the database file, so every
 * mutation here runs in a transaction and the renderer never sees a partially
 * applied change. Two invariants are enforced in this file rather than trusted
 * from the caller:
 *
 * 1. **A dirty row survives a clean upsert.** When a row is waiting to be
 *    pushed (`dirty = 1`) and a pull from the cloud arrives without the dirty
 *    flag, the payload is left alone; only `remote_updated_at` moves forward.
 *    Without this, a background sync would silently eat offline edits.
 * 2. **Ids are re-keyed everywhere at once.** A page created offline lives
 *    under a temporary id until the cloud answers with the real one. `remapPage`
 *    rewrites the row, its children, its blocks, its document and every queued
 *    payload in one transaction, so no dangling reference can survive a crash.
 */

import type Database from 'better-sqlite3';
import {
    DomainError,
    asBool,
    asFiniteNumber,
    asText,
    assertId,
    assertIdArray,
    assertRecordArray,
    blockFromRow,
    clampLimit,
    clampOffset,
    decodeJson,
    documentFromRow,
    encodeJson,
    escapeLike,
    outboxFromRow,
    pageFromRow,
    recordEpoch,
    spaceFromRow,
    type BlockRecord,
    type BlockRow,
    type DocumentRecord,
    type DocumentRow,
    type JsonRecord,
    type OutboxEntry,
    type OutboxRow,
    type PageRecord,
    type PageRow,
    type SpaceRecord,
    type SpaceRow,
} from './types';

export interface DomainStoreOptions {
    /** Path of the database file, surfaced by `info()`. */
    location: string;
    /** Injectable clock for tests. */
    now?: () => number;
}

export interface DomainStoreInfo {
    engine: 'sqlite';
    durable: boolean;
    location: string;
    schemaVersion: number;
    spaces: number;
    pages: number;
    blocks: number;
    documents: number;
    pendingChanges: number;
}

export interface DomainOutboxDraft {
    kind: string;
    entity: string;
    entityId: string;
    payload: JsonRecord;
    coalesceKey?: string;
}

const OUTBOX_ENTITIES = new Set(['space', 'page', 'block', 'document']);

const dirtyOf = (value: unknown): boolean => value === true;

/** Rows are keyed by `id` in the payload too; keep both in sync. */
const withId = (record: JsonRecord, id: string): JsonRecord => ({ ...record, id });

export class SqliteDomainStore {
    private readonly db: Database.Database;
    private readonly location: string;
    private readonly now: () => number;

    constructor(db: Database.Database, options: DomainStoreOptions) {
        this.db = db;
        this.location = options.location;
        this.now = options.now ?? (() => Date.now());
    }

    // -- introspection ------------------------------------------------------

    info(): DomainStoreInfo {
        const count = (table: string): number =>
            Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
        const schemaVersion = Number(this.db.pragma('user_version', { simple: true }) ?? 0);
        return {
            engine: 'sqlite',
            durable: this.location !== ':memory:',
            location: this.location,
            schemaVersion,
            spaces: count('spaces'),
            pages: count('pages'),
            blocks: count('blocks'),
            documents: count('page_documents'),
            pendingChanges: count('outbox'),
        };
    }

    // -- spaces -------------------------------------------------------------

    getSpace(spaceId: string): SpaceRecord | null {
        const id = assertId(spaceId, 'spaceId');
        const row = this.db.prepare('SELECT * FROM spaces WHERE id = ?').get(id) as SpaceRow | undefined;
        return row ? spaceFromRow(row) : null;
    }

    listSpaces(query: JsonRecord = {}): SpaceRecord[] {
        const { where, params } = this.spaceFilter(query);
        const limit = clampLimit(query.limit, 500, 5000);
        const offset = clampOffset(query.offset);
        const rows = this.db
            .prepare(`SELECT * FROM spaces ${where} ORDER BY archived ASC, name COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset) as SpaceRow[];
        return rows.map(spaceFromRow);
    }

    countSpaces(query: JsonRecord = {}): number {
        const { where, params } = this.spaceFilter(query);
        const row = this.db.prepare(`SELECT COUNT(*) AS n FROM spaces ${where}`).get(...params) as { n: number };
        return Number(row.n);
    }

    upsertSpaces(rawRecords: unknown): number {
        const records = assertRecordArray(rawRecords, 'records');
        const insert = this.db.prepare(`
            INSERT INTO spaces (id, name, type, archived, favorite, personal, data, updated_at, remote_updated_at, deleted, dirty)
            VALUES (@id, @name, @type, @archived, @favorite, @personal, @data, @updated_at, @remote_updated_at, COALESCE(@deleted, 0), @dirty)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                type = excluded.type,
                archived = excluded.archived,
                favorite = excluded.favorite,
                personal = excluded.personal,
                data = excluded.data,
                updated_at = excluded.updated_at,
                remote_updated_at = COALESCE(excluded.remote_updated_at, spaces.remote_updated_at),
                deleted = CASE WHEN @deleted IS NULL THEN spaces.deleted ELSE @deleted END,
                dirty = excluded.dirty
        `);
        const touch = this.db.prepare(
            'UPDATE spaces SET remote_updated_at = COALESCE(?, remote_updated_at) WHERE id = ?',
        );
        const existing = this.db.prepare('SELECT dirty FROM spaces WHERE id = ?');

        return this.transaction(() => {
            let affected = 0;
            for (const record of records) {
                const id = assertId(record.id, 'space.id');
                const dirty = dirtyOf(record.dirty);
                const current = existing.get(id) as { dirty: number } | undefined;
                if (current && current.dirty === 1 && !dirty) {
                    const remote = recordEpoch(record);
                    if (remote !== null) touch.run(remote, id);
                    continue;
                }
                insert.run({
                    id,
                    name: asText(record.name) ?? '',
                    type: asText(record.type),
                    archived: asBool(record.archived),
                    favorite: asBool(record.favorite),
                    personal: asBool(record.personal),
                    data: encodeJson(record),
                    updated_at: asFiniteNumber(record.localUpdatedAt) ?? this.now(),
                    remote_updated_at: asFiniteNumber(record.remoteUpdatedAt) ?? recordEpoch(record),
                    deleted: record.deleted === undefined ? null : asBool(record.deleted),
                    dirty: dirty ? 1 : 0,
                });
                affected += 1;
            }
            return affected;
        });
    }

    /** Remove cached spaces. Rows created offline are dropped outright. */
    deleteSpaces(rawIds: unknown): number {
        const ids = assertIdArray(rawIds, 'spaceIds');
        const find = this.db.prepare('SELECT * FROM spaces WHERE id = ?');
        const hard = this.db.prepare('DELETE FROM spaces WHERE id = ?');
        const soft = this.db.prepare('UPDATE spaces SET deleted = 1, updated_at = ? WHERE id = ?');
        const dropOutbox = this.db.prepare(
            "DELETE FROM outbox WHERE entity = 'space' AND entity_id = ?",
        );
        // "dirty" only means "has an unsent edit"; it does not mean the space was
        // created here. Only a queued create proves the cloud has never seen it,
        // and only then is dropping the row (and its queue) correct.
        const pendingCreate = this.db.prepare(
            "SELECT 1 AS present FROM outbox WHERE entity = 'space' AND entity_id = ? AND kind = 'space.create' LIMIT 1",
        );

        return this.transaction(() => {
            let affected = 0;
            for (const id of ids) {
                const row = find.get(id) as SpaceRow | undefined;
                if (!row) continue;
                if (pendingCreate.get(id)) {
                    hard.run(id);
                    dropOutbox.run(id);
                } else {
                    soft.run(this.now(), id);
                }
                affected += 1;
            }
            return affected;
        });
    }

    /** Re-key a space created offline onto the id the cloud assigned. */
    remapSpace(from: unknown, to: unknown): { affected: number } {
        const source = assertId(from, 'from');
        const target = assertId(to, 'to');
        if (source === target) return { affected: 0 };

        return this.transaction(() => {
            let affected = 0;
            affected += this.rekeyRow('spaces', source, target, (record) => withId(record, target));

            affected += this.rewriteReferences({
                table: 'pages',
                column: 'space_id',
                from: source,
                to: target,
                patch: (record) => ({ ...record, spaceId: target }),
            });
            affected += this.rewriteReferences({
                table: 'blocks',
                column: 'space_id',
                from: source,
                to: target,
                patch: (record) => ({ ...record, spaceId: target }),
            });
            this.rewriteOutbox(source, target);
            return { affected };
        });
    }

    // -- pages --------------------------------------------------------------

    getPage(pageId: string): PageRecord | null {
        const id = assertId(pageId, 'pageId');
        const row = this.db.prepare('SELECT * FROM pages WHERE id = ?').get(id) as PageRow | undefined;
        return row ? pageFromRow(row) : null;
    }

    listPages(query: JsonRecord = {}): PageRecord[] {
        const { where, params } = this.pageFilter(query);
        const limit = clampLimit(query.limit, 500, 5000);
        const offset = clampOffset(query.offset);
        const order = this.pageOrder(query.orderBy);
        const rows = this.db
            .prepare(`SELECT * FROM pages ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
            .all(...params, limit, offset) as PageRow[];
        return rows.map(pageFromRow);
    }

    countPages(query: JsonRecord = {}): number {
        const { where, params } = this.pageFilter(query);
        const row = this.db.prepare(`SELECT COUNT(*) AS n FROM pages ${where}`).get(...params) as { n: number };
        return Number(row.n);
    }

    upsertPages(rawRecords: unknown): number {
        const records = assertRecordArray(rawRecords, 'records');
        const insert = this.db.prepare(`
            INSERT INTO pages (id, space_id, parent_id, title, page_type, status, favorite, pinned, rank, data, updated_at, remote_updated_at, deleted, dirty)
            VALUES (@id, @space_id, @parent_id, @title, @page_type, @status, @favorite, @pinned, @rank, @data, @updated_at, @remote_updated_at, COALESCE(@deleted, 0), @dirty)
            ON CONFLICT(id) DO UPDATE SET
                space_id = excluded.space_id,
                parent_id = excluded.parent_id,
                title = excluded.title,
                page_type = excluded.page_type,
                status = excluded.status,
                favorite = excluded.favorite,
                pinned = excluded.pinned,
                rank = excluded.rank,
                data = excluded.data,
                updated_at = excluded.updated_at,
                remote_updated_at = COALESCE(excluded.remote_updated_at, pages.remote_updated_at),
                deleted = CASE WHEN @deleted IS NULL THEN pages.deleted ELSE @deleted END,
                dirty = excluded.dirty
        `);
        const touch = this.db.prepare(
            'UPDATE pages SET remote_updated_at = COALESCE(?, remote_updated_at) WHERE id = ?',
        );
        const existing = this.db.prepare('SELECT dirty FROM pages WHERE id = ?');

        return this.transaction(() => {
            let affected = 0;
            for (const record of records) {
                const id = assertId(record.id, 'page.id');
                const dirty = dirtyOf(record.dirty);
                const current = existing.get(id) as { dirty: number } | undefined;
                if (current && current.dirty === 1 && !dirty) {
                    const remote = recordEpoch(record);
                    if (remote !== null) touch.run(remote, id);
                    continue;
                }
                insert.run({
                    id,
                    space_id: asText(record.spaceId),
                    parent_id: asText(record.parentId),
                    title: asText(record.title) ?? '',
                    page_type: asText(record.pageType),
                    status: asText(record.status),
                    favorite: asBool(record.favorite),
                    pinned: asBool(record.pinned),
                    rank: asFiniteNumber(record.rank) ?? 0,
                    data: encodeJson(record),
                    updated_at: asFiniteNumber(record.localUpdatedAt) ?? this.now(),
                    remote_updated_at: asFiniteNumber(record.remoteUpdatedAt) ?? recordEpoch(record),
                    deleted: record.deleted === undefined ? null : asBool(record.deleted),
                    dirty: dirty ? 1 : 0,
                });
                affected += 1;
            }
            return affected;
        });
    }

    deletePages(rawIds: unknown): number {
        const ids = assertIdArray(rawIds, 'pageIds');
        const find = this.db.prepare('SELECT * FROM pages WHERE id = ?');
        const hard = this.db.prepare('DELETE FROM pages WHERE id = ?');
        const soft = this.db.prepare('UPDATE pages SET deleted = 1, updated_at = ? WHERE id = ?');
        // Only a page this device created (and the cloud has not accepted yet)
        // is discarded outright; a page the cloud knows is tombstoned so the
        // queued delete can still be replayed.
        const dropOutbox = this.db.prepare(
            "DELETE FROM outbox WHERE entity = 'page' AND entity_id = ?",
        );
        const dropDoc = this.db.prepare('DELETE FROM page_documents WHERE page_id = ?');
        const pendingCreate = this.db.prepare(
            "SELECT 1 AS present FROM outbox WHERE entity = 'page' AND entity_id = ? AND kind = 'page.create' LIMIT 1",
        );

        return this.transaction(() => {
            let affected = 0;
            for (const id of ids) {
                const row = find.get(id) as PageRow | undefined;
                if (!row) continue;
                if (pendingCreate.get(id)) {
                    hard.run(id);
                    dropDoc.run(id);
                    dropOutbox.run(id);
                } else {
                    soft.run(this.now(), id);
                }
                affected += 1;
            }
            return affected;
        });
    }

    remapPage(from: unknown, to: unknown): { affected: number } {
        const source = assertId(from, 'from');
        const target = assertId(to, 'to');
        if (source === target) return { affected: 0 };

        return this.transaction(() => {
            let affected = 0;
            affected += this.rekeyRow('pages', source, target, (record) => withId(record, target));
            affected += this.rewriteReferences({
                table: 'pages',
                column: 'parent_id',
                from: source,
                to: target,
                patch: (record) => ({ ...record, parentId: target }),
            });
            affected += this.rewriteReferences({
                table: 'blocks',
                column: 'page_id',
                from: source,
                to: target,
                patch: (record) => ({
                    ...record,
                    pageId: target,
                    ...(record.parentId === source ? { parentId: target } : {}),
                }),
            });
            affected += this.rewriteReferences({
                table: 'page_documents',
                column: 'page_id',
                from: source,
                to: target,
                patch: (record) => ({ ...record, pageId: target }),
                rekey: true,
            });
            this.rewriteOutbox(source, target);
            return { affected };
        });
    }

    // -- documents ----------------------------------------------------------

    getDocument(pageId: string): DocumentRecord | null {
        const id = assertId(pageId, 'pageId');
        const row = this.db
            .prepare('SELECT * FROM page_documents WHERE page_id = ?')
            .get(id) as DocumentRow | undefined;
        return row ? documentFromRow(row) : null;
    }

    upsertDocument(rawRecord: unknown): void {
        const record = assertRecordArray([rawRecord], 'record')[0];
        const pageId = assertId(record.pageId, 'record.pageId');
        const dirty = dirtyOf(record.dirty);
        const current = this.db
            .prepare('SELECT dirty FROM page_documents WHERE page_id = ?')
            .get(pageId) as { dirty: number } | undefined;
        if (current && current.dirty === 1 && !dirty) {
            const remote = asFiniteNumber(record.remoteUpdatedAt) ?? recordEpoch(record);
            if (remote !== null) {
                this.db
                    .prepare('UPDATE page_documents SET remote_updated_at = COALESCE(?, remote_updated_at) WHERE page_id = ?')
                    .run(remote, pageId);
            }
            return;
        }

        const doc = record.doc === undefined ? null : encodeJson(record.doc);
        const rev = record.rev === undefined || record.rev === null ? null : String(record.rev);
        this.db
            .prepare(`
                INSERT INTO page_documents (page_id, doc, rev, data, updated_at, remote_updated_at, dirty)
                VALUES (@page_id, @doc, @rev, @data, @updated_at, @remote_updated_at, @dirty)
                ON CONFLICT(page_id) DO UPDATE SET
                    doc = excluded.doc,
                    rev = excluded.rev,
                    data = excluded.data,
                    updated_at = excluded.updated_at,
                    remote_updated_at = COALESCE(excluded.remote_updated_at, page_documents.remote_updated_at),
                    dirty = excluded.dirty
            `)
            .run({
                page_id: pageId,
                doc,
                rev,
                data: encodeJson(record),
                updated_at: asFiniteNumber(record.localUpdatedAt) ?? this.now(),
                remote_updated_at: asFiniteNumber(record.remoteUpdatedAt) ?? recordEpoch(record),
                dirty: dirty ? 1 : 0,
            });
    }

    // -- blocks -------------------------------------------------------------

    getBlock(blockId: string): BlockRecord | null {
        const id = assertId(blockId, 'blockId');
        const row = this.db.prepare('SELECT * FROM blocks WHERE id = ?').get(id) as BlockRow | undefined;
        return row ? blockFromRow(row) : null;
    }

    listBlocks(query: JsonRecord = {}): BlockRecord[] {
        const { where, params } = this.blockFilter(query);
        const limit = clampLimit(query.limit, 500, 5000);
        const offset = clampOffset(query.offset);
        const rows = this.db
            .prepare(`SELECT * FROM blocks ${where} ORDER BY page_id ASC, parent_id ASC, id ASC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset) as BlockRow[];
        return rows.map(blockFromRow);
    }

    countBlocks(query: JsonRecord = {}): number {
        const { where, params } = this.blockFilter(query);
        const row = this.db.prepare(`SELECT COUNT(*) AS n FROM blocks ${where}`).get(...params) as { n: number };
        return Number(row.n);
    }

    upsertBlocks(rawRecords: unknown): number {
        const records = assertRecordArray(rawRecords, 'records');
        const insert = this.db.prepare(`
            INSERT INTO blocks (id, page_id, space_id, parent_id, type, text, data, updated_at, remote_updated_at, deleted, dirty)
            VALUES (@id, @page_id, @space_id, @parent_id, @type, @text, @data, @updated_at, @remote_updated_at, COALESCE(@deleted, 0), @dirty)
            ON CONFLICT(id) DO UPDATE SET
                page_id = excluded.page_id,
                space_id = excluded.space_id,
                parent_id = excluded.parent_id,
                type = excluded.type,
                text = excluded.text,
                data = excluded.data,
                updated_at = excluded.updated_at,
                remote_updated_at = COALESCE(excluded.remote_updated_at, blocks.remote_updated_at),
                deleted = CASE WHEN @deleted IS NULL THEN blocks.deleted ELSE @deleted END,
                dirty = excluded.dirty
        `);
        const existing = this.db.prepare('SELECT dirty FROM blocks WHERE id = ?');

        return this.transaction(() => {
            let affected = 0;
            for (const record of records) {
                const id = assertId(record.id, 'block.id');
                const dirty = dirtyOf(record.dirty);
                const current = existing.get(id) as { dirty: number } | undefined;
                if (current && current.dirty === 1 && !dirty) continue;
                insert.run({
                    id,
                    page_id: asText(record.pageId),
                    space_id: asText(record.spaceId),
                    parent_id: asText(record.parentId),
                    type: asText(record.type),
                    text: asText(record.text),
                    data: encodeJson(record),
                    updated_at: asFiniteNumber(record.localUpdatedAt) ?? this.now(),
                    remote_updated_at: asFiniteNumber(record.remoteUpdatedAt) ?? recordEpoch(record),
                    deleted: record.deleted === undefined ? null : asBool(record.deleted),
                    dirty: dirty ? 1 : 0,
                });
                affected += 1;
            }
            return affected;
        });
    }

    deleteBlocks(rawIds: unknown): number {
        const ids = assertIdArray(rawIds, 'blockIds');
        const find = this.db.prepare('SELECT * FROM blocks WHERE id = ?');
        const hard = this.db.prepare('DELETE FROM blocks WHERE id = ?');
        const soft = this.db.prepare('UPDATE blocks SET deleted = 1, updated_at = ? WHERE id = ?');

        return this.transaction(() => {
            let affected = 0;
            for (const id of ids) {
                const row = find.get(id) as BlockRow | undefined;
                if (!row) continue;
                if (row.dirty === 1) hard.run(id);
                else soft.run(this.now(), id);
                affected += 1;
            }
            return affected;
        });
    }

    // -- outbox -------------------------------------------------------------

    enqueue(rawEntries: unknown): number[] {
        const entries = assertRecordArray(rawEntries, 'entries');
        // Pending only: an `inflight` entry is on the wire and overwriting its
        // payload would lose the newer edit when that push acks it.
        const findCoalesced = this.db.prepare(
            "SELECT id FROM outbox WHERE coalesce_key = ? AND state = 'pending' ORDER BY id ASC LIMIT 1",
        );
        const update = this.db.prepare(`
            UPDATE outbox
               SET kind = @kind, entity = @entity, entity_id = @entity_id, payload = @payload,
                   state = 'pending', attempts = 0, last_error = NULL, updated_at = @updated_at
             WHERE id = @id
        `);
        const insert = this.db.prepare(`
            INSERT INTO outbox (kind, entity, entity_id, coalesce_key, payload, state, attempts, last_error, created_at, updated_at)
            VALUES (@kind, @entity, @entity_id, @coalesce_key, @payload, 'pending', 0, NULL, @created_at, @updated_at)
        `);

        return this.transaction(() => {
            const ids: number[] = [];
            for (const entry of entries) {
                const kind = assertId(entry.kind, 'entry.kind');
                const entity = assertId(entry.entity, 'entry.entity');
                if (!OUTBOX_ENTITIES.has(entity)) {
                    throw new DomainError('LOCAL_STORE_INVALID', `entry.entity must be one of ${Array.from(OUTBOX_ENTITIES).join(', ')}`);
                }
                const entityId = assertId(entry.entityId, 'entry.entityId');
                if (!entry.payload || typeof entry.payload !== 'object' || Array.isArray(entry.payload)) {
                    throw new DomainError('LOCAL_STORE_INVALID', 'entry.payload must be an object');
                }
                const coalesceKey = typeof entry.coalesceKey === 'string' && entry.coalesceKey ? entry.coalesceKey : null;
                const now = this.now();
                const named = {
                    kind,
                    entity,
                    entity_id: entityId,
                    coalesce_key: coalesceKey,
                    payload: encodeJson(entry.payload),
                    created_at: now,
                    updated_at: now,
                };
                if (coalesceKey) {
                    const existing = findCoalesced.get(coalesceKey) as { id: number } | undefined;
                    if (existing) {
                        update.run({ ...named, id: Number(existing.id) });
                        ids.push(Number(existing.id));
                        continue;
                    }
                }
                const result = insert.run(named);
                ids.push(Number(result.lastInsertRowid));
            }
            return ids;
        });
    }

    /**
     * Atomically take the oldest pending entries for replay (pending -> inflight).
     *
     * Claiming is what makes the push loop safe: two runs cannot get the same
     * entry, and a coalescing edit arriving mid-push becomes a new entry instead
     * of mutating the payload that is already being sent.
     */
    claimOutbox(query: JsonRecord = {}): OutboxEntry[] {
        const limit = clampLimit(query.limit, 1, 100);
        return this.transaction(() => {
            const rows = this.db
                .prepare("SELECT * FROM outbox WHERE state = 'pending' ORDER BY id ASC LIMIT ?")
                .all(limit) as OutboxRow[];
            if (!rows.length) return [];
            const update = this.db.prepare("UPDATE outbox SET state = 'inflight', updated_at = ? WHERE id = ?");
            const now = this.now();
            for (const row of rows) update.run(now, Number(row.id));
            return rows.map((row) => outboxFromRow({ ...row, state: 'inflight' }));
        });
    }

    listOutbox(query: JsonRecord = {}): OutboxEntry[] {
        const clauses: string[] = [];
        const params: unknown[] = [];
        if (query.state !== undefined) {
            clauses.push('state = ?');
            params.push(assertId(query.state, 'state'));
        }
        if (query.entityId !== undefined) {
            clauses.push('entity_id = ?');
            params.push(assertId(query.entityId, 'entityId'));
        }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const limit = clampLimit(query.limit, 100);
        const rows = this.db
            .prepare(`SELECT * FROM outbox ${where} ORDER BY id ASC LIMIT ?`)
            .all(...params, limit) as OutboxRow[];
        return rows.map(outboxFromRow);
    }

    countOutbox(state?: unknown): number {
        if (state === undefined) {
            const row = this.db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number };
            return Number(row.n);
        }
        const row = this.db
            .prepare('SELECT COUNT(*) AS n FROM outbox WHERE state = ?')
            .get(assertId(state, 'state')) as { n: number };
        return Number(row.n);
    }

    ackOutbox(rawIds: unknown): number {
        if (!Array.isArray(rawIds)) throw new DomainError('LOCAL_STORE_INVALID', 'ids must be an array');
        const ids = rawIds.map((value, index) => {
            const parsed = asFiniteNumber(value);
            if (parsed === undefined) throw new DomainError('LOCAL_STORE_INVALID', `ids[${index}] must be a number`);
            return Math.floor(parsed);
        });
        if (!ids.length) return 0;
        const placeholders = ids.map(() => '?').join(', ');
        const result = this.db.prepare(`DELETE FROM outbox WHERE id IN (${placeholders})`).run(...ids);
        return Number(result.changes);
    }

    failOutbox(rawId: unknown, error: unknown): void {
        const id = asFiniteNumber(rawId);
        if (id === undefined) throw new DomainError('LOCAL_STORE_INVALID', 'id must be a number');
        const message = typeof error === 'string' ? error : 'unknown error';
        this.db
            .prepare("UPDATE outbox SET state = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?")
            .run(message.slice(0, 2000), this.now(), Math.floor(id));
    }

    retryOutbox(rawIds?: unknown): number {
        const now = this.now();
        if (rawIds === undefined) {
            const result = this.db
                .prepare(
                    "UPDATE outbox SET state = 'pending', last_error = NULL, updated_at = ? WHERE state IN ('failed', 'inflight')",
                )
                .run(now);
            return Number(result.changes);
        }
        if (!Array.isArray(rawIds)) throw new DomainError('LOCAL_STORE_INVALID', 'ids must be an array');
        const ids = rawIds.map((value, index) => {
            const parsed = asFiniteNumber(value);
            if (parsed === undefined) throw new DomainError('LOCAL_STORE_INVALID', `ids[${index}] must be a number`);
            return Math.floor(parsed);
        });
        if (!ids.length) return 0;
        const placeholders = ids.map(() => '?').join(', ');
        const result = this.db
            .prepare(
                `UPDATE outbox SET state = 'pending', last_error = NULL, updated_at = ? WHERE id IN (${placeholders})`,
            )
            .run(now, ...ids);
        return Number(result.changes);
    }

    markSynced(entity: unknown, rawIds: unknown): number {
        const name = assertId(entity, 'entity');
        const ids = assertIdArray(rawIds, 'ids');
        if (!ids.length) return 0;
        const table = name === 'space' ? 'spaces' : name === 'page' ? 'pages' : name === 'block' ? 'blocks' : name === 'document' ? 'page_documents' : null;
        if (!table) {
            throw new DomainError('LOCAL_STORE_INVALID', 'entity must be one of space, page, block, document');
        }
        const column = table === 'page_documents' ? 'page_id' : 'id';
        const placeholders = ids.map(() => '?').join(', ');
        const result = this.db
            .prepare(`UPDATE ${table} SET dirty = 0 WHERE ${column} IN (${placeholders})`)
            .run(...ids);
        return Number(result.changes);
    }

    // -- sync state ---------------------------------------------------------

    getState<T = unknown>(key: string): T | null {
        const row = this.db.prepare('SELECT value FROM sync_state WHERE key = ?').get(assertId(key, 'key')) as
            | { value: string }
            | undefined;
        return row ? decodeJson<T>(row.value, `sync_state(${key}).value`) : null;
    }

    setState(key: string, value: unknown): void {
        this.db
            .prepare(`
                INSERT INTO sync_state (key, value, updated_at) VALUES (@key, @value, @updated_at)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            `)
            .run({ key: assertId(key, 'key'), value: encodeJson(value), updated_at: this.now() });
    }

    // -- maintenance --------------------------------------------------------

    clear(): void {
        this.transaction(() => {
            for (const table of ['spaces', 'pages', 'blocks', 'page_documents', 'outbox', 'sync_state']) {
                this.db.prepare(`DELETE FROM ${table}`).run();
            }
            this.db.prepare("DELETE FROM sqlite_sequence WHERE name = 'outbox'").run();
        });
    }

    // -- internals ----------------------------------------------------------

    private transaction<T>(fn: () => T): T {
        const run = this.db.transaction(fn);
        try {
            return run();
        } catch (error) {
            if (error instanceof DomainError) throw error;
            const message = error instanceof Error ? error.message : String(error);
            throw new DomainError('LOCAL_STORE_IO', message);
        }
    }

    private spaceFilter(query: JsonRecord): { where: string; params: unknown[] } {
        const clauses: string[] = [];
        const params: unknown[] = [];
        if (!query.includeDeleted) clauses.push('deleted = 0');
        if (query.archived !== undefined) {
            clauses.push(`archived = ${query.archived ? 1 : 0}`);
        }
        if (query.favorite !== undefined) {
            clauses.push(`favorite = ${query.favorite ? 1 : 0}`);
        }
        if (query.personal !== undefined) {
            clauses.push(`personal = ${query.personal ? 1 : 0}`);
        }
        if (query.type !== undefined) {
            clauses.push('type = ?');
            params.push(assertId(query.type, 'type'));
        }
        if (typeof query.search === 'string' && query.search.trim()) {
            clauses.push("name LIKE ? ESCAPE '\\'");
            params.push(`%${escapeLike(query.search.trim())}%`);
        }
        return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
    }

    private pageFilter(query: JsonRecord): { where: string; params: unknown[] } {
        const clauses: string[] = [];
        const params: unknown[] = [];
        if (!query.includeDeleted) clauses.push('deleted = 0');
        if (query.spaceId !== undefined) {
            clauses.push('space_id = ?');
            params.push(assertId(query.spaceId, 'spaceId'));
        }
        const parent = query.parentId;
        if (parent !== undefined && parent !== '*') {
            if (parent === null || parent === 'root' || parent === '') {
                clauses.push("(parent_id IS NULL OR parent_id = '')");
            } else {
                clauses.push('parent_id = ?');
                params.push(assertId(parent, 'parentId'));
            }
        }
        if (query.status !== undefined) {
            clauses.push('status = ?');
            params.push(assertId(query.status, 'status'));
        }
        if (query.favorite !== undefined) clauses.push(`favorite = ${query.favorite ? 1 : 0}`);
        if (query.pinned !== undefined) clauses.push(`pinned = ${query.pinned ? 1 : 0}`);
        if (typeof query.search === 'string' && query.search.trim()) {
            clauses.push("title LIKE ? ESCAPE '\\'");
            params.push(`%${escapeLike(query.search.trim())}%`);
        }
        return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
    }

    private pageOrder(orderBy: unknown): string {
        if (orderBy === 'updated') return 'COALESCE(remote_updated_at, updated_at) DESC, id ASC';
        if (orderBy === 'title') return 'title COLLATE NOCASE ASC, id ASC';
        return 'space_id ASC, parent_id ASC, rank ASC, id ASC';
    }

    private blockFilter(query: JsonRecord): { where: string; params: unknown[] } {
        const clauses: string[] = [];
        const params: unknown[] = [];
        if (!query.includeDeleted) clauses.push('deleted = 0');
        if (query.pageId !== undefined) {
            clauses.push('page_id = ?');
            params.push(assertId(query.pageId, 'pageId'));
        }
        if (query.spaceId !== undefined) {
            clauses.push('space_id = ?');
            params.push(assertId(query.spaceId, 'spaceId'));
        }
        const parent = query.parentId;
        if (parent !== undefined && parent !== '*') {
            if (parent === null || parent === 'root' || parent === '') {
                clauses.push("(parent_id IS NULL OR parent_id = '')");
            } else {
                clauses.push('parent_id = ?');
                params.push(assertId(parent, 'parentId'));
            }
        }
        if (query.type !== undefined) {
            clauses.push('type = ?');
            params.push(assertId(query.type, 'type'));
        }
        if (typeof query.search === 'string' && query.search.trim()) {
            clauses.push("(text LIKE ? ESCAPE '\\' OR type LIKE ? ESCAPE '\\')");
            const pattern = `%${escapeLike(query.search.trim())}%`;
            params.push(pattern, pattern);
        }
        return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
    }

    /**
     * Move a row to a new primary key: read, patch the payload, re-insert under
     * `target`, drop the old row. Done in JS because the payload is JSON and the
     * extracted columns have to be recomputed alongside it.
     */
    private rekeyRow(
        table: 'spaces' | 'pages',
        from: string,
        to: string,
        patch: (record: JsonRecord) => JsonRecord,
    ): number {
        const columns = table === 'spaces'
            ? 'id, name, type, archived, favorite, personal, data, updated_at, remote_updated_at, deleted, dirty'
            : 'id, space_id, parent_id, title, page_type, status, favorite, pinned, rank, data, updated_at, remote_updated_at, deleted, dirty';
        const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(from) as JsonRecord | undefined;
        if (!row) return 0;
        const patched = patch(decodeJson<JsonRecord>(row.data as string, `${table}(${from}).data`));
        const next: JsonRecord = {
            ...row,
            id: to,
            data: encodeJson(patched),
        };
        if (table === 'spaces') {
            next.name = asText(patched.name) ?? row.name;
            next.type = asText(patched.type);
            next.archived = asBool(patched.archived);
            next.favorite = asBool(patched.favorite);
            next.personal = row.personal;
        } else {
            next.space_id = asText(patched.spaceId);
            next.parent_id = asText(patched.parentId);
            next.title = asText(patched.title) ?? '';
            next.page_type = asText(patched.pageType);
            next.status = asText(patched.status);
            next.favorite = asBool(patched.favorite);
            next.pinned = asBool(patched.pinned);
            next.rank = asFiniteNumber(patched.rank) ?? row.rank ?? 0;
        }
        const names = columns.split(', ').map((name) => name.trim());
        // A row may already exist under the target id (the cloud answered with
        // an id we happen to have cached): replace it, the local copy wins.
        this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(to);
        this.db
            .prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((name) => `@${name}`).join(', ')})`)
            .run(next);
        this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(from);
        return 1;
    }

    /** Patch every row of `table` whose `column` points at `from`. */
    private rewriteReferences(options: {
        table: 'pages' | 'blocks' | 'page_documents';
        column: 'parent_id' | 'space_id' | 'page_id';
        from: string;
        to: string;
        patch: (record: JsonRecord) => JsonRecord;
        rekey?: boolean;
    }): number {
        const { table, column, from, to, patch, rekey } = options;
        const keyColumn = table === 'page_documents' ? 'page_id' : 'id';
        const rows = this.db
            .prepare(`SELECT * FROM ${table} WHERE ${column} = ?`)
            .all(from) as JsonRecord[];
        if (!rows.length) return 0;
        // Update by primary key, never by the reference column: several rows
        // share one `parent_id`/`page_id`, so a WHERE on that column would
        // rewrite all of them with the first row's payload and lose the rest.
        const update = this.db.prepare(
            `UPDATE ${table} SET ${column} = @next, data = @data WHERE ${keyColumn} = @key`,
        );

        if (rekey) {
            // `page_documents` is keyed by `page_id` itself: the new key must not
            // collide with a row that is already there.
            this.db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(to);
        }

        let affected = 0;
        for (const row of rows) {
            const key = String(row[keyColumn]);
            const current = decodeJson<JsonRecord>(row.data as string, `${table}(${key}).data`);
            update.run({ next: to, data: encodeJson(patch(current)), key });
            affected += 1;
        }
        return affected;
    }

    /**
     * Re-point queued mutations at the id the cloud assigned, including ids
     * embedded in payloads (a queued `page.move` still names its parent).
     */
    private rewriteOutbox(from: string, to: string): number {
        const rows = this.db
            .prepare(
                "SELECT id, entity_id, coalesce_key, payload FROM outbox WHERE state IN ('pending', 'inflight', 'failed')",
            )
            .all() as Array<{ id: number; entity_id: string; coalesce_key: string | null; payload: string }>;
        if (!rows.length) return 0;
        const update = this.db.prepare(
            'UPDATE outbox SET entity_id = ?, coalesce_key = ?, payload = ?, updated_at = ? WHERE id = ?',
        );
        let affected = 0;
        for (const row of rows) {
            const payload = decodeJson<JsonRecord>(row.payload, `outbox(${row.id}).payload`);
            const nextPayload = replaceStringValue(payload, from, to);
            const nextEntityId = row.entity_id === from ? to : row.entity_id;
            // The key is built from the id (`page.title:<id>`), so it has to move
            // too or later edits of the same kind stop coalescing.
            const nextCoalesce =
                row.coalesce_key && row.coalesce_key.includes(from)
                    ? row.coalesce_key.split(from).join(to)
                    : row.coalesce_key;
            if (
                nextEntityId === row.entity_id
                && nextCoalesce === row.coalesce_key
                && nextPayload === payload
            ) {
                continue;
            }
            update.run(nextEntityId, nextCoalesce, encodeJson(nextPayload), this.now(), Number(row.id));
            affected += 1;
        }
        return affected;
    }
}

/**
 * Recursively replace a string value that is *exactly* `from`.
 *
 * Exact matching (never substring) is what makes this safe: ids are opaque
 * tokens, and a payload that happens to contain the same characters inside a
 * document body must not be rewritten.
 */
export function replaceStringValue(value: unknown, from: string, to: string): unknown {
    if (value === from) return to;
    if (Array.isArray(value)) return value.map((item) => replaceStringValue(item, from, to));
    if (value && typeof value === 'object') {
        const result: JsonRecord = {};
        let changed = false;
        for (const [key, item] of Object.entries(value as JsonRecord)) {
            const next = replaceStringValue(item, from, to);
            if (next !== item) changed = true;
            result[key] = next;
        }
        return changed ? result : value;
    }
    return value;
}
