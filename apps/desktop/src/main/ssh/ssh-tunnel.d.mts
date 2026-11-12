/** Types for ssh-tunnel.mjs (plain JS so tests can import it directly). */

/** The only address a tunnel listener is bound to. */
export const TUNNEL_BIND_HOST: '127.0.0.1'

/** Default deadline for one `forwardOut` channel open. */
export const DEFAULT_TUNNEL_FORWARD_TIMEOUT_MS: number

/** How a tunnel forwards: one fixed destination (`-L`) or SOCKS5 (`-D`). */
export type TunnelKind = 'local' | 'dynamic'

export type TunnelHostKeyPolicy = 'strict' | 'accept-new'

export interface TunnelTarget {
    host: string
    /** `null` means "let ssh2 use the current user". */
    user: string | null
    port: number
}

/** What `open()` accepts. Validation/normalization happens before this module. */
export interface TunnelOptions {
    target: TunnelTarget
    hostKeyPolicy: TunnelHostKeyPolicy
    credentialId?: string
    /** Defaults to `local`. */
    kind?: TunnelKind
    /** `kind: 'local'` only: destination as the SSH server resolves it. */
    remoteHost?: string
    /** `kind: 'local'` only: destination port (1–65535). */
    remotePort?: number
    /** Loopback port to bind; omit or `0` to let the OS pick one. */
    localPort?: number
    label?: string | null
}

/**
 * A live tunnel as handed to callers: plain, serializable, and free of the
 * `ssh2` client / `net.Server` internals that own it.
 */
export interface PublicTunnel {
    tunnelId: string
    kind: TunnelKind
    /** The SSH target (`user@host:port`), not the local listener. */
    host: string
    user: string | null
    port: number
    localHost: '127.0.0.1'
    /** The real bound port (never `0`). */
    localPort: number
    /** Fixed destination for `local`; `null` for `dynamic`. */
    remoteHost: string | null
    remotePort: number | null
    label: string | null
    /** Epoch ms. */
    openedAt: number
}

/** Documented reasons a tunnel close event carries (callers may pass others). */
export type TunnelCloseReason =
    | 'closed'
    | 'ssh-closed'
    | 'ssh-error'
    | 'revoked'
    | 'app-quit'

/** The one event the manager ever broadcasts. */
export interface TunnelCloseEvent {
    type: 'tunnel-close'
    tunnelId: string
    reason: string
}

/** Dependencies a SOCKS5 handler gets from the engine. */
export interface Socks5Deps {
    /** Open one forwarding channel; rejects on refusal/timeout. */
    forwardOut(host: string, port: number): Promise<unknown>
    /** Defence-in-depth destination check (the same hook `local` tunnels use). */
    assertDestination: ((host: string) => void | Promise<void>) | null
    /** The engine's per-forward deadline, exposed for the negotiator's own timers. */
    timeoutMs: number
}

/** What a SOCKS5 handler hands back for the engine to pipe. */
export interface Socks5Result {
    channel: unknown
    destHost?: string
    destPort?: number
}

/**
 * The injected SOCKS5 negotiator (`ssh-socks5.mjs`). It owns the protocol
 * exchange on `socket` (writing its own replies) and returns the forwarded
 * channel; the engine only pipes it and cleans up.
 */
export type Socks5Handler = (
    socket: import('node:net').Socket,
    deps: Socks5Deps,
) => Promise<Socks5Result>

export interface TunnelManager {
    /** Open one tunnel and return its public descriptor. */
    open(options: TunnelOptions): Promise<PublicTunnel>
    /** Close one tunnel. Idempotent; `true` when it existed. */
    close(tunnelId: string, reason?: string): boolean
    /**
     * Close every tunnel for `host` + normalized `user` + numeric `port`, and
     * invalidate opens for that target that are still connecting/binding
     * (they reject with `desktop ssh: the host grant was revoked while opening
     * the tunnel`). Returns the number of published tunnels closed.
     */
    closeForTarget(target: TunnelTarget, reason?: string): number
    /** Live tunnels, oldest first. */
    list(): PublicTunnel[]
    /** Finish every tunnel and refuse new ones. */
    dispose(reason?: string): void
    /** Number of open tunnels (excludes opens still connecting). */
    size(): number
}

export function createTunnelManager(options: {
    /** Required: the gated connection path (network policy + grant + host key). */
    connect: (options: {
        target: TunnelTarget
        hostKeyPolicy: TunnelHostKeyPolicy
        credentialId?: string
    }) => Promise<unknown>
    /** Required: end a client; must not throw. */
    end: (client: unknown) => void
    /** Receives exactly one `tunnel-close` event per tunnel. */
    broadcast?: (event: TunnelCloseEvent) => void
    /** Required for `kind: 'dynamic'`; absent refuses dynamic tunnels. */
    socks5?: Socks5Handler | null
    /** Called for a `local` tunnel's fixed remote destination. */
    assertDestination?: ((host: string) => void | Promise<void>) | null
    createServer?: (handler: (socket: import('node:net').Socket) => void) => import('node:net').Server
    maxTunnels?: number
    maxChannelsPerTunnel?: number
    forwardTimeoutMs?: number
    now?: () => number
}): TunnelManager