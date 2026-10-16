/**
 * SSH capability — request validation (main process).
 *
 * Pure: no ssh2, no electron, no filesystem, so the whole request contract is
 * exercisable in plain Node. What survives from the spawn-based design is the
 * part that matters for safety: targets, commands, remote paths, budgets and
 * the network-policy wording. What is gone is argv construction — the protocol
 * runs through `ssh2` now (`ssh-client.mjs`), so there is no flag surface left
 * to protect.
 *
 * Security posture:
 * - **The host never receives credentials.** Auth is the user's ssh-agent and
 *   their default identity files (see `ssh-keys.mjs`).
 * - **Host key policy is explicit.** `strict` requires the server key to be in
 *   `known_hosts`; `accept-new` is trust-on-first-use and is remembered in a
 *   store the host owns. The user is shown which policy a caller asked for
 *   before any connection.
 */

/** Host-key verification policies a caller may request. */
export const SSH_HOST_KEY_POLICIES = ['strict', 'accept-new']
export const DEFAULT_SSH_HOST_KEY_POLICY = 'strict'
export const SSH_DEFAULT_PORT = 22
export const DEFAULT_SSH_TIMEOUT_MS = 30_000
export const MAX_SSH_TIMEOUT_MS = 600_000
export const DEFAULT_SSH_OUTPUT_BYTES = 1024 * 1024
export const MAX_SSH_OUTPUT_BYTES = 4 * 1024 * 1024
export const MAX_SSH_COMMAND_CHARS = 8192
export const MAX_SFTP_ENTRIES = 2000
export const MAX_TERM_CHARS = 32
export const MAX_SHELL_COLS = 500
export const MAX_SHELL_ROWS = 300
const MAX_HOST_CHARS = 253
const MAX_USER_CHARS = 64

/** Hostnames, IPv4 and (bare) IPv6 literals. */
const HOST_CHARS = /^[A-Za-z0-9._:%-]+$/
const USER_CHARS = /^[A-Za-z0-9._-]+$/
const SESSION_ID_CHARS = /^[A-Za-z0-9_-]{1,64}$/

const asString = (value) => (typeof value === 'string' ? value.trim() : '')

/** Validate and clamp a requested timeout. */
export const clampSshTimeout = (value) =>
    Math.min(Math.max(Number(value) || DEFAULT_SSH_TIMEOUT_MS, 1_000), MAX_SSH_TIMEOUT_MS)

/** Validate and clamp a byte budget. */
export const clampSshOutputBytes = (value) =>
    Math.min(Math.max(Number(value) || DEFAULT_SSH_OUTPUT_BYTES, 4_096), MAX_SSH_OUTPUT_BYTES)

/** Coerce a requested host-key policy; unknown values fall back to `strict`. */
export const normalizeHostKeyPolicy = (value) =>
    SSH_HOST_KEY_POLICIES.includes(value) ? value : DEFAULT_SSH_HOST_KEY_POLICY

/**
 * Validate `{ host, user, port }`.
 *
 * Brackets around an IPv6 literal are accepted and stripped. A leading `-` is
 * refused even though nothing is passed to an argv any more: such a host is a
 * typo or an attack, never a hostname.
 */
export const normalizeSshTarget = (raw = {}) => {
    if (!raw || typeof raw !== 'object') throw new Error('desktop ssh: target must be an object')
    let host = asString(raw.host)
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
    if (!host) throw new Error('desktop ssh: "host" is required')
    if (host.startsWith('-')) throw new Error('desktop ssh: "host" must not start with "-"')
    if (host.length > MAX_HOST_CHARS || !HOST_CHARS.test(host)) {
        throw new Error('desktop ssh: "host" contains unsupported characters')
    }

    let user = asString(raw.user)
    if (user) {
        if (user.startsWith('-')) throw new Error('desktop ssh: "user" must not start with "-"')
        if (user.length > MAX_USER_CHARS || !USER_CHARS.test(user)) {
            throw new Error('desktop ssh: "user" contains unsupported characters')
        }
    }

    let port = SSH_DEFAULT_PORT
    if (raw.port !== undefined && raw.port !== null && raw.port !== '') {
        port = Number(raw.port)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('desktop ssh: "port" must be an integer between 1 and 65535')
        }
    }

    return { host, user: user || null, port }
}

/** Stable identity of one grant: `user@host:port`. */
export const sshGrantKey = (target) => `${target.user ?? ''}@${target.host}:${target.port}`

/** Validate a remote command. Multi-line scripts are fine; NUL is not. */
export const normalizeSshCommand = (value) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('desktop ssh: "command" is required')
    }
    if (value.includes('\u0000')) throw new Error('desktop ssh: "command" must not contain NUL')
    if (value.length > MAX_SSH_COMMAND_CHARS) {
        throw new Error(`desktop ssh: "command" is too long (max ${MAX_SSH_COMMAND_CHARS} characters)`)
    }
    return value
}

/** Validate a remote path. Absolute or relative; no control characters. */
export const normalizeRemotePath = (value, field = 'remotePath') => {
    const path = asString(value)
    if (!path) throw new Error(`desktop ssh: "${field}" is required`)
    if (/[\r\n\u0000]/.test(path)) throw new Error(`desktop ssh: "${field}" must not contain control characters`)
    return path
}

/** Validate a shell-session id (they come back from the host, but never trust that). */
export const normalizeSessionId = (value) => {
    const id = asString(value)
    if (!id || !SESSION_ID_CHARS.test(id)) throw new Error('desktop ssh: invalid "sessionId"')
    return id
}

/** Validate the pty geometry a renderer asks for. */
export const normalizeShellSize = ({ cols, rows } = {}) => {
    const safeCols = Math.min(Math.max(Math.floor(Number(cols) || 80), 2), MAX_SHELL_COLS)
    const safeRows = Math.min(Math.max(Math.floor(Number(rows) || 24), 2), MAX_SHELL_ROWS)
    return { cols: safeCols, rows: safeRows }
}

/** Validate the TERM name (it reaches a remote `exec`, so keep it boring). */
export const normalizeTerm = (value) => {
    const term = asString(value) || 'xterm-256color'
    if (term.length > MAX_TERM_CHARS || !/^[A-Za-z0-9._-]+$/.test(term)) return 'xterm-256color'
    return term
}

/** Bytes accepted per shell `write` call. */
export const MAX_SHELL_WRITE_BYTES = 64 * 1024

/** Validate one chunk of terminal input. */
export const normalizeShellInput = (value) => {
    if (typeof value !== 'string') throw new Error('desktop ssh: "data" must be a string')
    if (Buffer.byteLength(value, 'utf8') > MAX_SHELL_WRITE_BYTES) {
        throw new Error(`desktop ssh: "data" is too large (max ${MAX_SHELL_WRITE_BYTES} bytes per write)`)
    }
    return value
}

/** ssh-worded policy refusal (net-policy decides; this only phrases it). */
export const sshDenyReason = (verdict, { resolved = false } = {}) => {
    if (verdict === 'metadata') {
        return 'desktop ssh: cloud metadata addresses are always blocked'
    }
    if (resolved) {
        return 'desktop ssh: the host resolves to a private address, which is blocked ' +
            '(enable "allow private network" in Settings to reach LAN hosts)'
    }
    return 'desktop ssh: private and loopback addresses are blocked ' +
        '(enable "allow private network" in Settings to reach LAN hosts)'
}

/**
 * Incremental output collector with a hard byte budget.
 *
 * Capping while reading (rather than after) is what bounds memory when a remote
 * command streams gigabytes; `truncated` travels with the result so a clipped
 * log is never mistaken for a complete one.
 */
export const createOutputCollector = (maxBytes) => {
    const chunks = []
    let bytes = 0
    let truncated = false
    return {
        push(chunk) {
            if (truncated) return
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
            const room = maxBytes - bytes
            if (buffer.length > room) {
                if (room > 0) chunks.push(buffer.subarray(0, room))
                bytes = maxBytes
                truncated = true
                return
            }
            chunks.push(buffer)
            bytes += buffer.length
        },
        result() {
            return { text: Buffer.concat(chunks).toString('utf8'), truncated }
        },
    }
}
