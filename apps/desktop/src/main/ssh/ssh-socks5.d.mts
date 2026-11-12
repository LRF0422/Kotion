/**
 * Types for ssh-socks5.mjs (plain JS so the tunnel engine and tests can import
 * it directly). The module is the SOCKS5 server half of the dynamic (`-D`)
 * tunnel: it parses one accepted loopback socket's handshake and asks the
 * injected `forwardOut` for a channel.
 */

/** Largest handshake (greeting + request) accepted before parsing bails. */
export const MAX_SOCKS5_HANDSHAKE_BYTES: number

/** How long one accepted socket has to finish the handshake, in milliseconds. */
export const DEFAULT_SOCKS5_TIMEOUT_MS: number

/**
 * Payload bytes buffered while `forwardOut` is opening (the client's first
 * application bytes, replayed into the channel). Bounds what a local client can
 * make the main process hold while the SSH server is slow.
 */
export const MAX_SOCKS5_PIPELINE_BYTES: number

export const SOCKS5_VERSION: number

export const SOCKS5_METHOD: {
    readonly NO_AUTH: number
    readonly NO_ACCEPTABLE: number
}

export const SOCKS5_COMMAND: {
    readonly CONNECT: number
    readonly BIND: number
    readonly UDP_ASSOCIATE: number
}

export const SOCKS5_ADDRESS: {
    readonly IPV4: number
    readonly DOMAIN: number
    readonly IPV6: number
}

/** RFC 1928 reply codes. */
export const SOCKS5_REPLY: {
    readonly SUCCEEDED: number
    readonly GENERAL_FAILURE: number
    readonly NOT_ALLOWED: number
    readonly NETWORK_UNREACHABLE: number
    readonly HOST_UNREACHABLE: number
    readonly CONNECTION_REFUSED: number
    readonly TTL_EXPIRED: number
    readonly COMMAND_UNSUPPORTED: number
    readonly ADDRESS_UNSUPPORTED: number
}

/**
 * `error.code` values this module rejects with. A failed `forwardOut` or a
 * refused `assertDestination` rejects with the original error instead, so the
 * engine can surface the SSH/policy reason.
 */
export const SOCKS5_ERROR: {
    readonly TIMEOUT: 'SOCKS5_TIMEOUT'
    readonly HANDSHAKE_TOO_LARGE: 'SOCKS5_HANDSHAKE_TOO_LARGE'
    readonly SOCKET_CLOSED: 'SOCKS5_SOCKET_CLOSED'
    readonly PROTOCOL: 'SOCKS5_PROTOCOL'
    readonly PIPELINE_TOO_LARGE: 'SOCKS5_PIPELINE_TOO_LARGE'
}

export interface Socks5GreetingIncomplete {
    status: 'incomplete'
}

export interface Socks5GreetingReady {
    status: 'ready'
    version: number
    methods: number[]
    /** Bytes received after the greeting (usually the start of the request). */
    rest: Buffer
}

export type Socks5Greeting = Socks5GreetingIncomplete | Socks5GreetingReady

export interface Socks5RequestIncomplete {
    status: 'incomplete'
}

export interface Socks5RequestReady {
    status: 'ready'
    version: number
    command: number
    /** RFC 1928 RSV; must be 0 (reported so the handler can check it). */
    reserved: number
    addressType: number
    /** IPv4/IPv6 literal or the domain name; empty for an unsupported ATYP. */
    host: string
    port: number
    /** Bytes received after the request: the client's first payload. */
    rest: Buffer
}

export type Socks5Request = Socks5RequestIncomplete | Socks5RequestReady

/**
 * Parse `[0x05, nmethods, methods...]`. Returns `incomplete` until the whole
 * greeting is buffered (arbitrary TCP fragmentation is expected).
 */
export function parseSocks5Greeting(buffer: Buffer | Uint8Array): Socks5Greeting

/**
 * Parse `[0x05, cmd, rsv, atyp, addr..., port]`. An unsupported address type
 * resolves as `ready` with `host: ''` as soon as its header is present, because
 * the address length is unknown.
 */
export function parseSocks5Request(buffer: Buffer | Uint8Array): Socks5Request

/** `[0x05, method]` — the server's method-selection reply. */
export function socks5MethodReply(method: number): Buffer

/**
 * Build a SOCKS5 reply. BND.ADDR defaults to `0.0.0.0:0`, which RFC 1928
 * permits when the server has no bound address to report.
 */
export function socks5Reply(code: number, options?: { host?: string; port?: number }): Buffer

/** Map an `forwardOut`/`assertDestination` failure to its closest reply code. */
export function socks5ReplyCodeForError(error: unknown): number

/** The duplex channel a successful `forwardOut` resolves to (an SSH channel). */
export type Socks5Channel = NodeJS.ReadWriteStream

export interface Socks5NegotiateOptions<Channel = Socks5Channel> {
    /** REQUIRED: opens the forwarded channel; supplied by the tunnel engine. */
    forwardOut: (destHost: string, destPort: number) => Promise<Channel>
    /**
     * OPTIONAL destination policy hook, called before `forwardOut`. A rejection
     * becomes reply `0x02` (NOT_ALLOWED) and the channel is never requested.
     */
    assertDestination?: ((host: string) => void | Promise<void>) | null
    /** Deadline in milliseconds, from the call until the channel is open. */
    timeoutMs?: number
    /** Handshake byte cap, checked while a parser is still waiting. */
    maxHandshakeBytes?: number
}

export interface Socks5Negotiated<Channel = Socks5Channel> {
    /** The open forwarded channel; the caller owns it from here on. */
    channel: Channel
    destHost: string
    destPort: number
}

/**
 * Drive one accepted local socket through a no-auth SOCKS5 CONNECT. Resolves
 * after the success reply is written, with the open channel; rejects after
 * writing an error reply (where a request was parsed) and ending the socket.
 * The caller owns both the socket and the channel after a successful resolve.
 */
export function negotiateSocks5<Channel = Socks5Channel>(
    socket: import('node:net').Socket,
    options: Socks5NegotiateOptions<Channel>,
): Promise<Socks5Negotiated<Channel>>