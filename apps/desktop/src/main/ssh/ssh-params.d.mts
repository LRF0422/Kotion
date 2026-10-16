/** Types for ssh-params.mjs (plain JS so tests can import it directly). */

export type SshHostKeyPolicy = 'strict' | 'accept-new'

export interface SshTarget {
    host: string
    user: string | null
    port: number
}

export const SSH_HOST_KEY_POLICIES: SshHostKeyPolicy[]
export const DEFAULT_SSH_HOST_KEY_POLICY: SshHostKeyPolicy
export const SSH_DEFAULT_PORT: number
export const DEFAULT_SSH_TIMEOUT_MS: number
export const MAX_SSH_TIMEOUT_MS: number
export const DEFAULT_SSH_OUTPUT_BYTES: number
export const MAX_SSH_OUTPUT_BYTES: number
export const MAX_SSH_COMMAND_CHARS: number
export const MAX_SFTP_ENTRIES: number
export const MAX_TERM_CHARS: number
export const MAX_SHELL_COLS: number
export const MAX_SHELL_ROWS: number
export const MAX_SHELL_WRITE_BYTES: number

export function clampSshTimeout(value: unknown): number
export function clampSshOutputBytes(value: unknown): number
export function normalizeHostKeyPolicy(value: unknown): SshHostKeyPolicy
export function normalizeSshTarget(raw?: Record<string, unknown>): SshTarget
export function sshGrantKey(target: SshTarget): string
export function normalizeSshCommand(value: unknown): string
export function normalizeRemotePath(value: unknown, field?: string): string
export function normalizeSessionId(value: unknown): string
export function normalizeShellSize(options?: { cols?: unknown; rows?: unknown }): { cols: number; rows: number }
export function normalizeTerm(value: unknown): string
export function normalizeShellInput(value: unknown): string
export function sshDenyReason(verdict: 'private' | 'metadata', options?: { resolved?: boolean }): string
export function createOutputCollector(maxBytes: number): {
    push(chunk: Buffer | string): void
    result(): { text: string; truncated: boolean }
}
