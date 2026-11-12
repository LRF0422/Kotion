/**
 * SSH surface (`ssh.*`): exec, file transfer, SFTP, interactive pty, port
 * forwarding and host credentials.
 *
 * Runs the user's own OpenSSH binaries. Every call passes the network policy
 * and, once per host per app run, an explicit user confirmation. Host keys are
 * verified before authentication (`known_hosts`, TOFU on `accept-new`). The host
 * never receives or stores a credential unless the user stored one explicitly
 * (`ssh.credentials*`, safeStorage at rest, write-only from the renderer).
 */
/**
 * Host-key verification policy for an SSH call.
 *
 * - `strict` (default): the host must already be in the user's `known_hosts`;
 *   an unknown or changed key fails.
 * - `accept-new`: trust on first use. The main process asks the user before a
 *   connection is made under this policy, because it is the weaker one.
 */
export type SshHostKeyPolicy = 'strict' | 'accept-new'

/** Which host to talk to. Credentials are never part of this shape. */
export interface SshTarget {
    /** Hostname, IPv4 or IPv6 literal (no brackets needed). */
    host: string
    /** Login user; omitted means the ssh config / local user decides. */
    user?: string | null
    /** TCP port; defaults to 22. */
    port?: number
}

/** Common knobs for one SSH call. */
export interface SshCallOptions extends SshTarget {
    /** Wall-clock budget for the whole call (default 30s, max 10min). */
    timeoutMs?: number
    /** Combined stdout+stderr byte budget (default 1 MiB, max 4 MiB). */
    maxOutputBytes?: number
    /** Host-key policy; defaults to `strict`. */
    hostKeyPolicy?: SshHostKeyPolicy
    /**
     * Which stored credential to authenticate with.
     *
     * Optional: when omitted, the credential saved for this target is used, and
     * without one the connection falls back to the ssh-agent and `~/.ssh` keys.
     * **A password or key is never passed in a call** — it is stored once, in the
     * host, and resolved in the main process.
     */
    credentialId?: string
}

/** How a stored credential authenticates. */
export type SshCredentialKind = 'password' | 'key'

/**
 * A stored SSH credential, as the renderer sees it.
 *
 * Deliberately metadata only: there is no field here that could carry the
 * password or the private key back out of the main process.
 */
export interface SshCredentialMetadata {
    id: string
    host: string
    user: string | null
    port: number
    kind: SshCredentialKind
    label?: string
    createdAt: number
    updatedAt: number
    /** A passphrase is stored alongside the key. */
    hasPassphrase: boolean
    /** `user@host:port` — what a call's target has to match. */
    targetKey: string
}

/** Add or replace the credential for one target. */
export interface SshCredentialInput {
    host: string
    user?: string | null
    port?: number
    kind?: SshCredentialKind
    label?: string
    /** The password, or a PEM private key. */
    secret: string
    /** Passphrase for an encrypted private key. */
    passphrase?: string
}

/** Result of storing/removing a credential: `ok: false` + a reason to show. */
export interface SshCredentialMutationResult {
    ok: boolean
    credential?: SshCredentialMetadata
    error?: string
}

/** The credential surface: everything a settings panel needs, and nothing more. */
export interface SshCredentialBridge {
    /** False when the OS cannot encrypt (no keyring): storing is refused. */
    available(): Promise<boolean>
    list(): Promise<SshCredentialMetadata[]>
    set(input: SshCredentialInput): Promise<SshCredentialMutationResult>
    remove(options: { id: string }): Promise<SshCredentialMutationResult>
}

/** Run one command on a remote host. */
export interface SshExecOptions extends SshCallOptions {
    /** Shell command line executed by the remote login shell. */
    command: string
}

/** Result of {@link SshExecOptions}. */
export interface SshExecResult {
    host: string
    user: string | null
    port: number
    /** The remote command that ran. */
    command: string
    /** True only for exit code 0 without a timeout. */
    ok: boolean
    code: number | null
    signal: string | null
    stdout: string
    stderr: string
    /** Output hit the byte budget: the text is clipped. */
    truncated: boolean
    timedOut: boolean
    durationMs: number
    /** The exact argv that ran, for diagnosing flag problems. */
    argv: string[]
}

/** Copy one file to (`put`) or from (`get`) a remote host. */
export interface SshTransferOptions extends SshCallOptions {
    /** Local path; validated against the same fs allowlist as `fs.*`. */
    localPath: string
    /** Remote path (no quoting needed: it travels as an argv entry). */
    remotePath: string
}

/** Result of {@link SshTransferOptions}. */
export interface SshTransferResult {
    host: string
    user: string | null
    port: number
    direction: 'put' | 'get'
    localPath: string
    remotePath: string
    ok: boolean
    code: number | null
    signal: string | null
    stdout: string
    stderr: string
    truncated: boolean
    timedOut: boolean
    durationMs: number
    argv: string[]
}

/**
 * What an SSH call does, as far as the user's consent is concerned.
 *
 * `tunnel` and `proxy` are deliberately separate scopes: a fixed-destination
 * local forward is a different grant from a SOCKS5 proxy that can reach
 * anything the server can reach, so allowing one must not silently allow the
 * other.
 */
export type SshRequestScope = 'command' | 'transfer' | 'sftp' | 'shell' | 'tunnel' | 'proxy'

/** A host the user has allowed for this app run. */
export interface SshGrant {
    /** `user@host:port` — the identity {@link SshForgetOptions} revokes (every scope). */
    key: string
    host: string
    user: string | null
    port: number
    hostKeyPolicy: SshHostKeyPolicy
    /**
     * What was allowed. Grants are per host **and** per scope: permission to run
     * a command does not imply permission to open an interactive terminal.
     */
    scope: SshRequestScope
    /** Epoch ms of the confirmation. */
    grantedAt: number
}

/** Revoke a grant, either by its key or by naming the target again. */
export interface SshForgetOptions extends Partial<SshTarget> {
    /** The `key` from {@link SshGrant}; takes precedence when present. */
    key?: string
}

/**
 * One remote directory entry (SFTP `readdir`).
 *
 * `path` is already joined with the directory that was listed, so a caller never
 * has to re-assemble it.
 */
export interface SshSftpEntry {
    name: string
    path: string
    /** The server's `ls -l`-style line, when it provides one. */
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

/** Common knobs for every SFTP call. */
export interface SshSftpOptions extends SshCallOptions {}

export interface SshSftpPathOptions extends SshSftpOptions {
    /** Remote path. No quoting needed: it is a protocol field, not a shell word. */
    path: string
}

export interface SshSftpMkdirOptions extends SshSftpPathOptions {
    /** Create missing parents (`mkdir -p`). */
    recursive?: boolean
}

export interface SshSftpRenameOptions extends SshSftpOptions {
    from: string
    to: string
    /** POSIX rename replaces silently; the default refuses an existing target. */
    overwrite?: boolean
}

export interface SshSftpRemoveOptions extends SshSftpPathOptions {
    /** Remove an empty directory instead of a file. */
    directory?: boolean
}

export interface SshSftpListOptions extends SshSftpPathOptions {}

export interface SshSftpListResult {
    host: string
    user: string | null
    port: number
    path: string
    entries: SshSftpEntry[]
    /** The entry cap was hit; the listing is partial. */
    truncated: boolean
}

export interface SshSftpStatResult {
    host: string
    user: string | null
    port: number
    path: string
    size: number
    mode: number
    directory: boolean
    file: boolean
    symlink: boolean
    modifiedAt: number
    accessedAt: number
    uid: number
    gid: number
}

export interface SshSftpMutationResult {
    host: string
    user: string | null
    port: number
    [key: string]: unknown
}

/** Open an interactive terminal: a remote pty with a writable stdin. */
export interface SshShellOpenOptions extends SshCallOptions {
    /** TERM name; sanitized to a boring default when it is not a plain token. */
    term?: string
    cols?: number
    rows?: number
}

/** A live terminal session. Data arrives as `SshShellEvent`s. */
export interface SshShellSession {
    sessionId: string
    host: string
    user: string | null
    port: number
    cols: number
    rows: number
    /** Epoch ms. */
    openedAt: number
}

export interface SshShellWriteOptions {
    sessionId: string
    /** Keystrokes / pasted text (UTF-8). */
    data: string
}

export interface SshShellResizeOptions {
    sessionId: string
    cols: number
    rows: number
}

export interface SshShellTarget {
    sessionId: string
}

/**
 * How a tunnel forwards.
 *
 * - `local` (`ssh -L`): one fixed destination, reached **from the SSH server**.
 * - `dynamic` (`ssh -D`): a no-auth SOCKS5 proxy on loopback; the client picks
 *   any destination the server can reach. Stronger than `local`, and a separate
 *   grant scope because of it.
 */
export type SshTunnelKind = 'local' | 'dynamic'

/**
 * Open one port-forwarding tunnel.
 *
 * The listener is always bound to `127.0.0.1` — a tunnel is for this machine's
 * plugins, never exposed to the LAN — and the returned session names the real
 * port the OS assigned when `localPort` is omitted (or `0`).
 *
 * Deadlines are fixed by the host (20 s connect, 10 s per forwarded channel),
 * not per-call knobs, so this deliberately does not extend {@link SshCallOptions}.
 */
export interface SshTunnelOptions extends SshTarget {
    /** Host-key policy; defaults to `strict`. */
    hostKeyPolicy?: SshHostKeyPolicy
    /** Stored credential to authenticate with; omit for the target's saved one. */
    credentialId?: string
    /** Defaults to `local`. */
    kind?: SshTunnelKind
    /**
     * `kind: 'local'` only: destination as the **SSH server** resolves it. A
     * private address here is the point of a bastion tunnel, not an error.
     */
    remoteHost?: string
    /** `kind: 'local'` only: destination port (1–65535). */
    remotePort?: number
    /** Loopback port to bind; omit or `0` to let the host choose one. */
    localPort?: number
    /** Optional label for `ssh.tunnels()` and diagnostics. Never used for routing. */
    label?: string
}

/** A live tunnel. The SSH connection belongs to it until it is closed. */
export interface SshTunnelSession {
    tunnelId: string
    kind: SshTunnelKind
    host: string
    user: string | null
    port: number
    /** Always `127.0.0.1`. */
    localHost: string
    /** The real bound port (never 0). */
    localPort: number
    /** Fixed destination for `local`; `null` for `dynamic`. */
    remoteHost: string | null
    remotePort: number | null
    label: string | null
    /** Epoch ms. */
    openedAt: number
}

/**
 * Why a tunnel stopped, delivered as `{ type: 'tunnel-close' }` on the `ssh`
 * desktop event channel.
 *
 * - `closed` — the caller called `ssh.tunnelClose`.
 * - `ssh-closed` / `ssh-error` — the SSH transport ended (server restart,
 *   network drop): the loopback listener is gone too.
 * - `revoked` — the user revoked the host grant via `ssh.forget`.
 * - `app-quit` — the app is shutting down.
 */
export type SshTunnelCloseReason =
    | 'closed'
    | 'ssh-closed'
    | 'ssh-error'
    | 'revoked'
    | 'app-quit'

/** One tunnel lifecycle event. */
export interface SshTunnelEvent {
    type: 'tunnel-close'
    tunnelId: string
    reason: SshTunnelCloseReason
}

export interface SshTunnelCloseOptions {
    tunnelId: string
}

/**
 * One terminal event, delivered on the `ssh` desktop event channel.
 *
 * `data` is base64: ssh2 hands over byte chunks that can split a multi-byte
 * character, so the renderer must decode bytes rather than trust a JSON string.
 */
export type SshShellEvent =
    | { type: 'shell-data'; sessionId: string; data: string }
    | { type: 'shell-exit'; sessionId: string; code: number | null; signal: string | null }
    | { type: 'shell-error'; sessionId: string; message: string }

/**
 * The SSH surface of the desktop bridge. Present only on desktop builds that
 * expose the `ssh.*` capabilities; feature-detect before use.
 *
 * Every call is gated by the network policy and by a per-host user confirmation
 * on first use in an app run; an interactive shell says so explicitly in that
 * dialog. There is deliberately no way to pass a password or a key — auth comes
 * from the user's ssh-agent and default identity files.
 */
export interface SshBridge {
    exec(options: SshExecOptions): Promise<SshExecResult>
    /** Upload a local file to the remote host (SFTP). */
    put(options: SshTransferOptions): Promise<SshTransferResult>
    /** Download a remote file to a local path (SFTP). */
    get(options: SshTransferOptions): Promise<SshTransferResult>
    /** List a remote directory. */
    list(options: SshSftpListOptions): Promise<SshSftpListResult>
    /** Stat a remote path. */
    stat(options: SshSftpPathOptions): Promise<SshSftpStatResult>
    /** Create a remote directory (optionally `-p`). */
    mkdir(options: SshSftpMkdirOptions): Promise<SshSftpMutationResult>
    /** Rename/move; refuses an existing target unless `overwrite` is set. */
    rename(options: SshSftpRenameOptions): Promise<SshSftpMutationResult>
    /** Delete a file, or an empty directory when `directory` is set. */
    remove(options: SshSftpRemoveOptions): Promise<SshSftpMutationResult>
    /** Open an interactive terminal (remote pty). */
    shell(options: SshShellOpenOptions): Promise<SshShellSession>
    /** Send input to a shell session. */
    shellWrite(options: SshShellWriteOptions): Promise<boolean>
    /** Resize a shell session's pty (the reason this is not a spawned `ssh`). */
    shellResize(options: SshShellResizeOptions): Promise<boolean>
    /** Close a shell session. */
    shellClose(options: SshShellTarget): Promise<boolean>
    /** Sessions that are currently open. */
    shellSessions(): Promise<SshShellSession[]>
    /** Subscribe to terminal output/exit events; returns an unsubscribe. */
    onShell(listener: (event: SshShellEvent) => void): () => void
    /**
     * Open a loopback tunnel through an SSH host: a fixed-destination local
     * forward (`ssh -L`) or a SOCKS5 proxy (`ssh -D`).
     *
     * An interactive terminal grant does not cover this: tunnels are their own
     * grant scope (`tunnel` for `-L`, `proxy` for `-D`) and are confirmed with
     * their destination/proxy wording.
     */
    tunnel(options: SshTunnelOptions): Promise<SshTunnelSession>
    /** Close one tunnel; false when it was already gone. */
    closeTunnel(options: SshTunnelCloseOptions): Promise<boolean>
    /** Tunnels currently open in this app run. */
    tunnels(): Promise<SshTunnelSession[]>
    /** Subscribe to tunnel lifecycle events; returns an unsubscribe. */
    onTunnel(listener: (event: SshTunnelEvent) => void): () => void
    /** Hosts the user has granted for this app run. */
    hosts(): Promise<SshGrant[]>
    /** Revoke one grant; true when a grant was removed. */
    forget(options: SshForgetOptions): Promise<boolean>
    /**
     * Stored credentials — the only way to log in to a password-only host.
     *
     * Secrets go in and never come back out: `list()` is metadata only and the
     * main process is the only reader of the plaintext.
     */
    credentials: SshCredentialBridge
}

