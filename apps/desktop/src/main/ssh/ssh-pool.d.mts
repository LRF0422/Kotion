/** Types for ssh-pool.mjs (plain JS so tests can import it directly). */

export const DEFAULT_SSH_POOL_IDLE_MS: number
export const DEFAULT_SSH_POOL_MAX_ENTRIES: number

export type SshHostKeyPolicy = 'strict' | 'accept-new'

export interface SshPoolTarget {
    host: string
    user?: string | null
    port?: number
}

/** `user@host:port` + host-key policy: what one pooled connection is for. */
export function sshPoolKey(target: SshPoolTarget, hostKeyPolicy?: SshHostKeyPolicy): string

/**
 * One borrowed connection. Always `release()` it (usually in `finally`) so the
 * idle countdown can start; `invalidate()` when the connection is known broken
 * (the lease stays valid for reading `client` until it is released).
 */
export interface SshPoolLease {
    readonly key: string
    readonly client: unknown
    readonly target: { host: string; user: string | null; port: number }
    readonly closed: boolean
    /** The shared, lazily opened SFTP channel for this connection. */
    sftp(): Promise<unknown>
    release(): void
    invalidate(): void
}

export interface SshPool {
    acquire(options: {
        target: SshPoolTarget
        hostKeyPolicy?: SshHostKeyPolicy
        /** Called at most once per new connection; resolves to `{ client }` or a client. */
        connect: () => Promise<unknown>
    }): Promise<SshPoolLease>
    /**
     * Drop connections for a target (all policies unless one is named) and orphan
     * its in-flight handshakes so a pre-revocation session can never be pooled.
     * Returns the number of affected keys (pooled entries and in-flight handshakes).
     */
    invalidate(target: SshPoolTarget, options?: { hostKeyPolicy?: SshHostKeyPolicy }): number
    dispose(): void
    size(): number
    keys(): string[]
}

export function createSshPool(options?: {
    /** Opens the SFTP channel on a client; required only for callers that use `sftp()`. */
    openSftp?: ((client: unknown) => Promise<unknown>) | null
    /** Ends a client (defaults to `client.end()`). */
    end?: (client: unknown) => void
    idleMs?: number
    maxEntries?: number
    now?: () => number
    setTimer?: (run: () => void, ms: number) => unknown
    clearTimer?: (handle: unknown) => void
}): SshPool
