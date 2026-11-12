/**
 * SOCKS5 dynamic-tunnel handler test (plain Node — no Electron, no sshd).
 *
 * Wire-level: every case starts a real `net.createServer` on 127.0.0.1, lets it
 * call `negotiateSocks5`, and drives it from a raw `net.Socket` client with
 * literal bytes. Nothing is mocked except the SSH side: `forwardOut` is a fake
 * that records `(host, port)` and returns a `PassThrough` (or a rejected
 * promise / a promise the test settles by hand).
 *
 * Covered here: no-auth method selection, CONNECT with IPv4 / domain / IPv6
 * destinations, RFC reply codes for refused commands and address types, the
 * ECONNREFUSED/ENETUNREACH/EHOSTUNREACH/ETIMEDOUT → 5/3/4/6 mapping, the
 * destination policy hook, pipelined first bytes, greeting/request split byte
 * by byte, the handshake byte cap and the deadline.
 *
 * Every wait is bounded (`waitFor`), so a regression fails the suite instead of
 * hanging it.
 *
 * Run: node apps/desktop/src/main/ssh/ssh-socks5.test.mjs
 */
import { Buffer } from 'node:buffer'
import { connect, createServer } from 'node:net'
import { PassThrough } from 'node:stream'
import {
    DEFAULT_SOCKS5_TIMEOUT_MS,
    MAX_SOCKS5_HANDSHAKE_BYTES,
    MAX_SOCKS5_PIPELINE_BYTES,
    SOCKS5_REPLY,
    negotiateSocks5,
    parseSocks5Greeting,
    parseSocks5Request,
    socks5MethodReply,
    socks5Reply,
    socks5ReplyCodeForError,
} from './ssh-socks5.mjs'

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
const throws = (fn) => {
    try {
        fn()
        return ''
    } catch (error) {
        return error.message
    }
}
const hex = (buffer) => buffer.toString('hex')
const portBytes = (port) => {
    const bytes = Buffer.alloc(2)
    bytes.writeUInt16BE(port)
    return bytes
}

const greeting = Buffer.from([0x05, 0x01, 0x00])
const ipv4Request = (host, port) => Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x01, ...host]), portBytes(port)])
const domainRequest = (name, port) =>
    Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, Buffer.byteLength(name)]), Buffer.from(name, 'utf8'), portBytes(port)])
const ipv6Request = (hostBytes, port) => Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x04]), hostBytes, portBytes(port)])

/* ================================================================== *
 * Harness: one SOCKS5 listener per case, one raw client socket
 * ================================================================== */

const closeProxy = async ({ server, record }) => {
    for (const socket of record.accepted) {
        try {
            socket.destroy()
        } catch {
            /* already gone */
        }
    }
    await new Promise((resolve) => server.close(() => resolve()))
}

/**
 * Start a loopback listener whose only job is to run `negotiateSocks5` on each
 * accepted socket and record how it settled.
 */
const startProxy = async ({ forwardOut, assertDestination, timeoutMs = 1_500, maxHandshakeBytes } = {}) => {
    const record = {
        events: [],
        forwardCalls: [],
        assertCalls: [],
        channels: [],
        accepted: [],
        result: null,
        error: null,
        settled: false,
        clientClosed: false,
    }
    const server = createServer((socket) => {
        record.accepted.push(socket)
        socket.on('close', () => {
            record.clientClosed = true
        })

        const options = {
            forwardOut: async (host, port) => {
                record.events.push(`forward:${host}:${port}`)
                record.forwardCalls.push({ host, port })
                if (forwardOut) return forwardOut(host, port)
                const channel = new PassThrough()
                record.channels.push(channel)
                return channel
            },
            timeoutMs,
        }
        if (maxHandshakeBytes !== undefined) options.maxHandshakeBytes = maxHandshakeBytes
        if (assertDestination) {
            options.assertDestination = async (host) => {
                record.events.push(`assert:${host}`)
                record.assertCalls.push(host)
                await assertDestination(host)
            }
        }

        const promise = negotiateSocks5(socket, options)
        record.promise = promise
        promise.then(
            (result) => {
                record.result = result
                record.settled = true
            },
            (error) => {
                record.error = error
                record.settled = true
            },
        )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return { server, port: server.address().port, record, close: () => closeProxy({ server, record }) }
}

const connectClient = (port) =>
    new Promise((resolve, reject) => {
        const socket = connect({ host: '127.0.0.1', port })
        const state = { socket, received: Buffer.alloc(0), closed: false, errored: null }
        socket.on('data', (chunk) => {
            state.received = Buffer.concat([state.received, chunk])
        })
        socket.on('close', () => {
            state.closed = true
        })
        socket.on('error', (error) => {
            state.errored = error
        })
        // Only the connection failure matters for rejecting; later errors are
        // recorded above and are expected on some teardown paths.
        socket.once('error', reject)
        socket.once('connect', () => resolve(state))
    })

const waitForBytes = (client, length, timeoutMs = 2_000) => waitFor(() => client.received.length >= length, timeoutMs)
const waitForClose = (client, timeoutMs = 2_000) => waitFor(() => client.closed, timeoutMs)
const waitForSettle = (proxy, timeoutMs = 2_000) => waitFor(() => proxy.record.settled, timeoutMs)
const waitForChannelData = (channel, length, timeoutMs = 2_000) => waitFor(() => channel.readableLength >= length, timeoutMs)

/* ================================================================== *
 * Constants and pure parsers
 * ================================================================== */

check('constants: handshake cap', MAX_SOCKS5_HANDSHAKE_BYTES === 512, String(MAX_SOCKS5_HANDSHAKE_BYTES))
check('constants: default timeout', DEFAULT_SOCKS5_TIMEOUT_MS === 10_000, String(DEFAULT_SOCKS5_TIMEOUT_MS))
check('constants: pipeline cap', MAX_SOCKS5_PIPELINE_BYTES === 1024 * 1024, String(MAX_SOCKS5_PIPELINE_BYTES))
check(
    'constants: reply codes',
    SOCKS5_REPLY.SUCCEEDED === 0 &&
        SOCKS5_REPLY.GENERAL_FAILURE === 1 &&
        SOCKS5_REPLY.NOT_ALLOWED === 2 &&
        SOCKS5_REPLY.NETWORK_UNREACHABLE === 3 &&
        SOCKS5_REPLY.HOST_UNREACHABLE === 4 &&
        SOCKS5_REPLY.CONNECTION_REFUSED === 5 &&
        SOCKS5_REPLY.TTL_EXPIRED === 6 &&
        SOCKS5_REPLY.COMMAND_UNSUPPORTED === 7 &&
        SOCKS5_REPLY.ADDRESS_UNSUPPORTED === 8,
    JSON.stringify(SOCKS5_REPLY),
)

/* ---- greeting parser ---- */
check('parser greeting: empty is incomplete', parseSocks5Greeting(Buffer.alloc(0)).status === 'incomplete')
check('parser greeting: one byte is incomplete', parseSocks5Greeting(Buffer.from([0x05])).status === 'incomplete')
check(
    'parser greeting: missing methods are incomplete',
    parseSocks5Greeting(Buffer.from([0x05, 0x02, 0x00])).status === 'incomplete',
)
const greetingReady = parseSocks5Greeting(Buffer.from([0x05, 0x02, 0x00, 0x02, 0xaa, 0xbb]))
check(
    'parser greeting: ready with rest',
    greetingReady.status === 'ready' &&
        greetingReady.version === 5 &&
        JSON.stringify(greetingReady.methods) === '[0,2]' &&
        hex(greetingReady.rest) === 'aabb',
    greetingReady.status === 'ready' ? JSON.stringify(greetingReady) : greetingReady.status,
)
check(
    'parser greeting: zero methods is ready',
    (() => {
        const parsed = parseSocks5Greeting(Buffer.from([0x05, 0x00]))
        return parsed.status === 'ready' && parsed.methods.length === 0
    })(),
)
check(
    'parser greeting: foreign version is still parsed',
    (() => {
        const parsed = parseSocks5Greeting(Buffer.from([0x04, 0x01, 0x00]))
        return parsed.status === 'ready' && parsed.version === 4
    })(),
)
check('parser greeting: rejects a string', /Buffer/.test(throws(() => parseSocks5Greeting('05'))))

/* ---- request parser: IPv4 ---- */
const ipv4Bytes = ipv4Request([127, 0, 0, 1], 443)
const ipv4Parsed = parseSocks5Request(ipv4Bytes)
check(
    'parser request: ipv4 ready',
    ipv4Parsed.status === 'ready' &&
        ipv4Parsed.version === 5 &&
        ipv4Parsed.command === 0x01 &&
        ipv4Parsed.reserved === 0 &&
        ipv4Parsed.addressType === 1 &&
        ipv4Parsed.host === '127.0.0.1' &&
        ipv4Parsed.port === 443 &&
        ipv4Parsed.rest.length === 0,
    ipv4Parsed.status === 'ready' ? `${ipv4Parsed.host}:${ipv4Parsed.port}` : ipv4Parsed.status,
)
check(
    'parser request: every ipv4 prefix is incomplete',
    Array.from({ length: ipv4Bytes.length }, (_, length) => parseSocks5Request(ipv4Bytes.subarray(0, length)).status === 'incomplete').every(
        Boolean,
    ),
)
const withRest = Buffer.concat([ipv4Bytes, Buffer.from('deadbeef', 'hex')])
check(
    'parser request: leftover bytes kept',
    (() => {
        const parsed = parseSocks5Request(withRest)
        return parsed.status === 'ready' && hex(parsed.rest) === 'deadbeef'
    })(),
)

/* ---- request parser: domain ---- */
const domainBytes = domainRequest('example.com', 80)
const domainParsed = parseSocks5Request(domainBytes)
check(
    'parser request: domain ready',
    domainParsed.status === 'ready' && domainParsed.addressType === 3 && domainParsed.host === 'example.com' && domainParsed.port === 80,
    domainParsed.status === 'ready' ? `${domainParsed.host}:${domainParsed.port}` : domainParsed.status,
)
check(
    'parser request: every domain prefix is incomplete',
    Array.from({ length: domainBytes.length }, (_, length) => parseSocks5Request(domainBytes.subarray(0, length)).status === 'incomplete').every(
        Boolean,
    ),
)
check(
    'parser request: empty domain is ready but hostless',
    (() => {
        const parsed = parseSocks5Request(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, 0x00]), portBytes(80)]))
        return parsed.status === 'ready' && parsed.host === ''
    })(),
)
check(
    'parser request: utf8 domain preserved',
    (() => {
        const parsed = parseSocks5Request(domainRequest('bücher.example', 8443))
        return parsed.status === 'ready' && parsed.host === 'bücher.example' && parsed.port === 8443
    })(),
)

/* ---- request parser: IPv6 ---- */
const ipv6Bytes = Buffer.from('20010db8000000000000000000000001', 'hex')
const ipv6Parsed = parseSocks5Request(ipv6Request(ipv6Bytes, 8080))
check(
    'parser request: ipv6 ready and compressed',
    ipv6Parsed.status === 'ready' && ipv6Parsed.addressType === 4 && ipv6Parsed.host === '2001:db8::1' && ipv6Parsed.port === 8080,
    ipv6Parsed.status === 'ready' ? `${ipv6Parsed.host}:${ipv6Parsed.port}` : ipv6Parsed.status,
)
check(
    'parser request: every ipv6 prefix is incomplete',
    Array.from({ length: 22 }, (_, length) => parseSocks5Request(ipv6Request(ipv6Bytes, 8080).subarray(0, length)).status === 'incomplete').every(
        Boolean,
    ),
)
check(
    'parser request: ipv6 ::1 formats as ::1',
    (() => {
        const parsed = parseSocks5Request(ipv6Request(Buffer.from('00000000000000000000000000000001', 'hex'), 80))
        return parsed.status === 'ready' && parsed.host === '::1'
    })(),
)

/* ---- request parser: unsupported address type + RSV ---- */
const unknownAtyp = parseSocks5Request(Buffer.from([0x05, 0x01, 0x00, 0x09, 0xde, 0xad]))
check(
    'parser request: unknown address type reports ready',
    unknownAtyp.status === 'ready' && unknownAtyp.addressType === 9 && unknownAtyp.host === '',
    unknownAtyp.status === 'ready' ? `atyp=${unknownAtyp.addressType}` : unknownAtyp.status,
)
check(
    'parser request: reserved byte reported',
    (() => {
        const parsed = parseSocks5Request(Buffer.from([0x05, 0x01, 0x01, 0x01, 127, 0, 0, 1, 0, 80]))
        return parsed.status === 'ready' && parsed.reserved === 1
    })(),
)

/* ---- reply builders ---- */
check(
    'builder: method replies',
    hex(socks5MethodReply(0x00)) === '0500' && hex(socks5MethodReply(0xff)) === '05ff',
    `${hex(socks5MethodReply(0x00))} ${hex(socks5MethodReply(0xff))}`,
)
check(
    'builder: default success reply is 0.0.0.0:0',
    hex(socks5Reply(0)) === '05000001000000000000',
    hex(socks5Reply(0)),
)
check(
    'builder: reply code carried',
    [0, 1, 2, 3, 4, 5, 6, 7, 8].every((code) => socks5Reply(code)[1] === code && socks5Reply(code)[0] === 5),
)
check(
    'builder: custom ipv4 bound address',
    hex(socks5Reply(0, { host: '10.0.0.1', port: 8080 })) === '050000010a0000011f90',
    hex(socks5Reply(0, { host: '10.0.0.1', port: 8080 })),
)
check(
    'builder: ipv6 bound address',
    (() => {
        const reply = socks5Reply(0, { host: '::1', port: 1 })
        return (
            reply.length === 22 &&
            reply[3] === 4 &&
            hex(reply.subarray(4, 20)) === '00000000000000000000000000000001' &&
            hex(reply.subarray(20)) === '0001'
        )
    })(),
)
check(
    'builder: domain bound address',
    (() => {
        const reply = socks5Reply(0, { host: 'localhost', port: 0 })
        return (
            reply.length === 16 &&
            reply[3] === 3 &&
            reply[4] === 'localhost'.length &&
            hex(reply.subarray(5, 14)) === Buffer.from('localhost').toString('hex')
        )
    })(),
)
check('builder: invalid code refused', /integer 0-255/.test(throws(() => socks5Reply(256))))

/* ---- error → reply code map ---- */
check('error map: ECONNREFUSED', socks5ReplyCodeForError({ code: 'ECONNREFUSED' }) === 5)
check('error map: ENETUNREACH', socks5ReplyCodeForError({ code: 'ENETUNREACH' }) === 3)
check('error map: EHOSTUNREACH', socks5ReplyCodeForError({ code: 'EHOSTUNREACH' }) === 4)
check('error map: ETIMEDOUT', socks5ReplyCodeForError({ code: 'ETIMEDOUT' }) === 6)
check('error map: unknown code is general failure', socks5ReplyCodeForError({ code: 'EPERM' }) === 1)
check('error map: missing error is general failure', socks5ReplyCodeForError(null) === 1 && socks5ReplyCodeForError(undefined) === 1)
check('error map: bare string accepted', socks5ReplyCodeForError('ECONNREFUSED') === 5)

/* ---- handler validation ---- */
check(
    'negotiate: missing forwardOut rejects',
    /forwardOut/.test((await rejection(negotiateSocks5(new PassThrough(), {})))?.message ?? ''),
)
check(
    'negotiate: non-socket rejects',
    /duplex socket/.test((await rejection(negotiateSocks5(null, { forwardOut: async () => new PassThrough() })))?.message ?? ''),
)
check(
    'negotiate: bad maxHandshakeBytes rejects',
    /maxHandshakeBytes/.test(
        (await rejection(negotiateSocks5(new PassThrough(), { forwardOut: async () => {}, maxHandshakeBytes: 0 })))?.message ?? '',
    ),
)

/* ================================================================== *
 * (a) greeting + IPv4 CONNECT, all in one packet, with pipelined payload
 * ================================================================== */
{
    const proxy = await startProxy({ assertDestination: async () => {} })
    const client = await connectClient(proxy.port)
    const payload = Buffer.from('hello-tunnel')
    try {
        client.socket.write(Buffer.concat([greeting, ipv4Request([127, 0, 0, 1], 443), payload]))
        const gotReplies = await waitForBytes(client, 12)
        check('a: method + success replies received', gotReplies, `received ${client.received.length} bytes`)
        check('a: method selection is 05 00', hex(client.received.subarray(0, 2)) === '0500', hex(client.received.subarray(0, 2)))
        check(
            'a: success reply is 05 00 00 01 0.0.0.0:0',
            hex(client.received.subarray(2, 12)) === '05000001000000000000',
            hex(client.received.subarray(2, 12)),
        )

        await waitForSettle(proxy)
        check('a: negotiate resolved', Boolean(proxy.record.result) && proxy.record.error === null, String(proxy.record.error ?? ''))
        check(
            'a: forwardOut called with the requested destination',
            proxy.record.forwardCalls.length === 1 &&
                proxy.record.forwardCalls[0].host === '127.0.0.1' &&
                proxy.record.forwardCalls[0].port === 443,
            JSON.stringify(proxy.record.forwardCalls),
        )
        check(
            'a: resolved destination',
            proxy.record.result?.destHost === '127.0.0.1' && proxy.record.result?.destPort === 443,
            JSON.stringify({ host: proxy.record.result?.destHost, port: proxy.record.result?.destPort }),
        )
        check(
            'a: policy hook ran before forwardOut',
            proxy.record.events[0] === 'assert:127.0.0.1' && proxy.record.events[1] === 'forward:127.0.0.1:443',
            JSON.stringify(proxy.record.events),
        )
        check('a: assertDestination saw the host', JSON.stringify(proxy.record.assertCalls) === '["127.0.0.1"]')

        const channel = proxy.record.result?.channel
        const gotPayload = channel ? await waitForChannelData(channel, payload.length) : false
        check('a: pipelined bytes written to the channel', gotPayload && channel.read(payload.length).equals(payload))
        check('a: local socket left open for the caller', !client.closed && proxy.record.accepted[0]?.destroyed === false)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}

/* ================================================================== *
 * (b) domain name and IPv6 destinations
 * ================================================================== */
{
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        client.socket.write(Buffer.concat([greeting, domainRequest('example.com', 80)]))
        check('b: domain CONNECT gets a success reply', await waitForBytes(client, 12))
        await waitForSettle(proxy)
        check(
            'b: domain destination forwarded',
            proxy.record.forwardCalls[0]?.host === 'example.com' && proxy.record.forwardCalls[0]?.port === 80,
            JSON.stringify(proxy.record.forwardCalls),
        )
        check('b: domain reply is success', hex(client.received.subarray(2, 12)) === '05000001000000000000')
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        client.socket.write(Buffer.concat([greeting, ipv6Request(ipv6Bytes, 8080)]))
        check('b: ipv6 CONNECT gets a success reply', await waitForBytes(client, 12))
        await waitForSettle(proxy)
        check(
            'b: ipv6 destination forwarded as a literal',
            proxy.record.forwardCalls[0]?.host === '2001:db8::1' && proxy.record.forwardCalls[0]?.port === 8080,
            JSON.stringify(proxy.record.forwardCalls),
        )
        check('b: ipv6 resolved destination', proxy.record.result?.destHost === '2001:db8::1')
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}

/* ================================================================== *
 * (c) no acceptable method → 05 FF and close
 * ================================================================== */
{
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        client.socket.write(Buffer.from([0x05, 0x01, 0x02])) // username/password only
        const got = await waitForBytes(client, 2)
        check('c: method-not-acceptable reply is 05 FF', got && hex(client.received) === '05ff', hex(client.received))
        check('c: connection closed', await waitForClose(client))
        await waitForSettle(proxy)
        check('c: handshake rejected', Boolean(proxy.record.error) && proxy.record.error.code === 'SOCKS5_PROTOCOL', String(proxy.record.error?.code))
        check('c: forwardOut never called', proxy.record.forwardCalls.length === 0)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}

/* ================================================================== *
 * (d) unsupported command / address type / version / RSV
 * ================================================================== */
{
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        // BIND (0x02) is refused with COMMAND_UNSUPPORTED.
        client.socket.write(Buffer.concat([greeting, Buffer.from([0x05, 0x02, 0x00, 0x01, 127, 0, 0, 1, 0, 80])]))
        check('d: BIND gets reply 07', (await waitForBytes(client, 12)) && client.received[3] === 7, hex(client.received))
        check('d: BIND closes the socket', await waitForClose(client))
        await waitForSettle(proxy)
        check('d: BIND never forwards', proxy.record.forwardCalls.length === 0)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        // Address type 0x09 is not defined by RFC 1928.
        client.socket.write(Buffer.concat([greeting, Buffer.from([0x05, 0x01, 0x00, 0x09, 1, 2, 3])]))
        check('d: unknown ATYP gets reply 08', (await waitForBytes(client, 12)) && client.received[3] === 8, hex(client.received))
        check('d: unknown ATYP closes the socket', await waitForClose(client))
        await waitForSettle(proxy)
        check('d: unknown ATYP never forwards', proxy.record.forwardCalls.length === 0)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        // Version 4 (SOCKS4) is not SOCKS5: close without writing a reply.
        client.socket.write(Buffer.from([0x04, 0x01, 0x00, 0x50, 127, 0, 0, 1, 0]))
        check('d: bad version closes without a reply', await waitForClose(client))
        check('d: bad version wrote no bytes', client.received.length === 0, hex(client.received))
        await waitForSettle(proxy)
        check('d: bad version rejected', proxy.record.error?.code === 'SOCKS5_PROTOCOL')
        check('d: bad version never forwards', proxy.record.forwardCalls.length === 0)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        // RSV must be 0x00.
        client.socket.write(Buffer.concat([greeting, Buffer.from([0x05, 0x01, 0x01, 0x01, 127, 0, 0, 1, 0, 80])]))
        check('d: non-zero RSV gets general failure', (await waitForBytes(client, 12)) && client.received[3] === 1, hex(client.received))
        check('d: non-zero RSV closes', await waitForClose(client))
        await waitForSettle(proxy)
        check('d: non-zero RSV never forwards', proxy.record.forwardCalls.length === 0)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}

/* ================================================================== *
 * (e) forwardOut failures → mapped reply codes
 * ================================================================== */
for (const [code, expected] of [
    ['ECONNREFUSED', SOCKS5_REPLY.CONNECTION_REFUSED],
    ['ENETUNREACH', SOCKS5_REPLY.NETWORK_UNREACHABLE],
    ['EHOSTUNREACH', SOCKS5_REPLY.HOST_UNREACHABLE],
    ['ETIMEDOUT', SOCKS5_REPLY.TTL_EXPIRED],
]) {
    const proxy = await startProxy({
        forwardOut: async () => {
            const error = new Error(`fake ssh2 failure: ${code}`)
            error.code = code
            throw error
        },
    })
    const client = await connectClient(proxy.port)
    try {
        client.socket.write(Buffer.concat([greeting, ipv4Request([10, 0, 0, 5], 22)]))
        const got = await waitForBytes(client, 12)
        check(`e: ${code} → reply ${expected}`, got && client.received[3] === expected, hex(client.received))
        check(`e: ${code} reply is not a success`, !(client.received[2] === 5 && client.received[3] === 0), hex(client.received.subarray(2, 12)))
        check(`e: ${code} closes the socket`, await waitForClose(client))
        await waitForSettle(proxy)
        check(`e: ${code} rejection keeps the ssh error`, proxy.record.error?.code === code, String(proxy.record.error?.code))
        check(`e: ${code} never resolved a channel`, proxy.record.result === null)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}

/* ================================================================== *
 * (f) assertDestination refusal → 02, no channel
 * ================================================================== */
{
    const proxy = await startProxy({
        assertDestination: async () => {
            const error = new Error('desktop ssh: destination blocked by policy')
            error.code = 'DESKTOP_NET_POLICY_DENIED'
            throw error
        },
    })
    const client = await connectClient(proxy.port)
    try {
        client.socket.write(Buffer.concat([greeting, domainRequest('metadata.internal', 80)]))
        const got = await waitForBytes(client, 12)
        check('f: policy refusal gets reply 02', got && client.received[3] === SOCKS5_REPLY.NOT_ALLOWED, hex(client.received))
        check('f: policy refusal closes the socket', await waitForClose(client))
        await waitForSettle(proxy)
        check('f: forwardOut never called', proxy.record.forwardCalls.length === 0)
        check('f: policy error is the rejection', proxy.record.error?.code === 'DESKTOP_NET_POLICY_DENIED', String(proxy.record.error?.code))
        check('f: policy hook saw the hostname', JSON.stringify(proxy.record.assertCalls) === '["metadata.internal"]')
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}

/* ================================================================== *
 * (g) fragmentation: byte-at-a-time, one packet, and payload during connect
 * ================================================================== */
{
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        const bytes = Buffer.concat([greeting, ipv4Request([192, 168, 1, 20], 8443)])
        for (const byte of bytes) {
            client.socket.write(Buffer.from([byte]))
            await wait(2)
        }
        const got = await waitForBytes(client, 12)
        check('g: byte-at-a-time handshake succeeds', got && client.received[2] === 5 && client.received[3] === 0, hex(client.received))
        await waitForSettle(proxy)
        check(
            'g: byte-at-a-time destination parsed',
            proxy.record.forwardCalls[0]?.host === '192.168.1.20' && proxy.record.forwardCalls[0]?.port === 8443,
            JSON.stringify(proxy.record.forwardCalls),
        )
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    // Greeting and request split at an awkward boundary (inside the request).
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        const bytes = Buffer.concat([greeting, ipv4Request([10, 1, 2, 3], 8080)])
        client.socket.write(bytes.subarray(0, 5))
        await wait(10)
        client.socket.write(bytes.subarray(5))
        check('g: split greeting+request succeeds', (await waitForBytes(client, 12)) && client.received[3] === 0, hex(client.received))
        await waitForSettle(proxy)
        check('g: split request forwarded', proxy.record.forwardCalls[0]?.host === '10.1.2.3')
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    // Payload that arrives while forwardOut is still pending must not be lost
    // (and the success reply must not be written before the channel is open).
    const channel = new PassThrough()
    let resolveForward = null
    const proxy = await startProxy({
        forwardOut: () =>
            new Promise((resolve) => {
                resolveForward = () => resolve(channel)
            }),
    })
    const client = await connectClient(proxy.port)
    const late = Buffer.from('late-payload')
    try {
        client.socket.write(Buffer.concat([greeting, ipv4Request([172, 16, 0, 9], 9000)]))
        await waitForBytes(client, 2)
        check('g: method reply precedes the channel open', hex(client.received) === '0500', hex(client.received))
        await waitFor(() => proxy.record.forwardCalls.length === 1)
        client.socket.write(late)
        await wait(20)
        check('g: no success reply while the channel is pending', client.received.length === 2, hex(client.received))
        resolveForward()
        check('g: success reply after the channel opens', (await waitForBytes(client, 12)) && client.received[3] === 0)
        await waitForSettle(proxy)
        const ready = await waitForChannelData(channel, late.length)
        check('g: payload buffered during connect is forwarded', ready && channel.read(late.length).equals(late))
        check('g: resolved channel is the forwarded one', proxy.record.result?.channel === channel)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}

/* ================================================================== *
 * (h) timeout and handshake byte cap
 * ================================================================== */
{
    const proxy = await startProxy({ timeoutMs: 40 })
    const client = await connectClient(proxy.port)
    try {
        // Say nothing at all: the deadline must close the socket.
        check('h: silent client is closed by the deadline', await waitForClose(client, 2_000))
        await waitForSettle(proxy)
        check('h: timeout rejects', proxy.record.error?.code === 'SOCKS5_TIMEOUT', String(proxy.record.error?.code))
        check('h: timeout writes no reply', client.received.length === 0, hex(client.received))
        check('h: timeout never forwards', proxy.record.forwardCalls.length === 0)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    const proxy = await startProxy({ maxHandshakeBytes: 8 })
    const client = await connectClient(proxy.port)
    try {
        // A domain request that wants 255 bytes but only sends a few: the cap is
        // exceeded while the parser is still waiting, so the handshake is ended.
        client.socket.write(Buffer.concat([greeting, Buffer.from([0x05, 0x01, 0x00, 0x03, 0xff]), Buffer.alloc(20)]))
        check('h: oversized handshake is closed', await waitForClose(client))
        await waitForSettle(proxy)
        check('h: oversized handshake rejects', proxy.record.error?.code === 'SOCKS5_HANDSHAKE_TOO_LARGE', String(proxy.record.error?.code))
        check('h: oversized handshake never forwards', proxy.record.forwardCalls.length === 0)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    // The cap applies to the handshake, not to the payload that follows it:
    // a tiny cap must not cut off a large first flight.
    const proxy = await startProxy({ maxHandshakeBytes: 16 })
    const client = await connectClient(proxy.port)
    const payload = Buffer.alloc(200, 0x41)
    try {
        client.socket.write(Buffer.concat([greeting, ipv4Request([10, 9, 8, 7], 443), payload]))
        check('h: large pipeline is not mistaken for a handshake', (await waitForBytes(client, 12)) && client.received[3] === 0)
        await waitForSettle(proxy)
        const channel = proxy.record.result?.channel
        const ready = channel ? await waitForChannelData(channel, payload.length) : false
        check('h: large pipeline forwarded intact', ready && channel.read(payload.length).equals(payload))
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    // A client that floods payload while the SSH channel is opening must be cut
    // off: the forward is bounded only by the engine's timeout, so without the
    // pipeline cap the main process would buffer whatever the client sends.
    const channel = new PassThrough()
    let resolveForward = null
    const proxy = await startProxy({
        forwardOut: () =>
            new Promise((resolve) => {
                resolveForward = () => resolve(channel)
            }),
    })
    const client = await connectClient(proxy.port)
    try {
        client.socket.write(Buffer.concat([greeting, ipv4Request([10, 0, 0, 8], 443)]))
        await waitForBytes(client, 2)
        await waitFor(() => proxy.record.forwardCalls.length === 1)

        // Fill the cap exactly, a chunk at a time, so the handler keeps up.
        const chunk = Buffer.alloc(64 * 1024, 0x42)
        for (let sent = 0; sent < MAX_SOCKS5_PIPELINE_BYTES; sent += chunk.length) {
            client.socket.write(chunk)
            await wait(10)
        }
        check('h: forwarding still pending at the pipeline cap', !proxy.record.settled)

        // One byte over the cap is enough to end the connection.
        client.socket.write(Buffer.alloc(4 * 1024, 0x43))
        await waitForSettle(proxy, 3_000)
        check(
            'h: pipeline overflow rejects with its own code',
            proxy.record.error?.code === 'SOCKS5_PIPELINE_TOO_LARGE',
            String(proxy.record.error?.code),
        )
        check(
            'h: pipeline overflow replies general failure',
            (await waitForBytes(client, 12, 3_000)) && client.received[3] === SOCKS5_REPLY.GENERAL_FAILURE,
            hex(client.received),
        )
        check('h: pipeline overflow closes the socket', await waitForClose(client, 3_000))

        // The in-flight forward lands after the rejection: the handler must
        // close that channel instead of leaking it.
        resolveForward()
        check('h: channel resolved after rejection is closed', await waitFor(() => channel.destroyed, 2_000))
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}
{
    // A socket that dies mid-handshake must settle the promise, not hang it.
    const proxy = await startProxy()
    const client = await connectClient(proxy.port)
    try {
        client.socket.write(Buffer.from([0x05, 0x01]))
        client.socket.destroy()
        await waitForSettle(proxy)
        check(
            'h: socket closed mid-handshake settles',
            proxy.record.error?.code === 'SOCKS5_SOCKET_CLOSED' || proxy.record.error?.code === 'ECONNRESET',
            String(proxy.record.error?.code),
        )
        check('h: closed socket never forwards', proxy.record.forwardCalls.length === 0)
    } finally {
        client.socket.destroy()
        await proxy.close()
    }
}

/* ================================================================== *
 * Summary
 * ================================================================== */
const failed = results.filter((result) => !result.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
if (failed > 0) {
    console.log('failed checks:')
    for (const result of results) if (!result.ok) console.log(`  - ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
}
process.exit(failed ? 1 : 0)