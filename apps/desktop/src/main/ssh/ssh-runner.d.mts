/** Types for ssh-runner.mjs (plain JS so tests can import it directly). */

export interface SshProcessResult {
    ok: boolean
    code: number | null
    signal: string | null
    stdout: string
    stderr: string
    truncated: boolean
    timedOut: boolean
    durationMs: number
    /** The exact argv that ran. */
    argv: string[]
}

export function runSshProcess(
    options: {
        binary?: string
        args: string[]
        /** Fed to the child's stdin (unused by ssh itself). */
        stdinText?: string
        timeoutMs: number
        maxOutputBytes: number
    },
    deps?: {
        spawnImpl?: typeof import('node:child_process').spawn
        env?: NodeJS.ProcessEnv
        cwd?: string
    },
): Promise<SshProcessResult>

/** Kill every in-flight ssh/scp child (called on `will-quit`). */
export function killActiveSshProcesses(signal?: NodeJS.Signals): number
/** How many children are in flight. */
export function activeSshProcessCount(): number
/** How many calls hold a concurrency slot (running or about to run). */
export function activeSshSlotCount(): number
