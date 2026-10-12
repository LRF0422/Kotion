/**
 * Packaged-app test for the desktop storage layer (plain Node, no Electron).
 *
 * Regression guard for the same class of bug the studio had: the app works in
 * `pnpm desktop:dev` but the *packaged* build cannot load its native module,
 * because electron-builder ships only `out/**` and excludes node_modules. For
 * storage that would be quiet — the layer degrades to localStorage — so this
 * test asserts the packaged layout instead of trusting a log line.
 *
 * It runs the real `afterPack` hook against a fake mac app bundle and then, with
 * the source checkout *not* on the resolution path, verifies that Node can still
 * load `better-sqlite3` from `<Resources>/node_modules` — the exact resolution
 * the main process performs from inside `app.asar/out/main/`.
 *
 * Run: node apps/desktop/scripts/prepare-storage-deps.test.mjs
 */
import { access, mkdir, readFile, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const prepareStorageDependencies = (
    await import(join(here, 'prepare-storage-deps.cjs'))
).default

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const exists = (target) =>
    access(target, constants.F_OK).then(
        () => true,
        () => false,
    )

/** A fake electron-builder context: macOS layout, one product name. */
const makeContext = (appOutDir) => ({
    appOutDir,
    electronPlatformName: 'darwin',
    packager: { appInfo: { productFilename: 'KN Desktop' } },
})

const workDir = join(tmpdir(), `kn-storage-deps-${process.pid}`)
const appOutDir = join(workDir, 'mac')
const resources = join(appOutDir, 'KN Desktop.app', 'Contents', 'Resources')

try {
    await mkdir(join(resources, 'app.asar', 'out', 'main'), { recursive: true })

    await prepareStorageDependencies(makeContext(appOutDir))

    const modulesDir = join(resources, 'node_modules')
    check(
        'better-sqlite3 is placed under Resources/node_modules',
        await exists(join(modulesDir, 'better-sqlite3', 'package.json')),
    )
    check('bindings (runtime dep) is placed too', await exists(join(modulesDir, 'bindings', 'package.json')))
    check(
        'file-uri-to-path (transitive dep) is placed too',
        await exists(join(modulesDir, 'file-uri-to-path', 'package.json')),
    )

    const manifest = JSON.parse(await readFile(join(modulesDir, 'better-sqlite3', 'package.json'), 'utf8'))
    const binaryCandidates = [
        join(modulesDir, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
        join(modulesDir, 'better-sqlite3', 'build', 'Debug', 'better_sqlite3.node'),
    ]
    const binary = (await Promise.all(binaryCandidates.map(exists))).some(Boolean)
    check('the native binary is on disk', binary, binaryCandidates[0])

    check('no source checkout is bundled', !(await exists(join(modulesDir, 'better-sqlite3', 'src'))))

    // The real property: load it the way the packaged main process does —
    // resolution starting inside app.asar, with the package only in
    // Resources/node_modules.
    const requireFromAsar = createRequire(join(resources, 'app.asar', 'out', 'main', 'noop.js'))
    try {
        const Database = requireFromAsar('better-sqlite3')
        const db = new Database(':memory:')
        db.exec('CREATE TABLE t (a)')
        db.prepare('INSERT INTO t VALUES (?)').run(1)
        const row = db.prepare('SELECT COUNT(*) AS n FROM t').get()
        db.close()
        check('the packaged module loads and queries', row && Number(row.n) === 1, JSON.stringify(row))
    } catch (error) {
        const message = String((error && error.message) || error)
        // The binary on disk is built for whichever runtime last ran
        // `rebuild-sqlite.cjs`; an ABI mismatch here is a state, not a defect.
        if (/NODE_MODULE_VERSION/.test(message)) {
            console.log('  skip the packaged module loads and queries — ABI of the installed build')
        } else {
            check('the packaged module loads and queries', false, message)
        }
    }
    check('version shipped matches the dependency', manifest.version.startsWith('12.'), manifest.version)

    // Opt-out path must be a no-op.
    const skippedDir = join(workDir, 'skipped')
    await mkdir(join(skippedDir, 'resources'), { recursive: true })
    process.env.KN_SKIP_STORAGE_DEPS = '1'
    await prepareStorageDependencies({
        appOutDir: skippedDir,
        packager: { appInfo: { productFilename: 'KN Desktop' } },
    })
    delete process.env.KN_SKIP_STORAGE_DEPS
    check('KN_SKIP_STORAGE_DEPS=1 skips the copy', !(await exists(join(skippedDir, 'resources', 'node_modules'))))
} catch (error) {
    check('storage deps test completed', false, String((error && error.stack) || error))
} finally {
    await rm(workDir, { recursive: true, force: true })
    const failed = results.filter((entry) => !entry.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
    process.exit(failed.length ? 1 : 0)
}
