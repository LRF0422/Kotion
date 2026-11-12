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

/* ------------------------------------------------------------------ *
 * Declaration extraction
 *
 * The agent's expensive mistake is reading a whole contract file to learn one
 * type. These helpers let it ask for exactly one declaration (`symbol`) or one
 * interface member (`members`, e.g. a `DesktopCapabilityContract` entry), which
 * keeps the answer small and source-accurate — the file stays the only truth,
 * nothing is duplicated into a table that can drift.
 * ------------------------------------------------------------------ */

const MAX_EXTRACT_LINES = 400
const MAX_EXTRACT_NAMES = 24

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeNameList = (value, field) => {
    if (!Array.isArray(value)) throw new Error('dev.hostApi: "' + field + '" must be an array of names')
    const names = []
    for (const item of value) {
        if (typeof item !== 'string' || !item.trim()) continue
        const name = item.trim()
        if (!names.includes(name)) names.push(name)
    }
    if (names.length === 0) throw new Error('dev.hostApi: "' + field + '" is empty')
    if (names.length > MAX_EXTRACT_NAMES) {
        throw new Error('dev.hostApi: "' + field + '" accepts at most ' + MAX_EXTRACT_NAMES + ' names')
    }
    return names
}

/** Start of the doc comment directly above `index`, or `index` itself. */
const docCommentStart = (lines, index) => {
    let cursor = index - 1
    while (cursor >= 0 && lines[cursor].trim() === '') cursor--
    if (cursor < 0 || !lines[cursor].trim().endsWith('*/')) return index
    let start = cursor
    while (start >= 0 && !lines[start].includes('/*')) start--
    return start < 0 ? index : start
}

/** End (inclusive) of a declaration that starts at `start`. */
const declarationEnd = (lines, start) => {
    const limit = Math.min(lines.length - 1, start + MAX_EXTRACT_LINES)
    for (let index = start + 1; index <= limit; index++) {
        const line = lines[index]
        const next = lines[index + 1]
        const startsTopLevel = /^(?:export|import|declare|\/\*|\/\/)/.test(line)
        const nextStartsTopLevel = next === undefined || /^(?:export|import|declare|\/\*)/.test(next)
        if (startsTopLevel && nextStartsTopLevel) return index - 1
        if (startsTopLevel) return index - 1
        if (line.trim() === '' && nextStartsTopLevel) return index - 1
    }
    return limit
}

const sliceDeclaration = (lines, start, end) => {
    const text = lines.slice(start, end + 1).join('\n')
    return { startLine: start + 1, endLine: end + 1, text }
}

/** Find `export … <symbol>` in one file and return the declaration text. */
export const findDeclaration = (contents, symbol) => {
    if (typeof symbol !== 'string' || !symbol.trim()) {
        throw new Error('dev.hostApi: "symbol" must be a non-empty string')
    }
    const wanted = symbol.trim()
    const lines = contents.split('\n')
    const declaration = new RegExp(
        '^(?:export\\s+(?:declare\\s+)?(?:abstract\\s+)?(?:interface|type|const|let|var|enum|class|function)\\s+' +
            escapeRegExp(wanted) +
            '\\b|^(?:declare\\s+)?(?:interface|type|const|let|var|enum|class|function)\\s+' +
            escapeRegExp(wanted) +
            '\\b)',
    )
    const index = lines.findIndex((line) => declaration.test(line))
    if (index < 0) return undefined
    const start = docCommentStart(lines, index)
    const end = declarationEnd(lines, index)
    return { ...sliceDeclaration(lines, start, end), totalLines: lines.length }
}

/** Find one interface member (`'name': { … }`) and return its text. */
export const findInterfaceMember = (contents, member) => {
    if (typeof member !== 'string' || !member.trim()) {
        throw new Error('dev.hostApi: "member" must be a non-empty string')
    }
    const wanted = member.trim()
    const lines = contents.split('\n')
    const pattern = new RegExp("^\\s*['\"]?" + escapeRegExp(wanted) + "['\"]?\\s*:\\s*")
    const index = lines.findIndex((line) => pattern.test(line))
    if (index < 0) return undefined

    const start = docCommentStart(lines, index)
    let depth = 0
    let end = index
    for (let cursor = index; cursor < lines.length; cursor++) {
        for (const char of lines[cursor]) {
            if (char === '{' || char === '(' || char === '[') depth++
            else if (char === '}' || char === ')' || char === ']') depth--
        }
        end = cursor
        if (depth <= 0 && cursor > index - 1) {
            // A member without braces on the first line still needs its own line.
            if (cursor === index && !/[{([]/.test(lines[index])) break
            if (depth === 0) break
        }
    }
    return { ...sliceDeclaration(lines, start, end), totalLines: lines.length }
}

const readPackageText = async (root, ref, path) => {
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
    return {
        pkg,
        path: toPosix(relative(pkg.root, target)),
        contents: await readFile(target, 'utf8'),
        bytes: info.size,
    }
}

/** Read one member of a contract-like interface (e.g. one capability entry). */
export const readInterfaceMembers = async (root, { package: ref, path, members } = {}) => {
    if (!ref) throw new Error('dev.hostApi: "package" is required to read a member')
    if (typeof path !== 'string' || !path.trim()) {
        throw new Error('dev.hostApi: "path" is required to read a member')
    }
    const wanted = normalizeNameList(members, 'members')
    const file = await readPackageText(root, ref, path)
    const entries = []
    const missing = []
    for (const member of wanted) {
        const found = findInterfaceMember(file.contents, member)
        if (!found) {
            missing.push(member)
            continue
        }
        entries.push({ member, ...found })
    }
    return { package: file.pkg.name, path: file.path, entries, missing }
}

/**
 * Resolve one or more declarations by name. With `package` set the search is
 * confined to that package (and to `path` when given); otherwise every host
 * package is scanned in {@link HOST_PACKAGE_DIRS} order.
 */
export const readDeclarations = async (root, { package: ref, path, symbols } = {}) => {
    const wanted = normalizeNameList(symbols, 'symbols')
    if (ref && typeof path === 'string' && path.trim()) {
        const file = await readPackageText(root, ref, path)
        const declarations = []
        const missing = []
        for (const symbol of wanted) {
            const found = findDeclaration(file.contents, symbol)
            if (!found) {
                missing.push(symbol)
                continue
            }
            declarations.push({ symbol, package: file.pkg.name, path: file.path, ...found })
        }
        return { declarations, missing }
    }

    const packages = ref ? [findPackage(root, ref)].filter(Boolean) : listHostPackages(root)
    if (ref && packages.length === 0) throw new Error('dev.hostApi: unknown host package "' + ref + '"')
    const sources = []
    for (const pkg of packages) {
        for (const file of await walkSourceFiles(join(pkg.root, 'src'))) {
            const info = await stat(file).catch(() => undefined)
            if (!info || info.size > MAX_SEARCH_FILE_BYTES) continue
            sources.push({ pkg, file })
        }
    }

    // One pass over the candidates: pasted-in type names (`StorageListOptions`)
    // live in sibling modules, and a per-symbol walk would re-read every file.
    const declarations = []
    const remaining = new Set(wanted)
    for (const source of sources) {
        if (remaining.size === 0) break
        const contents = await readFile(source.file, 'utf8').catch(() => '')
        if (!contents) continue
        for (const symbol of [...remaining]) {
            if (!contents.includes(symbol)) continue
            const found = findDeclaration(contents, symbol)
            if (!found) continue
            remaining.delete(symbol)
            declarations.push({
                symbol,
                package: source.pkg.name,
                path: toPosix(relative(source.pkg.root, source.file)),
                ...found,
            })
        }
    }
    return { declarations, missing: [...remaining] }
}

/** Read one package-relative file from a host package (optionally one declaration). */
export const readHostPackageFile = async (root, { package: ref, path, symbol } = {}) => {
    if (!ref) throw new Error('dev.hostApi: "package" is required to read a file')
    if (typeof path !== 'string' || !path.trim()) {
        throw new Error('dev.hostApi: "path" is required to read a file')
    }
    const file = await readPackageText(root, ref, path)
    if (typeof symbol === 'string' && symbol.trim()) {
        const found = findDeclaration(file.contents, symbol)
        if (!found) {
            throw new Error(
                'dev.hostApi: declaration "' + symbol.trim() + '" not found in ' + file.pkg.name + ':' + file.path,
            )
        }
        return {
            package: file.pkg.name,
            path: file.path,
            contents: found.text,
            bytes: found.text.length,
            symbol: symbol.trim(),
            startLine: found.startLine,
            endLine: found.endLine,
            totalLines: found.totalLines,
        }
    }
    return { package: file.pkg.name, path: file.path, contents: file.contents, bytes: file.contents.length }
}

/**
 * Dispatch every access mode behind the single `dev.hostApi` capability:
 *
 *   - `{ query }`                          → search host package source
 *   - `{ symbols: [...] }`                 → declarations by name (cross-package)
 *   - `{ members: [...], package, path }`  → interface members (e.g. contract entries)
 *   - `{ package, path, symbol }`          → one declaration inside one file
 *   - `{ package, path }`                  → one whole file
 *   - `{}`                                 → list packages
 */
export const queryHostApi = async (root, options = {}) => {
    if (!root) throw new Error('dev.hostApi: host package source is not available in this build')
    if (Array.isArray(options.symbols) && options.symbols.length > 0) {
        return { kind: 'declarations', ...(await readDeclarations(root, options)) }
    }
    if (Array.isArray(options.members) && options.members.length > 0) {
        return { kind: 'contract', ...(await readInterfaceMembers(root, options)) }
    }
    if (typeof options.query === 'string' && options.query.trim()) {
        const result = await searchHostPackages(root, options)
        return { kind: 'search', ...result }
    }
    if (typeof options.path === 'string' && options.path.trim()) {
        return { kind: 'file', ...(await readHostPackageFile(root, options)) }
    }
    return { kind: 'list', root, packages: listHostPackages(root) }
}
