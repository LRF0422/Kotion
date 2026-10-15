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
const DEFAULT_GREP_LIMIT = 80
const MAX_GREP_LIMIT = 200
const MAX_GREP_CONTEXT = 5
const MAX_GREP_PATTERN_CHARS = 400
const MAX_GREP_LINE_CHARS = 400
/**
 * Wall-clock budget for one grep.
 *
 * The pattern comes from a model, so it can be catastrophic (`(a+)+$` over
 * 400 KB) and this runs in the **main process** — a hang here freezes the whole
 * app, not just the tool call. On expiry the walk stops and reports
 * `timedOut: true` instead of pretending the result is complete.
 */
const GREP_DEADLINE_MS = 2500
const GREP_OUTPUT_MODES = new Set(['content', 'files_with_matches', 'count'])

const toPosix = (value) => value.split(sep).join('/')

const clamp = (value, fallback, max) => {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
    return Math.min(Math.max(numeric, 1), max)
}

/** Like {@link clamp}, but `0` is a meaningful value (grep context radius). */
const clampZeroBased = (value, fallback, max) => {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
    return Math.min(Math.max(numeric, 0), max)
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Compile a ripgrep-style glob (`*`, `**`, `?`) into a matcher over POSIX paths.
 *
 * `*.tsx` matches at any depth (basename), `src/**` and `src/*.ts` are anchored
 * to the project-relative path — the same split rg makes between a bare glob
 * and one that contains a separator.
 */
export const compileGlob = (glob) => {
    const normalized = toPosix(String(glob ?? '').trim())
    if (!normalized) return null
    const anchored = normalized.includes('/')
    let source = ''
    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index]
        if (char === '*') {
            if (normalized[index + 1] === '*') {
                if (normalized[index + 2] === '/') {
                    source += '(?:.*/)?'
                    index += 2
                } else {
                    source += '.*'
                    index += 1
                }
            } else {
                source += '[^/]*'
            }
        } else if (char === '?') {
            source += '[^/]'
        } else {
            source += escapeRegExp(char)
        }
    }
    return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${source}$`)
}

/**
 * Build the path filter from `include`.
 *
 * Accepts a comma-separated list that mixes globs (`*.tsx`, `src/**`) and plain
 * substrings (`src/`) — the substring form is what the older `query` search
 * took, so existing callers keep working.
 */
const buildPathFilter = (include) => {
    if (typeof include !== 'string' || !include.trim()) return null
    const parts = include.split(',').map((part) => part.trim()).filter(Boolean)
    const globs = []
    const literals = []
    for (const part of parts) {
        if (/[*?]/.test(part)) {
            const regex = compileGlob(part)
            if (regex) globs.push(regex)
        } else {
            literals.push(part.toLowerCase())
        }
    }
    if (!globs.length && !literals.length) return null
    return (path) => {
        const lower = path.toLowerCase()
        if (literals.some((literal) => lower.includes(literal))) return true
        return globs.some((regex) => regex.test(path))
    }
}

const shortenLine = (line) => {
    const trimmed = String(line ?? '').replace(/\r$/, '').trim()
    return trimmed.length > MAX_GREP_LINE_CHARS ? `${trimmed.slice(0, MAX_GREP_LINE_CHARS)}…` : trimmed
}

const contextAround = (lines, index, radius) => {
    const before = []
    const after = []
    for (let cursor = Math.max(0, index - radius); cursor < index; cursor += 1) {
        before.push({ line: cursor + 1, text: shortenLine(lines[cursor]) })
    }
    for (let cursor = index + 1; cursor <= Math.min(lines.length - 1, index + radius); cursor += 1) {
        after.push({ line: cursor + 1, text: shortenLine(lines[cursor]) })
    }
    return { before, after }
}

/**
 * Grep one plugin project.
 *
 * A real regex over the project's text files, with include globs, context lines
 * and the three output modes an agent actually needs (`content`,
 * `files_with_matches`, `count`). Everything is bounded — file count, match
 * count, line length and wall clock — and the bounds are reported back
 * (`truncated`, `timedOut`, `scanned`, `skippedLarge`) so a partial result is
 * never mistaken for a complete one.
 */
export const grepProjectFiles = async (
    root,
    { pattern, include, ignoreCase, context, outputMode, limit } = {},
) => {
    if (typeof pattern !== 'string' || !pattern.trim()) {
        throw new Error('dev.files: "pattern" is required for a grep')
    }
    const source = pattern.trim()
    if (source.length > MAX_GREP_PATTERN_CHARS) {
        throw new Error(`dev.files: "pattern" is too long (max ${MAX_GREP_PATTERN_CHARS} characters)`)
    }
    let regex
    try {
        regex = new RegExp(source, ignoreCase === true ? 'i' : '')
    } catch (error) {
        throw new Error(`dev.files: invalid regular expression "${source}": ${error.message}`)
    }

    const mode = GREP_OUTPUT_MODES.has(outputMode) ? outputMode : 'content'
    const radius = mode === 'content' ? clampZeroBased(context, 0, MAX_GREP_CONTEXT) : 0
    const max = clamp(limit, DEFAULT_GREP_LIMIT, MAX_GREP_LIMIT)
    const filter = buildPathFilter(include)
    const deadline = Date.now() + GREP_DEADLINE_MS
    const walkState = { truncated: false }

    const matches = []
    const filesWithMatches = []
    const counts = []
    let scanned = 0
    let skippedLarge = 0
    let truncated = false
    let timedOut = false

    outer: for (const file of await walk(root, [], walkState)) {
        if (Date.now() > deadline) {
            timedOut = true
            break
        }
        const path = toPosix(relative(root, file))
        if (filter && !filter(path)) continue
        let text
        try {
            text = await readFile(file, 'utf8')
        } catch {
            continue
        }
        if (text.length > MAX_SEARCH_FILE_BYTES) {
            skippedLarge += 1
            continue
        }
        scanned += 1
        const lines = text.split('\n')
        let fileMatches = 0
        for (let index = 0; index < lines.length; index += 1) {
            if ((index & 255) === 0 && Date.now() > deadline) {
                timedOut = true
                break outer
            }
            if (!regex.test(lines[index])) continue
            fileMatches += 1
            if (mode !== 'content') continue
            if (matches.length >= max) {
                truncated = true
                break outer
            }
            matches.push({ path, line: index + 1, text: shortenLine(lines[index]), ...contextAround(lines, index, radius) })
        }
        if (fileMatches === 0) continue
        if (mode === 'files_with_matches') {
            if (filesWithMatches.length >= max) {
                truncated = true
                break
            }
            filesWithMatches.push(path)
        } else if (mode === 'count') {
            if (counts.length >= max) {
                truncated = true
                break
            }
            counts.push({ path, count: fileMatches })
        }
    }

    return {
        kind: 'grep',
        root,
        mode,
        pattern: source,
        matches,
        files: filesWithMatches,
        counts,
        scanned,
        skippedLarge,
        truncated: truncated || walkState.truncated,
        timedOut,
    }
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

/**
 * Normalize the raw `dev.files` params.
 *
 * The renderer is untrusted input, so every field is type-checked here rather
 * than inside the IPC closure — which also makes the mapping testable without
 * Electron. Unknown or ill-typed fields are dropped instead of reaching the
 * walker.
 */
export const normalizeFilesParams = (params = {}) => ({
    query: typeof params.query === 'string' ? params.query : undefined,
    pattern: typeof params.pattern === 'string' ? params.pattern : undefined,
    include: typeof params.include === 'string' ? params.include : undefined,
    ignoreCase: params.ignoreCase === true,
    context: typeof params.context === 'number' ? params.context : undefined,
    outputMode: typeof params.outputMode === 'string' ? params.outputMode : undefined,
    limit: typeof params.limit === 'number' ? params.limit : undefined,
})

/** Dispatch list/search/grep behind the single dev.files capability. */
export const queryProjectFiles = async (root, options = {}) => {
    if (typeof options.pattern === 'string' && options.pattern.trim()) {
        return await grepProjectFiles(root, options)
    }
    if (typeof options.query === 'string' && options.query.trim()) {
        return { kind: 'search', ...(await searchProjectFiles(root, options)) }
    }
    return { kind: 'list', ...(await listProjectFiles(root, options)) }
}
