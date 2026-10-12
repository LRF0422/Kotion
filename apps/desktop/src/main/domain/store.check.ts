/**
 * Runtime checks for the local-first domain store (spaces / pages / blocks /
 * documents + outbox).
 *
 * These are the cases only SQL can get wrong — transaction rollback, the
 * dirty-row rule, soft vs hard delete, and the id re-keying that turns a
 * locally created page into the cloud's page without leaving a dangling
 * reference anywhere.
 *
 * Run with: pnpm --filter @kn/desktop check:domain
 *
 * Like `check:storage`, this needs the `better-sqlite3` binary built for the
 * *running* Node; after `rebuild:native` it is built for Electron and the check
 * reports a skip so the Electron smoke covers it instead.
 */

import { openStorageDatabase } from '../storage/sqlite-store';
import { SCHEMA_VERSION, readSchemaVersion } from '../storage/schema';
import { SqliteDomainStore, replaceStringValue } from './store';
import { DomainError } from './types';

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
        const actual = error instanceof DomainError ? error.code : 'not-a-DomainError';
        check(name, actual === code, actual);
    }
}

const page = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    spaceId: 's1',
    parentId: null,
    title: `Page ${id}`,
    ...overrides,
});

function main(): void {
    let clock = 1_000_000;
    const now = (): number => (clock += 1000);

    console.log('\nSchema');
    const opened = openStorageDatabase(':memory:');
    checkEqual('the domain schema is at the current version', readSchemaVersion(opened.db), SCHEMA_VERSION);
    check('schema version is at least 3', SCHEMA_VERSION >= 3, SCHEMA_VERSION);
    const store = new SqliteDomainStore(opened.db, { location: ':memory:', now });

    console.log('\nSpaces');
    checkEqual(
        'upsertSpaces stores records',
        store.upsertSpaces([
            { id: 's1', name: 'Team', type: 'COLLABORATION', updateTime: '2024-01-01T00:00:00Z' },
            { id: 's2', name: 'Personal', type: 'PERSONAL' },
        ]),
        2,
    );
    checkEqual('getSpace round-trips the payload', store.getSpace('s1')?.name, 'Team');
    checkEqual('remote_updated_at comes from the contract timestamp', store.getSpace('s1')?.remoteUpdatedAt, Date.parse('2024-01-01T00:00:00Z'));
    checkEqual('listSpaces keeps every row', store.listSpaces().length, 2);
    checkEqual('countSpaces honours a filter', store.countSpaces({ search: 'pers' }), 1);
    checkEqual('countSpaces filters by type', store.countSpaces({ type: 'COLLABORATION' }), 1);

    console.log('\nDirty rows survive a clean upsert');
    store.upsertSpaces([{ id: 's1', name: 'Renamed offline', dirty: true }]);
    store.upsertSpaces([{ id: 's1', name: 'Server name', updateTime: '2024-06-01T00:00:00Z' }]);
    checkEqual('the queued edit is not clobbered by a pull', store.getSpace('s1')?.name, 'Renamed offline');
    checkEqual('the pulled timestamp still lands', store.getSpace('s1')?.remoteUpdatedAt, Date.parse('2024-06-01T00:00:00Z'));
    // The sync engine clears `dirty` once the cloud has accepted the edit; from
    // then on the cloud is authoritative again.
    store.markSynced('space', ['s1']);
    store.upsertSpaces([{ id: 's1', name: 'Server name' }]);
    checkEqual('once the row is no longer dirty a clean upsert wins', store.getSpace('s1')?.name, 'Server name');

    console.log('\nPages');
    store.upsertPages([page('p1'), page('p2', { rank: 1 }), page('p3', { parentId: 'p1' })]);
    checkEqual('getPage round-trips', store.getPage('p2')?.title, 'Page p2');
    checkEqual('listPages for one space', store.listPages({ spaceId: 's1' }).length, 3);
    checkEqual('listPages at the root only', store.listPages({ spaceId: 's1', parentId: 'root' }).map((row) => row.id), ['p1', 'p2']);
    checkEqual('children are addressable by parent', store.listPages({ parentId: 'p1' }).map((row) => row.id), ['p3']);
    checkEqual('sibling order follows rank', store.listPages({ spaceId: 's1', parentId: 'root' })[1]?.id, 'p2');
    checkEqual('countPages counts the same filter', store.countPages({ spaceId: 's1' }), 3);
    checkEqual('search matches the title', store.listPages({ search: 'p3' }).map((row) => row.id), ['p3']);
    store.upsertPages([
        page('p5', { updateTime: '2025-01-01T00:00:00Z' }),
        page('p6', { updateTime: '2025-06-01T00:00:00Z' }),
    ]);
    checkEqual('recent ordering prefers the newest cloud timestamp', store.listPages({ orderBy: 'updated' })[0]?.id, 'p6');
    store.upsertPages([
        page('p7', { spaceId: 's-local' }),
        page('p8', { spaceId: 's-local' }),
    ]);
    checkEqual(
        'rows with no cloud timestamp fall back to the local write time',
        store.listPages({ spaceId: 's-local', orderBy: 'updated' })[0]?.id,
        'p8',
    );

    console.log('\nSoft delete versus "never pushed"');
    const inSpaceBeforeDelete = store.listPages({ spaceId: 's1' }).length;
    checkEqual('deleting a clean page soft-deletes it', store.deletePages(['p3']), 1);
    checkEqual('a soft-deleted row disappears from lists', store.listPages({ spaceId: 's1' }).length, inSpaceBeforeDelete - 1);
    check('a soft-deleted row is still readable', store.getPage('p3') !== null);
    store.upsertPages([page('p4', { dirty: true })]);
    store.enqueue([{ kind: 'page.create', entity: 'page', entityId: 'p4', payload: { id: 'p4' } }]);
    checkEqual('deleting an unpushed page drops it outright', store.deletePages(['p4']), 1);
    checkEqual('and its queued mutation goes with it', store.getPage('p4'), null);
    checkEqual('the outbox no longer holds the dropped create', store.countOutbox(), 0);

    console.log('\nDocuments');
    store.upsertDocument({ pageId: 'p1', doc: { type: 'doc' }, rev: 7 });
    checkEqual('document payload round-trips', store.getDocument('p1')?.doc, { type: 'doc' });
    checkEqual('document revision round-trips as text', store.getDocument('p1')?.rev, '7');
    store.upsertDocument({ pageId: 'p1', doc: { type: 'doc', local: true }, dirty: true });
    store.upsertDocument({ pageId: 'p1', doc: { type: 'doc' }, rev: 8 });
    checkEqual('a dirty document is not clobbered by a pull', store.getDocument('p1')?.doc, { type: 'doc', local: true });
    checkEqual('a missing document reads as null', store.getDocument('nope'), null);

    console.log('\nBlocks');
    checkEqual(
        'upsertBlocks stores records',
        store.upsertBlocks([
            { id: 'b1', pageId: 'p1', spaceId: 's1', type: 'paragraph', text: 'Hello world' },
            { id: 'b2', pageId: 'p1', spaceId: 's1', type: 'heading', text: 'Hello again' },
            { id: 'b3', pageId: 'p2', spaceId: 's1', type: 'paragraph', text: 'Unrelated' },
        ]),
        3,
    );
    checkEqual('blocks are scoped to a page', store.listBlocks({ pageId: 'p1' }).length, 2);
    checkEqual('block search matches the text', store.listBlocks({ spaceId: 's1', search: 'hello' }).length, 2);
    checkEqual('block count honours the page filter', store.countBlocks({ pageId: 'p1' }), 2);
    checkEqual('a block is readable by id', store.getBlock('b3')?.text, 'Unrelated');
    checkEqual('deleting a clean block soft-deletes it', store.deleteBlocks(['b3']), 1);
    checkEqual('and it leaves the counts', store.countBlocks({ spaceId: 's1' }), 2);

    console.log('\nOutbox');
    // Ids are not assumed to start at 1: earlier cases in this run may already
    // have enqueued (and dropped) entries, so they are captured, not hardcoded.
    const queued = store.enqueue([
        { kind: 'page.title', entity: 'page', entityId: 'p1', payload: { title: 'A' }, coalesceKey: 'page.title:p1' },
        { kind: 'page.move', entity: 'page', entityId: 'p1', payload: { targetSpaceId: 's2' }, coalesceKey: 'page.move:p1' },
    ]);
    checkEqual('enqueue returns ids in insert order', queued[1] > queued[0], true);
    checkEqual(
        'a coalesce key replaces the pending entry instead of appending',
        store.enqueue([{ kind: 'page.title', entity: 'page', entityId: 'p1', payload: { title: 'B' }, coalesceKey: 'page.title:p1' }]),
        [queued[0]],
    );
    checkEqual('the coalesced payload is the newest one', store.listOutbox()[0]?.payload, { title: 'B' });
    checkEqual('listOutbox is ordered by id', store.listOutbox().map((entry) => entry.id), queued);
    store.failOutbox(queued[0], 'HTTP 422');
    checkEqual('failOutbox marks the entry failed', store.countOutbox('failed'), 1);
    checkEqual('and records why', store.listOutbox({ state: 'failed' })[0]?.lastError, 'HTTP 422');
    checkEqual('the entry keeps its attempt count', store.listOutbox({ state: 'failed' })[0]?.attempts, 1);
    checkEqual('retryOutbox moves failed entries back to pending', store.retryOutbox(), 1);
    checkEqual('a retried entry is pending again', store.countOutbox('pending'), 2);
    checkEqual('ackOutbox removes accepted entries', store.ackOutbox([queued[1]]), 1);
    checkEqual('the queue is now a single entry', store.countOutbox(), 1);
    checkEqual('markSynced clears the dirty flag', (() => { store.markSynced('page', ['p1']); return store.getPage('p1')?.dirty; })(), false);
    checkCode('an unknown outbox entity is rejected', () => store.enqueue([{ kind: 'k', entity: 'nope', entityId: 'x', payload: {} }]), 'LOCAL_STORE_INVALID');
    checkCode('an empty entity id is rejected', () => store.enqueue([{ kind: 'k', entity: 'page', entityId: '', payload: {} }]), 'LOCAL_STORE_INVALID');
    checkCode('a missing page id is rejected', () => store.getPage(''), 'LOCAL_STORE_INVALID');
    checkCode('a non-array record list is rejected', () => store.upsertPages({}), 'LOCAL_STORE_INVALID');

    console.log('\nTombstones are local state');
    store.upsertPages([page('t1', { title: 'Alive' }), page('t2', { title: 'Alive too' })]);
    store.deletePages(['t1']);
    checkEqual('deleting a clean page tombstones it', store.getPage('t1')?.deleted, true);
    store.upsertPages([page('t1', { title: 'Back from the server?' })]);
    checkEqual('a pull that never mentions deleted does not resurrect it', store.getPage('t1')?.deleted, true);
    checkEqual('and the tree still excludes it', store.listPages({ spaceId: 's1' }).some((row) => row.id === 't1'), false);
    store.upsertPages([page('t1', { title: 'Restored', deleted: false })]);
    checkEqual('an explicit deleted:false restores it', store.getPage('t1')?.deleted, false);

    console.log('\nDiscarding only what the cloud never accepted');
    store.upsertPages([page('d1', { dirty: true })]);
    store.upsertPages([page('d2', { dirty: true })]);
    store.enqueue([{ kind: 'page.title', entity: 'page', entityId: 'd2', payload: { title: 'renamed' } }]);
    checkEqual('a page with only a queued edit is tombstoned', (() => { store.deletePages(['d2']); return store.getPage('d2')?.deleted; })(), true);
    checkEqual('and its queued edit survives', store.listOutbox({ entityId: 'd2' }).length, 1);
    store.enqueue([{ kind: 'page.create', entity: 'page', entityId: 'd1', payload: { id: 'd1' } }]);
    checkEqual('a page whose create is queued is dropped outright', (() => { store.deletePages(['d1']); return store.getPage('d1'); })(), null);
    checkEqual('along with its queued ops', store.listOutbox({ entityId: 'd1' }).length, 0);

    console.log('\nRe-keying a locally created page');
    store.upsertPages([
        page('local-page-1', { dirty: true }),
        page('child-a', { parentId: 'local-page-1', title: 'Child A' }),
        page('child-b', { parentId: 'local-page-1', title: 'Child B' }),
    ]);
    store.upsertBlocks([
        { id: 'b9', pageId: 'local-page-1', spaceId: 's1', type: 'paragraph', text: 'body' },
        { id: 'b10', pageId: 'local-page-1', spaceId: 's1', type: 'heading', text: 'other body' },
    ]);
    store.upsertDocument({ pageId: 'local-page-1', doc: { type: 'doc' }, dirty: true });
    store.enqueue([
        { kind: 'page.move', entity: 'page', entityId: 'local-page-1', payload: { pageId: 'local-page-1', targetSpaceId: 's1', targetParentId: null } },
        { kind: 'page.title', entity: 'page', entityId: 'local-page-1', payload: { pageId: 'local-page-1', title: 'Kept' } },
        { kind: 'other', entity: 'page', entityId: 'unrelated', payload: { note: 'local-page-1 is only part of this string' } },
    ]);
    const remapped = store.remapPage('local-page-1', 'p42');
    check('remap reports the rows it touched', remapped.affected >= 4, remapped);
    checkEqual('the row moved to the cloud id', store.getPage('p42')?.title, 'Page local-page-1');
    checkEqual('the temporary id is gone', store.getPage('local-page-1'), null);
    checkEqual('every child follows its parent', store.getPage('child-a')?.parentId, 'p42');
    checkEqual('and keeps its own payload (child A)', store.getPage('child-a')?.title, 'Child A');
    checkEqual('and keeps its own payload (child B)', store.getPage('child-b')?.title, 'Child B');
    checkEqual('blocks follow their page', store.listBlocks({ pageId: 'p42' }).map((row) => row.id), ['b10', 'b9']);
    checkEqual('each block keeps its own text', store.getBlock('b10')?.text, 'other body');
    checkEqual('and so does its sibling', store.getBlock('b9')?.text, 'body');
    checkEqual('the document follows its page', store.getDocument('p42')?.pageId, 'p42');
    checkEqual('outbox entity ids are rewritten', store.listOutbox({ entityId: 'p42' }).length, 2);
    checkEqual(
        'ids embedded in queued payloads are rewritten',
        store.listOutbox({ entityId: 'p42' }).map((entry) => (entry.payload as { pageId?: string }).pageId),
        ['p42', 'p42'],
    );
    checkEqual(
        'a string that merely contains the id is left alone',
        (store.listOutbox().find((entry) => entry.entityId === 'unrelated')?.payload as { note?: string }).note,
        'local-page-1 is only part of this string',
    );

    console.log('\nRe-keying a locally created space');
    store.upsertSpaces([{ id: 'local-space-1', name: 'Offline space', dirty: true }]);
    store.upsertPages([page('p50', { spaceId: 'local-space-1' })]);
    store.upsertBlocks([{ id: 'b50', pageId: 'p50', spaceId: 'local-space-1' }]);
    store.enqueue([{ kind: 'space.favorite', entity: 'space', entityId: 'local-space-1', payload: { spaceId: 'local-space-1' } }]);
    store.remapSpace('local-space-1', 's77');
    checkEqual('the space row is re-keyed', store.getSpace('s77')?.name, 'Offline space');
    checkEqual('pages follow the space', store.getPage('p50')?.spaceId, 's77');
    checkEqual('blocks follow the space', store.listBlocks({ spaceId: 's77' }).map((row) => row.id), ['b50']);
    checkEqual('outbox payloads follow the space', store.listOutbox({ entityId: 's77' })[0]?.payload, { spaceId: 's77' });

    console.log('\nClaiming entries for replay');
    // Drain whatever the earlier sections left queued, so this section observes
    // exactly the entries it creates.
    store.ackOutbox(store.listOutbox().map((entry) => entry.id));
    const claimable = store.enqueue([
        { kind: 'page.title', entity: 'page', entityId: 'p1', payload: { title: 'one' }, coalesceKey: 'page.title:p1' },
    ]);
    const claimed = store.claimOutbox({ limit: 1 });
    checkEqual('claimOutbox takes the oldest pending entry', claimed.map((entry) => entry.id), claimable);
    checkEqual('and marks it inflight', claimed[0]?.state, 'inflight');
    checkEqual('the queue no longer offers it as pending', store.countOutbox('pending'), 0);
    checkEqual('countOutbox can see it inflight', store.countOutbox('inflight'), 1);
    const whileInflight = store.enqueue([
        { kind: 'page.title', entity: 'page', entityId: 'p1', payload: { title: 'two' }, coalesceKey: 'page.title:p1' },
    ]);
    check('an edit arriving mid-push becomes its own entry', whileInflight[0] !== claimable[0], whileInflight);
    checkEqual('with the newer payload', store.listOutbox({ state: 'pending' })[0]?.payload, { title: 'two' });
    checkEqual('the in-flight payload is untouched', store.listOutbox({ state: 'inflight' })[0]?.payload, { title: 'one' });
    checkEqual('retryOutbox releases an inflight entry', store.retryOutbox(claimable), 1);
    checkEqual('it is pending again', store.countOutbox('pending'), 2);
    checkEqual('ackOutbox clears the rest', store.ackOutbox(store.listOutbox().map((entry) => entry.id)), 2);

    console.log('\nLocal history (the local medium for checkpoints)');
    store.upsertDocument({ pageId: 'h1', doc: { type: 'doc', body: 'v1' }, rev: 3 });
    const first = store.appendHistory({ pageId: 'h1', kind: 'USER', label: 'first', clientId: 'c1' });
    checkEqual('appendHistory assigns local rev 1', first.rev, '1');
    checkEqual('and marks it current', first.current, true);
    const second = store.appendHistory({ pageId: 'h1', kind: 'USER', doc: { type: 'doc', body: 'v2' }, clientId: 'c1' });
    checkEqual('the next checkpoint gets rev 2', second.rev, '2');
    const listed = store.listHistory('h1');
    checkEqual('history is newest first', listed.map((row) => row.rev), ['2', '1']);
    checkEqual('only the newest is current', listed.map((row) => row.current), [true, false]);
    checkEqual('the snapshot round-trips', store.getHistoryDocument('h1', '2')?.doc, { type: 'doc', body: 'v2' });
    checkEqual('the label is kept', store.getHistoryDocument('h1', '1')?.label, 'first');
    checkEqual('an unknown rev reads as null', store.getHistoryDocument('h1', '99'), null);
    checkEqual('checkpoints start local-only', store.getHistoryDocument('h1', '1')?.remoteRev, null);
    check('markHistorySynced records the cloud rev', store.markHistorySynced('h1', '1', '77') === true);
    checkEqual('and the row now points upstream', store.getHistoryDocument('h1', '1')?.remoteRev, '77');
    checkEqual('other pages have their own rev space', store.appendHistory({ pageId: 'h2', clientId: 'c1' }).rev, '1');
    checkEqual('info counts checkpoints', store.info().checkpoints >= 3, true);
    checkEqual('deleteHistory drops one page', store.deleteHistory('h1'), 2);
    checkEqual('and leaves the other', store.listHistory('h2').length, 1);
    checkEqual('deleting a local page drops its history', (() => {
        store.upsertPages([page('h2', { dirty: true })]);
        store.enqueue([{ kind: 'page.create', entity: 'page', entityId: 'h2', payload: { id: 'h2' } }]);
        store.deletePages(['h2']);
        return store.listHistory('h2').length;
    })(), 0);

    console.log('\nSync state and maintenance');
    store.setState('sync.cursor', { token: 'abc' });
    checkEqual('sync state round-trips', store.getState('sync.cursor'), { token: 'abc' });
    checkEqual('a missing state key reads as null', store.getState('missing'), null);
    const info = store.info();
    checkEqual('info reports the sqlite engine', info.engine, 'sqlite');
    check('info counts rows', info.spaces > 0 && info.pages > 0 && info.blocks > 0, info);
    store.clear();
    checkEqual('clear empties every domain table', store.countPages({ includeDeleted: true }), 0);
    checkEqual('clear empties the outbox', store.countOutbox(), 0);
    checkEqual('clear empties the spaces', store.countSpaces({ includeDeleted: true }), 0);
    checkEqual('clear empties the sync state', store.getState('sync.cursor'), null);
    checkEqual('clear empties the checkpoints', store.info().checkpoints, 0);
    checkEqual('ids start over after clear', store.enqueue([{ kind: 'page.title', entity: 'page', entityId: 'p1', payload: {} }]), [1]);

    console.log('\nExact-match payload rewriting');
    checkEqual('strings equal to the id are replaced', replaceStringValue('a', 'a', 'b'), 'b');
    checkEqual('substrings are untouched', replaceStringValue('xa', 'a', 'b'), 'xa');
    checkEqual('nested structures are walked', replaceStringValue({ x: ['a', { y: 'a' }] }, 'a', 'b'), { x: ['b', { y: 'b' }] });

    opened.db.close();

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    if (fail > 0) process.exit(1);
}

try {
    main();
} catch (error) {
    if (isNativeAbiMismatch(error)) {
        console.log(
            '\nSKIP: better-sqlite3 is built for a different runtime than this Node ' +
                `(${process.version}).\n` +
                'Reinstalling for Node: pnpm --filter @kn/desktop rebuild:native:node',
        );
        process.exit(0);
    }
    console.error(error);
    process.exit(1);
}

/** True when the native module exists but was compiled for another ABI. */
function isNativeAbiMismatch(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /NODE_MODULE_VERSION|was compiled against a different Node\.js version|invalid ELF header|mach-o/i.test(
        message,
    );
}
