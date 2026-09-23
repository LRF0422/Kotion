/**
 * Plugin-project file explorer (main process).
 *
 * DSH-style discovery primitives for the agent: enumerate a project's files
 * and search them, without ever handing the renderer a generic filesystem.
 * The caller validates the project root against the fs allowlist; this module
 * only walks under that root and skips vendor/build directories. Pure Node,
 * so it is testable without Electron.
 */
import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'release', 'out', '.git', '.turbo', 'coverage'])
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.html', '.txt'])
const MAX_LIST_FILES = 400
const DEFAULT_SEARCH_LIMIT = 60
const MAX_SEARCH_LIMIT = 200
const MAX_SEARCH_FILE_BYTES = 400000

const toPosix = (value) => value.split(sep).join('/')

const clamp = (value, fallback, max) => {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
    return Math.min(Math.max(numeric, 1), max)
}

const walk = async (dir, acc, state) => {
    if (state.truncated) return acc
    let entries
    try {
        entries = await readdir(dir, { withFileTypes: true })
    } catch {
        return acc
    }
    for (const entry of entries) {
        if (acc.length >= MAX_LIST_FILES) {
            // Report the cap: a search that stops walking must not claim it
            // scanned everything, or the agent silently misses matches.
            state.truncated = true
            return acc
        }
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) await walk(full, acc, state)
        } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
            acc.push(full)
        }
    }
    return acc
}

/** List project-relative source files, optionally filtered by a path substring. */
export const listProjectFiles = async (root, { include, limit } = {}) => {
    const state = { truncated: false }
    const files = (await walk(root, [], state)).map((file) => toPosix(relative(root, file))).sort()
    const needle = typeof include === 'string' && include.trim() ? include.trim().toLowerCase() : undefined
    const filtered = needle ? files.filter((path) => path.toLowerCase().includes(needle)) : files
    const max = clamp(limit, MAX_LIST_FILES, MAX_LIST_FILES)
    return { root, files: filtered.slice(0, max), truncated: state.truncated || filtered.length > max }
}

/** Search project source for a case-insensitive substring, returning file + line. */
export const searchProjectFiles = async (root, { query, include, limit } = {}) => {
    if (typeof query !== 'string' || !query.trim()) {
        throw new Error('dev.files: "query" is required for a search')
    }
    const needle = query.trim().toLowerCase()
    const filter = typeof include === 'string' && include.trim() ? include.trim().toLowerCase() : undefined
    const max = clamp(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
    const matches = []
    let truncated = false
    const state = { truncated: false }

    outer: for (const file of await walk(root, [], state)) {
        const path = toPosix(relative(root, file))
        if (filter && !path.toLowerCase().includes(filter)) continue
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
            matches.push({ path, line: index + 1, text: line.trim().slice(0, 240) })
        }
    }
    return { root, matches, truncated: truncated || state.truncated }
}

/** Dispatch list/search behind the single dev.files capability. */
export const queryProjectFiles = async (root, options = {}) => {
    if (typeof options.query === 'string' && options.query.trim()) {
        return { kind: 'search', ...(await searchProjectFiles(root, options)) }
    }
    return { kind: 'list', ...(await listProjectFiles(root, options)) }
}
