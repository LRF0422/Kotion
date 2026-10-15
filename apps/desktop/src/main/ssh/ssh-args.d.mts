/** Types for ssh-args.mjs (plain JS so tests can import it directly). */

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

export function clampSshTimeout(value: unknown): number
export function clampSshOutputBytes(value: unknown): number
export function normalizeHostKeyPolicy(value: unknown): SshHostKeyPolicy
export function normalizeSshTarget(raw?: Record<string, unknown>): SshTarget
export function sshGrantKey(target: SshTarget): string
export function normalizeSshCommand(value: unknown): string
export function normalizeRemotePath(value: unknown, field?: string): string
export function buildCommonSshArgs(options: {
    target: SshTarget
    hostKeyPolicy: SshHostKeyPolicy
    connectTimeoutMs: number
    portFlag?: string
}): string[]
export function buildSshArgs(options: {
    target: SshTarget
    command: string
    hostKeyPolicy: SshHostKeyPolicy
    connectTimeoutMs: number
}): string[]
export function buildScpArgs(options: {
    target: SshTarget
    direction: 'put' | 'get'
    localPath: string
    remotePath: string
    hostKeyPolicy: SshHostKeyPolicy
    connectTimeoutMs: number
}): string[]
export function sshDenyReason(verdict: 'private' | 'metadata', options?: { resolved?: boolean }): string
export function createOutputCollector(maxBytes: number): {
    push(chunk: Buffer | string): void
    result(): { text: string; truncated: boolean }
}
