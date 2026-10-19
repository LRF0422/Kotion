/**
 * Types for `secrets.mjs` (plain JS so the store can be driven directly by a
 * test — no `electron`, no build step, no app state).
 *
 * Keep in step with the implementation: `tsc -p tsconfig.node.json` checks the
 * consumer side only.
 */

export interface StoredSecret {
    cipher: string
    size: number
    createdAt: number
    updatedAt: number
}

export interface StoredFile {
    version: number
    namespaces: Record<string, Record<string, StoredSecret>>
}

export interface SecretStoreOptions {
    filePath: () => string
    encrypt: (plain: string) => string
    decrypt: (cipher: string) => string
    canEncrypt: () => boolean
    log?: (message: string) => void
}

export interface DesktopSecretMetadata {
    key: string
    size: number
    createdAt: number
    updatedAt: number
}

export interface SecretEntryWithValue extends DesktopSecretMetadata {
    value: string
    /** False when the ciphertext exists but could not be opened (keychain rotated). */
    decrypted: boolean
}

export interface SecretMutationResult {
    ok: boolean
    metadata?: DesktopSecretMetadata
    error?: string
    code?: string
}

export interface SecretNamespaceInfo {
    namespace: string
    count: number
}

export interface SecretStore {
    available(): boolean
    set(input: { namespace?: unknown; key?: unknown; value?: unknown }): SecretMutationResult
    get(input: { namespace?: unknown; key?: unknown }): SecretEntryWithValue | null
    has(input: { namespace?: unknown; key?: unknown }): boolean
    list(input: { namespace?: unknown }): DesktopSecretMetadata[]
    remove(input: { namespace?: unknown; key?: unknown }): SecretMutationResult
    clear(input: { namespace?: unknown }): number
    namespaces(): SecretNamespaceInfo[]
}

export const SECRET_FILE_VERSION: number
export const SECRET_FILE_NAME: string
export function readSecretFile(options: SecretStoreOptions): StoredFile
export function writeSecretFile(options: SecretStoreOptions, file: StoredFile): void
export function createSecretStore(options: SecretStoreOptions): SecretStore
export function secretFilePath(userDataPath: string): string
export function secretFileExists(filePath: string): boolean
export const unavailableKeychain: { encrypt(): never; decrypt(): never }
