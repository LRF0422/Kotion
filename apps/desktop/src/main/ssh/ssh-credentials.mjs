/**
 * SSH credentials the user stores in the host (main process).
 *
 * `ssh2` needs something to authenticate with. Agent + `~/.ssh/id_*` covers
 * key-based hosts, but plenty of servers only accept a password — and without a
 * place to put one, "SSH" means "cannot log in" there. This module is that
 * place, with the same trust model as `../credentials.ts` (the login keychain):
 *
 * - Secrets are encrypted with Electron's `safeStorage` (OS keychain) and only
 *   ciphertext is written, to `<userData>/ssh-credentials.json`.
 * - **The plugin never sees a secret.** `list` returns metadata; the only
 *   consumer of the plaintext is {@link resolveCredential}, called by the SSH
 *   client inside this process. A plugin passes a target (or an id), never a
 *   password or a key.
 * - **Fail closed when encryption is unavailable.** On a Linux box without a
 *   keyring `safeStorage` degrades to a fixed key ("basic_text"), which is not
 *   encryption; storing a password there would be worse than refusing. `set`
 *   returns an error and the UI explains it.
 *
 * Pure apart from the injected crypto/fs, so the storage and the
 * "metadata-only" guarantee are unit tested directly (`ssh.test.mjs`).
 */

/** How a credential authenticates. */
export const SSH_CREDENTIAL_KINDS = ['password', 'key']

/** Cap on what a user can paste in, so a mistake cannot balloon the file. */
export const MAX_PASSWORD_CHARS = 4096
export const MAX_PRIVATE_KEY_CHARS = 64 * 1024
export const MAX_LABEL_CHARS = 120

const FILE_VERSION = 1

const asString = (value) => (typeof value === 'string' ? value : '')

/** Stable identity of a credential: the target it belongs to. */
export const credentialTargetKey = ({ host, user, port }) => `${user ?? ''}@${host}:${port}`

/**
 * Shape of the on-disk file. Every secret field is base64 ciphertext.
 *
 * @typedef {{
 *   version: number,
 *   credentials: Array<{
 *     id: string,
 *     host: string,
 *     user: string | null,
 *     port: number,
 *     kind: 'password' | 'key',
 *     label?: string,
 *     secretCipher: string,
 *     passphraseCipher?: string,
 *     createdAt: number,
 *     updatedAt: number,
 *   }>,
 * }} SshCredentialFile
 */

/** An empty store. */
export const emptyStore = () => ({ version: FILE_VERSION, credentials: [] })

/** Read a store, tolerating absence/corruption by starting empty. */
export const readStore = (io) => {
    try {
        const raw = io.readFile()
        if (!raw) return emptyStore()
        const parsed = JSON.parse(raw)
        if (!parsed || !Array.isArray(parsed.credentials)) return emptyStore()
        return { version: FILE_VERSION, credentials: parsed.credentials }
    } catch {
        return emptyStore()
    }
}

const writeStore = (io, store) => {
    io.writeFile(JSON.stringify({ ...store, version: FILE_VERSION }, null, 2))
}

/** Public view of a credential: everything except the secret. */
export const toMetadata = (record) => ({
    id: record.id,
    host: record.host,
    user: record.user ?? null,
    port: record.port,
    kind: record.kind,
    label: record.label,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    hasPassphrase: Boolean(record.passphraseCipher),
    targetKey: credentialTargetKey(record),
})

/** List credentials as metadata; never returns ciphertext or plaintext. */
export const listCredentials = (io) =>
    readStore(io)
        .credentials.map(toMetadata)
        .sort((a, b) => a.targetKey.localeCompare(b.targetKey))

/**
 * Create or replace the credential for a target.
 *
 * Replacing keeps the original `id` so a plugin holding one keeps working after
 * the user rotates a password.
 */
export const setCredential = (io, input = {}) => {
    if (!io.canEncrypt()) {
        return {
            ok: false,
            error:
                'desktop ssh: this machine cannot encrypt secrets (no OS keychain), so nothing was stored. ' +
                'Use an ssh-agent or a key file instead.',
        }
    }
    const host = asString(input.host).trim()
    if (!host) return { ok: false, error: 'desktop ssh: "host" is required' }
    const port = Number(input.port) || 22
    const user = asString(input.user).trim() || null
    const kind = SSH_CREDENTIAL_KINDS.includes(input.kind) ? input.kind : 'password'
    const label = asString(input.label).trim().slice(0, MAX_LABEL_CHARS) || undefined
    const secret = asString(input.secret)
    const passphrase = asString(input.passphrase)

    if (kind === 'password') {
        if (!secret) return { ok: false, error: 'desktop ssh: a password is required' }
        if (secret.length > MAX_PASSWORD_CHARS) return { ok: false, error: 'desktop ssh: password is too long' }
    } else {
        if (!secret.trim()) return { ok: false, error: 'desktop ssh: a private key is required' }
        if (secret.length > MAX_PRIVATE_KEY_CHARS) return { ok: false, error: 'desktop ssh: private key is too long' }
        if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(secret)) {
            return { ok: false, error: 'desktop ssh: that does not look like a PEM private key' }
        }
    }

    const store = readStore(io)
    const targetKey = credentialTargetKey({ host, user, port })
    const existing = store.credentials.find((entry) => credentialTargetKey(entry) === targetKey)
    const now = Date.now()
    const record = {
        id: existing?.id ?? `sshcred-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        host,
        user,
        port,
        kind,
        ...(label ? { label } : {}),
        secretCipher: io.encrypt(secret),
        ...(kind === 'key' && passphrase ? { passphraseCipher: io.encrypt(passphrase) } : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    }
    store.credentials = [...store.credentials.filter((entry) => entry.id !== record.id), record]
    writeStore(io, store)
    return { ok: true, credential: toMetadata(record) }
}

/** Drop one credential by id. */
export const removeCredential = (io, id) => {
    const store = readStore(io)
    const next = store.credentials.filter((entry) => entry.id !== id)
    if (next.length === store.credentials.length) return { ok: false, error: 'desktop ssh: no such credential' }
    writeStore(io, { ...store, credentials: next })
    return { ok: true }
}

/**
 * Resolve what to authenticate with — **main process only**.
 *
 * `id` wins when given (the caller explicitly chose one); otherwise the
 * credential stored for this target is used. Returns `{}` when there is none,
 * so the caller can fall back to the agent / identity files.
 */
export const resolveCredential = (io, { id, host, user, port } = {}) => {
    const store = readStore(io)
    const record = id
        ? store.credentials.find((entry) => entry.id === id)
        : store.credentials.find((entry) => credentialTargetKey(entry) === credentialTargetKey({ host, user: user ?? null, port: port ?? 22 }))
    if (!record) return {}
    try {
        return {
            id: record.id,
            kind: record.kind,
            ...(record.kind === 'password'
                ? { password: io.decrypt(record.secretCipher) }
                : { privateKey: io.decrypt(record.secretCipher) }),
            ...(record.passphraseCipher ? { passphrase: io.decrypt(record.passphraseCipher) } : {}),
        }
    } catch {
        // A keychain that can no longer decrypt (profile moved machines, keyring
        // reset) must not silently become "no credential" without a trace.
        return { error: `desktop ssh: the stored credential "${record.id}" could not be decrypted (OS keychain changed?)` }
    }
}
