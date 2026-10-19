/**
 * Parameter normalization for the `net.socket.*` capability group.
 *
 * Pure functions over plain values — no `electron`, no sockets — so the rules a
 * plugin's payload has to satisfy are testable without a network. The network
 * policy and the user consent prompt live in ./handlers.ts (both need the app);
 * this module only answers "is this payload well-formed, and what bounds apply".
 */

import { isIP } from 'node:net'

/** Idle timeout bounds, in ms. */
export const SOCKET_MIN_TIMEOUT_MS = 1000
export const SOCKET_MAX_TIMEOUT_MS = 10 * 60 * 1000
export const SOCKET_DEFAULT_TIMEOUT_MS = 60 * 1000
/** Connect timeout bounds, in ms. */
export const SOCKET_MIN_CONNECT_TIMEOUT_MS = 1000
export const SOCKET_MAX_CONNECT_TIMEOUT_MS = 2 * 60 * 1000
export const SOCKET_DEFAULT_CONNECT_TIMEOUT_MS = 15 * 1000
/**
 * One `write` payload. A protocol frame is small; this only stops a plugin from
 * turning a session into a bulk-transfer channel through a single IPC message
 * (it can send more chunks, at its own pace, if it really means to).
 */
export const SOCKET_MAX_WRITE_BYTES = 1024 * 1024
/** Live sessions per window. Each holds two kernel buffers, so keep it modest. */
export const SOCKET_MAX_SESSIONS = 16

export const SOCKET_ERROR = {
    TARGET: 'SOCKET_INVALID_TARGET',
    OPTIONS: 'SOCKET_INVALID_OPTIONS',
    PAYLOAD: 'SOCKET_INVALID_PAYLOAD',
    LIMIT: 'SOCKET_LIMIT_REACHED',
}

/** A validation failure that travels to the renderer as a rejected invoke. */
export class SocketParamError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'SocketParamError'
        this.code = code
    }
}

const asRecord = (value) => (value && typeof value === 'object' ? value : {})

const clampNumber = (value, min, max, fallback) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(Math.max(Math.trunc(parsed), min), max)
}

/**
 * Validate a host for a raw connection: a hostname or an IP literal.
 *
 * Deliberately not a URL: a raw socket has no scheme, path or query, and
 * accepting one would only invite confusion about which part is dialled.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSocketHost(value) {
    if (typeof value !== 'string') {
        throw new SocketParamError(SOCKET_ERROR.TARGET, 'net.socket: "host" must be a string')
    }
    let host = value.trim().toLowerCase()
    // A bracketed IPv6 literal is the URL form; accept it, keep the address.
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
    if (!host) throw new SocketParamError(SOCKET_ERROR.TARGET, 'net.socket: "host" is required')
    if (host.length > 253) throw new SocketParamError(SOCKET_ERROR.TARGET, 'net.socket: "host" is too long')
    if (isIP(host) !== 0) return host
    // Hostnames: letters/digits/dot/dash/underscore, no scheme, no port, no path.
    if (!/^[a-z0-9_]([a-z0-9._-]*[a-z0-9_])?$/.test(host)) {
        throw new SocketParamError(
            SOCKET_ERROR.TARGET,
            'net.socket: "host" must be a hostname or IP literal (no scheme, path or port)',
        )
    }
    if (host.includes('..')) {
        throw new SocketParamError(SOCKET_ERROR.TARGET, 'net.socket: "host" has an empty label')
    }
    return host
}

/**
 * Validate a TCP port.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeSocketPort(value) {
    const port = Number(value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new SocketParamError(SOCKET_ERROR.TARGET, 'net.socket: "port" must be an integer in 1..65535')
    }
    return port
}

/** `tcp` (default) or `tls`. */
export function normalizeSocketProtocol(value) {
    if (value === undefined || value === null || value === '') return 'tcp'
    if (value === 'tcp' || value === 'tls') return value
    throw new SocketParamError(SOCKET_ERROR.OPTIONS, 'net.socket: "protocol" must be "tcp" or "tls"')
}

/** TLS verification policy; `strict` unless the caller asks otherwise. */
export function normalizeTlsMode(value) {
    if (value === undefined || value === null || value === '') return 'strict'
    if (value === 'strict' || value === 'relaxed') return value
    throw new SocketParamError(SOCKET_ERROR.OPTIONS, 'net.socket: "tlsMode" must be "strict" or "relaxed"')
}

/**
 * The SNI / verification name. Defaults to the host; must itself be a hostname
 * (or an IP, which is legal for SNI-free verification).
 */
export function normalizeServerName(value, fallbackHost) {
    if (value === undefined || value === null || value === '') return fallbackHost
    if (typeof value !== 'string') {
        throw new SocketParamError(SOCKET_ERROR.OPTIONS, 'net.socket: "serverName" must be a string')
    }
    const name = value.trim().toLowerCase().replace(/^\[|\]$/g, '')
    if (!name) return fallbackHost
    if (name.length > 253 || (!/^[a-z0-9._-]+$/.test(name) && isIP(name) === 0)) {
        throw new SocketParamError(SOCKET_ERROR.OPTIONS, 'net.socket: "serverName" must be a hostname')
    }
    return name
}

/**
 * Normalize a connection request into the shape the session keeps.
 *
 * @param {unknown} raw
 * @returns {{
 *   host: string, port: number, protocol: 'tcp'|'tls', serverName: string,
 *   tlsMode: 'strict'|'relaxed', timeoutMs: number, connectTimeoutMs: number, label: string,
 * }}
 */
export function normalizeSocketOpenOptions(raw) {
    const params = asRecord(raw)
    const host = normalizeSocketHost(params.host)
    const port = normalizeSocketPort(params.port)
    const protocol = normalizeSocketProtocol(params.protocol)
    const tlsMode = normalizeTlsMode(params.tlsMode)
    // A relaxed policy on a plain TCP stream is meaningless; refuse instead of
    // silently ignoring it, so the caller learns the flag did nothing.
    if (protocol === 'tcp' && params.tlsMode !== undefined && params.tlsMode !== 'strict') {
        throw new SocketParamError(
            SOCKET_ERROR.OPTIONS,
            'net.socket: "tlsMode" only applies to protocol "tls"',
        )
    }
    return {
        host,
        port,
        protocol,
        serverName: normalizeServerName(params.serverName, host),
        tlsMode,
        timeoutMs: clampNumber(params.timeoutMs, SOCKET_MIN_TIMEOUT_MS, SOCKET_MAX_TIMEOUT_MS, SOCKET_DEFAULT_TIMEOUT_MS),
        connectTimeoutMs: clampNumber(
            params.connectTimeoutMs,
            SOCKET_MIN_CONNECT_TIMEOUT_MS,
            SOCKET_MAX_CONNECT_TIMEOUT_MS,
            SOCKET_DEFAULT_CONNECT_TIMEOUT_MS,
        ),
        label: normalizeSocketLabel(params.label, host, port),
    }
}

/**
 * A human label for the consent dialog and the grant key. Sanitized hard: it is
 * rendered in a modal, and it keys a permission, so control characters and
 * host/path-like noise are stripped rather than displayed.
 */
export function normalizeSocketLabel(value, host, port) {
    if (typeof value !== 'string') return `${host}:${port}`
    const label = value
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 120)
    return label || `${host}:${port}`
}

/** Validate one base64 write payload and return the decoded byte length. */
export function normalizeSocketWritePayload(value) {
    if (typeof value !== 'string') {
        throw new SocketParamError(SOCKET_ERROR.PAYLOAD, 'net.socket: "dataBase64" must be a string')
    }
    if (value.length === 0) {
        throw new SocketParamError(SOCKET_ERROR.PAYLOAD, 'net.socket: "dataBase64" must not be empty')
    }
    // 4 base64 chars carry 3 bytes; reject before decoding so a huge payload
    // never gets materialized.
    if (Math.ceil((value.length * 3) / 4) > SOCKET_MAX_WRITE_BYTES) {
        throw new SocketParamError(
            SOCKET_ERROR.PAYLOAD,
            `net.socket: "dataBase64" decodes to more than ${SOCKET_MAX_WRITE_BYTES} bytes`,
        )
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
        throw new SocketParamError(SOCKET_ERROR.PAYLOAD, 'net.socket: "dataBase64" is not valid base64')
    }
    const buffer = Buffer.from(value, 'base64')
    if (!buffer.length) {
        throw new SocketParamError(SOCKET_ERROR.PAYLOAD, 'net.socket: "dataBase64" decoded to zero bytes')
    }
    return buffer
}

/** Validate a session id (the host generates them; a caller just echoes one). */
export function normalizeSessionId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
        throw new SocketParamError(SOCKET_ERROR.PAYLOAD, 'net.socket: "sessionId" is malformed')
    }
    return value
}

/**
 * Turn a socket failure into the message a plugin sees. DNS/TLS/ECONNREFUSED
 * messages are useful as-is; the prefix keeps it obvious which capability
 * produced them.
 */
export function socketErrorMessage(host, port, error) {
    const detail = error instanceof Error ? error.message : String(error)
    return `net.socket: cannot use ${host}:${port} (${detail})`
}
