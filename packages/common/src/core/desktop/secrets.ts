/* ------------------------------------------------------------------ *
 * storage.secret — plugin-scoped encrypted key-value storage
 *
 * Plugins need to keep a secret *between launches* (a refresh token, an app
 * password). `storage.*` is durable but transparent, and reading another
 * plugin's namespace is a directory listing away — so plugins that held a secret
 * had nowhere honest to put it. This is that place:
 *
 *   - every value is encrypted with Electron `safeStorage` (OS keychain) before
 *     it reaches disk; only the ciphertext is written, to
 *     `<userData>/plugin-secrets.json` with mode 0600;
 *   - secrets are grouped by `namespace`, and `plugin.<key>` is the convention
 *     the host validates so `clear` can never touch another plugin's;
 *   - `list` returns metadata only. `get` is the single deliberate door that
 *     hands the plaintext back to the renderer, so the plugin can *use* the
 *     token — it is not guarded, because no plugin-vs-plugin permission
 *     boundary exists in this shell (see docs/PLUGIN_SECRETS.md).
 * ------------------------------------------------------------------ */

/** One stored secret, as the renderer sees it. Never carries the plaintext. */
export interface DesktopSecretMetadata {
    key: string
    /** Length of the plaintext, so a UI can show "•••• (32)" without revealing it. */
    size: number
    createdAt: number
    updatedAt: number
}

/** A successful read. `value` is plaintext: treat it as in-memory only. */
export interface DesktopSecretEntry extends DesktopSecretMetadata {
    value: string
    /**
     * False when the stored ciphertext could not be decrypted (another machine,
     * a reset keychain). `value` is then empty and the UI should ask the user to
     * fill the secret in again — it is not "the secret does not exist".
     */
    decrypted?: boolean
}

export interface DesktopSecretSetOptions {
    /** Namespace the key lives in, e.g. `plugin.mail`. */
    namespace: string
    key: string
    value: string
}

export interface DesktopSecretKeyOptions {
    namespace: string
    key: string
}

/** Namespaces that currently hold at least one secret. */
export interface DesktopSecretNamespaceInfo {
    namespace: string
    count: number
}

/** Result of a write/remove: failures report inline instead of rejecting. */
export interface DesktopSecretMutationResult {
    ok: boolean
    metadata?: DesktopSecretMetadata
    error?: string
    /** `SECRET_NO_KEYCHAIN` when the OS cannot encrypt; the write is refused. */
    code?: 'SECRET_NO_KEYCHAIN' | 'SECRET_INVALID_NAMESPACE' | 'SECRET_INVALID_KEY' | 'SECRET_TOO_LARGE'
}

/** The secret-keychain surface (feature-detect `desktop.secrets`). */
export interface SecretBridge {
    /** False when this machine cannot encrypt at rest; then writes are refused. */
    available(): Promise<boolean>
    set(options: DesktopSecretSetOptions): Promise<DesktopSecretMutationResult>
    /** Read one secret, plaintext. `null` when absent. */
    get(options: DesktopSecretKeyOptions): Promise<DesktopSecretEntry | null>
    /** `list` without the plaintext. */
    has(options: DesktopSecretKeyOptions): Promise<boolean>
    list(options: { namespace: string }): Promise<DesktopSecretMetadata[]>
    remove(options: DesktopSecretKeyOptions): Promise<DesktopSecretMutationResult>
    /** Drop every secret in one namespace; answers with the removed count. */
    clear(options: { namespace: string }): Promise<number>
    /** Namespaces holding secrets (metadata only, no values). */
    namespaces(): Promise<DesktopSecretNamespaceInfo[]>
}
