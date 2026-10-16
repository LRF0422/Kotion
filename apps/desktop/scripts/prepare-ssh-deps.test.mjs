/**
 * `prepare-ssh-deps.cjs` test (plain Node, no Electron).
 *
 * The packaged app ships no `node_modules` (electron-builder excludes it) while
 * the main process `require`s `ssh2` at runtime, so the afterPack hook has to
 * materialize it. This test runs the hook against a fabricated app layout and
 * then proves the shipped tree is actually loadable from there — the property
 * that used to break silently (the audit found the *host API sources* shipped
 * but unreachable; the same class of bug).
 *
 * Run: node apps/desktop/scripts/prepare-ssh-deps.test.mjs
 */
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(here, '..')
const require = createRequire(import.meta.url)
const prepareSshDependencies = require(join(here, 'prepare-ssh-deps.cjs'))
const { collectClosure, SKIP_OPTIONAL, ROOT_PACKAGE } = prepareSshDependencies

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

process.env.KN_SSH_DEPS_BASE = APP_DIR

const sandbox = await mkdtemp(join(tmpdir(), 'kn-ssh-deps-'))
const appOutDir = join(sandbox, 'release')
const resourcesDir = join(appOutDir, 'KN Desktop.app', 'Contents', 'Resources')
await mkdir(resourcesDir, { recursive: true })

/* The hook itself. */
const outcome = prepareSshDependencies({
    appOutDir,
    electronPlatformName: 'darwin',
    packager: { appInfo: { productFilename: 'KN Desktop' } },
})

check('hook: reports success', outcome.ok === true, outcome.error)
check('hook: ships ssh2', outcome.packages?.includes('ssh2'), JSON.stringify(outcome.packages))
check(
    'hook: ships the declared runtime closure',
    ['asn1', 'bcrypt-pbkdf', 'tweetnacl', 'safer-buffer'].every((name) => outcome.packages?.includes(name)),
    JSON.stringify(outcome.packages),
)
check(
    'hook: skips the optional native accelerators',
    [...SKIP_OPTIONAL].every((name) => !outcome.packages?.includes(name)),
    JSON.stringify(outcome.packages),
)
check('hook: lands in <Resources>/node_modules', outcome.dest === join(resourcesDir, 'node_modules'), outcome.dest)
check('hook: ssh2 files are on disk', existsSync(join(resourcesDir, 'node_modules', 'ssh2', 'lib', 'client.js')))
check(
    'hook: build/test noise is pruned',
    !existsSync(join(resourcesDir, 'node_modules', 'ssh2', 'test')) &&
        !existsSync(join(resourcesDir, 'node_modules', 'ssh2', 'README.md')),
)

/* The property that matters: Node can resolve and load it from that layout. */
const shippedRequire = createRequire(join(resourcesDir, 'out', 'main', 'index.js'))
let loaded = null
let loadError = ''
try {
    loaded = shippedRequire('ssh2')
} catch (error) {
    loadError = error.message
}
check('runtime: ssh2 resolves from the shipped layout', Boolean(loaded?.Client), loadError)
check('runtime: the server half is there too (tests/probes need it)', typeof loaded?.Server === 'function')
check(
    'runtime: the closure resolves without the workspace',
    typeof shippedRequire('ssh2/lib/protocol/crypto.js') === 'object' ||
        typeof shippedRequire('ssh2/lib/protocol/crypto.js') === 'function',
)

/* Re-running must be idempotent (electron-builder reruns afterPack). */
const second = prepareSshDependencies({
    appOutDir,
    electronPlatformName: 'darwin',
    packager: { appInfo: { productFilename: 'KN Desktop' } },
})
check('hook: reruns cleanly', second.ok === true && second.packages.length === outcome.packages.length)

/* The off switch must be honoured (used when a platform cannot ship it). */
process.env.KN_SKIP_SSH_DEPS = '1'
const skipped = prepareSshDependencies({ appOutDir, electronPlatformName: 'darwin', packager: { appInfo: { productFilename: 'KN Desktop' } } })
check('hook: KN_SKIP_SSH_DEPS=1 skips without failing', skipped.ok === true && skipped.skipped === true)
delete process.env.KN_SKIP_SSH_DEPS

/* A missing dependency must fail loudly, not silently ship nothing. */
const closure = collectClosure(ROOT_PACKAGE, createRequire(join(APP_DIR, 'package.json')))
check('closure: walks real resolutions', closure.has('ssh2') && closure.has('safer-buffer'), [...closure.keys()].join(','))
check(
    'closure: never includes a skipped optional',
    [...closure.keys()].every((name) => !SKIP_OPTIONAL.has(name)),
    [...closure.keys()].join(','),
)

/* Windows/Linux layout: electron-builder uses <appOutDir>/resources. */
const winOut = join(sandbox, 'win-unpacked')
const winResources = join(winOut, 'resources')
await mkdir(winResources, { recursive: true })
const win = prepareSshDependencies({
    appOutDir: winOut,
    electronPlatformName: 'win32',
    packager: { appInfo: { productFilename: 'KN Desktop' } },
})
check('hook: non-mac layout lands under <out>/resources', win.dest === join(winResources, 'node_modules'), win.dest)

await rm(sandbox, { recursive: true, force: true })

const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
