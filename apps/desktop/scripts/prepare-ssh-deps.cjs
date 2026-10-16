/**
 * electron-builder `afterPack` hook (SSH side): put `ssh2` into the artifact.
 *
 * ## Why it is needed
 *
 * This project's electron-builder `files` ships only `out/**` and explicitly
 * excludes `node_modules`, while `ssh2` is a real runtime `require` of the main
 * process (`externalizeDepsPlugin` keeps it external). Without this hook a
 * packaged app has no SSH capability at all: every `ssh.*` call fails with
 * MODULE_NOT_FOUND.
 *
 * ## Where it lands
 *
 *     <Resources>/node_modules/ssh2/
 *     <Resources>/node_modules/asn1/
 *     <Resources>/node_modules/bcrypt-pbkdf/
 *     <Resources>/node_modules/tweetnacl/
 *     <Resources>/node_modules/safer-buffer/
 *
 * `Resources/node_modules` is the one directory Node's resolution reaches from
 * `app.asar/out/main/` without crossing into the asar (same reasoning as
 * ./prepare-storage-deps.cjs).
 *
 * ## Dependency closure
 *
 * Walked for real (`require.resolve` from each package's own directory) rather
 * than hand-listed, so an `ssh2` upgrade cannot silently ship a missing module.
 *
 * **Optional native packages are deliberately skipped**: `ssh2` declares
 * `cpu-features` (with `nan`) as optionalDependencies purely as an AES-GCM
 * accelerator, and it is written to work when they fail to load. Shipping a
 * half-built `.node` for the wrong ABI would be worse than not shipping it, and
 * this app already rebuilds its one native dependency by hand.
 *
 * Off switch: KN_SKIP_SSH_DEPS=1 (packaging still succeeds, but the artifact has
 * no SSH capability).
 */

const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

/** The runtime root package. */
const ROOT_PACKAGE = 'ssh2'

/** Optional native accelerators: never ship these (see the header). */
const SKIP_OPTIONAL = new Set(['cpu-features', 'nan', 'buildcheck'])

/** Package-relative paths that are not runtime code. */
const PRUNE_PATHS = [
    'test',
    'tests',
    '__tests__',
    'examples',
    'example',
    'docs',
    'doc',
    'coverage',
    '.github',
    'CHANGELOG.md',
    'README.md',
    '.npmignore',
    'tsconfig.json',
]

const readManifest = (dir) => {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    } catch {
        return {}
    }
}

/** Resolve one dependency name from a base directory, or undefined. */
const resolvePackageDir = (requireFrom, name) => {
    try {
        return path.dirname(requireFrom.resolve(`${name}/package.json`))
    } catch {
        return undefined
    }
}

/** Copy a package, minus its build/test-only paths. */
const copyPackage = (from, to) => {
    fs.mkdirSync(to, { recursive: true })
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        if (PRUNE_PATHS.includes(entry.name)) continue
        const source = path.join(from, entry.name)
        const target = path.join(to, entry.name)
        if (entry.isDirectory()) copyPackage(source, target)
        else if (entry.isSymbolicLink()) fs.copyFileSync(fs.realpathSync(source), target)
        else fs.copyFileSync(source, target)
    }
}

/** Every runtime package reachable from `rootDir`, dependencies first. */
const collectClosure = (root, appRequire) => {
    const found = new Map()
    const queue = [[root, appRequire]]
    while (queue.length) {
        const [name, parentRequire] = queue.shift()
        if (found.has(name) || SKIP_OPTIONAL.has(name)) continue
        const dir = resolvePackageDir(parentRequire, name)
        if (!dir) continue
        found.set(name, dir)
        const manifest = readManifest(dir)
        const own = createRequire(path.join(dir, 'package.json'))
        const next = [
            ...Object.keys(manifest.dependencies ?? {}),
            // Optional deps that are not skipped (there are none today, but a
            // future `ssh2` release must not silently lose one).
            ...Object.keys(manifest.optionalDependencies ?? {}).filter((entry) => !SKIP_OPTIONAL.has(entry)),
        ]
        for (const dependency of next) queue.push([dependency, own])
    }
    return found
}

/**
 * Materialize `ssh2` (and its runtime closure) into `<dest>/node_modules`.
 *
 * @returns {{ ok: boolean, packages: string[], dest?: string, error?: string, skipped?: boolean }}
 */
const prepareSshDependencies = (context) => {
    if (process.env.KN_SKIP_SSH_DEPS === '1') {
        return { ok: true, skipped: true, packages: [], dest: undefined }
    }
    try {
        const appDir = process.env.KN_SSH_DEPS_BASE || path.join(__dirname, '..')
        const appRequire = createRequire(path.join(appDir, 'package.json'))
        const rootDir = resolvePackageDir(appRequire, ROOT_PACKAGE)
        if (!rootDir) {
            return {
                ok: false,
                packages: [],
                error: `[prepare-ssh-deps] 找不到 ${ROOT_PACKAGE}；请先在 apps/desktop 里 pnpm install。`,
            }
        }
        const resourcesDir =
            context?.electronPlatformName === 'darwin'
                ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
                : path.join(context.appOutDir, 'resources')
        const dest = path.join(resourcesDir, 'node_modules')

        const closure = collectClosure(ROOT_PACKAGE, appRequire)
        // Remove only the packages this hook owns, so the storage hook's files
        // (and any future one) are left alone.
        for (const name of closure.keys()) {
            fs.rmSync(path.join(dest, name), { recursive: true, force: true })
        }
        for (const [name, dir] of closure) {
            copyPackage(dir, path.join(dest, name))
        }
        return { ok: true, packages: [...closure.keys()].sort(), dest }
    } catch (error) {
        return { ok: false, packages: [], error: `[prepare-ssh-deps] ${error.message}` }
    }
}

module.exports = prepareSshDependencies
module.exports.collectClosure = collectClosure
module.exports.SKIP_OPTIONAL = SKIP_OPTIONAL
module.exports.ROOT_PACKAGE = ROOT_PACKAGE
