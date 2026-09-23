/**
 * Dev-server child-process test (plain Node, no Electron).
 *
 * Exercises the NDJSON protocol end to end: initial build, file-change rebuild,
 * manual build over stdin, build-error reporting and shutdown.
 *
 * Run: node apps/desktop/src/main/plugin-dev/dev-server.test.mjs
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const DEV_SERVER = join(here, 'dev-server.mjs')

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const root = join(tmpdir(), 'kn-studio-devserver-test')

const writeProject = async (body) => {
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(
        join(root, 'package.json'),
        JSON.stringify(
            {
                name: 'watch-dev-plugin',
                knPluginStudio: { pluginKey: 'watch-dev-plugin', displayName: 'Watch', entry: 'src/index.tsx' },
            },
            null,
            2,
        ),
    )
    await writeFile(join(root, 'src', 'index.tsx'), body)
}

await rm(root, { recursive: true, force: true })
await writeProject(`import { KPlugin } from '@kn/common'
export const p = 'v1'
class Watch extends KPlugin {}
export const watch = new Watch({ name: 'Watch' })
`)

const events = []
const waiters = []
const push = (event) => {
    events.push(event)
    for (const waiter of [...waiters]) {
        if (waiter.match(event)) {
            waiters.splice(waiters.indexOf(waiter), 1)
            clearTimeout(waiter.timer)
            waiter.resolve(event)
        }
    }
}
const waitFor = (match, timeoutMs = 20000) =>
    new Promise((resolve, reject) => {
        const existing = events.find(match)
        if (existing) return resolve(existing)
        const timer = setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1)
            reject(new Error('timeout waiting for event'))
        }, timeoutMs)
        const waiter = { match, resolve, timer }
        waiters.push(waiter)
    })

const child = spawn(process.execPath, [DEV_SERVER, '--root', root, '--watch', 'true'], {
    stdio: ['pipe', 'pipe', 'pipe'],
})

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
                push(JSON.parse(line))
            } catch {
                push({ event: 'unparseable', raw: line })
            }
        }
        index = buffer.indexOf('\n')
    }
})

const stderr = []
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => stderr.push(String(chunk)))

try {
    const ready = await waitFor((event) => event.event === 'ready')
    check('protocol: ready event', ready.plugin.pluginKey === 'watch-dev-plugin', JSON.stringify(ready.plugin))

    const first = await waitFor((event) => event.event === 'build')
    check('protocol: initial build', first.buildCount === 1 && first.code.includes('__knRequire'), `${first.bytes} bytes in ${first.durationMs}ms`)
    check('protocol: modules reported', Array.isArray(first.modules) && first.modules.includes('src/index.tsx'), JSON.stringify(first.modules))
    const watching = await waitFor((event) => event.event === 'watching')
    check('protocol: watching announced', watching.recursive !== false, JSON.stringify(watching))

    /* Edit the source: the watcher must rebuild on its own. */
    await writeFile(
        join(root, 'src', 'index.tsx'),
        `import { KPlugin } from '@kn/common'
export const p = 'v2'
class Watch extends KPlugin {}
export const watch = new Watch({ name: 'Watch' })
`,
    )
    const rebuilt = await waitFor((event) => event.event === 'build' && event.buildCount === 2)
    check('watch: rebuild on file change', rebuilt.reason === 'file-change', rebuilt.reason)
    check('watch: new code served', rebuilt.code.includes("'v2'") || rebuilt.code.includes('"v2"'))

    /* Manual build over stdin. */
    child.stdin.write(JSON.stringify({ command: 'build' }) + '\n')
    const manual = await waitFor((event) => event.event === 'build' && event.buildCount === 3)
    check('stdin: manual build', manual.reason === 'manual', manual.reason)

    /* Break the build: must report an error and keep the session alive. */
    await writeFile(join(root, 'src', 'index.tsx'), `import { nope } from './missing'\nexport const p = nope\n`)
    const broken = await waitFor((event) => event.event === 'build-error')
    check('errors: build failure reported', /missing/.test(broken.errors.join(' ')), broken.errors[0])

    const exitCode = await new Promise((resolve) => {
        child.on('exit', resolve)
        child.stdin.write(JSON.stringify({ command: 'stop' }) + '\n')
        setTimeout(() => child.kill(), 5000)
    })
    check('shutdown: clean exit', exitCode === 0, `code=${exitCode}`)
    check('errors: nothing fatal on stderr', !stderr.join('').includes('uncaught'), stderr.join('').slice(0, 200))
} finally {
    try {
        child.kill()
    } catch {
        // already dead
    }
    await rm(root, { recursive: true, force: true })
}

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
