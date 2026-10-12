/**
 * Rebuild the SQLite native addon for the runtime that will load it.
 *
 * `better-sqlite3@12` is a classic V8 addon, so the binary in
 * `build/Release/better_sqlite3.node` is ABI-specific: the Electron main process
 * (Node 20 on Electron 33) and a plain `node` process cannot share one build.
 *
 * Order of preference:
 *   1. `prebuild-install` — a prebuilt binary for the exact runtime, downloaded
 *      from the package's GitHub releases. No compiler, no headers, seconds.
 *   2. `@electron/rebuild` (Electron) / `npm rebuild` (Node) — compiles from
 *      source when no prebuild exists for this runtime/platform.
 *
 * Usage:
 *   node scripts/rebuild-sqlite.cjs          # for the bundled Electron
 *   node scripts/rebuild-sqlite.cjs --node   # for the running Node
 *
 * If the download fails because the prebuild cache is not writable (a sandboxed
 * environment, a locked-down CI), point it somewhere writable — `prebuild-install`
 * reads `npm_config_cache`, so the env var is what actually moves the cache:
 *   KN_PREBUILD_CACHE=/tmp/kn-prebuild node scripts/rebuild-sqlite.cjs
 */

const { execFileSync, spawnSync } = require('node:child_process')
const path = require('node:path')
const { createRequire } = require('node:module')

const appRoot = path.resolve(__dirname, '..')
const requireFromApp = createRequire(path.join(appRoot, 'package.json'))
const sqliteDir = path.dirname(requireFromApp.resolve('better-sqlite3/package.json'))

const forNode = process.argv.includes('--node')
const runtime = forNode ? 'node' : 'electron'
const target = forNode ? process.version.replace(/^v/, '') : requireFromApp('electron/package.json').version

const resolveBinary = (spec) =>
    createRequire(path.join(sqliteDir, 'noop.js')).resolve(spec)

const prebuildInstall = () => {
    const bin = resolveBinary('prebuild-install/bin.js')
    const args = [bin, `--runtime=${runtime}`, `--target=${target}`, `--arch=${process.arch}`, '--verbose']
    const env = { ...process.env }
    if (process.env.KN_PREBUILD_CACHE) {
        env.npm_config_cache = path.resolve(process.env.KN_PREBUILD_CACHE)
    }
    return execFileSync(process.execPath, args, { cwd: sqliteDir, stdio: 'inherit', env })
}

const compileFromSource = () => {
    if (forNode) {
        const result = spawnSync('npm', ['rebuild', 'better-sqlite3'], {
            cwd: appRoot,
            stdio: 'inherit',
            shell: process.platform === 'win32',
        })
        if (result.status !== 0) throw new Error(`npm rebuild failed with status ${result.status}`)
        return
    }
    // `@electron/rebuild` writes its headers/sysroot cache to ~/.electron-gyp, and
    // its package `exports` hides the CLI entry — go through the bin shim.
    const bin = path.join(appRoot, 'node_modules', '.bin', 'electron-rebuild')
    execFileSync(bin, ['-f', '-w', 'better-sqlite3'], { cwd: appRoot, stdio: 'inherit' })
}

console.log(`[rebuild-sqlite] building better-sqlite3 for ${runtime} ${target} (${process.arch})`)

try {
    prebuildInstall()
    console.log(`[rebuild-sqlite] installed the prebuilt ${runtime} binary`)
} catch (error) {
    console.warn(`[rebuild-sqlite] no usable prebuild (${error.message}); compiling from source`)
    if (/EPERM|EACCES/.test(String(error.message))) {
        console.warn('[rebuild-sqlite] hint: set KN_PREBUILD_CACHE to a writable directory')
    }
    compileFromSource()
    console.log('[rebuild-sqlite] compiled from source')
}
