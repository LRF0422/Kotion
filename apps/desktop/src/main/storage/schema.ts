/**
 * Schema and migrations for the desktop storage database.
 *
 * Migrations are append-only and each runs inside its own transaction, so a
 * failure leaves the previous version intact and `PRAGMA user_version` always
 * describes the schema actually on disk.
 *
 * Adding a migration: append `{ version: n + 1, name, up }` — never edit an
 * existing one, because shipped databases have already run it.
 */

import type { Database } from 'better-sqlite3';

export interface Migration {
    /** Monotonic version, written to `PRAGMA user_version`. */
    version: number;
    /** Short description, logged when applied. */
    name: string;
    up: (db: Database) => void;
}

export const MIGRATIONS: Migration[] = [
    {
        version: 1,
        name: 'kv',
        up: (db) => {
            // `WITHOUT ROWID` + PK (namespace, key) makes the primary key the
            // table's B-tree, so `WHERE namespace = ? ORDER BY key` is an index
            // scan with no second lookup — which is exactly the shape of every
            // read this store performs.
            db.exec(`
                CREATE TABLE IF NOT EXISTS kv (
                    namespace  TEXT    NOT NULL,
                    key        TEXT    NOT NULL,
                    value      TEXT    NOT NULL,
                    rev        INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    expires_at INTEGER,
                    PRIMARY KEY (namespace, key)
                ) WITHOUT ROWID
            `);
            // Partial index: only expiring rows are indexed, so the common case
            // (no TTL at all) pays nothing for the prune query.
            db.exec(`
                CREATE INDEX IF NOT EXISTS kv_expires_at
                    ON kv (expires_at) WHERE expires_at IS NOT NULL
            `);
        },
    },
    {
        version: 2,
        name: 'domain-space-page',
        up: (db) => {
            // Local-first domain tables. `data` holds the normalized contract
            // record (Space / PageMetadata / BlockSummary) exactly as the
            // renderer knows it; the extracted columns exist only so list and
            // tree queries — the app's hot path — are index scans.
            //
            // `dirty` means "a local edit the cloud has not accepted yet" and
            // is what stops a pull from overwriting a queued change.
            // `deleted` is a tombstone, kept so a queued delete can still be
            // replayed after a restart.
            db.exec(`
                CREATE TABLE IF NOT EXISTS spaces (
                    id                TEXT    PRIMARY KEY,
                    name              TEXT    NOT NULL DEFAULT '',
                    type              TEXT,
                    archived          INTEGER NOT NULL DEFAULT 0,
                    favorite          INTEGER NOT NULL DEFAULT 0,
                    personal          INTEGER NOT NULL DEFAULT 0,
                    data              TEXT    NOT NULL,
                    updated_at        INTEGER NOT NULL,
                    remote_updated_at INTEGER,
                    deleted           INTEGER NOT NULL DEFAULT 0,
                    dirty             INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS spaces_order ON spaces (deleted, archived, name);

                CREATE TABLE IF NOT EXISTS pages (
                    id                TEXT    PRIMARY KEY,
                    space_id          TEXT,
                    parent_id         TEXT,
                    title             TEXT    NOT NULL DEFAULT '',
                    page_type         TEXT,
                    status            TEXT,
                    favorite          INTEGER NOT NULL DEFAULT 0,
                    pinned            INTEGER NOT NULL DEFAULT 0,
                    rank              INTEGER NOT NULL DEFAULT 0,
                    data              TEXT    NOT NULL,
                    updated_at        INTEGER NOT NULL,
                    remote_updated_at INTEGER,
                    deleted           INTEGER NOT NULL DEFAULT 0,
                    dirty             INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS pages_space ON pages (space_id, deleted, parent_id, rank);
                CREATE INDEX IF NOT EXISTS pages_recent ON pages (deleted, remote_updated_at, updated_at);

                CREATE TABLE IF NOT EXISTS blocks (
                    id                TEXT    PRIMARY KEY,
                    page_id           TEXT,
                    space_id          TEXT,
                    parent_id         TEXT,
                    type              TEXT,
                    text              TEXT,
                    data              TEXT    NOT NULL,
                    updated_at        INTEGER NOT NULL,
                    remote_updated_at INTEGER,
                    deleted           INTEGER NOT NULL DEFAULT 0,
                    dirty             INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS blocks_page ON blocks (page_id, deleted);
                CREATE INDEX IF NOT EXISTS blocks_space ON blocks (space_id, deleted);

                CREATE TABLE IF NOT EXISTS page_documents (
                    page_id           TEXT    PRIMARY KEY,
                    doc               TEXT,
                    rev               TEXT,
                    data              TEXT    NOT NULL,
                    updated_at        INTEGER NOT NULL,
                    remote_updated_at INTEGER,
                    dirty             INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS outbox (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind         TEXT    NOT NULL,
                    entity       TEXT    NOT NULL,
                    entity_id    TEXT    NOT NULL,
                    coalesce_key TEXT,
                    payload      TEXT    NOT NULL,
                    state        TEXT    NOT NULL DEFAULT 'pending',
                    attempts     INTEGER NOT NULL DEFAULT 0,
                    last_error   TEXT,
                    created_at   INTEGER NOT NULL,
                    updated_at   INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS outbox_state ON outbox (state, id);
                CREATE UNIQUE INDEX IF NOT EXISTS outbox_coalesce
                    ON outbox (coalesce_key) WHERE coalesce_key IS NOT NULL;

                CREATE TABLE IF NOT EXISTS sync_state (
                    key        TEXT    PRIMARY KEY,
                    value      TEXT    NOT NULL,
                    updated_at INTEGER NOT NULL
                ) WITHOUT ROWID;
            `);
        },
    },
    {
        version: 3,
        name: 'outbox-coalesce-pending-only',
        up: (db) => {
            // Coalescing must only ever replace a mutation that has not left the
            // device yet. The v2 index covered every entry, and `enqueue` matched
            // `failed` rows too, so a second edit with the same key could land on
            // an entry that was already on the wire: the push then sent the older
            // payload while the ack deleted the newer one. From v3 an entry being
            // pushed is `inflight` (see `claimOutbox`) and is never coalesced.
            db.exec(`
                DROP INDEX IF EXISTS outbox_coalesce;
                -- Deliberately NOT unique: releasing an entry that failed
                -- mid-push can legitimately put two entries with the same key
                -- back in the queue (the older payload first, the newer one
                -- after it), and the order is what keeps the final state right.
                -- enqueue() is the only coalescing writer and it looks the row
                -- up inside a transaction, so uniqueness buys nothing.
                CREATE INDEX IF NOT EXISTS outbox_coalesce
                    ON outbox (coalesce_key) WHERE coalesce_key IS NOT NULL AND state = 'pending';
                CREATE INDEX IF NOT EXISTS outbox_entity ON outbox (entity_id, state);
            `);
        },
    },
    {
        version: 4,
        name: 'page-history',
        up: (db) => {
            // Checkpoints/history for the *local* medium.
            //
            // The cloud keeps the revision log inside the document store, so a
            // device that only writes locally had no way to answer Ctrl+S or the
            // version panel. Each row is a self-contained snapshot of the page
            // document at `rev`, with `remote_rev` recording the cloud revision
            // once the same checkpoint also exists there (null = local-only).
            // `rev` is per page and monotonic; history is pruned by the store.
            db.exec(`
                CREATE TABLE IF NOT EXISTS page_history (
                    page_id    TEXT    NOT NULL,
                    rev        TEXT    NOT NULL,
                    kind       TEXT    NOT NULL DEFAULT 'USER',
                    label      TEXT,
                    client_id  TEXT,
                    doc        TEXT,
                    data       TEXT    NOT NULL,
                    remote_rev TEXT,
                    current    INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (page_id, rev)
                ) WITHOUT ROWID;
                CREATE INDEX IF NOT EXISTS page_history_recent ON page_history (page_id, created_at DESC);
            `);
        },
    },
];

/** Version this build expects after migrations have run. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Read the schema version recorded in the database file. */
export function readSchemaVersion(db: Database): number {
    const version = db.pragma('user_version', { simple: true });
    return typeof version === 'number' ? version : 0;
}

export interface MigrationResult {
    from: number;
    to: number;
    applied: string[];
}

/**
 * Bring `db` up to {@link SCHEMA_VERSION}.
 *
 * Refuses to continue when the file is *newer* than this build: opening a
 * future schema read-only would silently mis-read data, so it is an error the
 * user can act on (upgrade the app) instead.
 */
export function runMigrations(
    db: Database,
    migrations: Migration[] = MIGRATIONS,
    log: (message: string) => void = () => {},
): MigrationResult {
    const from = readSchemaVersion(db);
    const target = migrations.length ? migrations[migrations.length - 1].version : 0;

    if (from > target) {
        throw new Error(
            `storage database schema v${from} is newer than this build supports (v${target}); upgrade the app`,
        );
    }

    const applied: string[] = [];
    for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
        if (migration.version <= from) continue;
        const apply = db.transaction(() => {
            migration.up(db);
            // `user_version` cannot be parameterised; the value is a number
            // from our own migration table, never user input.
            db.pragma(`user_version = ${migration.version}`);
        });
        apply();
        applied.push(`${migration.version}:${migration.name}`);
        log(`[storage] applied migration ${migration.version} (${migration.name})`);
    }

    return { from, to: readSchemaVersion(db), applied };
}
