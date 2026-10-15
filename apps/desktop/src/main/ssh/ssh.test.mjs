/**
 * SSH capability test (plain Node, no Electron, no server).
 *
 * Covers the request contract (validation, clamping, policy wording), the argv
 * that reaches the OpenSSH binaries, the output budget and the timeout/kill
 * path — all against a fake spawn — plus one real-binary check that proves the
 * runner turns a failed connection into a structured result instead of hanging
 * on a password prompt (`BatchMode=yes`).
 *
 * Run: node apps/desktop/src/main/ssh/ssh.test.mjs
 */
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import {
    DEFAULT_SSH_OUTPUT_BYTES,
    MAX_SSH_OUTPUT_BYTES,
    MAX_SSH_TIMEOUT_MS,
    buildScpArgs,
    buildSshArgs,
    clampSshOutputBytes,
    clampSshTimeout,
    createOutputCollector,
    normalizeHostKeyPolicy,
    normalizeRemotePath,
    normalizeSshCommand,
    normalizeSshTarget,
    sshDenyReason,
    sshGrantKey,
} from './ssh-args.mjs'
import { activeSshProcessCount, activeSshSlotCount, killActiveSshProcesses, runSshProcess } from './ssh-runner.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const throws = (fn) => {
    try {
        fn()
        return ''
    } catch (error) {
        return error.message
    }
}

/* ------------------------------------------------------------------ *
 * 1. target validation — nothing from a plugin may become an ssh flag
 * ------------------------------------------------------------------ */
const target = normalizeSshTarget({ host: 'deploy.example.com', user: 'deploy', port: 2222 })
check('target: normalized', target.host === 'deploy.example.com' && target.user === 'deploy' && target.port === 2222, JSON.stringify(target))
check(
    'target: defaults',
    JSON.stringify(normalizeSshTarget({ host: 'h' })) === JSON.stringify({ host: 'h', user: null, port: 22 }),
)
check('target: ipv6 brackets stripped', normalizeSshTarget({ host: '[2001:db8::1]' }).host === '2001:db8::1')
check('target: host required', /host/.test(throws(() => normalizeSshTarget({}))), throws(() => normalizeSshTarget({})))
check('target: option injection refused', /must not start with/.test(throws(() => normalizeSshTarget({ host: '-oProxyCommand=id' }))), throws(() => normalizeSshTarget({ host: '-oProxyCommand=id' })))
check('target: user option injection refused', /user/.test(throws(() => normalizeSshTarget({ host: 'h', user: '-l root' }))))
check('target: bad host chars refused', /unsupported/.test(throws(() => normalizeSshTarget({ host: 'h;rm -rf /' }))))
check('target: bad port refused', /port/.test(throws(() => normalizeSshTarget({ host: 'h', port: 70000 }))))
check('target: non-integer port refused', /port/.test(throws(() => normalizeSshTarget({ host: 'h', port: 22.5 }))))
check('target: grant key', sshGrantKey({ host: 'h', user: 'u', port: 22 }) === 'u@h:22' && sshGrantKey({ host: 'h', user: null, port: 22 }) === '@h:22')
check('target: unknown policy falls back to strict', normalizeHostKeyPolicy('whatever') === 'strict' && normalizeHostKeyPolicy('accept-new') === 'accept-new')

/* ------------------------------------------------------------------ *
 * 2. command / path / budget validation
 * ------------------------------------------------------------------ */
check('command: required', /command/.test(throws(() => normalizeSshCommand('   '))))
check('command: rejects NUL', /NUL/.test(throws(() => normalizeSshCommand('a\u0000b'))))
check('command: rejects over-long', /too long/.test(throws(() => normalizeSshCommand('x'.repeat(9000)))))
check('command: multi-line script kept verbatim', normalizeSshCommand('set -e\nls -la') === 'set -e\nls -la')
check('remotePath: required', /remotePath/.test(throws(() => normalizeRemotePath(''))))
check('remotePath: leading dash refused', /must not start with/.test(throws(() => normalizeRemotePath('-rf'))))
check('remotePath: control characters refused', /control/.test(throws(() => normalizeRemotePath('/tmp/a\nb'))))
check('remotePath: spaces are fine', normalizeRemotePath('/var/www/my app/index.html') === '/var/www/my app/index.html')
check('timeout: default', clampSshTimeout(undefined) === 30_000)
check('timeout: clamped to the max', clampSshTimeout(10 ** 9) === MAX_SSH_TIMEOUT_MS)
check('timeout: floor of 1s', clampSshTimeout(-5) === 1_000)
check('output: default', clampSshOutputBytes(undefined) === DEFAULT_SSH_OUTPUT_BYTES)
check('output: clamped to the max', clampSshOutputBytes(10 ** 9) === MAX_SSH_OUTPUT_BYTES)
check('output: floor of 4KiB', clampSshOutputBytes(1) === 4_096)

/* ------------------------------------------------------------------ *
 * 3. argv — the only thing that decides what ssh is told
 * ------------------------------------------------------------------ */
const execArgs = buildSshArgs({
    target,
    command: 'unzip -o /tmp/app.zip -d /var/www',
    hostKeyPolicy: 'strict',
    connectTimeoutMs: 30_000,
})
check(
    'argv: ssh forces batch mode and strict host keys',
    execArgs.includes('BatchMode=yes') && execArgs.includes('StrictHostKeyChecking=yes'),
    execArgs.join(' '),
)
check('argv: connect timeout in seconds', execArgs.includes('ConnectTimeout=30'), execArgs.join(' '))
check('argv: custom port + user flags', execArgs.join(' ').includes('-p 2222') && execArgs.join(' ').includes('-l deploy'))
check('argv: no tty', execArgs.includes('-T'))
check('argv: host before the command, command last', execArgs[execArgs.length - 2] === 'deploy.example.com' && execArgs[execArgs.length - 1].startsWith('unzip -o'))
check('argv: command stays one argument', execArgs.filter((entry) => entry.includes('unzip')).length === 1)
check('argv: default port emits no -p', !buildSshArgs({ target: { host: 'h', user: null, port: 22 }, command: 'true', hostKeyPolicy: 'strict', connectTimeoutMs: 1000 }).includes('-p'))
check(
    'argv: accept-new is the only way to weaken host-key checking',
    buildSshArgs({ target, command: 'true', hostKeyPolicy: 'accept-new', connectTimeoutMs: 1000 }).includes('StrictHostKeyChecking=accept-new'),
)

const putArgs = buildScpArgs({ target, direction: 'put', localPath: '/tmp/build.zip', remotePath: '/var/www/build.zip', hostKeyPolicy: 'strict', connectTimeoutMs: 10_000 })
check('argv: scp put is local then remote', putArgs[putArgs.length - 2] === '/tmp/build.zip' && putArgs[putArgs.length - 1] === 'deploy@deploy.example.com:/var/www/build.zip', putArgs.join(' '))
check('argv: scp uses -P for the port', putArgs.includes('-P') && putArgs.includes('2222') && !putArgs.includes('-p'), putArgs.join(' '))
check('argv: scp keeps paths as single arguments', putArgs.filter((entry) => entry.includes('build.zip')).length === 2)
const getArgs = buildScpArgs({ target: { host: 'h', user: null, port: 22 }, direction: 'get', localPath: '/tmp/out.log', remotePath: '/var/log/app.log', hostKeyPolicy: 'strict', connectTimeoutMs: 10_000 })
check('argv: scp get is remote then local', getArgs[getArgs.length - 2] === 'h:/var/log/app.log' && getArgs[getArgs.length - 1] === '/tmp/out.log', getArgs.join(' '))

/* ------------------------------------------------------------------ *
 * 4. policy wording
 * ------------------------------------------------------------------ */
check('policy: private refused with a way forward', /allow private network/.test(sshDenyReason('private')))
check('policy: resolved-private explains the mismatch', /resolves to a private/.test(sshDenyReason('private', { resolved: true })))
check('policy: metadata is absolute', /always blocked/.test(sshDenyReason('metadata')))

/* ------------------------------------------------------------------ *
 * 5. output budget
 * ------------------------------------------------------------------ */
const collector = createOutputCollector(10)
collector.push('12345')
collector.push('67890')
collector.push('more')
const collected = collector.result()
check('output: capped at the budget', collected.text === '1234567890' && collected.truncated === true, JSON.stringify(collected))
const smallCollector = createOutputCollector(100)
smallCollector.push('hello')
check('output: untruncated when under budget', smallCollector.result().text === 'hello' && smallCollector.result().truncated === false)

/* ------------------------------------------------------------------ *
 * 6. runner — fake spawn, no server needed
 * ------------------------------------------------------------------ */
const fakeChild = ({ stdout = [], stderr = [], code = 0, signal = null, onSpawn } = {}) => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.killed = []
    child.kill = (sig) => {
        child.killed.push(sig)
        return true
    }
    setImmediate(() => {
        if (onSpawn) onSpawn(child)
        for (const chunk of stdout) child.stdout.emit('data', chunk)
        for (const chunk of stderr) child.stderr.emit('data', chunk)
        child.emit('close', code, signal)
    })
    return child
}

const seen = []
const spawnRecorder = (options) => (binary, args, spawnOptions) => {
    seen.push({ binary, args, spawnOptions })
    return fakeChild(options)
}

const ok = await runSshProcess(
    { binary: 'ssh', args: ['-T', 'h', 'true'], timeoutMs: 5_000, maxOutputBytes: 1_000 },
    { spawnImpl: spawnRecorder({ stdout: ['done\n'] }) },
)
check('runner: exit 0 is ok', ok.ok === true && ok.code === 0 && ok.timedOut === false, JSON.stringify(ok))
check('runner: captures stdout', ok.stdout === 'done\n' && ok.argv[0] === 'ssh')
check('runner: closes stdin for ssh', seen[0].spawnOptions.stdio[0] === 'ignore', JSON.stringify(seen[0].spawnOptions.stdio))

const failed = await runSshProcess(
    { binary: 'ssh', args: ['-T', 'h', 'false'], timeoutMs: 5_000, maxOutputBytes: 1_000 },
    { spawnImpl: spawnRecorder({ stderr: ['Permission denied (publickey).\n'], code: 255 }) },
)
check('runner: non-zero exit is a result, not a throw', failed.ok === false && failed.code === 255 && /Permission denied/.test(failed.stderr), JSON.stringify(failed))

const noisy = await runSshProcess(
    { binary: 'ssh', args: ['-T', 'h', 'cat big'], timeoutMs: 5_000, maxOutputBytes: 8 },
    { spawnImpl: spawnRecorder({ stdout: ['abcdefghijklmnop'] }) },
)
check('runner: clips output and says so', noisy.stdout === 'abcdefgh' && noisy.truncated === true, JSON.stringify(noisy))

const timedOut = await runSshProcess(
    { binary: 'ssh', args: ['-T', 'h', 'sleep 99'], timeoutMs: 20, maxOutputBytes: 1_000 },
    {
        spawnImpl: () => {
            const child = new EventEmitter()
            child.stdout = new EventEmitter()
            child.stderr = new EventEmitter()
            child.killed = []
            child.kill = (sig) => {
                child.killed.push(sig)
                // Report the kill the way a real child would.
                setImmediate(() => child.emit('close', null, sig))
                return true
            }
            return child
        },
    },
)
check('runner: timeout kills the child and reports it', timedOut.timedOut === true && timedOut.ok === false && timedOut.signal === 'SIGTERM', JSON.stringify(timedOut))

const missing = await runSshProcess(
    { binary: 'definitely-not-ssh', args: [], timeoutMs: 1_000, maxOutputBytes: 100 },
    {
        spawnImpl: () => {
            const child = new EventEmitter()
            child.stdout = new EventEmitter()
            child.stderr = new EventEmitter()
            child.kill = () => true
            setImmediate(() => {
                const error = new Error('spawn ENOENT')
                error.code = 'ENOENT'
                child.emit('error', error)
            })
            return child
        },
    },
).then(
    () => '',
    (error) => error.message,
)
check('runner: a missing binary explains itself', /was not found/.test(missing) && /OpenSSH/.test(missing), missing)

/* A child that never closes must be reachable from the quit path. */
const hanging = new EventEmitter()
hanging.stdout = new EventEmitter()
hanging.stderr = new EventEmitter()
hanging.killed = []
hanging.kill = (sig) => {
    hanging.killed.push(sig)
    return true
}
const pending = runSshProcess(
    { binary: 'ssh', args: ['-T', 'h', 'sleep 999'], timeoutMs: 60_000, maxOutputBytes: 1_000 },
    { spawnImpl: () => hanging },
)
await new Promise((resolve) => setImmediate(resolve))
check('runner: tracks the in-flight child', activeSshProcessCount() === 1, String(activeSshProcessCount()))
const reaped = killActiveSshProcesses()
check('runner: quit reaps in-flight children', reaped === 1 && hanging.killed[0] === 'SIGTERM', JSON.stringify(hanging.killed))
// Let it finish so the suite has no pending handle of its own.
hanging.emit('close', null, 'SIGTERM')
check('runner: a reaped child resolves as signalled', (await pending).signal === 'SIGTERM')
check('runner: registry drains after close', activeSshProcessCount() === 0, String(activeSshProcessCount()))

/* ------------------------------------------------------------------ *
 * 7. concurrency — many calls must not become many ssh processes
 * ------------------------------------------------------------------ */
check('runner: no slot leaks before the concurrency test', activeSshSlotCount() === 0, String(activeSshSlotCount()))
const spawned = []
const hangingSpawn = () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.killed = []
    child.kill = () => true
    spawned.push(child)
    return child
}
const burst = []
for (let index = 0; index < 5; index += 1) {
    burst.push(
        runSshProcess(
            { binary: 'ssh', args: ['-T', 'h', `echo ${index}`], timeoutMs: 60_000, maxOutputBytes: 100 },
            { spawnImpl: hangingSpawn },
        ),
    )
}
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))
check('runner: caps concurrency at 4', spawned.length === 4 && activeSshSlotCount() === 4, `spawned=${spawned.length} slots=${activeSshSlotCount()}`)
spawned[0].emit('close', 0, null)
await burst[0]
await new Promise((resolve) => setImmediate(resolve))
check('runner: the queued call starts when a slot frees', spawned.length === 5, `spawned=${spawned.length}`)
for (const child of spawned.slice(1)) child.emit('close', 0, null)
await Promise.all(burst.slice(1))
check('runner: slots drain to zero', activeSshSlotCount() === 0 && activeSshProcessCount() === 0, `slots=${activeSshSlotCount()} children=${activeSshProcessCount()}`)

/* ------------------------------------------------------------------ *
 * 8. real binary — a failed connection must be fast and structured
 * ------------------------------------------------------------------ */
if (existsSync('/usr/bin/ssh') || existsSync('/bin/ssh')) {
    const unreachable = await runSshProcess(
        {
            binary: 'ssh',
            args: ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=3', 'nonexistent.invalid', 'true'],
            timeoutMs: 15_000,
            maxOutputBytes: 4_000,
        },
    )
    check(
        'real ssh: unresolved host fails structurally (no prompt hang)',
        unreachable.ok === false && unreachable.code !== 0 && unreachable.timedOut === false && unreachable.stderr.length > 0,
        `code=${unreachable.code} stderr=${JSON.stringify(unreachable.stderr.slice(0, 120))}`,
    )
} else {
    check('real ssh: unavailable, skipped', true, 'no /usr/bin/ssh or /bin/ssh on this machine')
}

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
