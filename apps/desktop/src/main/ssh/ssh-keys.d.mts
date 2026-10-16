/** Types for ssh-keys.mjs (plain JS so tests can import it directly). */

export interface KnownHostEntry {
    names: string[]
    keyType: string
    key: string
}

export interface HostKeyVerdict {
    ok: boolean
    reason?: string
    /** OpenSSH-style `SHA256:<base64>` fingerprint of the presented key. */
    fingerprint: string
    /** True when `accept-new` trusted this key for the first time. */
    learned: boolean
}

export const DEFAULT_IDENTITY_FILES: string[]

export function knownHostsName(host: string, port?: number): string
export function knownHostsNames(host: string, port?: number): string[]
export function parseKnownHosts(text: string): KnownHostEntry[]
export function readKnownHosts(options?: { homeDir?: string }): KnownHostEntry[]
export function matchHashedName(entry: string, name: string): boolean
export function matchKnownHost(entry: KnownHostEntry, host: string, port?: number): boolean
export function verifyHostKey(options: {
    host: string
    port?: number
    key: Buffer | string
    entries?: KnownHostEntry[]
    known?: Record<string, string>
    policy?: 'strict' | 'accept-new'
}): HostKeyVerdict
export function sshKnownHostsStorePath(userDataDir: string): string
export function readKnownHostStore(path: string): Record<string, string>
export function isReadableKeyFile(path: string): boolean
export function buildAuthConfig(options?: {
    homeDir?: string
    env?: NodeJS.ProcessEnv
    readFile?: typeof import('node:fs').readFileSync
}): { agent?: string; privateKey?: Buffer; __identityFile?: string }
export function describeAuth(config?: { agent?: string; __identityFile?: string }): string
