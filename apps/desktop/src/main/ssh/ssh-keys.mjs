/**
 * SSH capability — credentials and host-key trust (main process).
 *
 * `ssh2` is a library, not the `ssh` binary: it does not read `~/.ssh/config`,
 * `known_hosts` or the agent for us. This module is the replacement for the two
 * things that actually matter, and nothing more:
 *
 * - **Auth material**: the ssh-agent socket plus the user's default identity
 *   files. Plugins never supply a password or a key (see `ssh-params.mjs`).
 * - **Host-key verification**: `strict` requires the server key to be present in
 *   the user's `known_hosts` — including the default **hashed** form
 *   (`HashKnownHosts yes`), which is why this file implements the HMAC check
 *   rather than a substring match. `accept-new` learns the key and remembers it
 *   in a store the host owns, so a later key change still fails loudly.
 *
 * Pure Node (no ssh2, no electron): the parsing and the trust decisions are unit
 * tested directly, and the caller injects the store.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Identity files ssh itself would try, most preferred first. */
export const DEFAULT_IDENTITY_FILES = ['id_ed25519', 'id_ecdsa', 'id_rsa', 'id_dsa']

/** Ports ssh omits from a `known_hosts` host field. */
const DEFAULT_PORT = 22

const asString = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * The `known_hosts` host field for one target.
 *
 * Non-default ports use the bracketed form (`[host]:2222`) — the same rule ssh
 * applies, and the reason a plain `host` match must not be accepted for a
 * nonstandard port.
 */
export const knownHostsName = (host, port = DEFAULT_PORT) =>
    port === DEFAULT_PORT ? host : `[${host}]:${port}`

/** Everything ssh would consider for this target. */
export const knownHostsNames = (host, port = DEFAULT_PORT) =>
    port === DEFAULT_PORT ? [host] : [`[${host}]:${port}`]

/**
 * Parse a `known_hosts` file.
 *
 * Returns entries as `{ names, keyType, key }` where `key` is the base64 key
 * blob. Hashed entries keep their `|1|salt|hash` marker in `names` so
 * {@link matchKnownHost} can verify them.
 */
export const parseKnownHosts = (text) => {
    const entries = []
    for (const rawLine of String(text ?? '').split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#') || line.startsWith('@')) continue
        const parts = line.split(/\s+/)
        if (parts.length < 3) continue
        const [nameField, keyType, key] = parts
        if (!keyType || !key) continue
        entries.push({ names: nameField.split(','), keyType, key })
    }
    return entries
}

/** Read the user's known_hosts, tolerating its absence. */
export const readKnownHosts = ({ homeDir = homedir() } = {}) => {
    const path = join(homeDir, '.ssh', 'known_hosts')
    try {
        return parseKnownHosts(readFileSync(path, 'utf8'))
    } catch {
        return []
    }
}

/** The raw base64 blob of a key ssh2 handed us (`Buffer` or string). */
const keyBlob = (key) => (Buffer.isBuffer(key) ? key : Buffer.from(String(key), 'binary'))

/** Constant-time compare of two base64 blobs, tolerating padding differences. */
const sameKey = (a, b) => {
    const left = Buffer.from(asString(a), 'base64')
    const right = Buffer.from(asString(b), 'base64')
    if (left.length !== right.length || left.length === 0) return false
    return timingSafeEqual(left, right)
}

/**
 * Does a hashed `known_hosts` entry cover this name?
 *
 * Format: `|1|<base64 salt>|<base64 hmac-sha1(salt, name)>` — exactly what
 * OpenSSH writes with `HashKnownHosts yes` (the modern default), and why a
 * naive string comparison would silently fail to verify real users' files.
 */
export const matchHashedName = (entry, name) => {
    const [marker, saltPart, hashPart] = entry.split('|').slice(1)
    if (marker !== '1' || !saltPart || !hashPart) return false
    const salt = Buffer.from(saltPart, 'base64')
    const expected = Buffer.from(hashPart, 'base64')
    const actual = createHmac('sha1', salt).update(name).digest()
    return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** Match a parsed entry against the names ssh would try for this target. */
export const matchKnownHost = (entry, host, port = DEFAULT_PORT) => {
    const names = entry.names ?? []
    for (const candidate of knownHostsNames(host, port)) {
        if (names.includes(candidate)) return true
        for (const name of names) {
            if (name.startsWith('|') && matchHashedName(name, candidate)) return true
        }
    }
    return false
}

/**
 * Verdict for one presented host key.
 *
 * @returns {{ ok: boolean, reason?: string, fingerprint: string, learned: boolean }}
 */
export const verifyHostKey = ({ host, port = DEFAULT_PORT, key, entries = [], known = {}, policy = 'strict' }) => {
    const blob = keyBlob(key)
    const presented = blob.toString('base64')
    // OpenSSH's fingerprint format: base64(sha256(key blob)) without padding.
    // (The base64 of the blob itself is what `known_hosts` stores; the two must
    // not be confused — one is compared byte-wise, the other is shown to a human.)
    const fingerprint = `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`

    for (const entry of entries) {
        if (!matchKnownHost(entry, host, port)) continue
        if (sameKey(entry.key, presented)) return { ok: true, fingerprint, learned: false }
        return {
            ok: false,
            reason:
                `desktop ssh: HOST KEY CHANGED for ${knownHostsName(host, port)} — ` +
                'the server presented a different key than known_hosts has. Refusing ' +
                '(if the server was rebuilt intentionally, remove the old entry from ~/.ssh/known_hosts).',
            fingerprint,
            learned: false,
        }
    }

    const remembered = known[knownHostsName(host, port)]
    if (remembered) {
        if (remembered === presented) return { ok: true, fingerprint, learned: false }
        return {
            ok: false,
            reason:
                `desktop ssh: HOST KEY CHANGED for ${knownHostsName(host, port)} — ` +
                'this host trusted a different key on an earlier connection. Refusing.',
            fingerprint,
            learned: false,
        }
    }

    if (policy === 'accept-new') return { ok: true, fingerprint, learned: true }
    return {
        ok: false,
        reason:
            `desktop ssh: host key for ${knownHostsName(host, port)} is not in ~/.ssh/known_hosts. ` +
            'Connect once with the ssh command line (or use hostKeyPolicy: "accept-new" and let the user approve).',
        fingerprint,
        learned: false,
    }
}

/** Where the trust-on-first-use store lives for this app run. */
export const sshKnownHostsStorePath = (userDataDir) => join(userDataDir, 'ssh-known-hosts.json')

/** Read a TOFU store; anything unreadable degrades to "nothing known". */
export const readKnownHostStore = (path) => {
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'))
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

/** True when a key file exists and is a readable regular file. */
export const isReadableKeyFile = (path) => {
    try {
        return existsSync(path)
    } catch {
        return false
    }
}

/**
 * Auth material for `ssh2.Client.connect`.
 *
 * Plugins cannot supply credentials, so this is entirely the user's own
 * environment: the agent first (it can hold encrypted keys and 2FA-backed
 * ones), then the default identity files. `privateKey` is only attached when a
 * file actually exists, and `agent` only when the environment advertises one.
 */
export const buildAuthConfig = ({ homeDir = homedir(), env = process.env, readFile = readFileSync } = {}) => {
    const config = {}
    const agent = asString(env?.SSH_AUTH_SOCK)
    if (agent) config.agent = agent

    for (const name of DEFAULT_IDENTITY_FILES) {
        const path = join(homeDir, '.ssh', name)
        if (!isReadableKeyFile(path)) continue
        try {
            config.privateKey = readFile(path)
            config.__identityFile = path
            break
        } catch {
            /* unreadable: fall through to the next candidate */
        }
    }
    return config
}

/** Human summary of where auth came from (for the confirmation dialog). */
export const describeAuth = (config = {}) => {
    const parts = []
    if (config.__identityFile) parts.push(config.__identityFile)
    if (config.agent) parts.push('ssh-agent')
    return parts.join(' + ') || 'no key or agent found'
}
