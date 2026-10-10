/**
 * Packaged-app test for the plugin studio (plain Node, no Electron).
 *
 * Regression guard for the bug where the studio worked in `pnpm desktop:dev` but
 * was **completely unusable after packaging**: electron-builder's `files` ships
 * only `out/**` and excludes node_modules, so the dev-server child could never
 * resolve the native `esbuild` it compiles with. Two further gaps showed up once
 * the app was actually packaged — plugin CSS compiled to nothing (missing host
 * Tailwind config + tailwindcss/postcss) and the agent's `searchHostApi` /
 * `readHostApiFile` tools had no host package source to read.
 *
 * The test materializes the packaged layout with the real `afterPack` hook and
 * then *runs the child process against it*, asserting that a build succeeds —
 * with CSS — with no source checkout anywhere up the tree. That is the property
 * that broke, and the one no unit test on the bundler can catch.
 *
 * Run: node apps/desktop/src/main/plugin-dev/packaged-studio-deps.test.mjs
 */
import { spawnSync } from 'node:child_process'
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(here, '..', '..', '..')
const WORKSPACE_ROOT = join(APP_DIR, '..', '..')
const require = createRequire(import.meta.url)
const { describeDevResolution } = await import('./manager.mjs')

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

const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, ...options })
    return { code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' }
}

/**
 * The hook resolves packages from its resolution bases. Point it at the app
 * directory the way electron-builder does (cwd = apps/desktop), so the test
 * exercises the same code path the real build does.
 */
process.env.KN_STUDIO_DEPS_BASE = APP_DIR
const prepareStudioDependencies = require(join(APP_DIR, 'scripts', 'prepare-studio-deps.cjs'))

/** Platforms the hook supports, so the test can pick a locally installed one. */
const PLATFORM_PACKAGES = {
    'darwin arm64': '@esbuild/darwin-arm64',
    'darwin x64': '@esbuild/darwin-x64',
    'win32 x64': '@esbuild/win32-x64',
    'linux x64': '@esbuild/linux-x64',
    'linux arm64': '@esbuild/linux-arm64',
}

const platformPackage = PLATFORM_PACKAGES[`${process.platform} ${process.arch}`]
const hasRequirements = (() => {
    if (!platformPackage) return false
    try {
        const esbuildDir = dirname(require.resolve('esbuild/package.json', { paths: [APP_DIR] }))
        require.resolve(join(platformPackage, 'package.json'), { paths: [esbuildDir] })
        require.resolve('tailwindcss/package.json', { paths: [APP_DIR] })
        return true
    } catch {
        return false
    }
})()

if (!hasRequirements) {
    console.log(`skip: missing esbuild/tailwindcss for ${process.platform} ${process.arch}`)
    process.exit(0)
}

const root = join(tmpdir(), 'kn-studio-packaged-test')
const appOutDir = join(root, 'release')
const resourcesDir = join(appOutDir, 'KN Desktop.app', 'Contents', 'Resources')
const projectRoot = join(root, 'project')
/** Where `afterPack` puts the runtime: a plain dir under Resources. */
const runtimeDir = join(resourcesDir, 'kn-studio-runtime')
const modulesDir = join(runtimeDir, 'node_modules')
/**
 * `__dirname` as the packaged manager sees it: *inside* app.asar.
 *
 * The manager must NOT resolve the runtime from here — that is the bug this
 * guards. Kept so the test can assert the resolution ignores it.
 */
const unpackedAsarDevDir = join(resourcesDir, 'app.asar', 'out', 'main', 'plugin-dev')

await rm(root, { recursive: true, force: true })
await mkdir(resourcesDir, { recursive: true })
// The packaged app has app.asar and nothing else — model that, including the
// *absence* of node_modules beside it.
await writeFile(join(resourcesDir, 'app.asar'), 'not a real asar')

const context = {
    appOutDir,
    electronPlatformName: process.platform,
    // electron-builder passes a numeric Arch enum; mirror its mapping.
    arch: { ia32: 0, x64: 1, arm: 2, arm64: 3 }[process.arch] ?? 1,
    packager: { appInfo: { productFilename: 'KN Desktop' } },
}

try {
    /* -------------------------------------------------------------- *
     * 1. The hook materializes a self-contained dependency tree
     * -------------------------------------------------------------- */
    await prepareStudioDependencies(context)

    // The child-process entry scripts must be OUTSIDE the asar. Inside an asar
    // `existsSync` reports them missing at runtime, the manager then falls back
    // to the asar copy, and the spawned Node process dies with MODULE_NOT_FOUND.
    for (const file of ['dev-server.mjs', 'bundler.mjs', 'tailwind.mjs']) {
        check(`hook: ${file} shipped outside the asar`, await exists(join(runtimeDir, file)))
    }

    const esbuildDir = join(modulesDir, 'esbuild')
    const manifest = JSON.parse(await readFile(join(esbuildDir, 'package.json'), 'utf8').catch(() => 'null'))
    check('hook: esbuild package materialized', manifest?.name === 'esbuild', manifest?.version)
    check('hook: esbuild JS entry present', await exists(join(esbuildDir, 'lib', 'main.js')))

    // CSS toolchain: without these the child compiles no CSS at all.
    for (const name of ['tailwindcss', 'postcss', 'tailwindcss-animate', '@tailwindcss/typography']) {
        check(`hook: ${name} materialized`, await exists(join(modulesDir, ...name.split('/'), 'package.json')))
    }

    /* -------------------------------------------------------------- *
     * 2. The platform binary is present AND spawnable
     * -------------------------------------------------------------- */
    const subpath = process.platform === 'win32' ? 'esbuild.exe' : join('bin', 'esbuild')
    const binPath = join(modulesDir, ...platformPackage.split('/'), subpath)
    check('hook: platform binary materialized', await exists(binPath))

    if (process.platform !== 'win32') {
        const mode = (await stat(binPath)).mode
        check('hook: platform binary is executable', (mode & 0o111) !== 0, mode.toString(8))
        // Spawning is exactly what failed for an asar-packed binary (ENOTDIR) —
        // prove the unpacked copy really runs.
        const version = run(binPath, ['--version'])
        check('hook: binary can actually be spawned', version.code === 0, version.stdout.trim() || version.stderr.trim())
    }

    /* -------------------------------------------------------------- *
     * 3. Host Tailwind config + host package sources shipped
     * -------------------------------------------------------------- */
    const tailwindConfig = join(runtimeDir, 'tailwind.config.cjs')
    check('hook: host tailwind config shipped', await exists(tailwindConfig))

    const hostApiRoot = join(runtimeDir, 'host-api')
    check('hook: host-api tree shipped', await exists(join(hostApiRoot, 'packages', 'common', 'package.json')))
    check('hook: host-api source shipped', await exists(join(hostApiRoot, 'packages', 'common', 'src', 'index.ts')))

    /* -------------------------------------------------------------- *
     * 4. The dev-server builds — with CSS — against that layout alone
     * -------------------------------------------------------------- */
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({
            name: 'packaged-dev-plugin',
            version: '0.0.1',
            knPluginStudio: { pluginKey: 'packaged-dev-plugin', displayName: 'Packaged', entry: 'src/index.tsx' },
        }),
    )
    // A class that only exists as a plugin utility: proves Tailwind ran here.
    await writeFile(
        join(projectRoot, 'src', 'index.tsx'),
        [
            `import { KPlugin } from '@kn/common'`,
            `class Packaged extends KPlugin {}`,
            `export const packaged = new Packaged({ name: 'Packaged' })`,
            `export const cls = 'text-[13.5px] tracking-[0.015em]'`,
            '',
        ].join('\n'),
    )

    // The hook already put the child assets there; assert what the manager will
    // actually pick, replaying its own resolution against this layout. The
    // runtime must resolve from `Resources/`, NOT from an asar-adjacent path —
    // resolving relative to app.asar is what made the child die with
    // MODULE_NOT_FOUND.
    const resolution = describeDevResolution({ resourcesPath: resourcesDir, moduleDir: unpackedAsarDevDir })
    check(
        'manager: resolves the runtime from Resources, not from inside the asar',
        resolution.shippedServerExists && resolution.shippedServer === join(runtimeDir, 'dev-server.mjs'),
        JSON.stringify(resolution),
    )
    check(
        'manager: the resolved path contains no app.asar segment',
        Boolean(resolution.shippedServer) && !resolution.shippedServer.includes('app.asar'),
        resolution.shippedServer,
    )

    const devServer = run(
        process.execPath,
        [
            join(runtimeDir, 'dev-server.mjs'),
            '--root', projectRoot,
            '--watch', 'false',
            '--writeToDisk', 'false',
        ],
        // The manager passes the shipped config through this variable.
        { env: { ...process.env, KN_TAILWIND_CONFIG: tailwindConfig } },
    )

    const events = devServer.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line)
            } catch {
                return null
            }
        })
        .filter(Boolean)

    const build = events.find((event) => event.event === 'build')
    const failure = events.find((event) => event.event === 'build-error' || event.event === 'fatal')
    check(
        'packaged layout: dev-server builds a plugin',
        Boolean(build),
        build ? `${build.bytes} bytes` : `no build event; stderr=${devServer.stderr.slice(0, 300)}`,
    )
    check('packaged layout: no bundler failure', !failure, failure ? JSON.stringify(failure).slice(0, 300) : '')
    check(
        'packaged layout: esbuild was really resolved',
        !/Cannot find package 'esbuild'|Bundler unavailable/.test(devServer.stderr),
        devServer.stderr.slice(0, 200),
    )
    check(
        'packaged layout: tailwind config was found',
        !/Tailwind config not found/.test(devServer.stderr),
        devServer.stderr.slice(0, 200),
    )
    // The CSS is injected into the emitted bundle as a scoped <style> tag.
    const code = build?.code || ''
    check(
        'packaged layout: plugin CSS compiled with its own utilities',
        code.includes('13.5px') && code.includes('data-kn-plugin-style'),
        `${code.length} bytes of bundle`,
    )
    check(
        'packaged layout: plugin CSS is scoped to the plugin',
        code.includes('[data-kn-plugin=\\"packaged-dev-plugin\\"]'),
    )
} finally {
    await rm(root, { recursive: true, force: true })
}

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
