/** Types for ssh-credentials.mjs (plain JS so tests can import it directly). */

export type SshCredentialKind = 'password' | 'key'

/** Public view of a stored credential — never contains the secret. */
export interface SshCredentialMetadata {
    id: string
    host: string
    user: string | null
    port: number
    kind: SshCredentialKind
    label?: string
    createdAt: number
    updatedAt: number
    hasPassphrase: boolean
    targetKey: string
}

export interface SshCredentialInput {
    host: string
    user?: string | null
    port?: number
    kind?: SshCredentialKind
    label?: string
    /** Password, or a PEM private key. Required. */
    secret: string
    /** Passphrase for an encrypted private key. */
    passphrase?: string
}

export interface SshCredentialIo {
    readFile(): string
    writeFile(contents: string): void
    canEncrypt(): boolean
    encrypt(plain: string): string
    decrypt(cipher: string): string
}

export const SSH_CREDENTIAL_KINDS: SshCredentialKind[]
export const MAX_PASSWORD_CHARS: number
export const MAX_PRIVATE_KEY_CHARS: number
export const MAX_LABEL_CHARS: number

export function credentialTargetKey(target: { host: string; user?: string | null; port?: number }): string
export function emptyStore(): { version: number; credentials: unknown[] }
export function readStore(io: SshCredentialIo): { version: number; credentials: Array<Record<string, unknown>> }
export function toMetadata(record: Record<string, unknown>): SshCredentialMetadata
export function listCredentials(io: SshCredentialIo): SshCredentialMetadata[]
export function setCredential(
    io: SshCredentialIo,
    input?: Partial<SshCredentialInput>,
): { ok: boolean; credential?: SshCredentialMetadata; error?: string }
export function removeCredential(io: SshCredentialIo, id: string): { ok: boolean; error?: string }
export function resolveCredential(
    io: SshCredentialIo,
    target?: { id?: string; host?: string; user?: string | null; port?: number },
): { id?: string; kind?: SshCredentialKind; password?: string; privateKey?: string; passphrase?: string; error?: string }
