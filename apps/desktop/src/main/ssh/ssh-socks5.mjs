/**
 * SSH capability — SOCKS5 CONNECT handler for the dynamic (`-D`) tunnel.
 *
 * A dynamic tunnel is a SOCKS5 server bound to `127.0.0.1:<ephemeral>` in the
 * main process that turns every `CONNECT` into an SSH `direct-tcpip` channel
 * (`forwardOut`, injected by the tunnel engine). Browsers and CLI tools then
 * reach the server's network without knowing SSH exists. This module owns only
 * the SOCKS5 side of **one accepted local socket** (RFC 1928 — and RFC 1929
 * method negotiation, which we deliberately refuse): the listener, the SSH
 * connection and the piping belong to `ssh-tunnel.mjs`.
 *
 * Non-goals, and why:
 *
 * - **No authentication methods.** The endpoint offers `0x00` (no auth) and
 *   nothing else. It is reachable from the same machine only — binding
 *   loopback is the tunnel engine's job, because only it knows the tunnel's
 *   lifetime — and every byte that crosses the proxy is already inside the
 *   SSH session's authenticated, encrypted trust boundary. A SOCKS password
 *   would add a second secret to store and to hand to plugins without
 *   protecting anything the SSH session does not already protect.
 * - **CONNECT only.** `BIND` and `UDP ASSOCIATE` are refused with the RFC's
 *   `0x07` rather than implemented: a desktop tunnel needs neither inbound
 *   accepts nor a datagram relay, and a half-implemented UDP path would be a
 *   way around the loopback-only assumption.
 * - **No destination policy here.** `assertDestination(host)` is injected by
 *   the engine, where the network policy and per-host grants live. This module
 *   only guarantees the hook runs **before** a channel is opened, so a refused
 *   destination can never reach the SSH server.
 * - **No state machine after the handshake.** Once the success reply is
 *   written the caller owns the socket and the channel; this handler detaches
 *   its listeners and writes any bytes it has already read into the channel.
 *   That is what makes a client that sends `CONNECT` plus its first payload in
 *   one packet work.
 *
 * Robustness choices:
 *
 * - The handshake is parsed incrementally: every socket write is appended and
 *   the parsers stay `incomplete` until a whole greeting/request is present, so
 *   arbitrary TCP fragmentation works. Anything after the request is the
 *   client's first application bytes and is forwarded before the promise
 *   resolves.
 * - `maxHandshakeBytes` bounds what can be buffered before the destination is
 *   even known, so a request that never completes cannot become an unbounded
 *   allocation in the main process. The cap is only checked while a parser is
 *   still waiting for bytes; once the request is complete its remainder is
 *   payload and may legitimately be larger.
 * - `MAX_SOCKS5_PIPELINE_BYTES` bounds the *other* buffering window: payload a
 *   client sends after CONNECT while `forwardOut` is still opening. That window
 *   is bounded by the caller's forward timeout, which is long enough for a
 *   local client to push megabytes into the main process, so the handler cuts
 *   the connection off instead of growing the heap.
 * - `timeoutMs` runs from the call until the channel is open, so a client that
 *   connects and says nothing, or an SSH server that never answers
 *   `forwardOut`, cannot pin a handshake forever.
 * - Every settle path detaches the socket listeners and clears the timer. The
 *   success path leaves exactly one no-op `error` listener: the caller attaches
 *   its own handlers immediately after `await`, and this closes the small
 *   window where a dying socket would otherwise emit an unhandled `error`.
 *
 * Pure Node (`Buffer` plus the shape of a `node:net` socket): no ssh2, no
 * Electron, so `ssh-socks5.test.mjs` drives it over real loopback TCP.
 */

/** Largest handshake (greeting + request headers) accepted before parsing bails. */
export const MAX_SOCKS5_HANDSHAKE_BYTES = 512

/** How long one accepted socket has to complete the SOCKS5 handshake. */
export const DEFAULT_SOCKS5_TIMEOUT_MS = 10_000

/**
 * Payload bytes accepted while the SSH channel is opening.
 *
 * A client may send its first application bytes immediately after CONNECT, and
 * the handler buffers them until `forwardOut` resolves so they can be replayed
 * into the channel. `forwardOut` is bounded only by the tunnel engine's forward
 * timeout (seconds, not milliseconds), so without a cap a local client could
 * make the main process buffer an unbounded amount while the SSH server is
 * slow. 1 MiB is ample for a TLS ClientHello plus early application bytes.
 */
export const MAX_SOCKS5_PIPELINE_BYTES = 1024 * 1024

/** Protocol version this handler speaks (RFC 1928). */
export const SOCKS5_VERSION = 0x05

/** RFC 1928 authentication methods. */
export const SOCKS5_METHOD = {
    NO_AUTH: 0x00,
    NO_ACCEPTABLE: 0xff,
}

/** RFC 1928 commands. Only CONNECT is implemented. */
export const SOCKS5_COMMAND = {
    CONNECT: 0x01,
    BIND: 0x02,
    UDP_ASSOCIATE: 0x03,
}

/** RFC 1928 address types. */
export const SOCKS5_ADDRESS = {
    IPV4: 0x01,
    DOMAIN: 0x03,
    IPV6: 0x04,
}

/** RFC 1928 reply codes. */
export const SOCKS5_REPLY = {
    SUCCEEDED: 0,
    GENERAL_FAILURE: 1,
    NOT_ALLOWED: 2,
    NETWORK_UNREACHABLE: 3,
    HOST_UNREACHABLE: 4,
    CONNECTION_REFUSED: 5,
    TTL_EXPIRED: 6,
    COMMAND_UNSUPPORTED: 7,
    ADDRESS_UNSUPPORTED: 8,
}

/**
 * `error.code` values this module rejects with, so the tunnel engine can tell
 * "the client misbehaved" from "the SSH forward failed" (the latter is the
 * original ssh2 error, passed through untouched).
 */
export const SOCKS5_ERROR = {
    /** The whole handshake did not finish inside `timeoutMs`. */
    TIMEOUT: 'SOCKS5_TIMEOUT',
    /** More handshake bytes than `maxHandshakeBytes` arrived before a parse. */
    HANDSHAKE_TOO_LARGE: 'SOCKS5_HANDSHAKE_TOO_LARGE',
    /** The local socket ended/errored while the handshake was still running. */
    SOCKET_CLOSED: 'SOCKS5_SOCKET_CLOSED',
    /** The client spoke something that is not a valid SOCKS5 handshake. */
    PROTOCOL: 'SOCKS5_PROTOCOL',
    /** More than {@link MAX_SOCKS5_PIPELINE_BYTES} arrived before the channel opened. */
    PIPELINE_TOO_LARGE: 'SOCKS5_PIPELINE_TOO_LARGE',
}

/**
 * ssh2/net error codes that map to a specific SOCKS5 reply, so the client sees
 * "connection refused" instead of a generic failure. Everything else is a
 * `GENERAL_FAILURE`: guessing a more specific code would tell the client
 * something we do not know.
 */
const REPLY_CODE_BY_ERROR = new Map([
    ['ECONNREFUSED', SOCKS5_REPLY.CONNECTION_REFUSED],
    ['ENETUNREACH', SOCKS5_REPLY.NETWORK_UNREACHABLE],
    ['EHOSTUNREACH', SOCKS5_REPLY.HOST_UNREACHABLE],
    ['ETIMEDOUT', SOCKS5_REPLY.TTL_EXPIRED],
])

/** Coerce parser input; the parsers stay plain data-in/data-out. */
const asBuffer = (value) => {
    if (Buffer.isBuffer(value)) return value
    if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    if (value instanceof ArrayBuffer) return Buffer.from(value)
    throw new Error('desktop ssh: a SOCKS5 parser needs a Buffer or Uint8Array')
}

/** `rest` is copied: the parser must not alias a socket buffer it no longer owns. */
const copyFrom = (buffer, start) => Buffer.from(buffer.subarray(start))

const socks5Error = (code, message) => {
    const error = new Error(message)
    error.code = code
    return error
}

/**
 * Parse `[0x05, nmethods, methods...]`.
 *
 * @param {Buffer | Uint8Array} buffer bytes received so far
 * @returns {{ status: 'incomplete' } | { status: 'ready', version: number, methods: number[], rest: Buffer }}
 */
export const parseSocks5Greeting = (buffer) => {
    const bytes = asBuffer(buffer)
    if (bytes.length < 2) return { status: 'incomplete' }
    const version = bytes[0]
    const count = bytes[1]
    const end = 2 + count
    if (bytes.length < end) return { status: 'incomplete' }
    return {
        status: 'ready',
        version,
        methods: [...bytes.subarray(2, end)],
        rest: copyFrom(bytes, end),
    }
}

/** Format 16 IPv6 bytes as an RFC 5952-ish literal (longest zero run compressed). */
const formatIpv6 = (bytes) => {
    const groups = []
    for (let offset = 0; offset < 16; offset += 2) groups.push(bytes.readUInt16BE(offset))

    let runStart = -1
    let runLength = 0
    for (let index = 0; index < groups.length; ) {
        if (groups[index] !== 0) {
            index += 1
            continue
        }
        let end = index
        while (end < groups.length && groups[end] === 0) end += 1
        if (end - index > runLength) {
            runStart = index
            runLength = end - index
        }
        index = end
    }

    const hex = groups.map((group) => group.toString(16))
    // RFC 5952: a single zero group is written `0`, not `::`.
    if (runLength < 2) return hex.join(':')
    const head = hex.slice(0, runStart).join(':')
    const tail = hex.slice(runStart + runLength).join(':')
    return `${head}::${tail}`
}

/**
 * Parse `[0x05, cmd, rsv, atyp, addr..., port(2)]`.
 *
 * An unsupported address type resolves as `ready` as soon as its four-byte
 * header is present: the address length is unknown, so the handler's only
 * meaningful action is to reply `ADDRESS_UNSUPPORTED` and close. `version` and
 * `reserved` are reported for the handler to check (RFC 1928 requires both).
 *
 * @param {Buffer | Uint8Array} buffer bytes received so far
 * @returns {{ status: 'incomplete' } | {
 *   status: 'ready', version: number, command: number, reserved: number,
 *   addressType: number, host: string, port: number, rest: Buffer,
 * }}
 */
export const parseSocks5Request = (buffer) => {
    const bytes = asBuffer(buffer)
    if (bytes.length < 4) return { status: 'incomplete' }
    const version = bytes[0]
    const command = bytes[1]
    const reserved = bytes[2]
    const addressType = bytes[3]

    if (addressType === SOCKS5_ADDRESS.IPV4) {
        const end = 4 + 4
        if (bytes.length < end + 2) return { status: 'incomplete' }
        const host = `${bytes[4]}.${bytes[5]}.${bytes[6]}.${bytes[7]}`
        const port = bytes.readUInt16BE(end)
        return { status: 'ready', version, command, reserved, addressType, host, port, rest: copyFrom(bytes, end + 2) }
    }

    if (addressType === SOCKS5_ADDRESS.IPV6) {
        const end = 4 + 16
        if (bytes.length < end + 2) return { status: 'incomplete' }
        const host = formatIpv6(bytes.subarray(4, end))
        const port = bytes.readUInt16BE(end)
        return { status: 'ready', version, command, reserved, addressType, host, port, rest: copyFrom(bytes, end + 2) }
    }

    if (addressType === SOCKS5_ADDRESS.DOMAIN) {
        if (bytes.length < 5) return { status: 'incomplete' }
        const length = bytes[4]
        const end = 5 + length
        if (bytes.length < end + 2) return { status: 'incomplete' }
        const host = bytes.toString('utf8', 5, end)
        const port = bytes.readUInt16BE(end)
        return { status: 'ready', version, command, reserved, addressType, host, port, rest: copyFrom(bytes, end + 2) }
    }

    // Unknown ATYP: the address body has no length we can trust, so this is as
    // far as the request can be interpreted. The caller replies 0x08 and closes.
    return { status: 'ready', version, command, reserved, addressType, host: '', port: 0, rest: copyFrom(bytes, 4) }
}

/** `[0x05, method]` — the server's method-selection reply. */
export const socks5MethodReply = (method) => {
    if (!Number.isInteger(method) || method < 0 || method > 0xff) {
        throw new Error('desktop ssh: a SOCKS5 method must be an integer 0-255')
    }
    return Buffer.from([SOCKS5_VERSION, method])
}

const isIpv4 = (host) =>
    typeof host === 'string' &&
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) &&
    host.split('.').every((part) => Number(part) <= 255)

/** Parse an IPv6 literal to eight 16-bit groups, or `null` when malformed. */
const parseIpv6Groups = (host) => {
    if (typeof host !== 'string' || !host.includes(':')) return null
    const compressed = host.includes('::')
    if (!compressed) {
        const parts = host.split(':')
        if (parts.length !== 8 || !parts.every((part) => /^[0-9a-fA-F]{1,4}$/.test(part))) return null
        return parts.map((part) => parseInt(part, 16))
    }
    const halves = host.split('::')
    if (halves.length !== 2) return null
    const parseHalf = (text) => (text === '' ? [] : text.split(':'))
    const head = parseHalf(halves[0])
    const tail = parseHalf(halves[1])
    const parts = [...head, ...tail]
    if (!parts.every((part) => /^[0-9a-fA-F]{1,4}$/.test(part))) return null
    const fill = 8 - parts.length
    if (fill < 1) return null
    return [
        ...head.map((part) => parseInt(part, 16)),
        ...new Array(fill).fill(0),
        ...tail.map((part) => parseInt(part, 16)),
    ]
}

/** Encode `ATYP + address bytes` for a reply's BND.ADDR. */
const encodeBoundAddress = (host) => {
    if (isIpv4(host)) {
        return Buffer.from([SOCKS5_ADDRESS.IPV4, ...host.split('.').map(Number)])
    }
    const groups = parseIpv6Groups(host)
    if (groups) {
        const bytes = Buffer.alloc(17)
        bytes[0] = SOCKS5_ADDRESS.IPV6
        groups.forEach((group, index) => bytes.writeUInt16BE(group, 1 + index * 2))
        return bytes
    }
    const name = Buffer.from(String(host ?? ''), 'utf8')
    if (name.length === 0 || name.length > 255) {
        throw new Error('desktop ssh: invalid SOCKS5 bound address')
    }
    return Buffer.concat([Buffer.from([SOCKS5_ADDRESS.DOMAIN, name.length]), name])
}

/**
 * Build a SOCKS5 reply.
 *
 * The bound address defaults to `0.0.0.0:0`, which RFC 1928 permits when the
 * server does not expose its actual bound address (the SSH channel has none to
 * report). Clients ignore BND.ADDR for CONNECT; `host`/`port` exist so a test
 * or a future local forward can report one.
 */
export const socks5Reply = (code, { host = '0.0.0.0', port = 0 } = {}) => {
    if (!Number.isInteger(code) || code < 0 || code > 0xff) {
        throw new Error('desktop ssh: a SOCKS5 reply code must be an integer 0-255')
    }
    if (!Number.isInteger(port) || port < 0 || port > 0xffff) {
        throw new Error('desktop ssh: a SOCKS5 reply port must be an integer 0-65535')
    }
    const address = encodeBoundAddress(host)
    const portBytes = Buffer.alloc(2)
    portBytes.writeUInt16BE(port)
    return Buffer.concat([Buffer.from([SOCKS5_VERSION, code, 0x00]), address, portBytes])
}

/**
 * Map a failure from `forwardOut`/`assertDestination` to the closest RFC 1928
 * reply code. The error's `code` (not its message) decides, because ssh2 and
 * Node report the useful fact there; strings are accepted for convenience.
 */
export const socks5ReplyCodeForError = (error) => {
    const code = typeof error === 'string' ? error : error?.code
    return REPLY_CODE_BY_ERROR.get(code) ?? SOCKS5_REPLY.GENERAL_FAILURE
}

/** Close a channel without letting a "already gone" throw mask the real path. */
const destroyChannel = (channel) => {
    try {
        channel?.destroy?.()
    } catch {
        /* already gone */
    }
}

/**
 * Drive one accepted local socket through a no-auth SOCKS5 CONNECT.
 *
 * Resolves once the forwarded channel is open **and** the success reply has
 * been written; the caller then owns both the socket and the channel (pipe them
 * together, and destroy them together). Rejects otherwise, after writing an
 * error reply wherever a request was parsed and always ending the socket.
 *
 * The returned promise never rejects with a non-Error value, never settles
 * twice, and is guaranteed to settle when the socket closes/errors mid
 * handshake — a pending handshake must not outlive its socket.
 *
 * @param {import('node:net').Socket} socket accepted local socket (duplex)
 * @param {{
 *   forwardOut: (destHost: string, destPort: number) => Promise<unknown>,
 *   assertDestination?: ((host: string) => void | Promise<void>) | null,
 *   timeoutMs?: number,
 *   maxHandshakeBytes?: number,
 * }} options
 * @returns {Promise<{ channel: any, destHost: string, destPort: number }>}
 */
export const negotiateSocks5 = (socket, options = {}) =>
    new Promise((resolve, reject) => {
        const {
            forwardOut,
            assertDestination = null,
            timeoutMs = DEFAULT_SOCKS5_TIMEOUT_MS,
            maxHandshakeBytes = MAX_SOCKS5_HANDSHAKE_BYTES,
        } = options ?? {}

        // Validation failures reject the promise (they are not thrown at the
        // call site) so every caller can use a single `await`/`catch` shape.
        if (!socket || typeof socket.on !== 'function' || typeof socket.write !== 'function' || typeof socket.end !== 'function') {
            throw new Error('desktop ssh: negotiateSocks5() needs a duplex socket')
        }
        if (typeof forwardOut !== 'function') {
            throw new Error('desktop ssh: negotiateSocks5() needs a forwardOut() function')
        }
        if (assertDestination !== null && typeof assertDestination !== 'function') {
            throw new Error('desktop ssh: "assertDestination" must be a function when provided')
        }
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error('desktop ssh: "timeoutMs" must be a positive number')
        }
        if (!Number.isInteger(maxHandshakeBytes) || maxHandshakeBytes < 1) {
            throw new Error('desktop ssh: "maxHandshakeBytes" must be a positive integer')
        }

        /** 'greeting' → 'request' → 'connecting' → settled. */
        let phase = 'greeting'
        /** Handshake bytes received but not yet parsed. */
        let buffered = Buffer.alloc(0)
        /** Payload bytes that arrived after the request while forwarding. */
        let pipeline = Buffer.alloc(0)
        let settled = false
        let timer = null
        let safetyErrorListener = false

        const clearTimer = () => {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
        }

        const detach = () => {
            clearTimer()
            socket.removeListener('data', onData)
            socket.removeListener('end', onSocketEnd)
            socket.removeListener('close', onSocketClose)
            socket.removeListener('error', onSocketError)
        }

        /**
         * Leave one listener behind so a reset racing the caller's own handler
         * attachment is not an unhandled 'error' event (which would crash the
         * main process). Harmless once the caller adds its handlers.
         */
        const attachSafetyErrorListener = () => {
            if (safetyErrorListener) return
            safetyErrorListener = true
            socket.on('error', () => {})
        }

        const endSocket = (reply = null) => {
            attachSafetyErrorListener()
            try {
                if (reply) socket.end(reply)
                else socket.end()
            } catch {
                /* the socket died first; the rejection still reports why */
            }
        }

        /** Terminal failure: no reply when we cannot describe one. */
        const fail = (error, reply = null) => {
            if (settled) return false
            settled = true
            detach()
            endSocket(reply)
            reject(error instanceof Error ? error : new Error(String(error)))
            return true
        }

        /** A malformed or unsupported handshake, answered when the RFC has a code. */
        const failProtocol = (message, reply = null) => fail(socks5Error(SOCKS5_ERROR.PROTOCOL, message), reply)

        /** More handshake bytes than the cap arrived before a parser was done. */
        const failTooLarge = (what) =>
            fail(socks5Error(SOCKS5_ERROR.HANDSHAKE_TOO_LARGE, `desktop ssh: SOCKS5 ${what} exceeded ${maxHandshakeBytes} bytes`))

        /** Terminal success: the reply is written, listeners are gone, socket stays open. */
        const succeed = (channel, destHost, destPort) => {
            settled = true
            detach()
            attachSafetyErrorListener()
            try {
                socket.write(socks5Reply(SOCKS5_REPLY.SUCCEEDED))
            } catch (error) {
                destroyChannel(channel)
                reject(error)
                return
            }
            if (pipeline.length > 0) {
                // The client's first application bytes arrived in the same
                // flight as CONNECT. Hand them over before resolving: the
                // caller has not had a chance to pipe anything yet, and losing
                // them would corrupt (for example) a TLS ClientHello.
                try {
                    channel.write(pipeline)
                } catch {
                    /* a channel write error surfaces through the caller's pipe */
                }
                pipeline = Buffer.alloc(0)
            }
            resolve({ channel, destHost, destPort })
        }

        /** Write a handshake reply; a dead socket turns into a rejection. */
        const writeReply = (reply) => {
            try {
                socket.write(reply)
                return true
            } catch (error) {
                return fail(error)
            }
        }

        /**
         * Parse as much of the buffered handshake as possible. Loop rather than
         * recurse: greeting + request often arrive together, and one `data`
         * event may therefore cover both phases.
         */
        const pump = () => {
            for (;;) {
                if (settled) return

                if (phase === 'greeting') {
                    const greeting = parseSocks5Greeting(buffered)
                    if (greeting.status === 'incomplete') {
                        if (buffered.length > maxHandshakeBytes) failTooLarge('greeting')
                        return
                    }
                    buffered = greeting.rest

                    // RFC 1928 §3: the version byte identifies the protocol.
                    // Ending *without* a reply keeps us from answering
                    // something that may not speak SOCKS at all.
                    if (greeting.version !== SOCKS5_VERSION) {
                        failProtocol(`desktop ssh: not a SOCKS5 client (version ${greeting.version})`)
                        return
                    }
                    if (!greeting.methods.includes(SOCKS5_METHOD.NO_AUTH)) {
                        // 0xFF is the RFC's "no acceptable methods"; the client
                        // is expected to close after it, and so do we.
                        failProtocol(
                            'desktop ssh: the SOCKS5 client offered no supported method',
                            socks5MethodReply(SOCKS5_METHOD.NO_ACCEPTABLE),
                        )
                        return
                    }
                    if (!writeReply(socks5MethodReply(SOCKS5_METHOD.NO_AUTH))) return
                    phase = 'request'
                    continue
                }

                if (phase === 'request') {
                    const request = parseSocks5Request(buffered)
                    if (request.status === 'incomplete') {
                        if (buffered.length > maxHandshakeBytes) failTooLarge('request')
                        return
                    }
                    buffered = request.rest

                    if (request.version !== SOCKS5_VERSION) {
                        failProtocol(`desktop ssh: not a SOCKS5 request (version ${request.version})`)
                        return
                    }
                    if (request.reserved !== 0) {
                        // RFC 1928 defines RSV as 0x00; a non-zero value means a
                        // malformed or non-SOCKS5 request, so no specific code fits.
                        failProtocol('desktop ssh: SOCKS5 RSV must be zero', socks5Reply(SOCKS5_REPLY.GENERAL_FAILURE))
                        return
                    }
                    if (request.command !== SOCKS5_COMMAND.CONNECT) {
                        failProtocol(
                            `desktop ssh: unsupported SOCKS5 command ${request.command}`,
                            socks5Reply(SOCKS5_REPLY.COMMAND_UNSUPPORTED),
                        )
                        return
                    }
                    if (
                        request.addressType !== SOCKS5_ADDRESS.IPV4 &&
                        request.addressType !== SOCKS5_ADDRESS.DOMAIN &&
                        request.addressType !== SOCKS5_ADDRESS.IPV6
                    ) {
                        failProtocol(
                            `desktop ssh: unsupported SOCKS5 address type ${request.addressType}`,
                            socks5Reply(SOCKS5_REPLY.ADDRESS_UNSUPPORTED),
                        )
                        return
                    }
                    if (!request.host) {
                        // A zero-length domain is malformed; treating it as a
                        // destination would mean asking SSH to connect nowhere.
                        failProtocol(
                            'desktop ssh: SOCKS5 destination host is empty',
                            socks5Reply(SOCKS5_REPLY.ADDRESS_UNSUPPORTED),
                        )
                        return
                    }

                    phase = 'connecting'
                    // Everything after the request is the client's payload.
                    pipeline = buffered
                    buffered = Buffer.alloc(0)
                    // Fire and forget: connect() owns its own failure path and
                    // catch, so this executor never sees an unhandled rejection.
                    connect(request).catch((error) => fail(error))
                    return
                }

                return
            }
        }

        /** The destination is known: check policy, open the channel, reply. */
        const connect = async ({ host, port }) => {
            try {
                if (assertDestination) await assertDestination(host)
            } catch (error) {
                // A policy refusal is not an SSH failure: the channel was never
                // requested, and 0x02 tells the client it is not allowed.
                fail(error, socks5Reply(SOCKS5_REPLY.NOT_ALLOWED))
                return
            }
            if (settled) return

            let channel
            try {
                channel = await forwardOut(host, port)
            } catch (error) {
                fail(error, socks5Reply(socks5ReplyCodeForError(error)))
                return
            }

            if (settled) {
                // The socket died (or the deadline passed) while the channel was
                // opening: nobody will ever read it, so close it instead of leaking.
                destroyChannel(channel)
                return
            }
            if (!channel || typeof channel.write !== 'function') {
                destroyChannel(channel)
                fail(
                    new Error('desktop ssh: forwardOut() resolved without a duplex channel'),
                    socks5Reply(SOCKS5_REPLY.GENERAL_FAILURE),
                )
                return
            }
            succeed(channel, host, port)
        }

        function onData(chunk) {
            if (settled) return
            if (phase === 'connecting') {
                // Bytes that arrive while the SSH channel is opening. `pump()`
                // already consumed the request, and anything left is payload,
                // not handshake, so it does not count against
                // `maxHandshakeBytes`. It is bounded separately: the forward is
                // only as fast as the SSH server, and a local client must not be
                // able to grow the main process's heap while it waits.
                if (pipeline.length + chunk.length > MAX_SOCKS5_PIPELINE_BYTES) {
                    // Release what we buffered before failing; nothing else is
                    // ours yet (the channel does not exist, or its late arrival
                    // is destroyed by `connect()` once it sees `settled`).
                    pipeline = Buffer.alloc(0)
                    fail(
                        socks5Error(
                            SOCKS5_ERROR.PIPELINE_TOO_LARGE,
                            `desktop ssh: SOCKS5 client sent more than ${MAX_SOCKS5_PIPELINE_BYTES} bytes before the tunnel opened`,
                        ),
                        socks5Reply(SOCKS5_REPLY.GENERAL_FAILURE),
                    )
                    return
                }
                pipeline = pipeline.length > 0 ? Buffer.concat([pipeline, chunk]) : Buffer.from(chunk)
                return
            }
            buffered = buffered.length > 0 ? Buffer.concat([buffered, chunk]) : Buffer.from(chunk)
            pump()
        }

        function onSocketEnd() {
            // A client that half-closes before the handshake is done is not a
            // SOCKS5 client: the caller's pipe would end the channel as soon as
            // it takes over, so there is nothing to negotiate for. Settle now
            // rather than wait for the deadline.
            fail(socks5Error(SOCKS5_ERROR.SOCKET_CLOSED, 'desktop ssh: the SOCKS5 client closed the connection'))
        }

        function onSocketClose() {
            fail(socks5Error(SOCKS5_ERROR.SOCKET_CLOSED, 'desktop ssh: the SOCKS5 connection closed'))
        }

        function onSocketError(error) {
            fail(error instanceof Error ? error : socks5Error(SOCKS5_ERROR.SOCKET_CLOSED, String(error)))
        }

        socket.on('data', onData)
        socket.on('end', onSocketEnd)
        socket.on('close', onSocketClose)
        socket.on('error', onSocketError)

        // Deadline from the call, covering both the client's handshake and the
        // SSH forward. The timer is not unref'd: the handshake is pending work.
        timer = setTimeout(() => {
            timer = null
            fail(socks5Error(SOCKS5_ERROR.TIMEOUT, `desktop ssh: SOCKS5 handshake timed out after ${timeoutMs} ms`))
        }, timeoutMs)
    })