/**
 * SSH capability — port-forwarding tunnel engine (main process).
 *
 * Two forwarding modes, one shape:
 *
 * - **`local`** (`ssh -L`): a loopback listener forwards every accepted
 *   connection to one fixed destination, resolved **from the SSH server**.
 * - **`dynamic`** (`ssh -D`): a loopback listener hands each accepted socket to
 *   an injected SOCKS5 negotiator (`ssh-socks5.mjs`), which chooses a different
 *   destination per connection.
 *
 * Why the listener is here and not in the renderer: plugins run in a sandboxed
 * renderer with no `net` server, and an SSH forwarding channel only exists
 * inside the main process. The bind address is deliberately **not** a caller
 * parameter: {@link TUNNEL_BIND_HOST} is `127.0.0.1`, so a tunnel is reachable
 * from this machine's plugins and never from the LAN — that is the whole point
 * of the capability, and a wrong default would be a remote-access hole.
 *
 * Connection ownership: a tunnel opens **its own** `ssh2` client through the
 * injected `connect` (the same gated path as every other SSH call: network
 * policy → user grant → host-key verification) and keeps it until the tunnel
 * closes. It must not use the connection pool: a tunnel is a long-lived stream,
 * and the pool's idle reaper would close the transport under an active forward.
 *
 * Pure Node: no `electron`, no `ssh2`. `connect`, `end`, `broadcast`, the SOCKS5
 * handler and `assertDestination` are injected, so `ssh-tunnel.test.mjs` drives
 * the whole lifecycle with a real in-process `ssh2.Server`.
 *
 * Invalidation and races: revoking a host (`closeForTarget`, used by
 * `ssh.forget`) bumps a per-`user@host:port` generation **before** it closes
 * matching tunnels. An `open()` that is still inside the handshake or still
 * binding then observes the bump and rejects with
 * `desktop ssh: the host grant was revoked while opening the tunnel` instead of
 * publishing a listener for a host the user just revoked. `dispose()` is the
 * app-wide equivalent: in-flight opens end the client that lands and reject.
 *
 * Failure semantics (all reject/throw, never silently degrade):
 *
 * - too many tunnels / disposed manager / missing SOCKS5 handler / bind failure;
 * - `desktop ssh: cannot forward to <host>:<port>: <reason>` for a channel that
 *   is refused, throws synchronously, or exceeds {@link DEFAULT_TUNNEL_FORWARD_TIMEOUT_MS}.
 *
 * A single forwarded connection failing only destroys that connection; the
 * tunnel and its listener stay up.
 */
import { randomBytes } from 'node:crypto'
import net from 'node:net'
import { MAX_SSH_TUNNELS, MAX_TUNNEL_CHANNELS } from './ssh-params.mjs'

/** The only address a tunnel listener is ever bound to. */
export const TUNNEL_BIND_HOST = '127.0.0.1'

/** How long a single `forwardOut` may take before that connection is failed. */
export const DEFAULT_TUNNEL_FORWARD_TIMEOUT_MS = 10_000

const asMessage = (value) => (value instanceof Error ? value.message : String(value))

/**
 * Wrap one forwarding failure while keeping ssh2's errno `code` on the new
 * error. The SOCKS5 negotiator maps `ECONNREFUSED`/`ENETUNREACH`/
 * `EHOSTUNREACH`/`ETIMEDOUT` onto distinct SOCKS5 reply codes; dropping the
 * code here would degrade every dynamic-tunnel refusal to "general failure".
 */
const forwardError = (destHost, destPort, error) => {
    const wrapped = new Error(`desktop ssh: cannot forward to ${destHost}:${destPort}: ${asMessage(error)}`)
    if (error && typeof error === 'object' && error.code !== undefined) wrapped.code = error.code
    return wrapped
}

/** The forward deadline is a timeout in protocol terms too. */
const forwardTimeoutError = (destHost, destPort, timeoutMs) => {
    const wrapped = new Error(
        `desktop ssh: cannot forward to ${destHost}:${destPort}: timed out after ${timeoutMs}ms`,
    )
    wrapped.code = 'ETIMEDOUT'
    return wrapped
}

/** End a client without letting "already gone" mask the real path. */
const endQuietly = (end, client) => {
    try {
        end(client)
    } catch {
        /* already gone */
    }
}

/**
 * Streams may emit `error` after we have already decided to close them (a
 * channel destroyed by the far end, a socket torn down by the server). An
 * unhandled `error` event would take the whole main process down, so every
 * quiet close attaches a no-op listener before touching the stream.
 */
const quietError = (stream) => {
    try {
        stream?.on?.('error', () => {})
    } catch {
        /* not an event emitter */
    }
}

/** Half-close a stream quietly (lets buffered bytes flush). */
const endStreamQuietly = (stream) => {
    if (!stream) return
    quietError(stream)
    try {
        stream.end?.()
    } catch {
        /* already closed */
    }
}

/** Tear a stream down now. */
const destroyStreamQuietly = (stream) => {
    if (!stream) return
    quietError(stream)
    try {
        stream.destroy?.()
    } catch {
        /* already closed */
    }
}

const disposedError = () => new Error('desktop ssh: the tunnel manager was disposed')

const revokedError = () => new Error('desktop ssh: the host grant was revoked while opening the tunnel')

const tooManyTunnelsError = (max) =>
    new Error(`desktop ssh: too many open tunnels (max ${max}); close one first`)

/**
 * Identity used for revocation generations: `user@host:port`, with the same
 * `null`-user spelling as `sshGrantKey`. Built here rather than imported so the
 * engine stays about tunnels only.
 */
const revocationKey = (target) => `${target.user ?? ''}@${target.host}:${target.port}`

/** Tunnel ids are opaque, unique for the app run, and `normalizeTunnelId`-safe. */
const makeTunnelId = (sequence) => `tunnel-${sequence.toString(36)}-${randomBytes(4).toString('hex')}`

/**
 * Create a tunnel manager.
 *
 * Dependencies are injected so the engine stays protocol-agnostic:
 *
 * @param {{
 *   connect: (options: { target: { host: string, user: string | null, port: number }, hostKeyPolicy: 'strict' | 'accept-new', credentialId?: string }) => Promise<unknown>,
 *   end: (client: unknown) => void,
 *   broadcast?: (event: { type: 'tunnel-close', tunnelId: string, reason: string }) => void,
 *   socks5?: ((socket: import('node:net').Socket, deps: { forwardOut: (host: string, port: number) => Promise<unknown>, assertDestination: ((host: string) => void | Promise<void>) | null, timeoutMs: number }) => Promise<{ channel: unknown, destHost?: string, destPort?: number }>) | null,
 *   assertDestination?: ((host: string) => void | Promise<void>) | null,
 *   createServer?: (handler: (socket: import('node:net').Socket) => void) => import('node:net').Server,
 *   maxTunnels?: number,
 *   maxChannelsPerTunnel?: number,
 *   forwardTimeoutMs?: number,
 *   now?: () => number,
 * }} [options]
 */
export const createTunnelManager = ({
    connect,
    end,
    broadcast = () => {},
    socks5 = null,
    assertDestination = null,
    createServer = (handler) => net.createServer(handler),
    maxTunnels = MAX_SSH_TUNNELS,
    maxChannelsPerTunnel = MAX_TUNNEL_CHANNELS,
    forwardTimeoutMs = DEFAULT_TUNNEL_FORWARD_TIMEOUT_MS,
    now = () => Date.now(),
} = {}) => {
    if (typeof connect !== 'function') throw new Error('desktop ssh: tunnel manager needs a connect() function')
    if (typeof end !== 'function') throw new Error('desktop ssh: tunnel manager needs an end() function')
    if (!Number.isInteger(maxTunnels) || maxTunnels < 1) {
        throw new Error('desktop ssh: tunnel maxTunnels must be a positive integer')
    }
    if (!Number.isInteger(maxChannelsPerTunnel) || maxChannelsPerTunnel < 1) {
        throw new Error('desktop ssh: tunnel maxChannelsPerTunnel must be a positive integer')
    }
    if (!Number.isFinite(forwardTimeoutMs) || forwardTimeoutMs <= 0) {
        throw new Error('desktop ssh: tunnel forwardTimeoutMs must be a positive number')
    }

    /** tunnelId → live tunnel record (only tunnels that were handed to a caller). */
    const tunnels = new Map()
    /**
     * `user@host:port` → revocation generation. Bumped by `closeForTarget` even
     * when no tunnel is published yet: an `open()` that is still inside
     * `connect()` (or still binding) must not land afterwards and publish a
     * listener for a host the user just revoked. Generations are monotonic and
     * never pruned — the same reasoning as the connection pool's epochs.
     */
    const revokedEpochs = new Map()
    /**
     * Opens that have reserved a slot but have not finished yet. Counted with
     * {@link tunnels} so a burst of concurrent `open()` calls cannot exceed the
     * cap before any of them lands in the map.
     */
    let inFlight = 0
    let disposed = false
    let sequence = 0

    const toPublic = (tunnel) => ({
        tunnelId: tunnel.tunnelId,
        kind: tunnel.kind,
        host: tunnel.target.host,
        user: tunnel.target.user,
        port: tunnel.target.port,
        localHost: tunnel.localHost,
        localPort: tunnel.localPort,
        remoteHost: tunnel.kind === 'local' ? tunnel.remoteHost : null,
        remotePort: tunnel.kind === 'local' ? tunnel.remotePort : null,
        label: tunnel.label,
        openedAt: tunnel.openedAt,
    })

    /**
     * Finish a tunnel exactly once: remove it from the map, stop accepting,
     * tear down live connections, end its client and broadcast the reason.
     *
     * `phase === 'opening'` means the listener is not up yet (the caller either
     * never got a tunnel, or `dispose()` raced the bind). In that case the
     * `open()` continuation closes the server, so `close()` is not called on a
     * server that is mid-listen.
     */
    const finish = (tunnel, reason) => {
        if (tunnel.closed) return false
        tunnel.closed = true
        const published = tunnels.get(tunnel.tunnelId) === tunnel
        if (published) tunnels.delete(tunnel.tunnelId)

        // Settle forwards that are still waiting on the server: their callers
        // would otherwise keep a socket (and this tunnel) alive forever.
        for (const cancel of [...tunnel.pendingForwards]) {
            try {
                cancel()
            } catch {
                /* already settled */
            }
        }
        tunnel.pendingForwards.clear()

        if (published && tunnel.phase === 'open') {
            try {
                tunnel.server?.close?.()
            } catch {
                /* already closed */
            }
        }

        for (const entry of [...tunnel.sockets]) {
            tunnel.sockets.delete(entry)
            destroyStreamQuietly(entry.channel)
            destroyStreamQuietly(entry.socket)
        }

        endQuietly(end, tunnel.client)

        if (published) {
            try {
                broadcast({ type: 'tunnel-close', tunnelId: tunnel.tunnelId, reason })
            } catch {
                /* a throwing listener must not keep the tunnel half-closed */
            }
        }
        return true
    }

    /**
     * Ask the server for one forwarding channel.
     *
     * ssh2's `forwardOut` is callback-only and has no internal deadline; a
     * server that keeps the transport up but never answers would leave the
     * local client hanging forever. The timer bounds that, and a callback that
     * lands after the deadline owns the returned stream: it is closed quietly
     * here rather than leaked.
     */
    const openChannel = (tunnel, destHost, destPort) =>
        new Promise((resolve, reject) => {
            let settled = false
            let timer = null
            const settle = (ok, value) => {
                if (settled) return false
                settled = true
                if (timer !== null) {
                    clearTimeout(timer)
                    timer = null
                }
                tunnel.pendingForwards.delete(cancel)
                if (ok) resolve(value)
                else reject(value)
                return true
            }
            const cancel = () => settle(false, new Error('desktop ssh: the tunnel closed while forwarding'))
            tunnel.pendingForwards.add(cancel)

            timer = setTimeout(() => {
                settle(false, forwardTimeoutError(destHost, destPort, forwardTimeoutMs))
            }, forwardTimeoutMs)
            timer.unref?.()

            try {
                tunnel.client.forwardOut(TUNNEL_BIND_HOST, 0, destHost, destPort, (error, channel) => {
                    if (settled) {
                        // The deadline (or the tunnel closing) already answered;
                        // this channel is ours to clean up.
                        endStreamQuietly(channel)
                        return
                    }
                    if (error) {
                        settle(false, forwardError(destHost, destPort, error))
                        return
                    }
                    settle(true, channel)
                })
            } catch (error) {
                settle(false, forwardError(destHost, destPort, error))
            }
        })

    /** Wire one forwarded channel to its local socket (both directions). */
    const pipeChannel = (tunnel, entry, channel) => {
        if (tunnel.closed || entry.socket.destroyed) {
            destroyStreamQuietly(channel)
            return
        }
        entry.channel = channel
        // Errors destroy the peer; close/end propagate so neither side is left
        // half-open (pipe already forwards EOF, the explicit calls cover the
        // cases where the far side was torn down without a graceful end).
        channel.on('error', () => destroyStreamQuietly(entry.socket))
        channel.on('close', () => endStreamQuietly(entry.socket))
        entry.socket.on('error', () => destroyStreamQuietly(channel))
        entry.socket.on('close', () => {
            tunnel.sockets.delete(entry)
            endStreamQuietly(channel)
        })
        entry.socket.pipe(channel)
        channel.pipe(entry.socket)
    }

    /**
     * One accepted loopback connection.
     *
     * The socket is tracked (and counted against the per-tunnel cap) from the
     * moment it is accepted, so a burst of connections cannot exceed the cap
     * while their channels are still opening.
     */
    const onConnection = (tunnel, socket) => {
        if (tunnel.closed) {
            destroyStreamQuietly(socket)
            return
        }
        socket.setNoDelay?.(true)
        const entry = { socket, channel: null }
        tunnel.sockets.add(entry)
        if (tunnel.sockets.size > maxChannelsPerTunnel) {
            tunnel.sockets.delete(entry)
            destroyStreamQuietly(socket)
            return
        }
        const fail = () => {
            tunnel.sockets.delete(entry)
            destroyStreamQuietly(socket)
        }
        // Track from accept, not from the moment a channel lands: a client that
        // disconnects while its forward is still opening must stop counting
        // against `maxChannelsPerTunnel` right away. The no-op error listener
        // also keeps an early error from becoming an uncaught exception before
        // `pipeChannel` installs the real handler.
        socket.on('error', () => {})
        socket.on('close', () => {
            tunnel.sockets.delete(entry)
        })
        if (socket.destroyed) {
            tunnel.sockets.delete(entry)
            return
        }

        const run = async () => {
            try {
                if (tunnel.kind === 'dynamic') {
                    if (typeof socks5 !== 'function') {
                        // Defensive: `open()` refuses dynamic tunnels without one.
                        fail()
                        return
                    }
                    const result = await socks5(socket, {
                        forwardOut: (host, port) => openChannel(tunnel, host, port),
                        assertDestination,
                        timeoutMs: forwardTimeoutMs,
                    })
                    if (tunnel.closed || socket.destroyed) {
                        destroyStreamQuietly(result?.channel)
                        return
                    }
                    if (!result?.channel) {
                        fail()
                        return
                    }
                    pipeChannel(tunnel, entry, result.channel)
                    return
                }

                // `local`: the destination is fixed by the caller and is
                // resolved by the *remote* host. `assertDestination` is a
                // defence-in-depth hook (e.g. refuse a metadata literal).
                if (typeof assertDestination === 'function') {
                    await assertDestination(tunnel.remoteHost)
                }
                if (tunnel.closed || socket.destroyed) return
                const channel = await openChannel(tunnel, tunnel.remoteHost, tunnel.remotePort)
                if (tunnel.closed || socket.destroyed) {
                    destroyStreamQuietly(channel)
                    return
                }
                pipeChannel(tunnel, entry, channel)
            } catch {
                // A rejected destination, a refused channel or a dead transport
                // only fails this connection; the listener stays up.
                fail()
            }
        }
        run().catch(fail)
    }

    /** Close the tunnel's client on transport end, or when it errors. */
    const watchClient = (tunnel) => {
        const client = tunnel.client
        client?.on?.('close', () => finish(tunnel, 'ssh-closed'))
        client?.on?.('end', () => finish(tunnel, 'ssh-closed'))
        client?.on?.('error', () => {
            finish(tunnel, 'ssh-error')
            // An errored client is unusable; end it so the socket is not left
            // half-open (end() is idempotent).
            endQuietly(end, client)
        })
    }

    /** Resolve on `listening`, reject on `error`, never leak the listeners. */
    const bind = (server, port) =>
        new Promise((resolve, reject) => {
            const cleanup = () => {
                server.removeListener('error', onError)
                server.removeListener('listening', onListening)
            }
            const onError = (error) => {
                cleanup()
                reject(error)
            }
            const onListening = () => {
                cleanup()
                resolve()
            }
            server.once('error', onError)
            server.once('listening', onListening)
            try {
                server.listen({ host: TUNNEL_BIND_HOST, port: port || 0 })
            } catch (error) {
                cleanup()
                reject(error)
            }
        })

    /**
     * Open one tunnel.
     *
     * The cap is checked (and its slot reserved) **before any side effect**, so
     * concurrent callers can never connect-then-fail at the cap.
     */
    const open = async (options = {}) => {
        if (disposed) throw disposedError()
        if (tunnels.size + inFlight >= maxTunnels) throw tooManyTunnelsError(maxTunnels)
        inFlight += 1
        try {
            const {
                target,
                hostKeyPolicy = 'strict',
                credentialId,
                kind = 'local',
                remoteHost = null,
                remotePort = null,
                localPort = 0,
                label = null,
            } = options ?? {}

            if (!target || typeof target !== 'object') throw new Error('desktop ssh: target must be an object')
            if (!target.host) throw new Error('desktop ssh: "host" is required')
            if (kind !== 'local' && kind !== 'dynamic') {
                throw new Error('desktop ssh: "kind" must be "local" or "dynamic"')
            }
            if (kind === 'dynamic' && typeof socks5 !== 'function') {
                throw new Error('desktop ssh: dynamic tunnels need a socks5 handler')
            }
            const requestedPort = localPort === undefined || localPort === null ? 0 : Number(localPort)
            if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
                throw new Error('desktop ssh: "localPort" must be an integer between 0 and 65535')
            }
            if (kind === 'local') {
                if (!remoteHost) throw new Error('desktop ssh: "remoteHost" is required for a local tunnel')
                const destinationPort = Number(remotePort)
                if (!Number.isInteger(destinationPort) || destinationPort < 1 || destinationPort > 65535) {
                    throw new Error('desktop ssh: "remotePort" must be an integer between 1 and 65535')
                }
            }

            const normalizedTarget = {
                host: String(target.host),
                user: target.user ?? null,
                port: Number(target.port ?? 22),
            }
            /**
             * The revocation generation this open started under. `ssh.forget`
             * can bump it while we are still connecting or binding; both later
             * checkpoints below reject the tunnel instead of publishing it.
             */
            const targetKey = revocationKey(normalizedTarget)
            const epoch = revokedEpochs.get(targetKey) ?? 0

            const session = await connect({ target: normalizedTarget, hostKeyPolicy, credentialId })
            const client = session?.client ?? session
            if (disposed) {
                if (client) endQuietly(end, client)
                throw disposedError()
            }
            if (!client) throw new Error('desktop ssh: connect() produced no client')
            if ((revokedEpochs.get(targetKey) ?? 0) !== epoch) {
                // The host grant was revoked while the handshake was in flight:
                // this session must never be handed out.
                endQuietly(end, client)
                throw revokedError()
            }

            const tunnel = {
                tunnelId: makeTunnelId((sequence += 1)),
                kind,
                target: normalizedTarget,
                hostKeyPolicy,
                credentialId,
                remoteHost: kind === 'local' ? String(remoteHost) : null,
                remotePort: kind === 'local' ? Number(remotePort) : null,
                label,
                localHost: TUNNEL_BIND_HOST,
                /** Filled in once the listener reports its real port. */
                localPort: 0,
                openedAt: now(),
                client,
                server: null,
                /** `opening` → `open`; finished tunnels are `closed`. */
                phase: 'opening',
                closed: false,
                /** `{ socket, channel }` per accepted loopback connection. */
                sockets: new Set(),
                /** Reject callbacks for channel opens still waiting on the server. */
                pendingForwards: new Set(),
            }
            watchClient(tunnel)

            const server = createServer((socket) => onConnection(tunnel, socket))
            tunnel.server = server
            try {
                await bind(server, requestedPort)
            } catch (error) {
                // The client was only opened for this tunnel; it must not
                // outlive a listener that never came up.
                tunnel.closed = true
                try {
                    server.close()
                } catch {
                    /* never bound */
                }
                endQuietly(end, client)
                throw new Error(
                    `desktop ssh: cannot bind ${TUNNEL_BIND_HOST}:${requestedPort || 'auto'}: ${asMessage(error)}`,
                )
            }
            const address = server.address()
            tunnel.localPort = address && typeof address === 'object' ? address.port : requestedPort

            if ((revokedEpochs.get(targetKey) ?? 0) !== epoch) {
                // Revoked while binding: close the listener we just opened, end
                // the client, and never publish a tunnel for a revoked host.
                try {
                    server.close()
                } catch {
                    /* already closed */
                }
                endQuietly(end, client)
                throw revokedError()
            }

            if (disposed || tunnel.closed) {
                // `dispose()` (or the transport dying) raced the bind: close the
                // listener we just created and never hand this tunnel out.
                try {
                    server.close()
                } catch {
                    /* already closed */
                }
                endQuietly(end, client)
                throw disposed ? disposedError() : new Error('desktop ssh: the SSH connection closed while opening the tunnel')
            }

            // A listener error after `listening` (EMFILE on accept, a local
            // misconfiguration) must not become an uncaught exception. The
            // tunnel keeps running; the next accept may succeed.
            server.on('error', () => {})

            tunnel.phase = 'open'
            tunnels.set(tunnel.tunnelId, tunnel)
            return toPublic(tunnel)
        } finally {
            inFlight -= 1
        }
    }

    /** Close one tunnel by id. Idempotent; `true` when it existed. */
    const close = (tunnelId, reason = 'closed') => {
        const tunnel = tunnels.get(tunnelId)
        if (!tunnel) return false
        return finish(tunnel, reason)
    }

    /**
     * Close every tunnel for a target — `host`, normalized `user` (`null`) and
     * numeric `port`. Used when the user revokes a host grant (`ssh.forget`).
     */
    const closeForTarget = (target = {}, reason = 'revoked') => {
        const host = target?.host
        const user = target?.user ?? null
        const port = Number(target?.port ?? 22)
        if (typeof host === 'string' && host) {
            const key = revocationKey({ host, user, port })
            // Bump even when no tunnel is published yet: an `open()` still
            // inside `connect()` or binding must observe the revocation and
            // reject instead of publishing afterwards.
            revokedEpochs.set(key, (revokedEpochs.get(key) ?? 0) + 1)
        }
        let closed = 0
        for (const tunnel of [...tunnels.values()]) {
            if (tunnel.target.host !== host) continue
            if ((tunnel.target.user ?? null) !== user) continue
            if (Number(tunnel.target.port) !== port) continue
            if (finish(tunnel, reason)) closed += 1
        }
        return closed
    }

    /** Snapshot of live tunnels, oldest first. Plain serializable objects only. */
    const list = () => [...tunnels.values()].sort((a, b) => a.openedAt - b.openedAt).map(toPublic)

    /** Finish every tunnel and refuse new ones (app quit / hot reload). */
    const dispose = (reason = 'app-quit') => {
        disposed = true
        for (const tunnel of [...tunnels.values()]) finish(tunnel, reason)
    }

    /** Number of open tunnels (excludes opens still connecting). */
    const size = () => tunnels.size

    return { open, close, closeForTarget, list, dispose, size }
}