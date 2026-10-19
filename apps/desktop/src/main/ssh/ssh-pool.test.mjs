/**
 * SSH connection pool test (plain Node — no Electron, no external sshd).
 *
 * Two halves, like `ssh.test.mjs` (which this file deliberately does not
 * import, because importing it would run its checks):
 *
 * 1. **Pool semantics** against fake clients: keying, reuse, idle reclamation,
 *    burst dedupe, failure caching, dead-client eviction, the lazily opened
 *    SFTP channel, invalidate(), dispose() and the maxEntries LRU cap. Timers
 *    are injected where determinism matters, and `idleMs` is always tiny —
 *    never the 60 s production default.
 * 2. **Real integration** against an in-process `ssh2.Server` on 127.0.0.1:
 *    two `execSsh` calls through two pool leases must share one server
 *    connection, two `sftpList` calls over the pooled channel must open the
 *    subsystem once, and the pool must close the idle connection again.
 *
 * Run: node apps/desktop/src/main/ssh/ssh-pool.test.mjs
 */
import { EventEmitter } from 'node:events'
import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ssh2 from 'ssh2'

const { Server, utils } = ssh2
import {
    DEFAULT_SSH_POOL_IDLE_MS,
    DEFAULT_SSH_POOL_MAX_ENTRIES,
    createSshPool,
    sshPoolKey,
} from './ssh-pool.mjs'
import { connectSsh, endSsh, execSsh, openSftpSession, sftpList } from './ssh-client.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** Bounded poll: never sleeps longer than ~timeoutMs and never hangs the suite. */
const waitFor = async (condition, timeoutMs = 2_000, stepMs = 5) => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
        if (condition()) return true
        if (Date.now() >= deadline) return Boolean(condition())
        await wait(stepMs)
    }
}
/** Resolve a rejection to its Error, or null when the promise resolved. */
const rejection = async (promise) => {
    try {
        await promise
        return null
    } catch (error) {
        return error
    }
}
/** A promise whose settlement the test controls (for handshake races). */
const deferred = () => {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}
/** Let queued microtasks (and one macrotask) run: the pool's handshakes settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve))

/**
 * A fake ssh2 client: an EventEmitter whose `end()` closes it the way the real
 * one does (the pool watches `close`/`end`/`error`).
 */
const fakeClient = () => {
    const client = new EventEmitter()
    client.ended = 0
    client.end = () => {
        client.ended += 1
        client.emit('close')
    }
    return client
}
/** A fake SFTP channel: same idea, `end()` emits `close`. */
const fakeSftp = () => {
    const session = new EventEmitter()
    session.ended = 0
    session.end = () => {
        session.ended += 1
        session.emit('close')
    }
    return session
}

/** `connect()` that hands out one fake client and counts how often it ran. */
const makeConnect = (client = fakeClient()) => {
    let calls = 0
    const connect = async () => {
        calls += 1
        return { client }
    }
    return { client, connect, calls: () => calls }
}

/**
 * Deterministic timer harness: the idle countdown is recorded instead of
 * running, so timer scheduling/cancellation can be asserted exactly.
 */
const createTimerHarness = () => {
    const live = new Map()
    const cleared = []
    let nextId = 1
    return {
        setTimer(run, ms) {
            const handle = { id: nextId++, run, ms }
            live.set(handle.id, handle)
            return handle
        },
        clearTimer(handle) {
            if (handle && live.delete(handle.id)) cleared.push(handle.id)
        },
        count: () => live.size,
        cleared,
    }
}

/* ================================================================== *
 * Real ssh2 server for the integration half
 * ================================================================== */
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))

const startPoolServer = async () => {
    const files = new Map([['/hello.txt', Buffer.from('hello from the pool\n')]])
    const dirs = new Set(['/', '/logs'])
    const counts = { connections: 0, sftpAccepts: 0, closed: 0 }
    const server = new Server({ hostKeys: [hostKeyPem] }, (client) => {
        counts.connections += 1
        // An aborted handshake emits `error`; an unhandled one would kill the run.
        client.on('error', () => undefined)
        client.on('close', () => {
            counts.closed += 1
        })
        client.on('authentication', (ctx) => ctx.accept())
        client.on('ready', () => {
            client.on('session', (accept) => {
                const session = accept()
                session.on('exec', (acceptExec, _reject, info) => {
                    const stream = acceptExec()
                    stream.write(`ran: ${info.command}\n`)
                    stream.exit(0)
                    stream.end()
                })
                session.on('sftp', (acceptSftp) => {
                    counts.sftpAccepts += 1
                    const sftp = acceptSftp()
                    const open = new Map()
                    const attrs = (path, size = 0) => ({
                        mode: dirs.has(path) ? 0o040755 : 0o100644,
                        size,
                        uid: 501,
                        gid: 20,
                        atime: 1_700_000_000,
                        mtime: 1_700_000_000,
                    })
                    sftp.on('OPENDIR', (reqid, path) => {
                        const handle = Buffer.from(`d${open.size}`)
                        open.set(handle.toString(), { path, offset: 0 })
                        sftp.handle(reqid, handle)
                    })
                    sftp.on('READDIR', (reqid, handle) => {
                        const state = open.get(handle.toString())
                        if (!state) {
                            sftp.status(reqid, 2)
                            return
                        }
                        const prefix = state.path === '/' ? '/' : `${state.path}/`
                        const all = [...files.keys(), ...dirs]
                            .filter((path) => path !== '/' && path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
                            .map((path) => ({
                                filename: path.split('/').pop(),
                                longname: path,
                                attrs: attrs(path, files.get(path)?.length ?? 0),
                            }))
                        const page = all.slice(state.offset, state.offset + 100)
                        state.offset += page.length
                        // SSH_FX_EOF (1) ends a listing; an empty NAME makes ssh2 loop.
                        if (page.length === 0) sftp.status(reqid, 1)
                        else sftp.name(reqid, page)
                    })
                    sftp.on('CLOSE', (reqid, handle) => {
                        open.delete(handle.toString())
                        sftp.status(reqid, 0)
                    })
                })
            })
        })
    })
    const port = await listen(server)
    const close = () =>
        new Promise((resolve) => {
            const timer = setTimeout(resolve, 1_000)
            server.close(() => {
                clearTimeout(timer)
                resolve()
            })
        })
    return { port, counts, close }
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const hostKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
const keyB64 = utils.parseKey(hostKeyPem).getPublicSSH().toString('base64')

const main = async () => {
    /* ================================================================== *
     * 1. Keying
     * ================================================================== */
    check(
        'key: shape is user@host:port|policy',
        sshPoolKey({ host: 'h', user: 'u', port: 2222 }, 'accept-new') === 'u@h:2222|accept-new',
        sshPoolKey({ host: 'h', user: 'u', port: 2222 }, 'accept-new'),
    )
    check('key: default port 22 is normalized', sshPoolKey({ host: 'h' }) === sshPoolKey({ host: 'h', port: 22 }), sshPoolKey({ host: 'h' }))
    check('key: user null and undefined are the same identity', sshPoolKey({ host: 'h', user: null }) === sshPoolKey({ host: 'h', user: undefined }))
    check('key: the host-key policy participates in the key', sshPoolKey({ host: 'h' }) !== sshPoolKey({ host: 'h' }, 'accept-new'))
    check(
        'key: host, user and port all participate in the key',
        sshPoolKey({ host: 'a' }) !== sshPoolKey({ host: 'b' }) &&
            sshPoolKey({ host: 'h', user: 'u' }) !== sshPoolKey({ host: 'h', user: 'v' }) &&
            sshPoolKey({ host: 'h', port: 22 }) !== sshPoolKey({ host: 'h', port: 2222 }),
    )
    check(
        'key: documented defaults are 60 s idle / 8 entries',
        DEFAULT_SSH_POOL_IDLE_MS === 60_000 && DEFAULT_SSH_POOL_MAX_ENTRIES === 8,
        `${DEFAULT_SSH_POOL_IDLE_MS}/${DEFAULT_SSH_POOL_MAX_ENTRIES}`,
    )

    {
        const pool = createSshPool({ idleMs: 1_000 })
        const strict = makeConnect()
        const acceptNew = makeConnect()
        const target = { host: 'policy.example' }
        const strictLease = await pool.acquire({ target, hostKeyPolicy: 'strict', connect: strict.connect })
        strictLease.release()
        const acceptLease = await pool.acquire({ target, hostKeyPolicy: 'accept-new', connect: acceptNew.connect })
        acceptLease.release()
        const defaultPortLease = await pool.acquire({ target: { host: 'policy.example', port: 22 }, hostKeyPolicy: 'strict', connect: strict.connect })
        check(
            'key: different policies never share a client; the default port shares one',
            strictLease.client !== acceptLease.client &&
                defaultPortLease.client === strictLease.client &&
                strict.calls() === 1 &&
                acceptNew.calls() === 1 &&
                pool.size() === 2,
            `strict=${strict.calls()} accept=${acceptNew.calls()} size=${pool.size()}`,
        )
        const otherHost = makeConnect()
        const otherHostLease = await pool.acquire({ target: { host: 'policy-other.example' }, hostKeyPolicy: 'strict', connect: otherHost.connect })
        check(
            'key: a different target never shares a client',
            otherHostLease.client !== strictLease.client && otherHost.calls() === 1 && strict.calls() === 1 && pool.size() === 3,
            `connects=${otherHost.calls()} size=${pool.size()}`,
        )
        otherHostLease.release()
        defaultPortLease.release()
        pool.dispose()
    }

    /* ================================================================== *
     * 2. Reuse and idle-timer cancellation
     * ================================================================== */
    {
        const timers = createTimerHarness()
        const pool = createSshPool({ idleMs: 1_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
        const state = makeConnect()
        const target = { host: 'reuse.example', user: 'deploy' }
        const first = await pool.acquire({ target, connect: state.connect })
        first.release()
        check('reuse: the first acquire connects once', state.calls() === 1 && pool.size() === 1, `connects=${state.calls()}`)
        check('reuse: release starts exactly one idle timer', timers.count() === 1, `timers=${timers.count()}`)
        const second = await pool.acquire({ target: { host: 'reuse.example', user: 'deploy', port: 22 }, connect: state.connect })
        check('reuse: a re-acquire before the deadline reuses the client', second.client === state.client && state.calls() === 1, `connects=${state.calls()}`)
        check('reuse: a re-acquire cancels the idle timer', timers.count() === 0 && timers.cleared.length === 1, `timers=${timers.count()} cleared=${timers.cleared.length}`)
        second.release()
        check('reuse: releasing again restarts the countdown', timers.count() === 1, `timers=${timers.count()}`)
        pool.dispose()
        check('reuse: dispose clears pooled idle timers', timers.count() === 0, `timers=${timers.count()}`)
    }

    {
        const idleMs = 80
        const pool = createSshPool({ idleMs })
        const state = makeConnect()
        const target = { host: 'reuse-real.example' }
        const first = await pool.acquire({ target, connect: state.connect })
        first.release()
        await wait(20)
        const second = await pool.acquire({ target, connect: state.connect })
        await wait(idleMs + 60)
        check(
            'reuse: a re-acquire before the deadline survives past it (real timer)',
            second.client === state.client && state.client.ended === 0 && pool.size() === 1 && state.calls() === 1,
            `ended=${state.client.ended} size=${pool.size()} connects=${state.calls()}`,
        )
        second.release()
        check(
            'reuse: it is reaped after that re-acquire is released',
            await waitFor(() => state.client.ended === 1 && pool.size() === 0, 2_000),
            `ended=${state.client.ended} size=${pool.size()}`,
        )
        pool.dispose()
    }

    /* ================================================================== *
     * 3. Idle reclamation
     * ================================================================== */
    {
        const idleMs = 50
        const pool = createSshPool({ idleMs })
        const target = { host: 'idle.example' }
        const first = makeConnect()
        const lease = await pool.acquire({ target, connect: first.connect })
        lease.release()
        check(
            'idle: release + wait ends the client and drops the entry',
            await waitFor(() => first.client.ended === 1 && pool.size() === 0, 2_000),
            `ended=${first.client.ended} size=${pool.size()}`,
        )
        const second = makeConnect()
        const again = await pool.acquire({ target, connect: second.connect })
        check('idle: the next acquire reconnects', second.calls() === 1 && again.client === second.client && pool.size() === 1, `connects=${second.calls()} size=${pool.size()}`)
        again.release()
        await waitFor(() => pool.size() === 0, 2_000)

        const held = makeConnect()
        const heldLease = await pool.acquire({ target: { host: 'held.example' }, connect: held.connect })
        await wait(idleMs * 2 + 40)
        check(
            'idle: an outstanding lease is never closed underneath it',
            held.client.ended === 0 && pool.size() === 1 && heldLease.closed === false,
            `ended=${held.client.ended} size=${pool.size()}`,
        )
        heldLease.release()
        check(
            'idle: it is reaped once the lease releases',
            await waitFor(() => held.client.ended === 1 && pool.size() === 0, 2_000),
            `ended=${held.client.ended} size=${pool.size()}`,
        )
        pool.dispose()
    }

    /* ================================================================== *
     * 4. Burst dedupe
     * ================================================================== */
    {
        const pool = createSshPool({ idleMs: 1_000 })
        const client = fakeClient()
        const resolvers = []
        let calls = 0
        const connect = () => {
            calls += 1
            return new Promise((resolve) => resolvers.push(resolve))
        }
        const target = { host: 'burst.example', user: 'ci' }
        const waiting = [pool.acquire({ target, connect }), pool.acquire({ target, connect }), pool.acquire({ target, connect })]
        check('burst: concurrent acquires share one in-flight handshake', calls === 1, `connects=${calls}`)
        // Resolve every captured connect() (a bug would leave more than one) so a
        // failed assertion can never turn into a hung suite.
        for (const resolve of resolvers) resolve({ client })
        const leases = await Promise.all(waiting)
        check(
            'burst: every waiter gets a lease on the same client',
            leases.length === 3 && leases.every((lease) => lease.client === client) && pool.size() === 1,
            `connects=${calls} size=${pool.size()}`,
        )
        for (const lease of leases) lease.release()
        check('burst: the three leases are balanced (one idle entry remains)', pool.size() === 1)
        pool.dispose()
    }

    /* Waiter reservations: a burst far above maxEntries must not let the LRU cap
     * evict a connection that is about to be leased by a not-yet-counted waiter.
     * Every handshake is resolved in ONE synchronous loop, so all landings are
     * queued before any acquire continuation can count its lease — the exact
     * shape where a pre-reservation implementation evicts entries and rejects. */
    {
        const maxEntries = 2
        const total = 10
        const pool = createSshPool({ idleMs: 1_000, maxEntries })
        const resolvers = []
        const clients = []
        let calls = 0
        const connect = () => {
            calls += 1
            const client = fakeClient()
            clients.push(client)
            return new Promise((resolve) => resolvers.push(() => resolve({ client })))
        }
        const waiting = Array.from({ length: total }, (_, index) => pool.acquire({ target: { host: `burst-over-cap-${index}.example` }, connect }))
        // Resolve ALL handshakes in one synchronous loop: no per-tick settling.
        for (const resolve of resolvers) resolve()
        const leases = await Promise.all(waiting)
        check(
            'burst: a >maxEntries concurrent first-connect burst resolves every acquire',
            leases.length === total && calls === total && resolvers.length === total,
            `leases=${leases.length} connects=${calls} resolvers=${resolvers.length}`,
        )
        check(
            'burst: every lease gets a distinct client (no entry evicted under a waiter)',
            new Set(leases.map((lease) => lease.client)).size === total && pool.size() === total,
            `distinct=${new Set(leases.map((lease) => lease.client)).size} size=${pool.size()}`,
        )
        for (const lease of leases) lease.release()
        pool.dispose()
        check('burst: the over-cap pool still disposes cleanly', pool.size() === 0 && clients.every((client) => client.ended === 1), `size=${pool.size()}`)
    }

    /* ================================================================== *
     * 5. Failure is not cached
     * ================================================================== */
    {
        const pool = createSshPool({ idleMs: 1_000 })
        const target = { host: 'failure.example' }
        let attempts = 0
        const connect = async () => {
            attempts += 1
            await wait(1)
            throw new Error('desktop ssh: authentication failed for failure.example')
        }
        const [firstError, secondError] = await Promise.all([rejection(pool.acquire({ target, connect })), rejection(pool.acquire({ target, connect }))])
        check(
            'failure: every waiter rejects with the connect error',
            /authentication failed/.test(firstError?.message ?? '') && /authentication failed/.test(secondError?.message ?? ''),
            `${firstError?.message} | ${secondError?.message}`,
        )
        check(
            'failure: one failed handshake for the burst and nothing cached',
            attempts === 1 && pool.size() === 0,
            `attempts=${attempts} size=${pool.size()}`,
        )
        const retry = makeConnect()
        const lease = await pool.acquire({ target, connect: retry.connect })
        check('failure: a later acquire retries and succeeds', retry.calls() === 1 && lease.client === retry.client && pool.size() === 1, `connects=${retry.calls()} size=${pool.size()}`)
        lease.release()
        pool.dispose()
    }

    /* ================================================================== *
     * 6. Dead client eviction
     * ================================================================== */
    {
        const timers = createTimerHarness()
        const pool = createSshPool({ idleMs: 1_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
        const target = { host: 'dead.example' }
        const first = makeConnect()
        const lease = await pool.acquire({ target, connect: first.connect })
        lease.release()
        first.client.emit('close')
        check(
            "dead: a 'close' from the server drops the entry and its idle timer",
            pool.size() === 0 && timers.count() === 0 && lease.closed === true,
            `size=${pool.size()} timers=${timers.count()}`,
        )
        const second = makeConnect()
        const lease2 = await pool.acquire({ target, connect: second.connect })
        check('dead: the next acquire reconnects', second.calls() === 1 && second.client !== first.client && pool.size() === 1, `connects=${second.calls()}`)
        lease2.release()
        second.client.emit('error', new Error('socket hang up'))
        check(
            "dead: an 'error' drops the entry and ends the client",
            pool.size() === 0 && timers.count() === 0 && second.client.ended === 1,
            `size=${pool.size()} ended=${second.client.ended}`,
        )
        pool.dispose()
    }

    /* ================================================================== *
     * 7. The lazily opened SFTP channel
     * ================================================================== */
    {
        const sessions = []
        let opens = 0
        const pool = createSshPool({
            idleMs: 1_000,
            openSftp: async () => {
                opens += 1
                const session = fakeSftp()
                sessions.push(session)
                return session
            },
        })
        const target = { host: 'sftp.example' }
        const state = makeConnect()
        const lease = await pool.acquire({ target, connect: state.connect })
        const firstSession = await lease.sftp()
        const sameSession = await lease.sftp()
        check('sftp: repeated calls open the channel once', opens === 1 && firstSession === sameSession && sessions.length === 1, `opens=${opens}`)
        firstSession.emit('close')
        const reOpened = await lease.sftp()
        check('sftp: a channel close makes the next call reopen', opens === 2 && reOpened !== firstSession && reOpened === sessions[1], `opens=${opens}`)
        lease.release()
        pool.dispose()
    }

    /* A generic open refusal (the server answered: no SFTP subsystem) rejects
     * the call but keeps the client pooled: exec must keep working on it. */
    {
        let opens = 0
        const sessions = []
        const pool = createSshPool({
            idleMs: 1_000,
            openSftp: async () => {
                opens += 1
                if (opens === 1) throw new Error('desktop ssh: cannot open sftp: subsystem unavailable')
                const session = fakeSftp()
                sessions.push(session)
                return session
            },
        })
        const target = { host: 'sftp-refused.example' }
        const state = makeConnect()
        const lease = await pool.acquire({ target, connect: state.connect })
        const error = await rejection(lease.sftp())
        check(
            'sftp: a generic open refusal rejects but keeps the client pooled',
            opens === 1 &&
                /subsystem unavailable/.test(error?.message ?? '') &&
                error?.code === undefined &&
                pool.size() === 1 &&
                state.client.ended === 0 &&
                lease.closed === false,
            `opens=${opens} size=${pool.size()} ended=${state.client.ended} code=${error?.code}`,
        )
        const retried = await lease.sftp()
        check(
            'sftp: the next sftp() retries the opener and succeeds on the same client',
            opens === 2 && retried === sessions[0] && pool.size() === 1 && state.client.ended === 0 && lease.closed === false,
            `opens=${opens} size=${pool.size()} retried=${retried === sessions[0]}`,
        )
        lease.release()
        pool.dispose()
    }

    /* A *tagged timeout* means the connection is suspect: drop it so the next
     * acquire reconnects instead of hanging on a half-open client. */
    {
        let opens = 0
        const pool = createSshPool({
            idleMs: 1_000,
            openSftp: async () => {
                opens += 1
                const error = new Error('desktop ssh: opening the sftp channel timed out')
                error.code = 'SSH_SFTP_TIMEOUT'
                throw error
            },
        })
        const target = { host: 'sftp-timeout.example' }
        const state = makeConnect()
        const lease = await pool.acquire({ target, connect: state.connect })
        const error = await rejection(lease.sftp())
        check(
            'sftp: a tagged open timeout drops the pooled connection',
            opens === 1 && error?.code === 'SSH_SFTP_TIMEOUT' && pool.size() === 0 && state.client.ended === 1 && lease.closed === true,
            `opens=${opens} size=${pool.size()} ended=${state.client.ended} code=${error?.code}`,
        )
        const retry = makeConnect()
        const retryLease = await pool.acquire({ target, connect: retry.connect })
        check(
            'sftp: the next acquire reconnects after an open timeout',
            retry.calls() === 1 && retryLease.client === retry.client && pool.size() === 1,
            `connects=${retry.calls()} size=${pool.size()}`,
        )
        retryLease.release()
        pool.dispose()
    }

    {
        const pool = createSshPool({ idleMs: 1_000 })
        const state = makeConnect()
        const lease = await pool.acquire({ target: { host: 'sftp-none.example' }, connect: state.connect })
        const error = await rejection(lease.sftp())
        check('sftp: no opener configured means sftp() rejects', /no SFTP opener/.test(error?.message ?? ''), error?.message)
        lease.release()
        pool.dispose()
    }

    /* ================================================================== *
     * 8. invalidate()
     * ================================================================== */
    {
        const timers = createTimerHarness()
        const pool = createSshPool({ idleMs: 1_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
        const target = { host: 'inv.example', user: 'deploy', port: 2222 }
        const strict = makeConnect()
        const acceptNew = makeConnect()
        const other = makeConnect()
        const strictLease = await pool.acquire({ target, hostKeyPolicy: 'strict', connect: strict.connect })
        strictLease.release()
        const acceptLease = await pool.acquire({ target: { host: 'inv.example', user: 'deploy', port: 2222 }, hostKeyPolicy: 'accept-new', connect: acceptNew.connect })
        acceptLease.release()
        const otherLease = await pool.acquire({ target: { host: 'other.example', user: 'deploy', port: 2222 }, connect: other.connect })
        otherLease.release()
        check('invalidate: three idle entries with three timers', pool.size() === 3 && timers.count() === 3, `size=${pool.size()} timers=${timers.count()}`)
        const removed = pool.invalidate(target)
        check(
            'invalidate: drops every policy for a target and clears their timers',
            removed === 2 && pool.size() === 1 && strict.client.ended === 1 && acceptNew.client.ended === 1 && timers.count() === 1 && timers.cleared.length === 2,
            `removed=${removed} size=${pool.size()} timers=${timers.count()}`,
        )
        const noMatch = pool.invalidate({ host: 'nope.example' })
        check('invalidate: a non-matching target is a no-op', noMatch === 0 && pool.size() === 1, `removed=${noMatch}`)
        const retry = makeConnect()
        const retryLease = await pool.acquire({ target, connect: retry.connect })
        check('invalidate: the next acquire reconnects', retry.calls() === 1 && retryLease.client === retry.client && strict.calls() === 1, `connects=${retry.calls()}`)
        retryLease.release()
        pool.dispose()
    }

    {
        const timers = createTimerHarness()
        const pool = createSshPool({ idleMs: 1_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
        const target = { host: 'inv-filter.example', user: 'deploy', port: 22 }
        const strict = makeConnect()
        const acceptNew = makeConnect()
        const strictLease = await pool.acquire({ target, hostKeyPolicy: 'strict', connect: strict.connect })
        strictLease.release()
        const acceptLease = await pool.acquire({ target, hostKeyPolicy: 'accept-new', connect: acceptNew.connect })
        acceptLease.release()
        const removed = pool.invalidate(target, { hostKeyPolicy: 'strict' })
        check(
            'invalidate: the policy filter drops only that policy',
            removed === 1 && pool.size() === 1 && acceptNew.client.ended === 0 && pool.keys()[0].endsWith('|accept-new'),
            `removed=${removed} keys=${pool.keys().join(',')}`,
        )
        pool.dispose()
    }

    /* Releasing a lease whose entry invalidate() already closed must not revive
     * it or start a countdown for a dead client. */
    {
        const timers = createTimerHarness()
        const pool = createSshPool({ idleMs: 1_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
        const target = { host: 'release-invalidated.example' }
        const state = makeConnect()
        const lease = await pool.acquire({ target, connect: state.connect })
        const removed = pool.invalidate(target)
        check(
            'release-after-invalidate: invalidate closes the leased entry',
            removed === 1 && lease.closed === true && pool.size() === 0 && state.client.ended === 1,
            `removed=${removed} size=${pool.size()} ended=${state.client.ended}`,
        )
        lease.release()
        check(
            'release-after-invalidate: release schedules no timer and revives nothing',
            timers.count() === 0 && pool.size() === 0 && timers.cleared.length === 0,
            `timers=${timers.count()} size=${pool.size()} cleared=${timers.cleared.length}`,
        )
        pool.dispose()
    }

    /* invalidate() while a handshake is in flight: the epoch bump must stop the
     * pre-invalidation client from ever being pooled or leased, and callers that
     * arrive after the invalidation must get the fresh connection. */
    {
        const pool = createSshPool({ idleMs: 1_000 })
        const target = { host: 'inflight-invalidate.example', user: 'deploy' }
        const staleClient = fakeClient()
        const staleGate = deferred()
        let staleCalls = 0
        const connectA = () => {
            staleCalls += 1
            // A retry after SSH_POOL_STALE would call this again; that client is
            // a fresh one, never the stale client resolved below.
            return staleCalls === 1 ? staleGate.promise : Promise.resolve({ client: fakeClient() })
        }
        const freshClient = fakeClient()
        const freshGate = deferred()
        let freshCalls = 0
        const connectB = () => {
            freshCalls += 1
            return freshGate.promise
        }
        const acquireA = pool.acquire({ target, connect: connectA })
        await flush()
        const removed = pool.invalidate(target)
        check('invalidate-in-flight: the in-flight handshake key is reported', removed === 1, `removed=${removed}`)
        const acquireB = pool.acquire({ target, connect: connectB })
        await flush()
        // A's original handshake now lands, but its epoch was bumped: it must be
        // closed instead of pooled and A must retry on the post-invalidation path.
        staleGate.resolve({ client: staleClient })
        await flush()
        check(
            'invalidate-in-flight: the stale client is ended and never pooled',
            staleClient.ended > 0 && pool.size() === 0,
            `ended=${staleClient.ended} size=${pool.size()}`,
        )
        freshGate.resolve({ client: freshClient })
        const [leaseA, leaseB] = await Promise.all([acquireA, acquireB])
        check(
            'invalidate-in-flight: both callers land on the fresh post-invalidation client',
            leaseA.client === freshClient &&
                leaseB.client === freshClient &&
                leaseA.client !== staleClient &&
                pool.size() === 1 &&
                pool.keys()[0] === leaseA.key,
            `A-fresh=${leaseA.client === freshClient} B-fresh=${leaseB.client === freshClient} size=${pool.size()}`,
        )
        check(
            'invalidate-in-flight: nothing stale survives in the pool',
            pool.keys().length === 1 && pool.keys()[0] === leaseB.key && staleClient.ended > 0,
            `keys=${pool.keys().join(',')} ended=${staleClient.ended}`,
        )
        check(
            'invalidate-in-flight: connect counts account for the stale-retry path',
            staleCalls === 1 && freshCalls === 1,
            `stale=${staleCalls} fresh=${freshCalls}`,
        )
        leaseA.release()
        leaseB.release()
        pool.dispose()
    }

    /* B1′ variant: the post-invalidation attempt FAILS. An older pre-invalidation
     * handshake that lands afterwards must still be rejected — generations are
     * monotonic, so losing the newer pending entry must not reset them. */
    {
        const pool = createSshPool({ idleMs: 1_000 })
        const target = { host: 'inflight-rotation.example', user: 'deploy' }
        const staleClient = fakeClient()
        const staleGate = deferred()
        let staleCalls = 0
        const connectA = () => {
            staleCalls += 1
            if (staleCalls === 1) return staleGate.promise
            // The stale retry re-resolves credentials, and a failing rotation
            // means that attempt must fail too.
            throw new Error('desktop ssh: authentication failed: the rotated credential was rejected')
        }
        const acquireA = pool.acquire({ target, connect: connectA })
        await flush()
        const removed = pool.invalidate(target)
        // The post-invalidation attempt fails; it settles and drops the newer
        // pending entry while the older pre-invalidation handshake is still open.
        let rotateCalls = 0
        const rotateError = await rejection(
            pool.acquire({
                target,
                connect: async () => {
                    rotateCalls += 1
                    throw new Error('desktop ssh: authentication failed for the rotated credential')
                },
            }),
        )
        check(
            'invalidate-while-rotating: invalidate reports the in-flight key and the rotation attempt fails',
            removed === 1 && rotateCalls === 1 && /authentication failed/.test(rotateError?.message ?? ''),
            `removed=${removed} rotateCalls=${rotateCalls} err=${rotateError?.message}`,
        )
        // The older handshake now lands: the monotonic generation must end it,
        // and A's single stale-retry must run connectA again (and fail).
        staleGate.resolve({ client: staleClient })
        const acquireAError = await rejection(acquireA)
        check(
            'invalidate-while-rotating: the stale client is ended and A retries then rejects',
            staleClient.ended > 0 && staleCalls === 2 && /rotated credential/.test(acquireAError?.message ?? ''),
            `staleEnded=${staleClient.ended} staleCalls=${staleCalls} err=${acquireAError?.message}`,
        )
        check(
            'invalidate-while-rotating: the stale client was never pooled or leased',
            pool.size() === 0 && pool.keys().length === 0,
            `size=${pool.size()} keys=${pool.keys().join(',')}`,
        )
    }

    /* B1′ variant: the post-invalidation caller succeeds and that pooled client
     * then CLOSES. The older pre-invalidation handshake landing afterwards must
     * still be rejected rather than pooled. */
    {
        const pool = createSshPool({ idleMs: 1_000 })
        const target = { host: 'inflight-close.example', user: 'deploy' }
        const staleClient = fakeClient()
        const staleGate = deferred()
        const freshTwo = fakeClient()
        let staleCalls = 0
        const connectA = () => {
            staleCalls += 1
            // A's stale retry re-resolves credentials and gets a new client.
            return staleCalls === 1 ? staleGate.promise : Promise.resolve({ client: freshTwo })
        }
        const acquireA = pool.acquire({ target, connect: connectA })
        await flush()
        const removed = pool.invalidate(target)
        check('invalidate-while-closing: the in-flight handshake key is reported', removed === 1, `removed=${removed}`)

        const freshClient = fakeClient()
        const leaseB = await pool.acquire({ target, connect: async () => ({ client: freshClient }) })
        check(
            'invalidate-while-closing: the post-invalidation caller lands on a fresh pooled client',
            leaseB.client === freshClient && pool.size() === 1 && freshClient.ended === 0,
            `size=${pool.size()}`,
        )
        leaseB.release()
        // The pooled fresh connection dies underneath the pool (server/network drop).
        freshClient.emit('close')
        check(
            'invalidate-while-closing: that fresh client closing drops its entry',
            pool.size() === 0 && leaseB.closed === true,
            `size=${pool.size()} leaseClosed=${leaseB.closed}`,
        )
        // The older handshake now lands: it must be ended, never leased/pooled,
        // and A must retry onto a brand-new client.
        staleGate.resolve({ client: staleClient })
        const leaseA = await acquireA
        check(
            'invalidate-while-closing: the stale client is ended and A retries onto a brand-new client',
            staleClient.ended > 0 &&
                staleCalls === 2 &&
                leaseA.client === freshTwo &&
                leaseA.client !== staleClient &&
                leaseA.client !== freshClient &&
                pool.size() === 1,
            `staleEnded=${staleClient.ended} staleCalls=${staleCalls} size=${pool.size()} A-fresh2=${leaseA.client === freshTwo}`,
        )
        leaseA.release()
        pool.dispose()
    }

    /* ================================================================== *
     * 9. dispose()
     * ================================================================== */
    {
        const pool = createSshPool({ idleMs: 1_000 })
        const first = makeConnect()
        const second = makeConnect()
        const firstLease = await pool.acquire({ target: { host: 'dispose-a.example' }, connect: first.connect })
        firstLease.release()
        const secondLease = await pool.acquire({ target: { host: 'dispose-b.example' }, connect: second.connect })
        pool.dispose()
        check(
            'dispose: ends every pooled client, idle or leased',
            first.client.ended === 1 && second.client.ended === 1 && pool.size() === 0 && secondLease.closed === true,
            `ended=${first.client.ended}/${second.client.ended} size=${pool.size()}`,
        )
        secondLease.release()
        const error = await rejection(
            pool.acquire({
                target: { host: 'dispose-a.example' },
                connect: () => {
                    throw new Error('must not connect after dispose')
                },
            }),
        )
        check('dispose: a later acquire rejects', /disposed/.test(error?.message ?? ''), error?.message)
    }

    /* dispose() while a handshake is still in flight: the promise the pool was
     * awaiting lands afterwards, and its client must be ended, never pooled. */
    {
        const pool = createSshPool({ idleMs: 1_000 })
        const client = fakeClient()
        const gate = deferred()
        const target = { host: 'dispose-inflight.example' }
        const waiting = rejection(pool.acquire({ target, connect: () => gate.promise }))
        await flush()
        pool.dispose()
        gate.resolve({ client })
        const error = await waiting
        check(
            'dispose-during-handshake: the late acquire rejects and its client is ended',
            /disposed|invalidated/.test(error?.message ?? '') && client.ended === 1 && pool.size() === 0,
            `${error?.message} ended=${client.ended} size=${pool.size()}`,
        )
    }

    /* ================================================================== *
     * 10. maxEntries LRU
     * ================================================================== */
    {
        let clock = 10_000
        const timers = createTimerHarness()
        const pool = createSshPool({ idleMs: 1_000, maxEntries: 2, now: () => clock, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
        const first = makeConnect()
        const second = makeConnect()
        const third = makeConnect()
        const targetA = { host: 'lru-a.example' }
        const targetB = { host: 'lru-b.example' }
        const targetC = { host: 'lru-c.example' }
        const aLease = await pool.acquire({ target: targetA, connect: first.connect })
        aLease.release()
        clock += 10
        const bLease = await pool.acquire({ target: targetB, connect: second.connect })
        bLease.release()
        clock += 10
        const cLease = await pool.acquire({ target: targetC, connect: third.connect })
        check(
            'lru: a new entry evicts the least-recently-used idle one',
            pool.size() === 2 &&
                first.client.ended === 1 &&
                second.client.ended === 0 &&
                third.client.ended === 0 &&
                !pool.keys().includes(sshPoolKey(targetA)),
            `size=${pool.size()} keys=${pool.keys().join(',')}`,
        )
        cLease.release()
        pool.dispose()
    }

    {
        let clock = 20_000
        const timers = createTimerHarness()
        const pool = createSshPool({ idleMs: 1_000, maxEntries: 1, now: () => clock, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
        const held = makeConnect()
        const second = makeConnect()
        const third = makeConnect()
        const heldLease = await pool.acquire({ target: { host: 'lru-hold.example' }, connect: held.connect })
        clock += 10
        const secondLease = await pool.acquire({ target: { host: 'lru-idle.example' }, connect: second.connect })
        clock += 10
        secondLease.release()
        clock += 10
        const thirdLease = await pool.acquire({ target: { host: 'lru-new.example' }, connect: third.connect })
        check(
            'lru: a leased entry is never evicted; the idle one is',
            heldLease.closed === false &&
                held.client.ended === 0 &&
                second.client.ended === 1 &&
                third.client.ended === 0 &&
                pool.size() === 2,
            `size=${pool.size()} ended=${held.client.ended}/${second.client.ended}/${third.client.ended}`,
        )
        thirdLease.release()
        heldLease.release()
        pool.dispose()
    }

    /* ================================================================== *
     * 11. Real integration — one server connection, one SFTP subsystem
     * ================================================================== */
    {
        const integration = await startPoolServer()
        const homeDir = mkdtempSync(join(tmpdir(), 'kn-ssh-pool-home-'))
        mkdirSync(join(homeDir, '.ssh'), { recursive: true })
        writeFileSync(join(homeDir, '.ssh', 'known_hosts'), `[127.0.0.1]:${integration.port} ssh-rsa ${keyB64}\n`)
        const idleMs = 200
        const pool = createSshPool({ openSftp: openSftpSession, end: endSsh, idleMs })
        try {
            const target = { host: '127.0.0.1', user: 'tester', port: integration.port }
            const connect = () =>
                connectSsh({
                    target,
                    hostKeyPolicy: 'strict',
                    homeDir,
                    knownStorePath: join(homeDir, 'tofu.json'),
                    timeoutMs: 10_000,
                })
            const execOptions = { timeoutMs: 5_000, maxOutputBytes: 4_096 }
            const firstLease = await pool.acquire({ target, hostKeyPolicy: 'strict', connect })
            const firstExec = await execSsh(firstLease.client, { ...execOptions, command: 'echo one' })
            firstLease.release()
            const secondLease = await pool.acquire({ target, hostKeyPolicy: 'strict', connect })
            const secondExec = await execSsh(secondLease.client, { ...execOptions, command: 'echo two' })
            secondLease.release()
            check(
                'integration: two exec calls through two leases use exactly one server connection',
                firstExec.ok &&
                    secondExec.ok &&
                    firstExec.stdout.includes('ran: echo one') &&
                    secondExec.stdout.includes('ran: echo two') &&
                    integration.counts.connections === 1,
                `exec=${firstExec.ok}/${secondExec.ok} connections=${integration.counts.connections}`,
            )
            check(
                'integration: the second lease reuses the first client and key',
                firstLease.client === secondLease.client && firstLease.key === secondLease.key,
                `${firstLease.key} :: ${secondLease.key}`,
            )

            const sftpLease = await pool.acquire({ target, hostKeyPolicy: 'strict', connect })
            const channel = await sftpLease.sftp()
            const listingOne = await sftpList(sftpLease.client, { path: '/' }, { session: channel })
            const listingTwo = await sftpList(sftpLease.client, { path: '/' }, { session: channel })
            sftpLease.release()
            check(
                'integration: two sftpList calls over the pooled channel open the subsystem once',
                integration.counts.sftpAccepts === 1 &&
                    listingOne.entries.some((entry) => entry.name === 'hello.txt' && entry.path === '/hello.txt' && entry.file === true) &&
                    listingTwo.entries.length === listingOne.entries.length &&
                    integration.counts.connections === 1,
                `accepts=${integration.counts.sftpAccepts} connections=${integration.counts.connections} entries=${listingOne.entries.map((entry) => entry.name).join(',')}`,
            )
            const serverSawClose = await waitFor(() => integration.counts.closed >= 1 && pool.size() === 0, 3_000)
            check(
                'integration: the idle connection is closed (the server observes it)',
                serverSawClose,
                `closed=${integration.counts.closed} size=${pool.size()}`,
            )
        } finally {
            pool.dispose()
            await integration.close()
        }
    }
}

const failedChecks = () => results.filter((entry) => !entry.ok)

main().then(
    () => {
        const failed = failedChecks()
        console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
        process.exit(failed.length ? 1 : 0)
    },
    (error) => {
        console.error('FAIL ssh pool test crashed —', error)
        process.exit(1)
    },
)
