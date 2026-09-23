/**
 * Host package API reference (main process).
 *
 * The plugin studio's agent authors plugins against the standard host packages
 * (@kn/common, @kn/core, @kn/ui, @kn/icon, @kn/editor, @kn/plugin-api). Their
 * TypeScript source is the authoritative interface, so this module exposes a
 * read-only view of it: list the packages, search their declarations, and read
 * one file. Pure Node — the caller supplies the workspace root, so it is
 * testable without Electron and never reaches outside <root>/packages.
 */
import { existsSync, readFileSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Directory names under <root>/packages that make up the host API. */
export const HOST_PACKAGE_DIRS = ['common', 'core', 'ui', 'icon', 'editor', 'plugin-api']

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.turbo', '.git', '__tests__', '__snapshots__'])
const MAX_SEARCH_FILE_BYTES = 400000
const MAX_READ_BYTES = 200000
const DEFAULT_LIMIT = 60
const MAX_LIMIT = 200

const toPosix = (value) => value.split(sep).join('/')

/** First candidate that looks like the monorepo root, or undefined. */
export const resolveWorkspaceRoot = (candidates = []) => {
    for (const candidate of candidates) {
        if (!candidate) continue
        const root = resolve(candidate)
        if (HOST_PACKAGE_DIRS.some((name) => existsSync(join(root, 'packages', name, 'package.json')))) {
            return root
        }
    }
    return undefined
}

const readManifest = (packageRoot) => {
    try {
        return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
    } catch {
        return {}
    }
}

/** Describe every host package present under <root>/packages. */
export const listHostPackages = (root) => {
    const packages = []
    for (const dir of HOST_PACKAGE_DIRS) {
        const packageRoot = join(root, 'packages', dir)
        if (!existsSync(join(packageRoot, 'package.json'))) continue
        const manifest = readManifest(packageRoot)
        const entryRel = typeof manifest.types === 'string'
            ? manifest.types
            : typeof manifest.main === 'string' ? manifest.main : undefined
        packages.push({
            name: typeof manifest.name === 'string' ? manifest.name : '@kn/' + dir,
            version: typeof manifest.version === 'string' ? manifest.version : undefined,
            root: packageRoot,
            entry: entryRel && existsSync(join(packageRoot, entryRel)) ? toPosix(entryRel) : undefined,
        })
    }
    return packages
}

const findPackage = (root, ref) => {
    if (!ref) return undefined
    const wanted = String(ref).trim()
    return listHostPackages(root).find((pkg) => pkg.name === wanted || pkg.name === '@kn/' + wanted)
}

const walkSourceFiles = async (dir, acc = []) => {
    let entries
    try {
        entries = await readdir(dir, { withFileTypes: true })
    } catch {
        return acc
    }
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) await walkSourceFiles(full, acc)
        } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
            acc.push(full)
        }
    }
    return acc
}

const clampLimit = (value) => {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_LIMIT
    return Math.min(Math.max(numeric, 1), MAX_LIMIT)
}

/** Search host package source for a case-insensitive substring. */
export const searchHostPackages = async (root, { package: ref, query, limit } = {}) => {
    if (typeof query !== 'string' || !query.trim()) {
        throw new Error('dev.hostApi: "query" is required for a search')
    }
    const packages = ref ? [findPackage(root, ref)].filter(Boolean) : listHostPackages(root)
    if (ref && packages.length === 0) throw new Error('dev.hostApi: unknown host package "' + ref + '"')

    const needle = query.trim().toLowerCase()
    const max = clampLimit(limit)
    const matches = []
    let truncated = false

    outer: for (const pkg of packages) {
        for (const file of await walkSourceFiles(join(pkg.root, 'src'))) {
            let text
            try {
                text = await readFile(file, 'utf8')
            } catch {
                continue
            }
            if (text.length > MAX_SEARCH_FILE_BYTES) continue
            const lines = text.split('\n')
            for (let index = 0; index < lines.length; index++) {
                const line = lines[index]
                if (!line.toLowerCase().includes(needle)) continue
                if (matches.length >= max) {
                    truncated = true
                    break outer
                }
                matches.push({
                    package: pkg.name,
                    path: toPosix(relative(pkg.root, file)),
                    line: index + 1,
                    text: line.trim().slice(0, 240),
                })
            }
        }
    }
    return { matches, truncated }
}

/** Read one package-relative file from a host package. */
export const readHostPackageFile = async (root, { package: ref, path } = {}) => {
    if (!ref) throw new Error('dev.hostApi: "package" is required to read a file')
    if (typeof path !== 'string' || !path.trim()) {
        throw new Error('dev.hostApi: "path" is required to read a file')
    }
    const pkg = findPackage(root, ref)
    if (!pkg) throw new Error('dev.hostApi: unknown host package "' + ref + '"')
    if (isAbsolute(path)) throw new Error('dev.hostApi: "path" must be package-relative')
    const target = resolve(pkg.root, path)
    if (target !== pkg.root && !target.startsWith(pkg.root + sep)) {
        throw new Error('dev.hostApi: "path" escapes the package root')
    }
    const info = await stat(target).catch(() => undefined)
    if (!info || !info.isFile()) throw new Error('dev.hostApi: not a file: ' + path)
    if (info.size > MAX_READ_BYTES) {
        throw new Error('dev.hostApi: file is too large (' + info.size + ' bytes); search it instead')
    }
    const contents = await readFile(target, 'utf8')
    return { package: pkg.name, path: toPosix(relative(pkg.root, target)), contents, bytes: contents.length }
}

/** Dispatch the three access modes behind the single dev.hostApi capability. */
export const queryHostApi = async (root, options = {}) => {
    if (!root) throw new Error('dev.hostApi: host package source is not available in this build')
    if (typeof options.query === 'string' && options.query.trim()) {
        const result = await searchHostPackages(root, options)
        return { kind: 'search', ...result }
    }
    if (typeof options.path === 'string' && options.path.trim()) {
        return { kind: 'file', ...(await readHostPackageFile(root, options)) }
    }
    return { kind: 'list', root, packages: listHostPackages(root) }
}
