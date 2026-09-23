/**
 * Plugin dev-session manager (main process).
 *
 * Owns the child-process lifecycle for every watched plugin project and turns
 * the NDJSON protocol into the promise-based `dev.*` capability surface.
 *
 * Security posture: the only path that reaches `spawn` is a project root that
 * a caller already validated against the fs allowlist (see ipc.ts), and the
 * child is always *this* dev-server script with a fixed argument shape — the
 * renderer can never pass arbitrary commands or environment variables.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderScaffold } from './bundler.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Locate the dev-server entry the child process runs.
 *
 * The build copies `dev-server.mjs` next to this module (`out/main/plugin-dev/`)
 * because a child process needs a real file on disk — it is never part of the
 * main bundle. Running from source (tests, `electron-vite dev`) uses the sibling
 * in `src/main/plugin-dev/`.
 */
const resolveDevServer = () => {
    const candidates = [
        join(here, 'dev-server.mjs'),
        join(here, '..', '..', 'src', 'main', 'plugin-dev', 'dev-server.mjs'),
    ]
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

const MAX_LOG_ENTRIES = 400
const INITIAL_BUILD_TIMEOUT_MS = 30_000

/** True when `dir` exists and has at least one entry (ENOENT => false). */
const directoryHasEntries = async (dir) => {
    try {
        const entries = await readdir(dir)
        return entries.length > 0
    } catch (error) {
        if (error.code === 'ENOENT') return false
        throw error
    }
}

/** @typedef {import('./dev-server.mjs')} DevServerModule */

class DevSession {
    constructor(root, options, emit) {
        this.root = root
        this.options = options
        this.emit = emit
        this.child = null
        // Resolved once: a child process needs a real file on disk, and the
        // entry differs between source runs and built output.
        this.devServer = resolveDevServer()
        this.state = 'idle'
        this.plugin = { pluginKey: null, name: root }
        this.build = null
        this.error = null
        this.buildCount = 0
        this.updatedAt = 0
        this.watching = false
        this.logs = []
        this.readyWaiters = []
        this.buildWaiters = []
    }

    status() {
        return {
            root: this.root,
            state: this.state,
            plugin: this.plugin,
            build: this.build,
            error: this.error || undefined,
            buildCount: this.buildCount,
            updatedAt: this.updatedAt,
            watching: this.watching,
        }
    }

    pushLog(level, message) {
        this.logs.push({ level, message, at: Date.now() })
        if (this.logs.length > MAX_LOG_ENTRIES) this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES)
    }

    /** Resolve once the child is up (ready or fatal), never before a first build. */
    waitForReady(timeoutMs = INITIAL_BUILD_TIMEOUT_MS) {
        if (this.state === 'watching' || this.state === 'failed' || this.state === 'stopped') {
            return Promise.resolve()
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.readyWaiters = this.readyWaiters.filter((entry) => entry.resolve !== resolve)
                resolve()
            }, timeoutMs)
            this.readyWaiters.push({ resolve: () => {
                clearTimeout(timer)
                resolve()
            } })
        })
    }

    /**
     * Resolve once a build *later than* `minCount` has landed, so a one-shot
     * build issued over stdin returns the new status rather than the previous one.
     */
    waitForBuildCount(minCount, timeoutMs = INITIAL_BUILD_TIMEOUT_MS) {
        if (this.buildCount > minCount) return Promise.resolve()
        return new Promise((resolve) => {
            const waiter = { minCount, resolve }
            const timer = setTimeout(() => {
                this.buildWaiters = this.buildWaiters.filter((entry) => entry !== waiter)
                resolve()
            }, timeoutMs)
            waiter.resolve = () => {
                clearTimeout(timer)
                resolve()
            }
            this.buildWaiters.push(waiter)
        })
    }

    settleReadyWaiters() {
        const waiters = this.readyWaiters
        this.readyWaiters = []
        for (const waiter of waiters) waiter.resolve()
    }

    /**
     * Resolve pending count-based build waits. A successful build resolves the
     * waits it satisfies; a failure (`force`) resolves them all, because the
     * attempt is over even though the count did not move.
     */
    settleBuildWaiters(force = false) {
        const remaining = []
        for (const waiter of this.buildWaiters) {
            if (force || this.buildCount > waiter.minCount) waiter.resolve()
            else remaining.push(waiter)
        }
        this.buildWaiters = remaining
    }

    handleEvent(event) {
        switch (event.event) {
            case 'ready':
                this.plugin = event.plugin || this.plugin
                this.state = 'starting'
                break
            case 'watching':
                this.watching = true
                break
            case 'build':
                this.build = {
                    code: event.code,
                    outFile: event.outFile,
                    bytes: event.bytes,
                    durationMs: event.durationMs,
                    modules: event.modules || [],
                }
                this.plugin = event.plugin || this.plugin
                this.buildCount = event.buildCount
                this.updatedAt = event.at
                this.error = null
                this.state = 'watching'
                this.settleReadyWaiters()
                this.settleBuildWaiters()
                this.emit('build', this.status())
                break
            case 'build-error':
                this.error = (event.errors || []).join('\n')
                this.state = this.build ? this.state : 'failed'
                this.settleReadyWaiters()
                // A failed attempt is still a finished attempt: release any
                // one-shot build() caller instead of making it wait out the
                // full initial-build timeout.
                this.settleBuildWaiters(true)
                this.emit('build-error', this.status())
                break
            case 'log':
                this.pushLog(event.level, event.message)
                break
            case 'fatal':
                this.error = event.error
                this.state = 'failed'
                this.settleReadyWaiters()
                this.emit('build-error', this.status())
                break
            case 'stopped':
                this.state = 'stopped'
                this.settleReadyWaiters()
                break
            default:
                break
        }
    }

    start() {
        if (this.child) return
        this.state = 'starting'
        this.error = null

        const args = [
            this.devServer,
            '--root', this.root,
            '--watch', String(this.options.watch !== false),
            '--writeToDisk', String(Boolean(this.options.writeToDisk)),
        ]
        if (this.options.externals?.length) args.push('--externals', this.options.externals.join(','))

        // ELECTRON_RUN_AS_NODE turns Electron's binary into a plain Node runtime,
        // so the studio needs no separately installed Node on the user's machine.
        const child = spawn(process.execPath, args, {
            cwd: this.root,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
        })
        this.child = child

        let buffer = ''
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (chunk) => {
            buffer += chunk
            let index = buffer.indexOf('\n')
            while (index !== -1) {
                const line = buffer.slice(0, index).trim()
                buffer = buffer.slice(index + 1)
                if (line) {
                    try {
                        this.handleEvent(JSON.parse(line))
                    } catch (error) {
                        this.pushLog('warn', `unparseable dev-server output: ${line.slice(0, 200)}`)
                    }
                }
                index = buffer.indexOf('\n')
            }
        })

        child.stderr.setEncoding('utf8')
        child.stderr.on('data', (chunk) => {
            const text = String(chunk).trim()
            if (text) console.log('[plugin-dev]', text)
        })

        child.on('error', (error) => {
            this.error = error.message
            this.state = 'failed'
            this.child = null
            this.settleReadyWaiters()
        })

        child.on('exit', (code) => {
            this.child = null
            this.watching = false
            if (this.state !== 'stopped') {
                this.state = this.state === 'failed' ? 'failed' : 'stopped'
                if (code !== 0 && !this.error) this.error = `dev-server exited with code ${code}`
            }
            this.settleReadyWaiters()
        })
    }

    requestBuild() {
        if (!this.child) {
            this.start()
            return
        }
        this.child.stdin.write(JSON.stringify({ command: 'build' }) + '\n')
    }

    stop() {
        if (!this.child) {
            this.state = 'stopped'
            this.watching = false
            return
        }
        try {
            this.child.stdin.write(JSON.stringify({ command: 'stop' }) + '\n')
        } catch {
            // pipe already closed
        }
        const child = this.child
        setTimeout(() => {
            if (this.child === child) {
                try {
                    child.kill()
                } catch {
                    // already gone
                }
            }
        }, 1500)
        this.state = 'stopped'
        this.watching = false
        this.settleReadyWaiters()
    }
}

export class DevSessionManager {
    constructor() {
        /** @type {Map<string, DevSession>} */
        this.sessions = new Map()
        /** @type {Set<(event: string, status: object) => void>} */
        this.listeners = new Set()
    }

    onEvent(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emit(event, status) {
        for (const listener of this.listeners) {
            try {
                listener(event, status)
            } catch (error) {
                console.error('[plugin-dev] listener failed', error)
            }
        }
    }

    async start(options) {
        const root = options.root
        const existing = this.sessions.get(root)
        if (existing) {
            // Restart with the new options rather than leaking the old watcher.
            existing.stop()
            this.sessions.delete(root)
        }
        const session = new DevSession(root, options, (event, status) => this.emit(event, status))
        this.sessions.set(root, session)
        session.start()
        await session.waitForReady()
        return session.status()
    }

    stop(options) {
        const session = this.sessions.get(options.root)
        if (!session) return false
        session.stop()
        this.sessions.delete(options.root)
        return true
    }

    async build(options) {
        const session = this.sessions.get(options.root)
        if (!session) {
            return await this.start({ ...options, watch: false })
        }
        // A manual build is asynchronous over stdin: wait for the *next* build
        // so the caller gets the fresh status instead of the previous one.
        const previousCount = session.buildCount
        session.requestBuild()
        await session.waitForBuildCount(previousCount)
        return session.status()
    }

    status(options = {}) {
        if (options.root) {
            const session = this.sessions.get(options.root)
            return session ? [session.status()] : []
        }
        return [...this.sessions.values()].map((session) => session.status())
    }

    logs(options) {
        const session = this.sessions.get(options.root)
        if (!session) return []
        const limit = options.limit ?? 200
        return session.logs.slice(-limit)
    }

    async scaffold(options) {
        const files = renderScaffold({
            name: options.name,
            pluginKey: options.pluginKey || options.name.replace(/^@[^/]+\//, ''),
            displayName: options.displayName,
        })
        // `projectsDir` is the host's managed directory; an explicit `parentDir`
        // wins (adding an existing project that lives elsewhere).
        const parentDir = options.parentDir || options.projectsDir
        if (!parentDir) {
            throw new Error('dev.scaffold: no parentDir and the host provided no managed projects directory')
        }
        const root = join(parentDir, options.name)

        if (!options.overwrite && (await directoryHasEntries(root))) {
            throw new Error(`Target directory is not empty: ${root}`)
        }

        const written = []
        for (const [relativePath, contents] of Object.entries(files)) {
            const target = join(root, relativePath)
            await mkdir(dirname(target), { recursive: true })
            await writeFile(target, contents, 'utf8')
            written.push(relativePath)
        }

        return {
            root,
            pluginKey: options.pluginKey || options.name.replace(/^@[^/]+\//, ''),
            files: written,
            managed: !options.parentDir,
        }
    }

    /**
     * Enumerate plugin projects on disk.
     *
     * A directory counts as a project when it has a `package.json`; one with a
     * `knPluginStudio` block also reports its registry key. Unreadable folders
     * are skipped instead of failing the whole listing, so one bad directory
     * cannot hide the rest.
     */
    async listProjects(options = {}) {
        const dir = options.dir
        if (!dir) return []

        let entries
        try {
            entries = await readdir(dir, { withFileTypes: true })
        } catch (error) {
            if (error.code === 'ENOENT') return []
            throw error
        }

        const projects = []
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) continue
            const root = join(dir, entry.name)
            const manifestPath = join(root, 'package.json')
            let manifest
            let stats
            try {
                manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
                stats = await stat(manifestPath)
            } catch {
                continue
            }
            const studio = manifest.knPluginStudio || manifest.knPlugin || {}
            let entryFile = typeof studio.entry === 'string' ? join(root, studio.entry) : undefined
            if (entryFile && !existsSync(entryFile)) entryFile = undefined
            projects.push({
                root,
                name: entry.name,
                pluginKey: studio.pluginKey || manifest.name || entry.name.replace(/^@[^/]+\//, ''),
                displayName: studio.displayName || undefined,
                entry: entryFile,
                updatedAt: stats.mtimeMs,
                active: this.sessions.has(root),
            })
        }

        return projects.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
    }

    dispose() {
        for (const session of this.sessions.values()) session.stop()
        this.sessions.clear()
        this.listeners.clear()
    }
}
