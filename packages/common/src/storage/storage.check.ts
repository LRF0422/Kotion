/**
 * Runtime checks for the storage contract and the shared KV engine.
 *
 * Both renderer backends are exercised with the same script so the SQLite
 * implementation in `apps/desktop/src/main/storage/` has a pinned reference for
 * the semantics that must match: revisions, compare-and-set, TTL, cursors,
 * prefix scans, batch atomicity and error codes.
 *
 * Run with: pnpm --filter @kn/common check:storage
 */

import {
    STORAGE_NAMESPACE_MAX_LENGTH,
    StorageError,
    appStorageNamespace,
    assertStorageKey,
    assertStorageNamespace,
    isPluginStorageNamespace,
    pluginStorageNamespace,
    storageKey,
} from './types'
import {
    createLocalStorageService,
    type WebStorageLike,
} from './local-storage'
import { createMemoryStorage } from './memory-storage'
import type { StorageService } from './types'

let pass = 0
let fail = 0

function check(name: string, condition: boolean, actual?: unknown): void {
    if (condition) {
        pass += 1
        console.log('  ok   ' + name)
    } else {
        fail += 1
        console.log('  FAIL ' + name + (actual === undefined ? '' : '  -> ' + JSON.stringify(actual)))
    }
}

function checkEqual(name: string, actual: unknown, expected: unknown): void {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    check(name + (ok ? '' : ' (got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected) + ')'), ok)
}

async function checkCode(name: string, run: () => Promise<unknown>, code: string): Promise<void> {
    try {
        await run()
        check(name + ' (resolved instead of rejecting with ' + code + ')', false)
    } catch (error) {
        const actual = StorageError.is(error) ? error.code : 'not-a-StorageError'
        check(name, actual === code, actual)
    }
}

/** Minimal `localStorage` stand-in, so the checks need no browser or flag. */
class FakeWebStorage implements WebStorageLike {
    private readonly map = new Map<string, string>()

    get length(): number {
        return this.map.size
    }

    key(index: number): string | null {
        return [...this.map.keys()][index] ?? null
    }

    getItem(key: string): string | null {
        return this.map.has(key) ? (this.map.get(key) as string) : null
    }

    setItem(key: string, value: string): void {
        this.map.set(key, String(value))
    }

    removeItem(key: string): void {
        this.map.delete(key)
    }
}

// ─── Validation ─────────────────────────────────────────────

console.log('\nNamespace and key validation')

const badNamespaces = ['', 'App Theme', '.app', 'app.', 'app..x', 'a'.repeat(STORAGE_NAMESPACE_MAX_LENGTH + 1), 42]
let rejectedNamespaces = 0
for (const namespace of badNamespaces) {
    try {
        assertStorageNamespace(namespace)
    } catch (error) {
        if (StorageError.is(error) && error.code === 'STORAGE_INVALID_NAMESPACE') rejectedNamespaces += 1
    }
}
check('rejects malformed namespaces', rejectedNamespaces === badNamespaces.length, rejectedNamespaces)

check('accepts dotted namespaces', assertStorageNamespace('plugin.my-plugin.config') === 'plugin.my-plugin.config')
check('app namespace helper', appStorageNamespace('theme') === 'app.theme')
checkEqual('plugin namespace slugs the key', pluginStorageNamespace('Plugin AI!'), 'plugin.plugin-ai')
check('plugin subtree test', isPluginStorageNamespace('plugin.plugin-ai.state', 'Plugin AI'))
check('plugin subtree rejects sibling', !isPluginStorageNamespace('plugin.other.state', 'Plugin AI'))
check('plugin subtree rejects app', !isPluginStorageNamespace('app.theme', 'Plugin AI'))

const badKeys = ['', 'a'.repeat(513), 'bad\u0000key', 7]
let rejectedKeys = 0
for (const key of badKeys) {
    try {
        assertStorageKey(key)
    } catch (error) {
        if (StorageError.is(error) && error.code === 'STORAGE_INVALID_KEY') rejectedKeys += 1
    }
}
check('rejects malformed keys', rejectedKeys === badKeys.length, rejectedKeys)
checkEqual('storageKey joins parts', storageKey('doc', 42, 'body'), 'doc/42/body')
checkEqual('storageKey drops empties', storageKey('doc', null, '', 'body'), 'doc/body')

// ─── Shared engine scenario ─────────────────────────────────

async function runScenario(label: string, service: StorageService, clock: () => number, now: () => void): Promise<void> {
    console.log('\n' + label)

    const entry = await service.set('app.test', 'alpha', { title: 'hello' })
    checkEqual('set returns rev 1', entry.rev, 1)
    checkEqual('set returns the value', entry.value, { title: 'hello' })

    const read = await service.get<{ title: string }>('app.test', 'alpha')
    checkEqual('get round-trips the value', read?.value, { title: 'hello' })
    checkEqual('get reports createdAt = updatedAt on first write', read?.createdAt, read?.updatedAt)

    const second = await service.set('app.test', 'alpha', { title: 'again' })
    checkEqual('second write bumps rev', second.rev, 2)
    checkEqual('second write keeps createdAt', second.createdAt, entry.createdAt)

    checkEqual('get on a missing key', await service.get('app.test', 'missing'), null)

    // Compare-and-set
    await checkCode(
        'ifRev 0 refuses an existing key',
        () => service.set('app.test', 'alpha', { title: 'x' }, { ifRev: 0 }),
        'STORAGE_REV_CONFLICT',
    )
    const cas = await service.set('app.test', 'alpha', { title: 'cas' }, { ifRev: 2 })
    checkEqual('ifRev matches the stored revision', cas.rev, 3)
    const created = await service.set('app.test', 'fresh', 1, { ifRev: 0 })
    checkEqual('ifRev 0 creates when absent', created.rev, 1)

    // Value validation
    await checkCode('rejects undefined', () => service.set('app.test', 'u', undefined), 'STORAGE_INVALID_VALUE')
    await checkCode('rejects bigint', () => service.set('app.test', 'b', { n: 1n }), 'STORAGE_INVALID_VALUE')
    await checkCode('rejects NaN', () => service.set('app.test', 'n', { n: Number.NaN }), 'STORAGE_INVALID_VALUE')
    await checkCode('rejects oversized values', () => service.set('app.test', 'big', 'x'.repeat(2 * 1024 * 1024 + 8)), 'STORAGE_INVALID_VALUE')
    await checkCode('rejects a bad namespace', () => service.set('Bad Namespace', 'k', 1), 'STORAGE_INVALID_NAMESPACE')

    // TTL
    const before = clock()
    await service.set('app.test', 'short', 'lived', { ttlMs: 1000 })
    const ttlEntry = await service.get('app.test', 'short')
    checkEqual('ttl is recorded as an absolute expiry', ttlEntry?.expiresAt, before + 1000)
    checkEqual('unexpired ttl entry counts', await service.count('app.test', 'short'), 1)
    now()
    checkEqual('expired entry reads as absent', await service.get('app.test', 'short'), null)
    checkEqual('expired entry is not counted', await service.count('app.test', 'short'), 0)
    checkEqual('expired entry is skipped by keys', (await service.keys('app.test')).includes('short'), false)
    const revived = await service.set('app.test', 'short', 'again', { ifRev: 0 })
    checkEqual('a TTL lapse resets the revision', revived.rev, 1)

    // Ordering, pagination, cursors
    for (const name of ['d1', 'd2', 'd3', 'd4', 'd5']) {
        await service.set('app.pages', name, name)
    }
    const firstPage = await service.list<string>({ namespace: 'app.pages', limit: 2 })
    checkEqual('list honours the limit', firstPage.entries.map((item) => item.key), ['d1', 'd2'])
    check('list returns a cursor while more rows remain', typeof firstPage.cursor === 'string')
    const secondPage = await service.list<string>({ namespace: 'app.pages', limit: 2, cursor: firstPage.cursor })
    checkEqual('cursor continues the scan', secondPage.entries.map((item) => item.key), ['d3', 'd4'])
    const lastPage = await service.list<string>({ namespace: 'app.pages', limit: 2, cursor: secondPage.cursor })
    checkEqual('final page has no cursor', lastPage.cursor, null)
    checkEqual('final page holds the remainder', lastPage.entries.map((item) => item.key), ['d5'])

    checkEqual('keys honours the prefix', await service.keys('app.pages', 'd'), ['d1', 'd2', 'd3', 'd4', 'd5'])
    checkEqual('keys filters', await service.keys('app.pages', 'd3'), ['d3'])
    checkEqual('count honours the prefix', await service.count('app.pages', 'd'), 5)

    // Namespaces stay separate
    await service.set('app.other', 'd1', 'not the same key')
    checkEqual('namespaces isolate the same key', (await service.get<string>('app.other', 'd1'))?.value, 'not the same key')
    checkEqual('namespaces() lists both roots', await service.namespaces(), ['app.other', 'app.pages', 'app.test'])

    // delete / clear
    checkEqual('delete removes the key', await service.delete('app.other', 'd1'), true)
    checkEqual('delete is idempotent', (await service.get('app.other', 'd1')) === null, true)
    checkEqual('clear reports the removed count', await service.clear('app.pages', 'd'), 5)
    checkEqual('clear emptied the namespace', await service.count('app.pages'), 0)

    // Batch: atomic in the memory backend, sequential in localStorage — either
    // way the conflict must abort before anything is written.
    await service.batch([
        { type: 'set', namespace: 'app.batch', key: 'x', value: 1 },
        { type: 'set', namespace: 'app.batch', key: 'y', value: 2 },
    ])
    checkEqual('batch wrote both keys', await service.count('app.batch'), 2)
    const batchResult = await service.batch([
        { type: 'set', namespace: 'app.batch', key: 'z', value: 3 },
        { type: 'delete', namespace: 'app.batch', key: 'x' },
    ])
    checkEqual('batch reports what it did', batchResult, { written: 1, deleted: 1 })
    checkEqual('batch delete applied', await service.get('app.batch', 'x'), null)

    await checkCode(
        'a conflicting batch is rejected',
        () =>
            service.batch([
                { type: 'set', namespace: 'app.batch', key: 'y', value: 9, ifRev: 99 },
                { type: 'set', namespace: 'app.batch', key: 'w', value: 4 },
            ]),
        'STORAGE_REV_CONFLICT',
    )
    checkEqual('rejected batch left later keys unwritten', await service.get('app.batch', 'w'), null)
    checkEqual('rejected batch left the conflicting key untouched', (await service.get<number>('app.batch', 'y'))?.value, 2)

    // scope()
    const scope = service.scope('app.scoped')
    checkEqual('scope namespace', scope.namespace, 'app.scoped')
    await scope.set('k', 'v')
    checkEqual('scope writes into its namespace', (await service.get<string>('app.scoped', 'k'))?.value, 'v')
    checkEqual('scope keys', await scope.keys(), ['k'])
    checkEqual('scope count', await scope.count(), 1)
    checkEqual('scope clear', await scope.clear(), 1)

    // info()
    const info = await service.info()
    check('info reports the engine', info.engine === 'memory' || info.engine === 'local-storage', info.engine)
    check('info reports schema version 1', info.schemaVersion === 1, info.schemaVersion)
    check('info counts live entries', info.entries > 0, info.entries)
    check('info counts bytes', typeof info.bytes === 'number' && info.bytes > 0, info.bytes)
}

async function main(): Promise<void> {
    let clock = 1_000_000
    const tick = () => {
        clock += 5000
    }
    await runScenario('memory backend', createMemoryStorage({ now: () => clock }), () => clock, tick)

    const fake = new FakeWebStorage()
    clock = 2_000_000
    const localStorageService = createLocalStorageService({ storage: fake, now: () => clock })
    await runScenario('localStorage backend', localStorageService, () => clock, tick)

    console.log('\nlocalStorage-specific behaviour')
    const durableInfo = await localStorageService.info()
    check('localStorage reports durability', durableInfo.durable === true && durableInfo.engine === 'local-storage')

    fake.setItem('some.unrelated.key', 'ignore me')
    check(
        'foreign localStorage keys are ignored',
        !(await localStorageService.namespaces()).includes('some.unrelated.key'),
    )

    fake.setItem('kn.storage.v1.app.corrupt/broken', 'not json at all')
    await checkCode(
        'a malformed physical entry surfaces as corrupt on read',
        () => localStorageService.get('app.corrupt', 'broken'),
        'STORAGE_CORRUPT',
    )
    await checkCode(
        'enumeration reports corruption instead of hiding it',
        () => localStorageService.info(),
        'STORAGE_CORRUPT',
    )

    console.log('\n' + pass + ' passed, ' + fail + ' failed')
    if (fail > 0) process.exit(1)
}

void main()
