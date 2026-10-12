/**
 * Runtime checks for the desktop SQLite store.
 *
 * Mirrors the case list in `packages/common/src/storage/storage.check.ts` — the
 * renderer's reference implementation — so the two stay in step. Extra cases
 * here cover what only SQL can get wrong: transaction rollback on a conflicting
 * batch, expired-row pruning, schema versioning and corrupt-file recovery.
 *
 * Run with: pnpm --filter @kn/desktop check:storage
 *
 * The store needs the `better-sqlite3` binary built for the *running* Node
 * (pnpm builds it that way); after `rebuild:native` it is built for Electron
 * instead, and this check reports a skip so the Electron smoke can cover it.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, readSchemaVersion } from './schema';
import { SqliteKvStore, openStorageDatabase } from './sqlite-store';
import { StorageError } from './types';

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, actual?: unknown): void {
    if (condition) {
        pass += 1;
        console.log('  ok   ' + name);
    } else {
        fail += 1;
        console.log('  FAIL ' + name + (actual === undefined ? '' : '  -> ' + JSON.stringify(actual)));
    }
}

function checkEqual(name: string, actual: unknown, expected: unknown): void {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    check(name + (ok ? '' : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`), ok);
}

function checkCode(name: string, run: () => unknown, code: string): void {
    try {
        run();
        check(name + ` (resolved instead of throwing ${code})`, false);
    } catch (error) {
        const actual = error instanceof StorageError ? error.code : 'not-a-StorageError';
        check(name, actual === code, actual);
    }
}

async function main(): Promise<void> {
    let clock = 1_000_000;
    const opened = openStorageDatabase(':memory:');
    const store = new SqliteKvStore(opened.db, { location: ':memory:', now: () => clock });

    console.log('\nSchema');
    checkEqual('user_version is the current schema', readSchemaVersion(opened.db), SCHEMA_VERSION);
    const secondRun = openStorageDatabase(':memory:');
    check('migrations are re-runnable', readSchemaVersion(secondRun.db) === SCHEMA_VERSION);
    secondRun.db.close();

    console.log('\nRevisions and compare-and-set');
    const first = store.set('app.test', 'alpha', { title: 'hello' });
    checkEqual('set returns rev 1', first.rev, 1);
    checkEqual('get round-trips the value', store.get<{ title: string }>('app.test', 'alpha')?.value, { title: 'hello' });
    const second = store.set('app.test', 'alpha', { title: 'again' });
    checkEqual('second write bumps rev', second.rev, 2);
    checkEqual('second write keeps createdAt', second.createdAt, first.createdAt);
    checkEqual('get on a missing key', store.get('app.test', 'missing'), null);
    checkCode('ifRev 0 refuses an existing key', () => store.set('app.test', 'alpha', {}, { ifRev: 0 }), 'STORAGE_REV_CONFLICT');
    checkEqual('ifRev matches the stored revision', store.set('app.test', 'alpha', { title: 'cas' }, { ifRev: 2 }).rev, 3);
    checkEqual('ifRev 0 creates when absent', store.set('app.test', 'fresh', 1, { ifRev: 0 }).rev, 1);

    console.log('\nValidation');
    checkCode('rejects a bad namespace', () => store.set('Bad Namespace', 'k', 1), 'STORAGE_INVALID_NAMESPACE');
    checkCode('rejects a bad key', () => store.set('app.test', 'bad\u0000key', 1), 'STORAGE_INVALID_KEY');
    checkCode('rejects undefined', () => store.set('app.test', 'u', undefined), 'STORAGE_INVALID_VALUE');
    checkCode('rejects bigint', () => store.set('app.test', 'b', { n: 1n }), 'STORAGE_INVALID_VALUE');
    checkCode('rejects NaN', () => store.set('app.test', 'n', { n: Number.NaN }), 'STORAGE_INVALID_VALUE');
    checkCode(
        'rejects oversized values',
        () => store.set('app.test', 'big', 'x'.repeat(2 * 1024 * 1024 + 8)),
        'STORAGE_INVALID_VALUE',
    );
    checkEqual('a rejected write stored nothing', store.get('app.test', 'u'), null);

    console.log('\nTTL');
    const before = clock;
    store.set('app.test', 'short', 'lived', { ttlMs: 1000 });
    checkEqual('ttl is recorded as an absolute expiry', store.get('app.test', 'short')?.expiresAt, before + 1000);
    checkEqual('unexpired ttl entry counts', store.count('app.test', 'short'), 1);
    clock += 5000;
    checkEqual('expired entry reads as absent', store.get('app.test', 'short'), null);
    checkEqual('expired entry is not counted', store.count('app.test', 'short'), 0);
    checkEqual('expired entry is skipped by keys', store.keys('app.test').includes('short'), false);
    checkEqual('a TTL lapse resets the revision', store.set('app.test', 'short', 'again', { ifRev: 0 }).rev, 1);
    store.set('app.test', 'short2', 'x', { ttlMs: 1 });
    clock += 10;
    check('pruneExpired reclaims expired rows', store.pruneExpired() >= 1);
    checkEqual('pruned row is gone physically', store.get('app.test', 'short2'), null);

    console.log('\nOrdering, pagination, prefixes');
    for (const name of ['d1', 'd2', 'd3', 'd4', 'd5']) store.set('app.pages', name, name);
    const pageOne = store.list<string>({ namespace: 'app.pages', limit: 2 });
    checkEqual('list honours the limit', pageOne.entries.map((entry) => entry.key), ['d1', 'd2']);
    check('list returns a cursor while more rows remain', typeof pageOne.cursor === 'string');
    const pageTwo = store.list<string>({ namespace: 'app.pages', limit: 2, cursor: pageOne.cursor });
    checkEqual('cursor continues the scan', pageTwo.entries.map((entry) => entry.key), ['d3', 'd4']);
    const pageThree = store.list<string>({ namespace: 'app.pages', limit: 2, cursor: pageTwo.cursor });
    checkEqual('final page has no cursor', pageThree.cursor, null);
    checkEqual('final page holds the remainder', pageThree.entries.map((entry) => entry.key), ['d5']);
    checkEqual('keys is ordered and prefixed', store.keys('app.pages', 'd'), ['d1', 'd2', 'd3', 'd4', 'd5']);
    checkEqual('keys filters', store.keys('app.pages', 'd3'), ['d3']);
    checkEqual('count honours the prefix', store.count('app.pages', 'd'), 5);

    store.set('app.other', 'd1', 'not the same key');
    checkEqual('namespaces isolate the same key', store.get<string>('app.other', 'd1')?.value, 'not the same key');
    checkEqual('namespaces() is sorted', store.namespaces(), ['app.other', 'app.pages', 'app.test']);
    checkEqual('getMany returns the live subset', store.getMany('app.pages', ['d1', 'nope']).length, 1);
    checkEqual('delete removes the key', store.delete('app.other', 'd1'), true);
    checkEqual('delete of a missing key', store.delete('app.other', 'd1'), false);
    checkEqual('clear reports the removed count', store.clear('app.pages', 'd'), 5);
    checkEqual('clear emptied the namespace', store.count('app.pages'), 0);

    console.log('\nBatch atomicity');
    store.batch([
        { type: 'set', namespace: 'app.batch', key: 'x', value: 1 },
        { type: 'set', namespace: 'app.batch', key: 'y', value: 2 },
    ]);
    checkEqual('batch wrote both keys', store.count('app.batch'), 2);
    checkEqual('batch reports what it did', store.batch([
        { type: 'set', namespace: 'app.batch', key: 'z', value: 3 },
        { type: 'delete', namespace: 'app.batch', key: 'x' },
    ]), { written: 1, deleted: 1 });
    checkEqual('batch delete applied', store.get('app.batch', 'x'), null);
    checkCode(
        'a conflicting batch is rejected',
        () =>
            store.batch([
                { type: 'set', namespace: 'app.batch', key: 'y', value: 9, ifRev: 99 },
                { type: 'set', namespace: 'app.batch', key: 'w', value: 4 },
            ]),
        'STORAGE_REV_CONFLICT',
    );
    checkEqual('the transaction rolled back the later key', store.get('app.batch', 'w'), null);
    checkEqual('the transaction left the conflicting key alone', store.get<number>('app.batch', 'y')?.value, 2);

    console.log('\nDiagnostics');
    const info = store.info();
    checkEqual('info reports the engine', info.engine, 'sqlite');
    checkEqual('info reports durability', info.durable, true);
    checkEqual('info reports the schema version', info.schemaVersion, SCHEMA_VERSION);
    check('info counts live entries', info.entries > 0, info.entries);
    check('info counts bytes', typeof info.bytes === 'number' && info.bytes > 0, info.bytes);
    checkEqual('info reports the location', info.location, ':memory:');

    console.log('\nCorruption');
    opened.db.exec("INSERT INTO kv (namespace, key, value, rev, created_at, updated_at, expires_at) VALUES ('app.corrupt', 'broken', 'not json', 1, 1, 1, NULL)");
    checkCode('a malformed row surfaces as corrupt', () => store.get('app.corrupt', 'broken'), 'STORAGE_CORRUPT');
    // Counts and byte totals never parse a value, so they stay usable — which is
    // what a settings panel needs in order to show "one entry is unreadable".
    const corruptInfo = store.info();
    check('aggregates survive a corrupt row', corruptInfo.entries > 0 && (corruptInfo.bytes ?? 0) > 0);

    console.log('\nCorrupt file recovery');
    const dir = mkdtempSync(join(tmpdir(), 'kn-storage-'));
    try {
        const file = join(dir, 'kotion.db');
        writeFileSync(file, 'this is definitely not a sqlite database');
        const recovered = openStorageDatabase(file);
        check('a corrupt file is moved aside', typeof recovered.recoveredFrom === 'string', recovered.recoveredFrom);
        check('the recovered file opens on a fresh schema', readSchemaVersion(recovered.db) === SCHEMA_VERSION);
        recovered.db.close();

        const reopened = openStorageDatabase(file);
        check('reopening an existing file applies no migration', reopened.notes.filter((note) => note.includes('applied')).length === 0);
        reopened.db.close();

        const fresh = openStorageDatabase(join(dir, 'nested', 'deeper', 'kotion.db'));
        check('the parent directory is created', readSchemaVersion(fresh.db) === SCHEMA_VERSION);
        fresh.db.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }

    console.log('\nLifecycle');
    const store2 = new SqliteKvStore(opened.db, { location: ':memory:' });
    store2.close();
    store2.close();
    check('close() is idempotent', true);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    if (fail > 0) process.exit(1);
}

main().catch((error) => {
    if (isNativeAbiMismatch(error)) {
        console.log(
            '\nSKIP: better-sqlite3 is built for a different runtime than this Node ' +
                `(${process.version}). Run the Electron smoke instead:\n` +
                '    apps/desktop/node_modules/.bin/electron apps/desktop/src/main/storage/electron.smoke.cjs --no-sandbox\n' +
                'Reinstalling for Node: pnpm --filter @kn/desktop rebuild:native:node',
        );
        process.exit(0);
    }
    console.error(error);
    process.exit(1);
});

/** True when the native module exists but was compiled for another ABI. */
function isNativeAbiMismatch(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /NODE_MODULE_VERSION|was compiled against a different Node\.js version|invalid ELF header|mach-o/i.test(
        message,
    );
}
