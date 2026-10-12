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
