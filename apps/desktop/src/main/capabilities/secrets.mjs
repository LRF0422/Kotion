/**
 * Plugin-scoped encrypted key-value storage — the `storage.secret.*` backend.
 *
 * Why this exists next to `storage.*`: durable KV is transparent to every
 * plugin, so a refresh token kept there is one `storage.list` call away from any
 * other plugin, and today most plugins have nowhere honest to put a credential
 * and end up with it in `localStorage` as plaintext. This is the place that is
 * *supposed* to hold one:
 *
 *   - only ciphertext reaches disk: every value is sealed with Electron's
 *     `safeStorage` (macOS Keychain / Windows DPAPI / Linux libsecret), exactly
 *     like `credentials.*` and `ssh.credentials*`;
 *   - the file is `<userData>/plugin-secrets.json`, mode 0600, written whole and
 *     atomically (temp file + rename) so a crash cannot truncate the keystore;
 *   - when the OS cannot genuinely encrypt (no keyring; on Linux
 *     `getSelectedStorageBackend() === 'basic_text'`), **writes are refused**
 *     rather than quietly "encrypting" behind a hardcoded key. Reading an
 *     existing keystore still works when the keychain is merely busy;
 *   - `list` is metadata only; `get` is the single deliberate door that returns
 *     plaintext to the caller, because a plugin cannot use a token it may not
 *     read. That door is not access-controlled per plugin: this shell has no
 *     plugin-vs-plugin isolation (all plugins are trusted bundles), so what this
 *     buys is an *at-rest* and *accidental-exposure* guarantee, not a boundary
 *     between plugins. Say so in the docs rather than implying otherwise.
 *
 * The module is electron-free: the store takes its file I/O and its seal/open
 * primitives as options, so the check suite can drive every branch with a fake
 * keystore. `setupSecretBridge` in ./secrets.ts supplies the Electron pieces.
 */

import { randomUUID } from 'node:crypto'
import {
    chmodSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
    SECRET_ERROR,
    SECRET_MAX_ENTRIES_PER_NAMESPACE,
    SecretParamError,
    normalizeSecretKey,
    normalizeSecretNamespace,
    normalizeSecretValue,
    secretByteLength,
    secretFailure,
} from './secret-params.mjs'

/** On-disk version. Bump only with a migration in `readFile`. */
export const SECRET_FILE_VERSION = 1

/** File name under `<userData>`, next to `login-credentials.json`. */
export const SECRET_FILE_NAME = 'plugin-secrets.json'

/**
 * @typedef {object} StoredSecret
 * @property {string} cipher base64 `safeStorage.encryptString(value)`
 * @property {number} size plaintext byte length (metadata; not a leak beyond "how long")
 * @property {number} createdAt epoch ms
 * @property {number} updatedAt epoch ms
 *
 * @typedef {object} StoredFile
 * @property {number} version
 * @property {Record<string, Record<string, StoredSecret>>} namespaces
 *
 * @typedef {object} SecretStoreOptions
 * @property {() => string} filePath resolves the keystore path lazily (app paths are only valid after ready)
 * @property {(plain: string) => string} encrypt returns base64 ciphertext
 * @property {(cipher: string) => string} decrypt returns the plaintext (may throw)
 * @property {() => boolean} canEncrypt false when the OS cannot encrypt at rest
 * @property {(message: string) => void} [log]
 */

const emptyFile = () => ({ version: SECRET_FILE_VERSION, namespaces: {} })

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * Read + sanitize the keystore. A malformed or unreadable file degrades to an
 * empty store: losing secrets is bad, but throwing on every call would make the
 * whole capability unusable and hide the real problem (the file stays on disk
 * untouched — nothing here rewrites it until the next successful write).
 *
 * @param {SecretStoreOptions} options
 * @returns {StoredFile}
 */
export function readSecretFile(options) {
    let raw
    try {
        raw = readFileSync(options.filePath(), 'utf8')
    } catch {
        return emptyFile()
    }
    let parsed
    try {
        parsed = JSON.parse(raw)
    } catch {
        options.log?.('[secrets] keystore is not valid JSON; starting empty')
        return emptyFile()
    }
    if (!isPlainObject(parsed) || parsed.version !== SECRET_FILE_VERSION || !isPlainObject(parsed.namespaces)) {
        options.log?.('[secrets] keystore has an unknown shape; starting empty')
        return emptyFile()
    }
    /** @type {StoredFile} */
    const file = emptyFile()
    for (const [namespace, entries] of Object.entries(parsed.namespaces)) {
        if (!isPlainObject(entries)) continue
        const clean = {}
        for (const [key, entry] of Object.entries(entries)) {
            if (!isPlainObject(entry) || typeof entry.cipher !== 'string' || !entry.cipher) continue
            clean[key] = {
                cipher: entry.cipher,
                size: typeof entry.size === 'number' && entry.size >= 0 ? entry.size : 0,
                createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
                updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
            }
        }
        if (Object.keys(clean).length) file.namespaces[namespace] = clean
    }
    return file
}

/**
 * Write the keystore atomically with owner-only permissions.
 *
 * temp-file + rename inside the same directory, so a reader either sees the
 * previous file or the new one — never a half-written JSON that parses into an
 * empty keystore.
 *
 * @param {SecretStoreOptions} options
 * @param {StoredFile} file
 */
export function writeSecretFile(options, file) {
    const target = options.filePath()
    mkdirSync(dirname(target), { recursive: true })
    const temp = `${target}.${randomUUID()}.tmp`
    try {
        writeFileSync(temp, JSON.stringify(file, null, 2), { encoding: 'utf8', mode: 0o600 })
        try {
            chmodSync(temp, 0o600)
        } catch {
            // Windows has no POSIX mode bits; the mode option already applied.
        }
        renameSync(temp, target)
    } catch (error) {
        try {
            rmSync(temp, { force: true })
        } catch {
            /* best effort */
        }
        throw error
    }
}

/** Metadata-only view of one entry. */
const toMetadata = (key, entry) => ({
    key,
    size: entry.size,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
})

/**
 * Bind the store to one keystore file.
 *
 * @param {SecretStoreOptions} options
 */
export function createSecretStore(options) {
    /** Cache so two reads in a row do not hit the disk twice. */
    let cache = null

    const load = () => {
        if (!cache) cache = readSecretFile(options)
        return cache
    }

    const flush = (file) => {
        writeSecretFile(options, file)
        cache = file
    }

    const assertEncryptable = () => {
        if (!options.canEncrypt()) {
            throw new SecretParamError(
                SECRET_ERROR.NO_KEYCHAIN,
                'storage.secret: the OS keychain is unavailable, so the value cannot be encrypted at rest; refusing to store it in the clear',
            )
        }
    }

    const entryOf = (namespace, key) => {
        const file = readSecretFile(options)
        return { file, entry: file.namespaces[namespace]?.[key] }
    }

    return {
        /** Whether this machine can encrypt at rest right now. */
        available: () => {
            try {
                return Boolean(options.canEncrypt())
            } catch {
                return false
            }
        },

        /**
         * Encrypt + persist one secret. Replaces an existing key, keeping the
         * original `createdAt`.
         *
         * @param {{ namespace: unknown, key: unknown, value: unknown }} input
         * @returns {{ ok: true, metadata: object } | { ok: false, code: string, error: string }}
         */
        set(input) {
            try {
                const namespace = normalizeSecretNamespace(input?.namespace)
                const key = normalizeSecretKey(input?.key)
                const value = normalizeSecretValue(input?.value)
                assertEncryptable()

                const file = readSecretFile(options)
                const bucket = file.namespaces[namespace] ?? (file.namespaces[namespace] = {})
                const existing = bucket[key]
                if (!existing && Object.keys(bucket).length >= SECRET_MAX_ENTRIES_PER_NAMESPACE) {
                    throw new SecretParamError(
                        SECRET_ERROR.TOO_LARGE,
                        `storage.secret: namespace "${namespace}" already holds ${SECRET_MAX_ENTRIES_PER_NAMESPACE} secrets`,
                    )
                }
                const now = Date.now()
                const cipher = options.encrypt(value)
                if (typeof cipher !== 'string' || !cipher) {
                    throw new Error('storage.secret: the keystore returned no ciphertext')
                }
                const entry = {
                    cipher,
                    size: secretByteLength(value),
                    createdAt: existing?.createdAt || now,
                    updatedAt: now,
                }
                bucket[key] = entry
                flush(file)
                return { ok: true, metadata: toMetadata(key, entry) }
            } catch (error) {
                return secretFailure(error)
            }
        },

        /**
         * Read one secret, plaintext. `null` when it is absent; the shape stays
         * honest when it is present but undecryptable (keychain rotated), by
         * answering `value: ''` with `decrypted: false` instead of pretending it
         * does not exist — a UI can then say "re-enter it".
         *
         * @param {{ namespace: unknown, key: unknown }} input
         * @returns {{ key: string, size: number, createdAt: number, updatedAt: number, value: string, decrypted: boolean } | null}
         */
        get(input) {
            const namespace = normalizeSecretNamespace(input?.namespace)
            const key = normalizeSecretKey(input?.key)
            const { entry } = entryOf(namespace, key)
            if (!entry) return null
            try {
                const value = options.decrypt(entry.cipher)
                return { ...toMetadata(key, entry), value, decrypted: true }
            } catch (error) {
                options.log?.(`[secrets] could not decrypt ${namespace}/${key}: ${String(error)}`)
                return { ...toMetadata(key, entry), value: '', decrypted: false }
            }
        },

        /** `true` when the key exists, without touching the ciphertext. */
        has(input) {
            const namespace = normalizeSecretNamespace(input?.namespace)
            const key = normalizeSecretKey(input?.key)
            const { entry } = entryOf(namespace, key)
            return Boolean(entry)
        },

        /**
         * Metadata for one namespace, ordered by key. Never decrypts.
         *
         * @param {{ namespace: unknown }} input
         */
        list(input) {
            const namespace = normalizeSecretNamespace(input?.namespace)
            const file = load()
            const bucket = file.namespaces[namespace] ?? {}
            return Object.entries(bucket)
                .map(([key, entry]) => toMetadata(key, entry))
                .sort((a, b) => a.key.localeCompare(b.key))
        },

        /**
         * Remove one secret.
         *
         * @param {{ namespace: unknown, key: unknown }} input
         */
        remove(input) {
            try {
                const namespace = normalizeSecretNamespace(input?.namespace)
                const key = normalizeSecretKey(input?.key)
                const file = readSecretFile(options)
                const bucket = file.namespaces[namespace]
                if (!bucket || !bucket[key]) return { ok: true }
                delete bucket[key]
                if (!Object.keys(bucket).length) delete file.namespaces[namespace]
                flush(file)
                return { ok: true }
            } catch (error) {
                return secretFailure(error)
            }
        },

        /**
         * Drop one namespace. Answers with how many secrets were removed, so the
         * caller can tell "cleared 3" from "there was nothing there".
         *
         * @param {{ namespace: unknown }} input
         */
        clear(input) {
            const namespace = normalizeSecretNamespace(input?.namespace)
            const file = readSecretFile(options)
            const bucket = file.namespaces[namespace]
            if (!bucket) return 0
            const count = Object.keys(bucket).length
            delete file.namespaces[namespace]
            flush(file)
            return count
        },

        /** Namespaces holding at least one secret (metadata only). */
        namespaces() {
            const file = load()
            return Object.entries(file.namespaces)
                .map(([namespace, bucket]) => ({ namespace, count: Object.keys(bucket).length }))
                .filter((entry) => entry.count > 0)
                .sort((a, b) => a.namespace.localeCompare(b.namespace))
        },
    }
}

/**
 * Resolve the keystore path under `userData`, and (defensively) make sure the
 * directory exists before the first write.
 *
 * @param {string} userDataPath
 */
export function secretFilePath(userDataPath) {
    return join(userDataPath, SECRET_FILE_NAME)
}

/** Whether this profile already has a keystore on disk (diagnostics only). */
export function secretFileExists(filePath) {
    try {
        return statSync(filePath).isFile()
    } catch {
        return false
    }
}

/**
 * The seal/open primitives for a host without `safeStorage` — used only when
 * `canEncrypt()` is false, in which case writes are refused; reads still call
 * `decrypt`, and this placeholder reports the refusal the same way a wrong
 * keychain would. Kept here so the store never has to branch on Electron.
 */
export const unavailableKeychain = {
    encrypt() {
        throw new SecretParamError(SECRET_ERROR.NO_KEYCHAIN, 'storage.secret: no OS keychain is available')
    },
    decrypt() {
        throw new Error('storage.secret: no OS keychain is available')
    },
}

/** Exported for the check suite: the temp directory a keystore may live under. */
export const secretTempRoot = () => join(tmpdir(), 'kn-plugin-secrets')
