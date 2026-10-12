/**
 * Electron end-to-end test for the desktop storage layer.
 *
 * Answers what the compiled checks cannot:
 *   1. does `better-sqlite3` load under Electron (its N-API prebuild is ABI
 *      stable, but that claim is worth proving on this machine)?
 *   2. does the whole chain work — real preload capability whitelist → real
 *      `storage.*` and `spacepage.*` IPC handlers → real SQLite file —
 *      including the `{ok, code}` failure envelopes the renderer rethrows?
 *   3. does data survive the process?
 *
 * The `spacepage.*` half is the local-first domain repository (spaces, pages,
 * blocks, documents, outbox) sharing the same database file and connection as
 * `storage.*`; see docs/LOCAL_FIRST.md.
 *
 * The storage/domain modules are TypeScript, so they are bundled with esbuild
 * into `.tmp-check/storage-smoke/` first (the same bundler the plugin studio
 * uses); the preload is bundled too, so the capability list under test is the
 * one in source.
 *
 * CommonJS on purpose: Electron 33's ESM loader throws
 * "Cannot read properties of undefined (reading 'exports')" on
 * `import { app } from 'electron'`, so a `.mjs` entry cannot even start.
 *
 * Run:
 *   apps/desktop/node_modules/.bin/electron \
 *     apps/desktop/src/main/storage/electron.smoke.cjs --no-sandbox
 */
const { app, BrowserWindow } = require('electron')

// `ELECTRON_RUN_AS_NODE=1` (set by some shells/CI runners) makes the electron
// binary behave as plain Node, where `require('electron')` is the npm shim and
// `app` is undefined. Fail with the fix instead of a confusing TypeError.
if (!process.versions.electron) {
    console.error(
        'storage smoke must run under Electron, not Node. Unset ELECTRON_RUN_AS_NODE (or run:\n' +
            '  ELECTRON_RUN_AS_NODE= apps/desktop/node_modules/.bin/electron <this file> --no-sandbox)',
    )
    process.exit(1)
}

const { build } = require('esbuild')
const { existsSync, mkdirSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')

const appRoot = resolve(__dirname, '../../..')
const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>',
)}`

/** Load `better-sqlite3` with an actionable message when no binary works here. */
const loadSqlite = () => {
    try {
        return require('better-sqlite3')
    } catch (error) {
        const message = String((error && error.message) || error)
        if (/NODE_MODULE_VERSION|different Node\.js version|mach-o|invalid ELF|prebuilds/i.test(message)) {
            throw new Error(
                'better-sqlite3 has no usable binary for this platform. Fallback for platforms ' +
                    'without a prebuild: pnpm --filter @kn/desktop rebuild:native',
            )
        }
        throw error
    }
}

async function run() {
    // Inside the app directory on purpose: the bundle keeps better-sqlite3
    // external, so `require` must resolve it from the app's node_modules.
    const workDir = join(appRoot, '.tmp-check', 'storage-smoke')
    rmSync(workDir, { recursive: true, force: true })
    mkdirSync(workDir, { recursive: true })
    const Database = loadSqlite()

    await build({
        entryPoints: [join(appRoot, 'src/main/storage/index.ts')],
        outfile: join(workDir, 'storage.cjs'),
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        external: ['electron', 'better-sqlite3'],
        logLevel: 'silent',
    })
    await build({
        entryPoints: [join(appRoot, 'src/preload/index.ts')],
        outfile: join(workDir, 'preload.cjs'),
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        external: ['electron'],
        logLevel: 'silent',
    })
    await build({
        entryPoints: [join(appRoot, 'src/main/domain/index.ts')],
        outfile: join(workDir, 'domain.cjs'),
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        external: ['electron', 'better-sqlite3'],
        logLevel: 'silent',
    })

    const storageModule = require(join(workDir, 'storage.cjs'))
    const dbPath = join(workDir, 'storage', 'kotion.db')
    const runtime = storageModule.setupStorageHandlers({ filePath: dbPath, log: () => {} })
    check('main: sqlite runtime opened', runtime.store !== null, runtime.failure || '')
    check('main: database file created', existsSync(dbPath), dbPath)

    // The local-first repository shares the connection the storage layer opened
    // (one writer, one WAL, one close) — exactly as `ipc.ts` wires it.
    const domainModule = require(join(workDir, 'domain.cjs'))
    const domain = domainModule.setupDomainHandlers(runtime)
    check('main: domain repository opened', domain.store !== null, domain.failure || '')

    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: join(workDir, 'preload.cjs'),
            contextIsolation: true,
            sandbox: false,
        },
    })
    await win.loadURL(PAGE)
    const evaluate = (expression) => win.webContents.executeJavaScript(expression, true)
    const call = (capability, params) =>
        evaluate(
            `window.knDesktop.invoke(${JSON.stringify(capability)}, ${
                params === undefined ? 'undefined' : JSON.stringify(params)
            })`,
        )

    console.log('\nIPC through the real preload bridge')
    const capabilities = await evaluate('window.knDesktop.capabilities')
    check(
        'preload: storage capabilities are whitelisted',
        ['storage.get', 'storage.set', 'storage.batch'].every((name) => capabilities.includes(name)),
    )

    const info = await call('storage.info')
    check('info: reports sqlite', info && info.ok === true && info.value.engine === 'sqlite', JSON.stringify(info))
    check('info: reports durability', Boolean(info && info.value.durable === true))

    const written = await call('storage.set', {
        namespace: 'app.smoke',
        key: 'round-trip',
        value: { title: 'smoke', n: 1 },
    })
    check(
        'set: returns the stored entry',
        written && written.ok === true && written.value.rev === 1,
        JSON.stringify(written),
    )

    const read = await call('storage.get', { namespace: 'app.smoke', key: 'round-trip' })
    check(
        'get: round-trips the value',
        read && read.ok === true && read.value.value.title === 'smoke' && read.value.rev === 1,
        JSON.stringify(read),
    )

    const conflict = await call('storage.set', {
        namespace: 'app.smoke',
        key: 'round-trip',
        value: { title: 'nope' },
        ifRev: 0,
    })
    check(
        'set: rev conflict keeps its code across IPC',
        conflict && conflict.ok === false && conflict.code === 'STORAGE_REV_CONFLICT',
        JSON.stringify(conflict),
    )

    const invalid = await call('storage.set', { namespace: 'Bad Namespace', key: 'k', value: 1 })
    check(
        'set: invalid namespace keeps its code across IPC',
        invalid && invalid.ok === false && invalid.code === 'STORAGE_INVALID_NAMESPACE',
        JSON.stringify(invalid),
    )

    const badValue = await call('storage.set', {
        namespace: 'app.smoke',
        key: 'big',
        value: 'x'.repeat(2 * 1024 * 1024 + 8),
    })
    check(
        'set: oversized value is refused',
        badValue && badValue.ok === false && badValue.code === 'STORAGE_INVALID_VALUE',
        JSON.stringify(badValue),
    )

    const batch = await call('storage.batch', {
        operations: [
            { type: 'set', namespace: 'app.smoke', key: 'a', value: 1 },
            { type: 'set', namespace: 'app.smoke', key: 'b', value: 2 },
        ],
    })
    check('batch: writes both keys', batch && batch.ok === true && batch.value.written === 2, JSON.stringify(batch))

    const list = await call('storage.list', { namespace: 'app.smoke', limit: 10 })
    const keys = list && list.value ? list.value.entries.map((entry) => entry.key).join(',') : ''
    check('list: returns ordered entries', list && list.ok === true && keys === 'a,b,round-trip', keys)

    const cleared = await call('storage.clear', { namespace: 'app.smoke', prefix: 'r' })
    check('clear: reports the removed count', cleared && cleared.ok === true && cleared.value === 1, JSON.stringify(cleared))

    let gated = false
    try {
        await call('storage.not-a-capability', {})
    } catch {
        gated = true
    }
    check('preload: unknown capabilities are rejected', gated)

    console.log('\nLocal-first domain data (same bridge, same file)')
    check(
        'preload: spacepage capabilities are whitelisted',
        ['spacepage.upsertPages', 'spacepage.listPages', 'spacepage.enqueue', 'spacepage.listOutbox'].every((name) =>
            capabilities.includes(name),
        ),
    )

    const domainInfo = await call('spacepage.info')
    check(
        'spacepage.info: reports the sqlite engine',
        domainInfo && domainInfo.ok === true && domainInfo.value.engine === 'sqlite',
        JSON.stringify(domainInfo),
    )

    const upserted = await call('spacepage.upsertPages', {
        records: [{ id: 'p1', spaceId: 's1', title: 'Smoke page' }],
    })
    check(
        'spacepage.upsertPages: stores a page',
        upserted && upserted.ok === true && upserted.value === 1,
        JSON.stringify(upserted),
    )

    const pageRead = await call('spacepage.getPage', { pageId: 'p1' })
    check(
        'spacepage.getPage: round-trips through IPC',
        pageRead && pageRead.ok === true && pageRead.value.title === 'Smoke page',
        JSON.stringify(pageRead),
    )

    const pageList = await call('spacepage.listPages', { spaceId: 's1' })
    check(
        'spacepage.listPages: filters by space',
        pageList && pageList.ok === true && pageList.value.length === 1,
        JSON.stringify(pageList),
    )

    const enqueued = await call('spacepage.enqueue', {
        entries: [{ kind: 'page.title', entity: 'page', entityId: 'p1', payload: { pageId: 'p1', title: 'Queued' } }],
    })
    check(
        'spacepage.enqueue: returns the queued id',
        enqueued && enqueued.ok === true && Array.isArray(enqueued.value) && enqueued.value.length === 1,
        JSON.stringify(enqueued),
    )

    const outbox = await call('spacepage.listOutbox', { state: 'pending' })
    check(
        'spacepage.listOutbox: returns the queued edit',
        outbox && outbox.ok === true && outbox.value[0] && outbox.value[0].payload.title === 'Queued',
        JSON.stringify(outbox),
    )

    const claimed = await call('spacepage.claimOutbox', { limit: 1 })
    check(
        'spacepage.claimOutbox: takes the entry for replay',
        claimed && claimed.ok === true && claimed.value.length === 1 && claimed.value[0].state === 'inflight',
        JSON.stringify(claimed),
    )

    const acked = await call('spacepage.ackOutbox', {
        ids: claimed && claimed.ok ? claimed.value.map((entry) => entry.id) : [],
    })
    check(
        'spacepage.ackOutbox: drains the queue',
        acked && acked.ok === true && acked.value === 1,
        JSON.stringify(acked),
    )

    const remapped = await call('spacepage.remapPage', { from: 'p1', to: 'p-cloud' })
    check(
        'spacepage.remapPage: re-keys the row',
        remapped && remapped.ok === true && remapped.value.affected >= 1,
        JSON.stringify(remapped),
    )
    const afterRemap = await call('spacepage.getPage', { pageId: 'p-cloud' })
    check(
        'spacepage.getPage: the cloud id answers',
        afterRemap && afterRemap.ok === true && afterRemap.value.title === 'Smoke page',
        JSON.stringify(afterRemap),
    )

    const badPageId = await call('spacepage.getPage', { pageId: '' })
    check(
        'spacepage: invalid input keeps its code across IPC',
        badPageId && badPageId.ok === false && badPageId.code === 'LOCAL_STORE_INVALID',
        JSON.stringify(badPageId),
    )

    console.log('\nPersistence')
    const db = new Database(dbPath, { readonly: true })
    const journalMode = db.pragma('journal_mode', { simple: true })
    check('database uses WAL', journalMode === 'wal', String(journalMode))
    const rows = db.prepare('SELECT key FROM kv ORDER BY key').all()
    check(
        'rows are on disk',
        rows.length >= 2 && rows.some((row) => row.key === 'a'),
        rows.map((row) => row.key).join(','),
    )
    check('schema version recorded', db.pragma('user_version', { simple: true }) >= 1)
    const domainTables = db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN " +
                "('spaces','pages','blocks','page_documents','outbox','sync_state')",
        )
        .all()
    check('domain tables exist on disk', domainTables.length === 6, domainTables.map((row) => row.name).join(','))
    const domainRows = db.prepare('SELECT id, title FROM pages').all()
    check(
        'domain rows are on disk',
        domainRows.some((row) => row.id === 'p-cloud' && row.title === 'Smoke page'),
        JSON.stringify(domainRows),
    )
    db.close()

    win.destroy()
    runtime.dispose()
}

app.whenReady().then(async () => {
    const timer = setTimeout(() => {
        console.error('storage smoke timed out')
        app.exit(2)
    }, 60000)
    try {
        await run()
    } catch (error) {
        check('storage smoke completed', false, String((error && error.stack) || error))
    } finally {
        clearTimeout(timer)
        const failed = results.filter((entry) => !entry.ok)
        console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
        app.exit(failed.length ? 1 : 0)
    }
})

app.on('window-all-closed', () => {})
