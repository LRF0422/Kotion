/**
 * Plugin secret-field helpers.
 *
 * Plugin configs used to be persisted verbatim — including `apiKey`,
 * `personalAccessToken`, `accessSecret`, … — into `localStorage` and into the
 * server's `wiki_plugin_config.config` JSON column. Both copies are now
 * ciphertext/masked, and the plaintext only ever lives in memory.
 *
 * The contract with the backend (`PluginConfigApplication` in knowledge-wiki):
 *
 * - The server never returns a stored secret. Every configured secret field is
 *   replaced by {@link SECRET_MASK} in the `config` payload it sends back.
 * - Posting {@link SECRET_MASK} for a field means "keep the stored value".
 * - Posting a real value stores it (encrypted) and replaces the old one.
 * - Posting `''` / `null` clears it.
 *
 * The mirrored Java implementation is `PluginSecretFields` — keep the suffix
 * table in sync when adding a new secret-bearing plugin.
 */

// ─── Sentinel ────────────────────────────────────────────────

/**
 * Placeholder written wherever a real secret would otherwise be persisted.
 * Value chosen to be obviously non-secret and impossible to confuse with a
 * credential a user could actually type.
 */
export const SECRET_MASK = '__KN_SECRET_MASK__'

/** True when a stored value is the redaction sentinel rather than a credential. */
export function isSecretMask(value: unknown): boolean {
    return value === SECRET_MASK
}

/**
 * True only for a usable plaintext credential.
 * Masks, `''`, `null`, `undefined` and non-strings are all "no value".
 */
export function hasSecretValue(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && !isSecretMask(value)
}

// ─── Field detection ─────────────────────────────────────────

/**
 * Normalized name suffixes that identify a credential. Matching is done on the
 * lowercased name with separators stripped so `api_key`, `apiKey` and `API-KEY`
 * all collapse to `apikey`.
 *
 * Suffix (not substring) matching is deliberate: it keeps `maxTokens`,
 * `tokenCount` and `cookiesEnabled` out of the secret set.
 */
const SECRET_FIELD_SUFFIXES: readonly string[] = [
    'apikey',
    'apisecret',
    'accesskey',
    'accesssecret',
    'secretkey',
    'clientsecret',
    'privatekey',
    'personalaccesstoken',
    'accesstoken',
    'authtoken',
    'bearertoken',
    'refreshtoken',
    'token',
    'password',
    'passwd',
    'pwd',
    'credential',
    'credentials',
    'authorization',
    'cookie',
    'secret',
]

function normalizeFieldName(name: string): string {
    return name.replace(/[-_\s]/g, '').toLowerCase()
}

/** Heuristic: does this config field name look like it holds a credential? */
export function isSecretFieldName(name: string): boolean {
    const normalized = normalizeFieldName(name)
    return SECRET_FIELD_SUFFIXES.some(
        (suffix) => normalized === suffix || normalized.endsWith(suffix),
    )
}

/** Config fields whose names look like credentials. */
export function detectSecretFields(config: Record<string, unknown>): string[] {
    return Object.keys(config).filter(isSecretFieldName)
}

/**
 * The authoritative secret-field set for one config: an explicit plugin
 * declaration wins, and the name heuristic is unioned in so a plugin that
 * forgets to declare a credential still gets redacted.
 */
export function resolveSecretFields(
    config: Record<string, unknown> | null | undefined,
    declared?: readonly string[],
): string[] {
    const fields = new Set<string>(declared ?? [])
    if (config && typeof config === 'object') {
        for (const name of detectSecretFields(config)) fields.add(name)
    }
    return [...fields]
}

// ─── Split / redact ──────────────────────────────────────────

export interface RedactedConfig<T extends Record<string, unknown> = Record<string, unknown>> {
    /** Local-safe projection: every real credential replaced by {@link SECRET_MASK}. */
    redacted: T
    /** Plaintext credentials pulled out of the config (memory-only). */
    secrets: Record<string, string>
}

/**
 * Split a config into a persistable projection and the plaintext credentials it
 * carried.
 *
 * Fields that are already masked stay masked (they mean "configured, value not
 * held here"), and empty fields stay empty so "not configured" is not mistaken
 * for "configured".
 */
export function redactSecretFields<T extends Record<string, unknown>>(
    config: T,
    fields: readonly string[],
): RedactedConfig<T> {
    const redacted = { ...config }
    const secrets: Record<string, string> = {}

    for (const field of fields) {
        const value = (config as Record<string, unknown>)[field]
        if (hasSecretValue(value)) {
            secrets[field] = value
            ;(redacted as Record<string, unknown>)[field] = SECRET_MASK
        }
    }

    return { redacted, secrets }
}

/** Plaintext credentials currently present in a config (masks excluded). */
export function extractSecretValues(
    config: Record<string, unknown> | null | undefined,
    fields: readonly string[],
): Record<string, string> {
    const secrets: Record<string, string> = {}
    if (!config) return secrets
    for (const field of fields) {
        const value = config[field]
        if (hasSecretValue(value)) secrets[field] = value
    }
    return secrets
}

/** True when the config carries at least one real (unmasked) credential. */
export function containsPlaintextSecret(
    config: Record<string, unknown> | null | undefined,
    fields?: readonly string[],
): boolean {
    if (!config) return false
    const target = fields ?? detectSecretFields(config)
    return target.some((field) => hasSecretValue(config[field]))
}

// ─── Display ─────────────────────────────────────────────────

/**
 * Abbreviated rendering of a credential for confirmation UI (`sk-…4f2a`).
 * Never widen this to reveal more than a short tail.
 */
export function maskSecretForDisplay(value: string, tail = 4): string {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (trimmed.length <= tail) return '•'.repeat(trimmed.length)
    return `••••••${trimmed.slice(-tail)}`
}

// ─── In-memory credential cache ──────────────────────────────

/**
 * Process-wide, memory-only store for decrypted credentials. Deliberately lives
 * in this leaf module (no imports) so both the config store and the auth/logout
 * helpers can reach it without an import cycle.
 */
const secretCache = new Map<string, Record<string, string>>()

/** Credentials currently held in memory for one plugin. */
export function readCachedPluginSecrets(pluginKey: string): Record<string, string> {
    return secretCache.get(pluginKey) ?? {}
}

/** Merge freshly decrypted credentials into the memory cache. */
export function cachePluginSecrets(pluginKey: string, secrets: Record<string, string>): void {
    if (!secrets || Object.keys(secrets).length === 0) return
    secretCache.set(pluginKey, { ...(secretCache.get(pluginKey) ?? {}), ...secrets })
}

/**
 * Drop specific credentials from the memory cache — used when the user clears a
 * field, so a later runtime read cannot resurrect the previous value.
 */
export function removeCachedPluginSecrets(pluginKey: string, fields: readonly string[]): void {
    if (!fields?.length) return
    const cached = secretCache.get(pluginKey)
    if (!cached) return
    const next = { ...cached }
    let changed = false
    for (const field of fields) {
        if (field in next) {
            delete next[field]
            changed = true
        }
    }
    if (changed) secretCache.set(pluginKey, next)
}

/** Drop cached credentials for one plugin, or all of them. */
export function clearCachedPluginSecrets(pluginKey?: string): void {
    if (pluginKey) secretCache.delete(pluginKey)
    else secretCache.clear()
}
