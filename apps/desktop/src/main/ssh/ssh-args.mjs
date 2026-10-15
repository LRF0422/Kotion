/**
 * SSH capability — parameter validation and argv construction (main process).
 *
 * Pure on purpose: no child_process, no electron, no filesystem, so the whole
 * request contract is exercisable in plain Node (`ssh.test.mjs`). The runner
 * (`ssh-runner.mjs`) spawns; this module is the only place that decides what the
 * `ssh` / `scp` binaries are told.
 *
 * Security posture (this is the app's remote-code-execution surface):
 *
 * - **The host never receives credentials.** Auth is whatever the user already
 *   configured (`~/.ssh/config`, keys, agent). `BatchMode=yes` means ssh can
 *   never sit on a password prompt: an unauthenticated host fails fast instead
 *   of hanging the main process behind an invisible prompt.
 * - **Callers cannot inject options.** Targets are charset-validated and a
 *   leading `-` is refused, so nothing from a plugin can turn into an ssh flag;
 *   the remote command travels as the final positional argument and never
 *   through a shell.
 * - **Host key policy is explicit.** It defaults to `strict` (the user's
 *   known_hosts decides). `accept-new` (trust on first use) is allowed, but the
 *   user is shown which policy a caller asked for before any connection.
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
const MAX_HOST_CHARS = 253
const MAX_USER_CHARS = 64

/** Hostnames, IPv4 and (bare) IPv6 literals. */
const HOST_CHARS = /^[A-Za-z0-9._:%-]+$/
const USER_CHARS = /^[A-Za-z0-9._-]+$/

/** What the ssh host-key policy flag expands to. */
const HOST_KEY_FLAG = {
    strict: 'yes',
    'accept-new': 'accept-new',
}

const asString = (value) => (typeof value === 'string' ? value.trim() : '')

/** Validate and clamp a requested timeout. */
export const clampSshTimeout = (value) =>
    Math.min(Math.max(Number(value) || DEFAULT_SSH_TIMEOUT_MS, 1_000), MAX_SSH_TIMEOUT_MS)

/** Validate and clamp the combined stdout+stderr byte budget. */
export const clampSshOutputBytes = (value) =>
    Math.min(Math.max(Number(value) || DEFAULT_SSH_OUTPUT_BYTES, 4_096), MAX_SSH_OUTPUT_BYTES)

/** Coerce a requested host-key policy; unknown values fall back to `strict`. */
export const normalizeHostKeyPolicy = (value) =>
    SSH_HOST_KEY_POLICIES.includes(value) ? value : DEFAULT_SSH_HOST_KEY_POLICY

/**
 * Validate `{ host, user, port }`.
 *
 * Brackets around an IPv6 literal are accepted and stripped — ssh itself wants
 * the bare address.
 */
export const normalizeSshTarget = (raw = {}) => {
    if (!raw || typeof raw !== 'object') throw new Error('desktop ssh: target must be an object')
    let host = asString(raw.host)
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
    if (!host) throw new Error('desktop ssh: "host" is required')
    // A leading dash would be read as an ssh option: refuse instead of quoting.
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
};

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

/** The remote path travels inside an `scp` positional argument, so `-` is the only hazard. */
export const normalizeRemotePath = (value, field = 'remotePath') => {
    const path = asString(value)
    if (!path) throw new Error(`desktop ssh: "${field}" is required`)
    if (path.startsWith('-')) throw new Error(`desktop ssh: "${field}" must not start with "-"`)
    if (/[\r\n\u0000]/.test(path)) throw new Error(`desktop ssh: "${field}" must not contain control characters`)
    return path
}

/**
 * Options shared by `ssh` and `scp`.
 *
 * `BatchMode=yes` is what keeps an unauthenticated host from blocking on a
 * prompt the user cannot see; `-o ConnectTimeout` bounds the TCP+handshake
 * phase separately from the command timeout.
 */
export const buildCommonSshArgs = ({ target, hostKeyPolicy, connectTimeoutMs, portFlag = '-p' }) => {
    const args = [
        '-o',
        'BatchMode=yes',
        '-o',
        `StrictHostKeyChecking=${HOST_KEY_FLAG[hostKeyPolicy]}`,
        '-o',
        `ConnectTimeout=${Math.max(1, Math.ceil(Math.min(connectTimeoutMs, 60_000) / 1000))}`,
    ]
    if (target.port !== SSH_DEFAULT_PORT) args.push(portFlag, String(target.port))
    if (target.user) args.push('-l', target.user)
    return args
}

/** ssh argv after the binary name: options, host, command. */
export const buildSshArgs = ({ target, command, hostKeyPolicy, connectTimeoutMs }) => [
    ...buildCommonSshArgs({ target, hostKeyPolicy, connectTimeoutMs }),
    // No pseudo-tty: stdout stays clean data instead of becoming a terminal.
    '-T',
    target.host,
    command,
]

/**
 * scp argv after the binary name.
 *
 * `scp` is used instead of an `sftp -b -` batch because it takes paths as
 * argv entries: a path with spaces (or any quoting character) never has to be
 * escaped into a batch file that a second parser would re-read.
 */
export const buildScpArgs = ({ target, direction, localPath, remotePath, hostKeyPolicy, connectTimeoutMs }) => {
    // scp spells its port flag `-P` (lowercase `-p` means "preserve times").
    const args = buildCommonSshArgs({ target, hostKeyPolicy, connectTimeoutMs, portFlag: '-P' })
    const remote = `${target.user ? `${target.user}@` : ''}${target.host}:${remotePath}`
    return direction === 'put' ? [...args, localPath, remote] : [...args, remote, localPath]
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
