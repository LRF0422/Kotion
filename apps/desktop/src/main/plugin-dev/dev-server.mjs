/**
 * Plugin dev-server child process.
 *
 * Spawned by the desktop main process with `ELECTRON_RUN_AS_NODE=1`, so it is
 * plain Node with no Electron APIs. Speaks NDJSON on stdout — one JSON object
 * per line, always with an `event` field — and accepts `{"command": "build" |
 * "stop"}` on stdin. Diagnostics that are not protocol messages go to stderr.
 *
 * Why a child process: bundling is CPU-heavy and a broken build (or a runaway
 * watcher) must never block or crash the host window.
 */
import { watch } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { buildPlugin, readProjectManifest } from './bundler.mjs'

const IGNORED = /(^|[\\/])(node_modules|\.git|dist|out|release|\.turbo)([\\/]|$)/
const WATCHED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'])

const parseArgs = (argv) => {
    const options = { watch: true, writeToDisk: false, externals: [] }
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (arg === '--root') options.root = resolve(argv[++i])
        else if (arg === '--watch') options.watch = argv[++i] !== 'false'
        else if (arg === '--writeToDisk') options.writeToDisk = argv[++i] === 'true'
        else if (arg === '--externals') {
            const raw = argv[++i]
            options.externals = raw ? raw.split(',').map((value) => value.trim()).filter(Boolean) : []
        }
    }
    return options
}

const send = (payload) => {
    process.stdout.write(JSON.stringify({ ...payload, at: Date.now() }) + '\n')
}

const log = (level, message) => {
    process.stderr.write(`[plugin-dev:${level}] ${message}\n`)
    send({ event: 'log', level, message })
}

const main = async () => {
    const options = parseArgs(process.argv.slice(2))
    if (!options.root) {
        send({ event: 'fatal', error: 'missing --root' })
        process.exit(2)
    }

    let manifest
    try {
        manifest = await readProjectManifest(options.root)
    } catch (error) {
        send({ event: 'fatal', error: `cannot read project: ${error.message}` })
        process.exit(2)
    }

    send({
        event: 'ready',
        root: options.root,
        entry: manifest.entry,
        plugin: {
            pluginKey: manifest.pluginKey,
            name: manifest.displayName || manifest.name,
            icon: manifest.icon || undefined,
        },
    })

    let building = false
    let queued = false
    let buildCount = 0
    let lastCode = null
    let lastMeta = null

    const runBuild = async (reason) => {
        if (building) {
            queued = true
            return
        }
        building = true
        const startedAt = Date.now()
        try {
            // Re-read the manifest each build so pluginKey / entry edits apply
            // without restarting the session.
            manifest = await readProjectManifest(options.root)
            const result = await buildPlugin({
                root: options.root,
                entry: manifest.entry,
                pluginKey: manifest.pluginKey,
                name: manifest.name,
                writeToDisk: options.writeToDisk,
                externals: options.externals,
            })

            if (!result.ok) {
                log('error', `build failed (${reason}): ${result.errors.join(' | ')}`)
                send({ event: 'build-error', errors: result.errors, reason })
                return
            }

            buildCount += 1
            lastCode = result.code
            lastMeta = {
                pluginKey: manifest.pluginKey,
                name: manifest.displayName || manifest.name,
                icon: manifest.icon || undefined,
            }

            for (const warning of result.warnings || []) log('warn', warning)
            log('info', `build #${buildCount} ok in ${Date.now() - startedAt}ms (${result.code.length} bytes)`)

            send({
                event: 'build',
                reason,
                buildCount,
                durationMs: Date.now() - startedAt,
                bytes: result.code.length,
                outFile: result.outFile,
                modules: result.modules,
                plugin: lastMeta,
                code: result.code,
            })
        } catch (error) {
            log('error', `build crashed: ${error && error.stack ? error.stack : String(error)}`)
            send({ event: 'build-error', errors: [String((error && error.message) || error)], reason })
        } finally {
            building = false
            if (queued) {
                queued = false
                void runBuild('queued')
            }
        }
    }

    await runBuild('initial')

    const watchers = []
    if (options.watch) {
        let timer = null
        const schedule = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                timer = null
                void runBuild('file-change')
            }, 80)
        }

        try {
            const watcher = watch(options.root, { recursive: true }, (_event, filename) => {
                if (!filename) return schedule()
                const name = String(filename)
                if (IGNORED.test(name)) return
                if (!WATCHED_EXTENSIONS.has(extname(name))) return
                schedule()
            })
            watcher.on('error', (error) => log('warn', `watcher error: ${error.message}`))
            watchers.push(watcher)
            send({ event: 'watching', root: options.root })
        } catch (error) {
            log('warn', `recursive watch unavailable (${error.message}); falling back to package.json only`)
            try {
                const watcher = watch(join(options.root, 'package.json'), () => schedule())
                watchers.push(watcher)
                send({ event: 'watching', root: options.root, recursive: false })
            } catch (fallbackError) {
                log('warn', `watch disabled: ${fallbackError.message}`)
            }
        }
    }

    const shutdown = (code) => {
        for (const watcher of watchers) {
            try {
                watcher.close()
            } catch {
                // already closed
            }
        }
        send({ event: 'stopped' })
        setTimeout(() => process.exit(code ?? 0), 20)
    }

    let stdinBuffer = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
        stdinBuffer += chunk
        let index = stdinBuffer.indexOf('\n')
        while (index !== -1) {
            const line = stdinBuffer.slice(0, index).trim()
            stdinBuffer = stdinBuffer.slice(index + 1)
            if (line) {
                try {
                    const command = JSON.parse(line)
                    if (command.command === 'build') void runBuild('manual')
                    else if (command.command === 'stop') shutdown(0)
                } catch (error) {
                    log('warn', `bad command: ${error.message}`)
                }
            }
            index = stdinBuffer.indexOf('\n')
        }
    })

    process.on('SIGTERM', () => shutdown(0))
    process.on('SIGINT', () => shutdown(0))
    process.on('uncaughtException', (error) => {
        send({ event: 'fatal', error: error && error.stack ? error.stack : String(error) })
        shutdown(1)
    })
}

void main()
