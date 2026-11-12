/**
 * SSH tunnel engine test (plain Node — no Electron, no external sshd).
 *
 * The engine itself is protocol-agnostic, so this file injects:
 *
 * - **a real `connectSsh`** against a real in-process `ssh2.Server` whose
 *   `direct-tcpip` handler dials a real local echo server — `forwardOut` is
 *   exercised end to end, not faked;
 * - **a fake SOCKS5 negotiator** for the engine-only lifecycle checks (the real
 *   one has its own suite), plus one **end-to-end composition check** that wires
 *   the real `negotiateSocks5` through the engine exactly like `index.ts` does;
 * - a **silent SSH server** that never answers a channel open, to prove the
 *   forward deadline fails a connection instead of hanging it.
 *
 * Every wait is bounded (`withTimeout` / `waitFor` / helper timers), so a
 * regression fails with a row instead of stalling the suite.
 *
 * Run: node apps/desktop/src/main/ssh/ssh-tunnel.test.mjs
 */
import { generateKeyPairSync } from 'node:crypto'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ssh2 from 'ssh2'

const { Server } = ssh2
import { connectSsh, endSsh } from './ssh-client.mjs'
import { negotiateSocks5 } from './ssh-socks5.mjs'
import {
    MAX_SSH_TUNNELS,
    MAX_TUNNEL_CHANNELS,
    MAX_TUNNEL_LABEL_CHARS,
    normalizeTunnelId,
    normalizeTunnelKind,
    normalizeTunnelLabel,
    normalizeTunnelLocalPort,
    normalizeTunnelRemoteTarget,
} from './ssh-params.mjs'
import {
    DEFAULT_TUNNEL_FORWARD_TIMEOUT_MS,
    TUNNEL_BIND_HOST,
    createTunnelManager,
} from './ssh-tunnel.mjs'

/* ================================================================== *
 * Harness
 * ================================================================== */
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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Bounded await: a regression rejects instead of hanging the whole suite. */
const withTimeout = (promise, label, timeoutMs = 8_000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms: ${label}`)), timeoutMs)
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer)
                resolve(value)
            },
            (error) => {
                clearTimeout(timer)
                reject(error)
            },
        )
    })

const waitFor = async (predicate, { timeoutMs = 5_000, interval = 20, label = 'condition' } = {}) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (predicate()) return true
        await wait(interval)
    }
    if (predicate()) return true
    throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`)
}

const endStreamQuietly = (stream) => {
    try {
        stream?.end?.()
    } catch {
        /* already closed */
    }
}
const destroyStreamQuietly = (stream) => {
    try {
        stream?.destroy?.()
    } catch {
        /* already closed */
    }
}

/** Listen on an ephemeral loopback port (the only bind address these tests use). */
const listen = (server) =>
    new Promise((resolve, reject) => {
        const onError = (error) => {
            server.removeListener('listening', onListening)
            reject(error)
        }
        const onListening = () => {
            server.removeListener('error', onError)
            resolve(server.address().port)
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(0, TUNNEL_BIND_HOST)
    })

const closeServer = (server) =>
    new Promise((resolve) => {
        try {
            server.close(() => resolve())
        } catch {
            resolve()
        }
    })

/** A port the OS just told us was free; used for the "requested port" case. */
const freePort = async () => {
    const server = net.createServer()
    const port = await listen(server)
    await closeServer(server)
    return port
}

/** Send one message and resolve once the expected echo comes back. */
const roundTrip = (port, message, { expectPrefix = 'echo:', timeoutMs = 5_000 } = {}) =>
    new Promise((resolve, reject) => {
        const socket = net.connect({ host: TUNNEL_BIND_HOST, port })
        const chunks = []
        let settled = false
        const finish = (error, value) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            socket.destroy()
            if (error) reject(error)
            else resolve(value)
        }
        const timer = setTimeout(() => {
            const seen = Buffer.concat(chunks).toString()
            finish(
                new Error(
                    `timed out after ${timeoutMs}ms waiting for ${JSON.stringify(expectPrefix + message)} ` +
                        `through 127.0.0.1:${port} (saw ${JSON.stringify(seen)})`,
                ),
            )
        }, timeoutMs)
        socket.on('connect', () => socket.write(message))
        socket.on('data', (chunk) => {
            chunks.push(chunk)
            const text = Buffer.concat(chunks).toString()
            if (text.includes(expectPrefix + message)) finish(null, text)
        })
        socket.on('error', (error) => finish(error))
        socket.on('close', () => {
            if (!settled) finish(new Error(`closed before the echo arrived: ${JSON.stringify(Buffer.concat(chunks).toString())}`))
        })
    })

/** Read everything a loopback connection gets until it closes (or the deadline). */
const collectTcp = (port, message, { timeoutMs = 4_000 } = {}) =>
    new Promise((resolve) => {
        const socket = net.connect({ host: TUNNEL_BIND_HOST, port })
        const state = { text: '', closed: false, timedOut: false, error: null }
        let settled = false
        const finish = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            state.text = Buffer.concat(chunks).toString()
            socket.destroy()
            resolve(state)
        }
        const chunks = []
        const timer = setTimeout(() => {
            state.timedOut = true
            finish()
        }, timeoutMs)
        socket.on('connect', () => socket.write(message))
        socket.on('data', (chunk) => chunks.push(chunk))
        socket.on('error', (error) => {
            state.error = error.code ?? error.message
            finish()
        })
        socket.on('close', () => {
            state.closed = true
            finish()
        })
    })

/** Does anything still accept on this loopback port? */
const probeConnect = (port) =>
    new Promise((resolve) => {
        const socket = net.connect({ host: TUNNEL_BIND_HOST, port })
        let settled = false
        const finish = (result) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            socket.destroy()
            resolve(result)
        }
        const timer = setTimeout(() => finish('timeout'), 3_000)
        socket.once('connect', () => finish('connected'))
        socket.once('error', () => finish('refused'))
    })

/** Keep a raw connection open, so "first connection stays up" can be asserted. */
const openTcp = (port) =>
    new Promise((resolve, reject) => {
        const state = { socket: null, chunks: [], closed: false, error: null }
        const socket = net.connect({ host: TUNNEL_BIND_HOST, port })
        state.socket = socket
        let connected = false
        const timer = setTimeout(() => {
            socket.destroy()
            reject(new Error(`timed out connecting to 127.0.0.1:${port}`))
        }, 5_000)
        socket.on('connect', () => {
            connected = true
            clearTimeout(timer)
            resolve(state)
        })
        socket.on('error', (error) => {
            state.error = error
            if (!connected) {
                clearTimeout(timer)
                reject(error)
            }
        })
        socket.on('data', (chunk) => state.chunks.push(chunk))
        socket.on('close', () => {
            state.closed = true
            clearTimeout(timer)
        })
    })

/** Encode a SOCKS5 destination: IPv4 literal or domain name. */
const socks5Dest = (host) => {
    if (net.isIP(host) === 4) return Buffer.from([0x01, ...host.split('.').map(Number)])
    const name = Buffer.from(host, 'utf8')
    return Buffer.concat([Buffer.from([0x03, name.length]), name])
}

/**
 * Speak a minimal SOCKS5 CONNECT over a raw socket, optionally round-tripping
 * one message. Resolves `{ reply, text }`; bounded so a broken stack fails a
 * check instead of hanging.
 */
const socks5Exchange = (tunnelPort, { destHost, destPort, message = '' }, { timeoutMs = 5_000 } = {}) =>
    new Promise((resolve, reject) => {
        const socket = net.connect({ host: TUNNEL_BIND_HOST, port: tunnelPort })
        let incoming = Buffer.alloc(0)
        let stage = 'greeting'
        let reply = null
        let settled = false
        const finish = (error, value) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            socket.destroy()
            if (error) reject(error)
            else resolve(value)
        }
        const timer = setTimeout(
            () => finish(new Error(`SOCKS5 exchange timed out after ${timeoutMs}ms (stage ${stage})`)),
            timeoutMs,
        )
        const pump = () => {
            if (stage === 'greeting') {
                if (incoming.length < 2) return
                if (incoming[0] !== 0x05 || incoming[1] !== 0x00) {
                    finish(new Error(`unexpected SOCKS5 method reply ${incoming.subarray(0, 2).toString('hex')}`))
                    return
                }
                incoming = incoming.subarray(2)
                stage = 'reply'
                socket.write(
                    Buffer.concat([
                        Buffer.from([0x05, 0x01, 0x00]),
                        socks5Dest(destHost),
                        Buffer.from([(destPort >> 8) & 0xff, destPort & 0xff]),
                    ]),
                )
                pump()
                return
            }
            if (stage === 'reply') {
                if (incoming.length < 4) return
                const atyp = incoming[3]
                if (atyp === 0x03 && incoming.length < 5) return
                const addressLength = atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : atyp === 0x03 ? 1 + incoming[4] : -1
                if (addressLength < 0) {
                    finish(new Error(`unexpected SOCKS5 address type ${atyp}`))
                    return
                }
                const replyLength = 4 + addressLength + 2
                if (incoming.length < replyLength) return
                reply = incoming[1]
                incoming = incoming.subarray(replyLength)
                if (reply !== 0) {
                    finish(null, { reply, text: '' })
                    return
                }
                stage = 'data'
                if (message) {
                    socket.write(message)
                    pump()
                } else {
                    finish(null, { reply: 0, text: '' })
                }
                return
            }
            const text = incoming.toString('utf8')
            if (text.includes(`echo:${message}`)) finish(null, { reply, text })
        }
        socket.on('connect', () => socket.write(Buffer.from([0x05, 0x01, 0x00])))
        socket.on('data', (chunk) => {
            incoming = Buffer.concat([incoming, chunk])
            pump()
        })
        socket.on('error', (error) => finish(error))
        socket.on('close', () => {
            if (!settled) finish(new Error(`SOCKS5 socket closed at stage ${stage} (reply ${reply})`))
        })
    })

const openTunnel = (manager, options, label) => withTimeout(manager.open(options), `open ${label}`)

/* ================================================================== *
 * 1. Constants + factory contract
 * ================================================================== */
check('tunnel: bind host is loopback', TUNNEL_BIND_HOST === '127.0.0.1')
check('tunnel: default forward deadline is 10s', DEFAULT_TUNNEL_FORWARD_TIMEOUT_MS === 10_000)
check('tunnel: limits are the shared SSH limits', MAX_SSH_TUNNELS === 8 && MAX_TUNNEL_CHANNELS === 64)
check(
    'tunnel: connect() is required',
    /needs a connect\(\) function/.test(throws(() => createTunnelManager({ end: () => {} }))),
)
check(
    'tunnel: end() is required',
    /needs an end\(\) function/.test(throws(() => createTunnelManager({ connect: async () => ({}) }))),
)
check(
    'tunnel: invalid caps are refused at construction',
    /maxTunnels/.test(throws(() => createTunnelManager({ connect: async () => ({}), end: () => {}, maxTunnels: 0 }))) &&
        /maxChannelsPerTunnel/.test(
            throws(() => createTunnelManager({ connect: async () => ({}), end: () => {}, maxChannelsPerTunnel: 0 })),
        ),
)

/* ================================================================== *
 * 2. Request validation (`ssh-params.mjs` tunnel helpers)
 * ================================================================== */
check('params: tunnel kind defaults to local', normalizeTunnelKind(undefined) === 'local' && normalizeTunnelKind('') === 'local')
check('params: tunnel kind accepts both modes', normalizeTunnelKind('local') === 'local' && normalizeTunnelKind('dynamic') === 'dynamic')
check('params: unknown tunnel kind is refused', /"kind" must be "local" or "dynamic"/.test(throws(() => normalizeTunnelKind('socks4'))))
check(
    'params: local port defaults to auto (0)',
    normalizeTunnelLocalPort(undefined) === 0 && normalizeTunnelLocalPort(null) === 0 && normalizeTunnelLocalPort('') === 0,
)
check('params: local port accepts 65535', normalizeTunnelLocalPort(65535) === 65535)
check(
    'params: local port range and integer enforced',
    /localPort/.test(throws(() => normalizeTunnelLocalPort(65_536))) && /localPort/.test(throws(() => normalizeTunnelLocalPort(1.5))),
)
const remoteParams = normalizeTunnelRemoteTarget({ remoteHost: '[2001:db8::1]', remotePort: 8080 })
check('params: remote target strips IPv6 brackets', remoteParams.host === '2001:db8::1' && remoteParams.port === 8080, JSON.stringify(remoteParams))
check('params: remote host is required', /remoteHost/.test(throws(() => normalizeTunnelRemoteTarget({ remotePort: 80 }))))
check(
    'params: remote port is required and bounded',
    /remotePort/.test(throws(() => normalizeTunnelRemoteTarget({ remoteHost: 'db.internal' }))) &&
        /remotePort/.test(throws(() => normalizeTunnelRemoteTarget({ remoteHost: 'db.internal', remotePort: 70_000 }))),
)
check('params: blank label is null', normalizeTunnelLabel(undefined) === null && normalizeTunnelLabel('   ') === null)
check('params: label rejects control characters', /control/.test(throws(() => normalizeTunnelLabel('a\nb'))))
check('params: label length is capped', /too long/.test(throws(() => normalizeTunnelLabel('x'.repeat(MAX_TUNNEL_LABEL_CHARS + 1)))))
check(
    'params: tunnel id validated',
    normalizeTunnelId('tunnel-abc_1') === 'tunnel-abc_1' &&
        /invalid/.test(throws(() => normalizeTunnelId('a b'))) &&
        /invalid/.test(throws(() => normalizeTunnelId(''))),
)

/* ================================================================== *
 * 3. Servers: two echo servers, a real ssh2.Server with tcpip, a silent one
 * ================================================================== */
const startEcho = async (prefix) => {
    const server = net.createServer((socket) => {
        socket.on('error', () => {})
        socket.on('data', (chunk) => {
            if (!socket.destroyed) socket.write(Buffer.concat([Buffer.from(prefix), chunk]))
        })
    })
    const port = await listen(server)
    server.on('error', () => {})
    return { server, port }
}

const echo = await startEcho('echo:')
const echo2 = await startEcho('echo2:')

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const hostKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()

/**
 * A real SSH server: auth accepts anything, and each `direct-tcpip` channel is
 * piped to the requested local TCP destination — the forwarding path a real
 * bastion performs.
 */
const startSshServer = async ({ answerTcpip = true } = {}) => {
    const clients = []
    const tcpip = []
    const server = new Server({ hostKeys: [hostKeyPem] }, (client) => {
        clients.push(client)
        client.on('error', () => {})
        client.on('authentication', (ctx) => ctx.accept())
        client.on('ready', () => {
            client.on('tcpip', (accept, reject, info) => {
                tcpip.push({ destIP: info.destIP, destPort: info.destPort, srcIP: info.srcIP })
                // Deliberately never answer: the client-side deadline must fire.
                if (!answerTcpip) return
                const stream = accept()
                const upstream = net.connect(info.destPort, info.destIP)
                upstream.on('connect', () => {
                    stream.pipe(upstream)
                    upstream.pipe(stream)
                })
                upstream.on('error', () => destroyStreamQuietly(stream))
                upstream.on('close', () => endStreamQuietly(stream))
                stream.on('error', () => upstream.destroy())
                stream.on('close', () => upstream.destroy())
            })
        })
    })
    const port = await listen(server)
    server.on('error', () => {})
    return { server, port, clients, tcpip, close: () => closeServer(server) }
}

const sshServer = await startSshServer()
const silentSsh = await startSshServer({ answerTcpip: false })

const workDir = mkdtempSync(join(tmpdir(), 'kn-ssh-tunnel-'))
const sshTarget = { host: '127.0.0.1', user: 'tester', port: sshServer.port }

/**
 * One tunnel manager with real dependency injection.
 *
 * `listenCalls` captures what the manager asked `net.Server#listen` for, which
 * is how the loopback-only guarantee is asserted from the outside.
 */
const managers = []
const createHarness = (overrides = {}) => {
    const state = {
        events: [],
        connectCalls: [],
        clients: [],
        ended: new Set(),
        assertCalls: [],
        listenCalls: [],
    }
    const manager = createTunnelManager({
        connect: async (options) => {
            state.connectCalls.push(options)
            const session = await connectSsh({
                target: options.target,
                hostKeyPolicy: options.hostKeyPolicy,
                homeDir: workDir,
                knownStorePath: join(workDir, 'tofu.json'),
                env: {},
                timeoutMs: 10_000,
            })
            state.clients.push(session.client)
            return { client: session.client }
        },
        end: (client) => {
            state.ended.add(client)
            endSsh(client)
        },
        broadcast: (event) => {
            state.events.push(event)
        },
        assertDestination: (host) => {
            state.assertCalls.push(host)
        },
        createServer: (handler) => {
            const server = net.createServer(handler)
            const originalListen = server.listen.bind(server)
            server.listen = (...args) => {
                state.listenCalls.push(args[0])
                return originalListen(...args)
            }
            return server
        },
        ...overrides,
    })
    managers.push(manager)
    return { manager, ...state }
}

const localOptions = (overrides = {}) => ({
    target: sshTarget,
    hostKeyPolicy: 'accept-new',
    kind: 'local',
    remoteHost: '127.0.0.1',
    remotePort: echo.port,
    ...overrides,
})

/* ================================================================== *
 * 4. (a) local tunnel + (b) concurrent connections + (d) close
 * ================================================================== */
const a = createHarness()
const tunnelA = await openTunnel(a.manager, localOptions({ label: 'echo' }), 'local tunnel')

const expectedKeys = ['host', 'kind', 'label', 'localHost', 'localPort', 'openedAt', 'port', 'remoteHost', 'remotePort', 'tunnelId', 'user']
check(
    'local: PublicTunnel carries exactly the documented fields',
    Object.keys(tunnelA).sort().join(',') === expectedKeys.slice().sort().join(','),
    Object.keys(tunnelA).join(','),
)
check('local: public shape is serializable', JSON.stringify(tunnelA) === JSON.stringify(JSON.parse(JSON.stringify(tunnelA))))
check(
    'local: fixed destination and label carried',
    tunnelA.kind === 'local' && tunnelA.remoteHost === '127.0.0.1' && tunnelA.remotePort === echo.port && tunnelA.label === 'echo',
)
check(
    'local: SSH target carried verbatim',
    tunnelA.host === '127.0.0.1' && tunnelA.user === 'tester' && tunnelA.port === sshServer.port,
)
check(
    'local: loopback localHost and a real bound port',
    tunnelA.localHost === TUNNEL_BIND_HOST && Number.isInteger(tunnelA.localPort) && tunnelA.localPort > 0,
    `${tunnelA.localHost}:${tunnelA.localPort}`,
)
check(
    'local: listener was asked for 127.0.0.1 and ephemeral port 0',
    a.listenCalls.at(-1)?.host === TUNNEL_BIND_HOST && a.listenCalls.at(-1)?.port === 0,
    JSON.stringify(a.listenCalls.at(-1)),
)
check('local: tunnel id is normalize-safe', /^[A-Za-z0-9_-]{1,64}$/.test(tunnelA.tunnelId), tunnelA.tunnelId)
check('local: list()/size() report it', a.manager.size() === 1 && a.manager.list().length === 1 && a.manager.list()[0].tunnelId === tunnelA.tunnelId)
check('local: one dedicated SSH connection', a.connectCalls.length === 1 && a.clients.length === 1)

const echoA = await roundTrip(tunnelA.localPort, 'hello-a')
check('local: bytes round-trip to the echo server', echoA.includes('echo:hello-a'), JSON.stringify(echoA))
check('local: assertDestination saw the remote host', a.assertCalls.includes('127.0.0.1'), JSON.stringify(a.assertCalls))
check(
    'local: forward reached the requested destination',
    sshServer.tcpip.at(-1)?.destIP === '127.0.0.1' && sshServer.tcpip.at(-1)?.destPort === echo.port,
    JSON.stringify(sshServer.tcpip.at(-1)),
)

const tcpipBeforeConcurrent = sshServer.tcpip.length
const [echoOne, echoTwo] = await Promise.all([
    roundTrip(tunnelA.localPort, 'one'),
    roundTrip(tunnelA.localPort, 'two'),
])
check('concurrent: two connections through one tunnel both round-trip', echoOne.includes('echo:one') && echoTwo.includes('echo:two'))
check(
    'concurrent: each connection opened its own forwarded channel',
    sshServer.tcpip.length === tcpipBeforeConcurrent + 2,
    `${sshServer.tcpip.length - tcpipBeforeConcurrent} channel(s)`,
)

const eventsBeforeClose = a.events.length
check('close: returns true for an open tunnel', a.manager.close(tunnelA.tunnelId) === true)
check('close: second call is a no-op', a.manager.close(tunnelA.tunnelId) === false)
check('close: list()/size() empty', a.manager.size() === 0 && a.manager.list().length === 0)
const closeEvents = a.events.filter((event) => event.tunnelId === tunnelA.tunnelId)
check(
    'close: exactly one tunnel-close with reason "closed"',
    closeEvents.length === 1 && closeEvents[0].type === 'tunnel-close' && closeEvents[0].reason === 'closed',
    JSON.stringify(closeEvents),
)
check(
    'close: event has exactly the documented shape',
    Object.keys(closeEvents[0]).sort().join(',') === 'reason,tunnelId,type',
    Object.keys(closeEvents[0]).join(','),
)
check('close: the tunnel client was ended', a.ended.size === a.clients.length, `${a.ended.size}/${a.clients.length}`)
const probeAfterClose = await probeConnect(tunnelA.localPort)
check('close: listener no longer accepts', probeAfterClose !== 'connected', probeAfterClose)
check('close: one event was emitted while closing', a.events.length === eventsBeforeClose + 1)
const closeEventCount = a.events.length
await wait(150)
check('close: no duplicate event after the client settles', a.events.length === closeEventCount)

/* ================================================================== *
 * 5. (c) requested localPort is honored; a duplicate bind fails clearly
 * ================================================================== */
const c = createHarness()
const wantedPort = await freePort()
const tunnelC = await openTunnel(c.manager, localOptions({ localPort: wantedPort }), 'requested-port tunnel')
check('localPort: the requested loopback port is honored', tunnelC.localPort === wantedPort, `${tunnelC.localPort} vs ${wantedPort}`)
const echoC = await roundTrip(tunnelC.localPort, 'fixed-port')
check('localPort: the explicitly bound port forwards', echoC.includes('echo:fixed-port'), JSON.stringify(echoC))

let bindMessage = ''
try {
    await withTimeout(c.manager.open(localOptions({ localPort: wantedPort })), 'duplicate bind')
} catch (error) {
    bindMessage = error.message
}
check(
    'localPort: a second bind on the same port fails with a clear message',
    bindMessage.startsWith(`desktop ssh: cannot bind 127.0.0.1:${wantedPort}: `) && /EADDRINUSE/.test(bindMessage),
    bindMessage,
)
check('localPort: the failed open did not leave a tunnel behind', c.manager.size() === 1 && c.manager.list()[0].tunnelId === tunnelC.tunnelId)
check(
    'localPort: the failed open ended its dedicated SSH client',
    c.clients.length === 2 && c.ended.size === 1,
    `${c.clients.length} created / ${c.ended.size} ended`,
)
c.manager.close(tunnelC.tunnelId)
await waitFor(() => c.ended.size === c.clients.length, { label: 'all clients of manager C ended' })

/* ================================================================== *
 * 6. (e) SSH transport dies -> listener closed, reason "ssh-closed"
 * ================================================================== */
const e = createHarness()
const tunnelE = await openTunnel(e.manager, localOptions(), 'transport-loss tunnel')
const serverSideClient = sshServer.clients.at(-1)
check('ssh close: the server side of a tunnel connection is live', Boolean(serverSideClient))
// A graceful server-side close is what a peer reboot / network drop looks like
// to ssh2: `close`, not `error`.
serverSideClient.end()
await waitFor(() => e.manager.size() === 0, { label: 'tunnel removal after SSH transport loss', timeoutMs: 5_000 })
const eventsE = e.events.filter((event) => event.tunnelId === tunnelE.tunnelId)
check('ssh close: tunnel disappeared from list()/size()', e.manager.list().length === 0 && e.manager.size() === 0)
check(
    'ssh close: one tunnel-close with reason "ssh-closed"',
    eventsE.length === 1 && eventsE[0].type === 'tunnel-close' && eventsE[0].reason === 'ssh-closed',
    JSON.stringify(eventsE),
)
const probeE = await probeConnect(tunnelE.localPort)
check('ssh close: the loopback listener stopped accepting', probeE !== 'connected', probeE)
check('ssh close: the client was ended', e.ended.size === e.clients.length, `${e.ended.size}/${e.clients.length}`)

/* A transport *error* is a different close reason; a fake client emits it
   deterministically, without depending on how a socket happens to fail. */
const errorEvents = []
const errorEnded = []
let errorClient = null
const errorManager = createTunnelManager({
    connect: async () => {
        errorClient = new EventEmitter()
        errorClient.end = () => {}
        return { client: errorClient }
    },
    end: (client) => errorEnded.push(client),
    broadcast: (event) => errorEvents.push(event),
})
const tunnelErr = await openTunnel(
    errorManager,
    {
        target: { host: 'db.internal', user: 'deploy', port: 22 },
        hostKeyPolicy: 'strict',
        kind: 'local',
        remoteHost: '10.0.0.5',
        remotePort: 5_432,
    },
    'transport-error tunnel',
)
errorClient.emit('error', new Error('socket hang up'))
check(
    'ssh error: reason "ssh-error" and the listener is closed',
    errorEvents.length === 1 &&
        errorEvents[0].tunnelId === tunnelErr.tunnelId &&
        errorEvents[0].reason === 'ssh-error' &&
        errorManager.size() === 0,
    JSON.stringify(errorEvents),
)
check('ssh error: the errored client is ended', errorEnded.includes(errorClient))
const probeErr = await probeConnect(tunnelErr.localPort)
check('ssh error: the loopback listener stopped accepting', probeErr !== 'connected', probeErr)
errorManager.dispose()

/* ================================================================== *
 * 7. (f) closeForTarget + dispose
 * ================================================================== */
const f = createHarness()
const sameTargetTester = {
    target: { host: '127.0.0.1', user: 'tester', port: sshServer.port },
    hostKeyPolicy: 'accept-new',
    kind: 'local',
    remoteHost: '127.0.0.1',
    remotePort: echo.port,
}
const otherTargetUser = {
    ...sameTargetTester,
    target: { host: '127.0.0.1', user: 'other', port: sshServer.port },
}
const tunnelTester = await openTunnel(f.manager, sameTargetTester, 'tester-target tunnel')
const tunnelOther = await openTunnel(f.manager, otherTargetUser, 'other-user tunnel')
check(
    'closeForTarget: matches host + user + port and returns the count',
    f.manager.closeForTarget({ host: '127.0.0.1', user: 'tester', port: sshServer.port }) === 1,
)
check(
    'closeForTarget: other users on the same host stay open',
    f.manager.size() === 1 && f.manager.list().every((tunnel) => tunnel.tunnelId !== tunnelTester.tunnelId),
)
check(
    'closeForTarget: broadcasts reason "revoked" once',
    f.events.filter((event) => event.tunnelId === tunnelTester.tunnelId).length === 1 &&
        f.events.find((event) => event.tunnelId === tunnelTester.tunnelId)?.reason === 'revoked',
    JSON.stringify(f.events.filter((event) => event.tunnelId === tunnelTester.tunnelId)),
)
check(
    'closeForTarget: an undefined user normalizes to null and matches nothing here',
    f.manager.closeForTarget({ host: '127.0.0.1', user: undefined, port: sshServer.port }) === 0,
)
check('closeForTarget: a non-matching target closes nothing', f.manager.closeForTarget({ host: '10.9.9.9', user: 'other', port: sshServer.port }) === 0)
check('closeForTarget: the remaining tunnel is still the other user', f.manager.list().length === 1 && f.manager.list()[0].tunnelId === tunnelOther.tunnelId)

f.manager.dispose('app-quit')
check('dispose: finishes every remaining tunnel', f.manager.size() === 0 && f.manager.list().length === 0)
check(
    'dispose: broadcasts "app-quit" for the remaining tunnel',
    f.events.filter((event) => event.tunnelId === tunnelOther.tunnelId).length === 1 &&
        f.events.find((event) => event.tunnelId === tunnelOther.tunnelId)?.reason === 'app-quit',
    JSON.stringify(f.events.filter((event) => event.tunnelId === tunnelOther.tunnelId)),
)
let disposedMessage = ''
try {
    await f.manager.open(localOptions())
} catch (error) {
    disposedMessage = error.message
}
check('dispose: later open() refuses', disposedMessage === 'desktop ssh: the tunnel manager was disposed', disposedMessage)
const eventsAtDispose = f.events.length
f.manager.dispose('app-quit')
check('dispose: idempotent, no extra events', f.events.length === eventsAtDispose)
await waitFor(() => f.ended.size === f.clients.length, { label: 'all manager F clients ended' })

/* Disposing while a handshake is still in flight must end the client that
   eventually lands and reject the caller — never leave an orphan tunnel. */
const slowEnded = []
let resolveSlowConnect = null
const slowManager = createTunnelManager({
    connect: () => new Promise((resolve) => {
        resolveSlowConnect = resolve
    }),
    end: (client) => slowEnded.push(client),
    broadcast: () => {},
})
const pendingOpen = slowManager.open({
    target: { host: 'db.internal', user: 'deploy', port: 22 },
    hostKeyPolicy: 'strict',
    kind: 'local',
    remoteHost: '10.0.0.5',
    remotePort: 5_432,
})
slowManager.dispose('app-quit')
const slowClient = { on() {}, end() {} }
resolveSlowConnect({ client: slowClient })
let slowMessage = ''
try {
    await pendingOpen
} catch (error) {
    slowMessage = error.message
}
check(
    'dispose: an in-flight open ends its client and rejects',
    slowMessage === 'desktop ssh: the tunnel manager was disposed' &&
        slowEnded.includes(slowClient) &&
        slowManager.size() === 0,
    slowMessage,
)

/* Revoking a host while `open()` is still connecting must never publish the
   tunnel: `closeForTarget` bumps a per-target generation even when nothing is
   in the map yet, and the in-flight open notices. */
const revokedEvents = []
const revokedEnded = []
let resolveRevokedConnect = null
let revokedConnectCalls = 0
const revokedManager = createTunnelManager({
    connect: () => {
        revokedConnectCalls += 1
        if (revokedConnectCalls === 1) {
            return new Promise((resolve) => {
                resolveRevokedConnect = resolve
            })
        }
        return Promise.resolve({ client: { on() {}, end() {} } })
    },
    end: (client) => revokedEnded.push(client),
    broadcast: (event) => revokedEvents.push(event),
    maxTunnels: 1,
})
const revokedTarget = { host: 'db.internal', user: 'deploy', port: 2_222 }
const revokedTunnelOptions = {
    target: revokedTarget,
    hostKeyPolicy: 'strict',
    kind: 'local',
    remoteHost: '10.0.0.5',
    remotePort: 5_432,
}
const inFlightRevoked = revokedManager.open(revokedTunnelOptions)
const closedWhileConnecting = revokedManager.closeForTarget(revokedTarget, 'revoked')
check('revoked: closeForTarget matches nothing while the open is in flight', closedWhileConnecting === 0)
const revokedClient = { on() {}, end() {} }
resolveRevokedConnect({ client: revokedClient })
let revokedMessage = ''
try {
    await inFlightRevoked
} catch (error) {
    revokedMessage = error.message
}
check(
    'revoked: the in-flight open rejects with the revoked message',
    revokedMessage === 'desktop ssh: the host grant was revoked while opening the tunnel',
    revokedMessage,
)
check(
    'revoked: the in-flight client was ended and nothing was published',
    revokedEnded.includes(revokedClient) && revokedManager.size() === 0 && revokedManager.list().length === 0,
)
check('revoked: no tunnel-close event for a tunnel the caller never got', revokedEvents.length === 0)
const retryTunnel = await openTunnel(revokedManager, revokedTunnelOptions, 'post-revocation open')
check(
    'revoked: the failed open released its cap slot (a new open fits maxTunnels: 1)',
    revokedManager.size() === 1 && retryTunnel.user === 'deploy' && retryTunnel.kind === 'local',
)
revokedManager.close(retryTunnel.tunnelId)
revokedManager.dispose()
check('revoked: cleanup leaves nothing behind', revokedManager.size() === 0 && revokedManager.list().length === 0)

/**
 * `closeForTarget` normalization for a target without a user. A fake client
 * keeps this check about target matching rather than about what `ssh2` accepts
 * as a username.
 */
const fakeConnectCalls = []
const nullUserManager = createTunnelManager({
    connect: async (options) => {
        const client = { on() {}, end() {} }
        fakeConnectCalls.push({ options, client })
        return { client }
    },
    end: () => {},
    broadcast: () => {},
})
managers.push(nullUserManager)
const nullUserTunnel = await openTunnel(
    nullUserManager,
    {
        target: { host: 'db.internal', user: null, port: 22 },
        hostKeyPolicy: 'strict',
        kind: 'local',
        remoteHost: '10.0.0.5',
        remotePort: 5_432,
    },
    'null-user tunnel',
)
check('local: a target without a user is stored as null', nullUserTunnel.user === null && nullUserTunnel.host === 'db.internal')
check(
    'local: connect() receives the normalized target',
    fakeConnectCalls[0]?.options.target.user === null && fakeConnectCalls[0]?.options.target.port === 22,
    JSON.stringify(fakeConnectCalls[0]?.options.target),
)
check(
    'closeForTarget: a normalized null user matches a tunnel opened without a user',
    nullUserManager.closeForTarget({ host: 'db.internal', user: undefined, port: 22 }) === 1 && nullUserManager.size() === 0,
)

/* ================================================================== *
 * 8. (g) maxTunnels: sequential refusal and a concurrent burst
 * ================================================================== */
const g = createHarness({ maxTunnels: 1 })
const tunnelG = await openTunnel(g.manager, localOptions(), 'cap tunnel')
let capMessage = ''
try {
    await g.manager.open(localOptions())
} catch (error) {
    capMessage = error.message
}
check(
    'maxTunnels: a second open is refused with the actionable message',
    capMessage === 'desktop ssh: too many open tunnels (max 1); close one first',
    capMessage,
)
check('maxTunnels: the refused open had no side effect', g.manager.size() === 1 && g.clients.length === 1, `${g.clients.length} client(s)`)
g.manager.close(tunnelG.tunnelId)

const burst = createHarness({ maxTunnels: 2 })
const burstResults = await Promise.allSettled([
    burst.manager.open(localOptions()),
    burst.manager.open(localOptions()),
    burst.manager.open(localOptions()),
])
const burstFulfilled = burstResults.filter((result) => result.status === 'fulfilled')
const burstRejected = burstResults.filter((result) => result.status === 'rejected')
check(
    'maxTunnels: a concurrent burst never exceeds the cap (in-flight opens count)',
    burstFulfilled.length === 2 &&
        burstRejected.length === 1 &&
        /too many open tunnels \(max 2\); close one first/.test(burstRejected[0].reason?.message ?? ''),
    `${burstFulfilled.length} fulfilled / ${burstRejected.length} rejected: ${burstRejected[0]?.reason?.message}`,
)
for (const result of burstFulfilled) burst.manager.close(result.value.tunnelId)
burst.manager.dispose()
await waitFor(() => burst.manager.size() === 0, { label: 'burst tunnels closed' })

/* ================================================================== *
 * 9. (h) assertDestination rejection means no forwarded channel
 * ================================================================== */
const h = createHarness({
    assertDestination: () => {
        throw new Error('test: destination blocked')
    },
})
const tunnelH = await openTunnel(h.manager, localOptions(), 'assert-destination tunnel')
const tcpipBeforeH = sshServer.tcpip.length
const outcomeH = await collectTcp(tunnelH.localPort, 'blocked')
check(
    'assertDestination: the local socket is destroyed',
    outcomeH.timedOut !== true && (outcomeH.closed === true || outcomeH.error === 'ECONNRESET'),
    JSON.stringify(outcomeH),
)
check('assertDestination: nothing was echoed back', outcomeH.text === '', JSON.stringify(outcomeH.text))
await wait(100)
check('assertDestination: no forwarding channel was opened', sshServer.tcpip.length === tcpipBeforeH, `${sshServer.tcpip.length - tcpipBeforeH} channel(s)`)
check('assertDestination: the rejection did not close the tunnel', h.manager.size() === 1 && h.manager.list().length === 1)
h.manager.close(tunnelH.tunnelId)

/* ================================================================== *
 * 10. (i) dynamic: needs a handler; a fake handler pipes both ways;
 *     a silent server proves the forward deadline
 * ================================================================== */
const iNoSocks = createHarness()
let dynamicMessage = ''
try {
    await iNoSocks.manager.open({ target: sshTarget, hostKeyPolicy: 'accept-new', kind: 'dynamic' })
} catch (error) {
    dynamicMessage = error.message
}
check('dynamic: missing socks5 handler is refused', dynamicMessage === 'desktop ssh: dynamic tunnels need a socks5 handler', dynamicMessage)
check('dynamic: the refusal happens before any connection', iNoSocks.connectCalls.length === 0 && iNoSocks.manager.size() === 0)

const socks5Calls = []
const i = createHarness({
    socks5: async (socket, deps) => {
        socks5Calls.push({ socket, deps })
        const channel = await deps.forwardOut('127.0.0.1', echo.port)
        return { channel, destHost: '127.0.0.1', destPort: echo.port }
    },
})
const tunnelI = await openTunnel(i.manager, { target: sshTarget, hostKeyPolicy: 'accept-new', kind: 'dynamic', label: 'socks' }, 'dynamic tunnel')
check(
    'dynamic: public tunnel has no fixed destination',
    tunnelI.kind === 'dynamic' && tunnelI.remoteHost === null && tunnelI.remotePort === null && tunnelI.label === 'socks',
)
check('dynamic: a real loopback port is bound', tunnelI.localPort > 0 && tunnelI.localHost === TUNNEL_BIND_HOST, `${tunnelI.localHost}:${tunnelI.localPort}`)
const echoI = await roundTrip(tunnelI.localPort, 'via-socks5')
check('dynamic: bytes pipe through the handler channel both ways', echoI.includes('echo:via-socks5'), JSON.stringify(echoI))
check(
    'dynamic: handler got forwardOut, assertDestination and the deadline',
    socks5Calls.length === 1 &&
        typeof socks5Calls[0].deps.forwardOut === 'function' &&
        typeof socks5Calls[0].deps.assertDestination === 'function' &&
        socks5Calls[0].deps.timeoutMs === DEFAULT_TUNNEL_FORWARD_TIMEOUT_MS,
    JSON.stringify({ timeoutMs: socks5Calls[0]?.deps?.timeoutMs }),
)
check('dynamic: handler received the accepted local socket', socks5Calls[0]?.socket instanceof net.Socket)
i.manager.close(tunnelI.tunnelId)

const timeoutHarness = createHarness({ forwardTimeoutMs: 250 })
const timeoutTarget = { host: '127.0.0.1', user: 'tester', port: silentSsh.port }
const tunnelT = await openTunnel(
    timeoutHarness.manager,
    {
        target: timeoutTarget,
        hostKeyPolicy: 'accept-new',
        kind: 'local',
        remoteHost: '127.0.0.1',
        remotePort: echo.port,
    },
    'forward-timeout tunnel',
)
const timeoutStartedAt = Date.now()
const outcomeT = await collectTcp(tunnelT.localPort, 'slow')
const timeoutElapsed = Date.now() - timeoutStartedAt
check('forward timeout: the local socket fails instead of hanging', outcomeT.timedOut !== true && outcomeT.text === '', JSON.stringify(outcomeT))
check(
    'forward timeout: the engine deadline ended the attempt',
    timeoutElapsed < 3_000 && silentSsh.tcpip.length === 1,
    `${timeoutElapsed}ms, ${silentSsh.tcpip.length} forward attempt(s)`,
)
timeoutHarness.manager.close(tunnelT.tunnelId)

/* ssh2's errno code must survive the readable wrapper: the SOCKS5 negotiator
   maps `ECONNREFUSED` → 5, `ENETUNREACH` → 3, etc. A fake client exercises the
   callback-error path and the synchronous-throw path. */
const forwardFailures = []
let forwardAttempts = 0
const errnoClient = {
    on() {},
    end() {},
    forwardOut(_srcIP, _srcPort, _destHost, _destPort, callback) {
        forwardAttempts += 1
        if (forwardAttempts === 1) {
            callback(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' }))
            return
        }
        throw Object.assign(new Error('Not connected'), { code: 'ENOTCONN' })
    },
}
const errnoManager = createTunnelManager({
    connect: async () => ({ client: errnoClient }),
    end: () => {},
    broadcast: () => {},
    socks5: async (socket, deps) => {
        try {
            const channel = await deps.forwardOut('10.0.0.5', 5_432)
            return { channel, destHost: '10.0.0.5', destPort: 5_432 }
        } catch (error) {
            forwardFailures.push(error)
            // The handler owns its replies and destroys the socket on failure;
            // the engine only cleans up.
            socket.destroy()
            throw error
        }
    },
})
managers.push(errnoManager)
const tunnelErrno = await openTunnel(
    errnoManager,
    {
        target: { host: 'db.internal', user: 'deploy', port: 22 },
        hostKeyPolicy: 'strict',
        kind: 'dynamic',
    },
    'errno-mapping tunnel',
)
await collectTcp(tunnelErrno.localPort, 'refused')
await waitFor(() => forwardFailures.length === 1, { label: 'refused forward to surface', timeoutMs: 5_000 })
check(
    'forward refusal: callback error keeps the readable message and the ssh2 errno code',
    forwardFailures[0]?.code === 'ECONNREFUSED' &&
        forwardFailures[0]?.message ===
            'desktop ssh: cannot forward to 10.0.0.5:5432: connect ECONNREFUSED 10.0.0.5:5432',
    JSON.stringify({ code: forwardFailures[0]?.code, message: forwardFailures[0]?.message }),
)
await collectTcp(tunnelErrno.localPort, 'throw')
await waitFor(() => forwardFailures.length === 2, { label: 'synchronous forward throw to surface', timeoutMs: 5_000 })
check(
    'forward refusal: a synchronous throw keeps the errno code too',
    forwardFailures[1]?.code === 'ENOTCONN' &&
        forwardFailures[1]?.message === 'desktop ssh: cannot forward to 10.0.0.5:5432: Not connected',
    JSON.stringify({ code: forwardFailures[1]?.code, message: forwardFailures[1]?.message }),
)
errnoManager.close(tunnelErrno.tunnelId)
errnoManager.dispose()

/* ================================================================== *
 * 11. (j) two tunnels to the same target are independent
 * ================================================================== */
const j = createHarness()
const jFirst = await openTunnel(j.manager, localOptions({ remotePort: echo.port }), 'first of two tunnels')
const jSecond = await openTunnel(j.manager, localOptions({ remotePort: echo2.port, label: 'second' }), 'second of two tunnels')
check(
    'independent: two tunnels to the same SSH target coexist',
    j.manager.size() === 2 && jFirst.tunnelId !== jSecond.tunnelId && jFirst.localPort !== jSecond.localPort,
)
const [echoJ1, echoJ2] = await Promise.all([
    roundTrip(jFirst.localPort, 'first'),
    roundTrip(jSecond.localPort, 'second', { expectPrefix: 'echo2:' }),
])
check(
    'independent: each tunnel forwards to its own destination',
    echoJ1.includes('echo:first') && echoJ2.includes('echo2:second'),
    JSON.stringify({ echoJ1, echoJ2 }),
)
const sortedJ = j.manager.list()
check('independent: list() is sorted by openedAt', sortedJ.length === 2 && sortedJ[0].openedAt <= sortedJ[1].openedAt)
j.manager.close(jFirst.tunnelId)
check(
    'independent: closing one leaves the other open',
    j.manager.size() === 1 && j.manager.list()[0].tunnelId === jSecond.tunnelId,
)
const echoJ2b = await roundTrip(jSecond.localPort, 'still-here', { expectPrefix: 'echo2:' })
check('independent: the surviving tunnel still forwards', echoJ2b.includes('echo2:still-here'), JSON.stringify(echoJ2b))
j.manager.close(jSecond.tunnelId)

/* ================================================================== *
 * 12. (k) per-tunnel channel cap
 * ================================================================== */
const k = createHarness({ maxChannelsPerTunnel: 1 })
const tunnelK = await openTunnel(k.manager, localOptions(), 'channel-cap tunnel')
const tcpipBeforeK = sshServer.tcpip.length
const firstK = await openTcp(tunnelK.localPort)
await waitFor(() => sshServer.tcpip.length === tcpipBeforeK + 1, { label: 'first forwarded channel', timeoutMs: 5_000 })
const secondK = await openTcp(tunnelK.localPort)
await waitFor(() => secondK.closed === true, { label: 'excess local connection destroyed', timeoutMs: 5_000 })
check('channel cap: the excess connection is destroyed immediately', secondK.closed === true)
check('channel cap: the first connection stays up', firstK.closed === false)
check(
    'channel cap: no second forwarding channel was opened',
    sshServer.tcpip.length === tcpipBeforeK + 1,
    `${sshServer.tcpip.length - tcpipBeforeK} channel(s)`,
)
firstK.socket.destroy()
await waitFor(() => firstK.closed === true, { label: 'first local connection closed', timeoutMs: 5_000 })
k.manager.close(tunnelK.tunnelId)

/* ================================================================== *
 * 13. End-to-end composition: real negotiateSocks5 + real engine + ssh2
 *
 * The other suites inject a fake SOCKS5 handler or a fake `forwardOut`; this
 * one executes the adapter `index.ts` actually uses
 * (`deps.forwardOut` / `deps.assertDestination ?? undefined` / `deps.timeoutMs`)
 * against the real engine and a real SSH channel to the echo server.
 * ================================================================== */
const compositionEvents = []
/** A real port that is currently closed, for the refused-destination reply. */
const compositionRefusedPort = await freePort()
let compositionRealClient = null
const compositionManager = createTunnelManager({
    connect: async ({ target, hostKeyPolicy }) => {
        const session = await connectSsh({
            target,
            hostKeyPolicy,
            homeDir: workDir,
            knownStorePath: join(workDir, 'tofu.json'),
            env: {},
            timeoutMs: 10_000,
        })
        compositionRealClient = session.client
        return {
            client: {
                on: (...args) => compositionRealClient.on(...args),
                end: () => compositionRealClient.end(),
                forwardOut: (srcIP, srcPort, destHost, destPort, callback) => {
                    /**
                     * A *real* ssh2 channel-open failure only carries the numeric
                     * SSH reason (verified: `{ reason: 2, code: undefined }`), so
                     * the refused destination is answered here with the errno a
                     * local refusal produces. Everything else uses the real
                     * channel, and everything above this line (engine errno
                     * preservation → SOCKS5 reply mapping) is the real stack.
                     */
                    if (destPort === compositionRefusedPort) {
                        callback(
                            Object.assign(new Error(`connect ECONNREFUSED ${destHost}:${destPort}`), {
                                code: 'ECONNREFUSED',
                            }),
                        )
                        return
                    }
                    compositionRealClient.forwardOut(srcIP, srcPort, destHost, destPort, callback)
                },
            },
        }
    },
    end: endSsh,
    broadcast: (event) => compositionEvents.push(event),
    assertDestination: null,
    // Exactly the adapter from index.ts.
    socks5: (socket, deps) =>
        negotiateSocks5(socket, {
            forwardOut: deps.forwardOut,
            assertDestination: deps.assertDestination ?? undefined,
            timeoutMs: deps.timeoutMs,
        }),
})
managers.push(compositionManager)
const tunnelCompose = await openTunnel(
    compositionManager,
    { target: sshTarget, hostKeyPolicy: 'accept-new', kind: 'dynamic', label: 'real-socks5' },
    'real SOCKS5 composition tunnel',
)
const composed = await socks5Exchange(tunnelCompose.localPort, {
    destHost: '127.0.0.1',
    destPort: echo.port,
    message: 'through-real-socks5',
})
check(
    'compose: real SOCKS5 greeting + CONNECT + echo through the real engine',
    composed.reply === 0 && composed.text.includes('echo:through-real-socks5'),
    JSON.stringify(composed),
)
const composedRefused = await socks5Exchange(tunnelCompose.localPort, {
    destHost: '127.0.0.1',
    destPort: compositionRefusedPort,
})
check(
    'compose: a refused forward becomes SOCKS reply 5 (engine errno + SOCKS mapping)',
    composedRefused.reply === 5,
    JSON.stringify(composedRefused),
)
const composedAfterRefusal = await socks5Exchange(tunnelCompose.localPort, {
    destHost: '127.0.0.1',
    destPort: echo.port,
    message: 'after-refusal',
})
check(
    'compose: the refused connection did not tear down the tunnel',
    compositionManager.size() === 1 && composedAfterRefusal.reply === 0 && composedAfterRefusal.text.includes('echo:after-refusal'),
    JSON.stringify(composedAfterRefusal),
)
compositionManager.close(tunnelCompose.tunnelId)
const composedCloseEvents = compositionEvents.filter((event) => event.tunnelId === tunnelCompose.tunnelId)
check(
    'compose: closing the composed tunnel emits exactly one tunnel-close',
    composedCloseEvents.length === 1 &&
        composedCloseEvents[0].type === 'tunnel-close' &&
        composedCloseEvents[0].reason === 'closed',
    JSON.stringify(compositionEvents),
)
compositionManager.dispose()

/* ================================================================== *
 * Cleanup + summary
 * ================================================================== */
for (const manager of managers) {
    try {
        manager.dispose('cleanup')
    } catch {
        /* already disposed */
    }
}
for (const server of [sshServer.server, silentSsh.server, echo.server, echo2.server]) {
    await Promise.race([closeServer(server), wait(1_500)])
}
try {
    rmSync(workDir, { recursive: true, force: true })
} catch {
    /* best effort */
}

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)