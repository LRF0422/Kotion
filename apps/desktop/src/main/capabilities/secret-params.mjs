/**
 * Parameter normalization for the `storage.secret.*` capability group.
 *
 * Pure functions over plain values — no `electron`, no `node:fs`, no state — so
 * the rules a plugin's payload has to satisfy are testable in isolation and are
 * the same rules the main process enforces (see ./secrets.mjs).
 *
 * The shape of the guarantees:
 *   - a namespace is a **plugin-scoped** prefix (`plugin.<key>.…`) or an app area
 *     (`app.<area>`), never an empty string: it is what `clear`/`namespaces`
 *     group by, and what keeps one plugin's `clear` from being able to name
 *     another plugin's data;
 *   - a key is a short, boring token (letters/digits/`.`/`_`/`-`): it ends up in
 *     error messages and in the on-disk map, and a key that needs escaping is a
 *     key somebody is trying to smuggle something through;
 *   - values are strings with a hard byte cap. A secret is a token, not a
 *     document; the cap keeps one abusive write from turning the keystore into
 *     an unbounded blob store.
 */

/** Hard ceiling for one ciphertext entry, in plaintext bytes (UTF-8). */
export const SECRET_MAX_VALUE_BYTES = 64 * 1024

/** Hard ceiling for one key, in characters. */
export const SECRET_MAX_KEY_LENGTH = 128

/** Hard ceiling for one namespace, in characters. */
export const SECRET_MAX_NAMESPACE_LENGTH = 96

/** Keys per namespace, so `list` stays bounded. */
export const SECRET_MAX_ENTRIES_PER_NAMESPACE = 256

const NAMESPACE_RE = /^(?:plugin|app)\.[A-Za-z0-9][A-Za-z0-9._-]*$/
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** Why a payload was refused; the caller maps this to a code + message. */
export const SECRET_ERROR = {
    NAMESPACE: 'SECRET_INVALID_NAMESPACE',
    KEY: 'SECRET_INVALID_KEY',
    TOO_LARGE: 'SECRET_TOO_LARGE',
    NO_KEYCHAIN: 'SECRET_NO_KEYCHAIN',
}

/** A validation failure that still has to travel to the renderer as data. */
export class SecretParamError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'SecretParamError'
        this.code = code
    }
}

/**
 * Normalize a namespace.
 *
 * Accepts `plugin.<key>` / `app.<area>` with dotted or dashed tails. The
 * `plugin.` prefix is the documented convention for plugin-owned secrets; the
 * host cannot prove which plugin is calling (no plugin-vs-plugin sandbox exists
 * in this shell), so this is a naming contract plus an input guard, not an
 * access-control boundary — see docs/PLUGIN_SECRETS.md.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSecretNamespace(value) {
    if (typeof value !== 'string') {
        throw new SecretParamError(SECRET_ERROR.NAMESPACE, 'storage.secret: "namespace" must be a string')
    }
    const namespace = value.trim()
    if (!namespace) {
        throw new SecretParamError(SECRET_ERROR.NAMESPACE, 'storage.secret: "namespace" is required')
    }
    if (namespace.length > SECRET_MAX_NAMESPACE_LENGTH) {
        throw new SecretParamError(
            SECRET_ERROR.NAMESPACE,
            `storage.secret: "namespace" is longer than ${SECRET_MAX_NAMESPACE_LENGTH} characters`,
        )
    }
    if (!NAMESPACE_RE.test(namespace)) {
        throw new SecretParamError(
            SECRET_ERROR.NAMESPACE,
            'storage.secret: "namespace" must start with "plugin." or "app." (letters, digits, dot, dash, underscore)',
        )
    }
    // A trailing/duplicated separator invites prefix confusion in `clear`.
    if (/[.\-_]$/.test(namespace) || /\.\./.test(namespace)) {
        throw new SecretParamError(SECRET_ERROR.NAMESPACE, 'storage.secret: "namespace" has a malformed separator')
    }
    return namespace
}

/**
 * Normalize a secret key.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSecretKey(value) {
    if (typeof value !== 'string') {
        throw new SecretParamError(SECRET_ERROR.KEY, 'storage.secret: "key" must be a string')
    }
    const key = value.trim()
    if (!key) {
        throw new SecretParamError(SECRET_ERROR.KEY, 'storage.secret: "key" is required')
    }
    if (key.length > SECRET_MAX_KEY_LENGTH) {
        throw new SecretParamError(
            SECRET_ERROR.KEY,
            `storage.secret: "key" is longer than ${SECRET_MAX_KEY_LENGTH} characters`,
        )
    }
    if (!KEY_RE.test(key)) {
        throw new SecretParamError(
            SECRET_ERROR.KEY,
            'storage.secret: "key" may only contain letters, digits, dot, dash and underscore',
        )
    }
    return key
}

/** UTF-8 byte length (the cap that matters, not the UTF-16 length). */
export function secretByteLength(value) {
    return Buffer.byteLength(value, 'utf8')
}

/**
 * Normalize a secret value. Empty strings are allowed (a plugin may want to
 * record "configured, but blank"), and are still encrypted.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSecretValue(value) {
    if (typeof value !== 'string') {
        throw new SecretParamError(SECRET_ERROR.KEY, 'storage.secret: "value" must be a string')
    }
    if (secretByteLength(value) > SECRET_MAX_VALUE_BYTES) {
        throw new SecretParamError(
            SECRET_ERROR.TOO_LARGE,
            `storage.secret: "value" is larger than ${SECRET_MAX_VALUE_BYTES} bytes`,
        )
    }
    return value
}

/**
 * Map any thrown value from this module (or a store failure) onto the
 * `{ok, code, error}` shape the capability answers with.
 *
 * @param {unknown} error
 * @returns {{ ok: false, code: string, error: string }}
 */
export function secretFailure(error) {
    const code = typeof error?.code === 'string' ? error.code : 'SECRET_FAILED'
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, code, error: message }
}
