/** Types for ssh-client.mjs (plain JS so tests can import it directly). */

/** What to authenticate with; resolved in the main process, never by a plugin. */
export interface SshCredentialSecret {
    id?: string
    kind?: 'password' | 'key'
    password?: string
    privateKey?: string
    passphrase?: string
    error?: string
}

export interface SshConnectOptions {
    target: { host: string; user: string | null; port: number }
    hostKeyPolicy?: 'strict' | 'accept-new'
    timeoutMs?: number
    knownStorePath?: string
    homeDir?: string
    env?: NodeJS.ProcessEnv
    /** Stored credential for this target, if the user saved one. */
    credential?: SshCredentialSecret
}

export function buildConnectAuth(options?: {
    homeDir?: string
    env?: NodeJS.ProcessEnv
    credential?: SshCredentialSecret
}): Record<string, unknown>

export interface SshConnectResult {
    client: unknown
    auth: { agent?: string; privateKey?: Buffer; __identityFile?: string }
    verdict: { ok: boolean; reason?: string; fingerprint: string; learned: boolean } | null
}

export function connectSsh(
    options: SshConnectOptions,
    deps?: { clientFactory?: () => unknown },
): Promise<SshConnectResult>
export function endSsh(client: unknown): void

export interface SshExecOutcome {
    ok: boolean
    code: number | null
    signal: string | null
    stdout: string
    stderr: string
    truncated: boolean
    timedOut: boolean
    durationMs: number
}

export function execSsh(
    client: unknown,
    options: { command: string; timeoutMs: number; maxOutputBytes: number },
): Promise<SshExecOutcome>

export interface SshSftpEntryMapped {
    name: string
    path: string
    longname: string
    directory: boolean
    file: boolean
    symlink: boolean
    size: number
    mode: number
    modifiedAt: number
    uid: number
    gid: number
}

export function sftpList(client: unknown, options: { path: string }): Promise<{ path: string; entries: SshSftpEntryMapped[]; truncated: boolean }>
export function sftpStat(
    client: unknown,
    options: { path: string },
): Promise<{ path: string; size: number; mode: number; directory: boolean; file: boolean; symlink: boolean; modifiedAt: number; accessedAt: number; uid: number; gid: number }>
export function sftpMkdir(client: unknown, options: { path: string; recursive?: boolean }): Promise<{ path: string; created: boolean }>
export function sftpRename(client: unknown, options: { from: string; to: string; overwrite?: boolean }): Promise<{ from: string; to: string }>
export function sftpRemove(client: unknown, options: { path: string; directory?: boolean }): Promise<{ path: string; removed: boolean }>
export function sftpUpload(client: unknown, options: { localPath: string; remotePath: string }): Promise<{ localPath: string; remotePath: string; durationMs: number }>
export function sftpDownload(client: unknown, options: { remotePath: string; localPath: string }): Promise<{ localPath: string; remotePath: string; durationMs: number }>

export interface SshShellHandle {
    write(data: string): boolean
    resize(cols: number, rows: number): boolean
    close(): boolean
    readonly closed: boolean
}

export function openShell(
    client: unknown,
    options: {
        term?: string
        cols?: number
        rows?: number
        onData?: (chunk: Buffer) => void
        onExit?: (info: { code: number | null; signal: string | null }) => void
        onError?: (error: Error) => void
    },
): Promise<SshShellHandle>
