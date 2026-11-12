/* ------------------------------------------------------------------ *
 * net.socket — raw TCP / TLS byte streams
 *
 * The host is a *transport*, not a protocol client. It opens a TCP or TLS
 * connection, moves bytes in both directions and reports open/data/close — so a
 * plugin can implement its own wire protocol (IMAP, SMTP, MQTT, a custom
 * line protocol) in TypeScript instead of depending on a host-provided client.
 * There is deliberately no `mail.*` surface here: the mail protocol lives in the
 * plugin that needs it.
 *
 * Every connection passes the same gates as `http.request`/`ssh.*`:
 *   1. the network policy (`net.policy.*`) refuses loopback / RFC1918 /
 *      link-local / cloud-metadata targets unless the user lifted it;
 *   2. the first connection to `host:port` in this app run asks the user, in a
 *      modal dialog naming the target and the port — because a raw stream to an
 *      arbitrary host is a stronger thing to hand a plugin than an HTTP GET;
 *   3. the session is capped in memory, and the *host* owns closing it: the
 *      plugin cannot leave a socket behind that it no longer holds a handle to.
 *
 * TLS is verified by default (real chain + hostname), because the main process
 * trusts the OS/Chromium root store, not a plugin's pinned key. `relaxed` exists
 * only for a self-signed development server; it must be requested explicitly.
 * ------------------------------------------------------------------ */

export type DesktopNetSocketProtocol = 'tcp' | 'tls'

/**
 * How strictly a TLS connection is verified.
 *
 * `strict` (default) validates the certificate chain **and** the hostname.
 * `relaxed` accepts a certificate that does not verify (self-signed, expired,
 * wrong host) but keeps encryption on. There is no "no TLS" mode: use `tcp`.
 */
export type DesktopNetSocketTlsMode = 'strict' | 'relaxed'

/** Open one TCP or TLS connection. */
export interface DesktopNetSocketOpenOptions {
    /** Hostname, IPv4 or IPv6 literal (no brackets needed). */
    host: string
    /** TCP port; 1–65535. */
    port: number
    /** `tcp` (default) or `tls`. */
    protocol?: DesktopNetSocketProtocol
    /**
     * TLS server name, for the SNI extension and the hostname check. Defaults to
     * `host`. Required in practice when `host` is an IP address and a `tls`
     * server routes by SNI.
     */
    serverName?: string
    /** TLS verification policy; defaults to `strict`. */
    tlsMode?: DesktopNetSocketTlsMode
    /** Idle timeout in ms (default 60s, max 10min). `0` disables it. */
    timeoutMs?: number
    /** Connect timeout in ms (default 15s, max 2min). */
    connectTimeoutMs?: number
    /**
     * Host identity to report in the consent prompt and to key the grant on.
     * Omitted means `host:port`; set it when the plugin dials an IP but the user
     * thinks in names (e.g. `imap.example.com:993`).
     */
    label?: string
}

/** A live connection. Data arrives as {@link DesktopNetSocketEvent}s. */
export interface DesktopNetSocketSession {
    sessionId: string
    host: string
    port: number
    protocol: DesktopNetSocketProtocol
    /** SNI / hostname used for verification. */
    serverName: string
    /** True when the connection actually negotiated TLS. */
    encrypted: boolean
    /** Epoch ms. */
    openedAt: number
    /** Bytes received so far (both directions are counted separately). */
    bytesIn: number
    bytesOut: number
}

export interface DesktopNetSocketWriteOptions {
    sessionId: string
    /**
     * Bytes to send. Base64 on purpose: a protocol frame is a byte sequence and
     * a JS string round-trip would corrupt anything that is not valid UTF-8.
     */
    dataBase64: string
}

/** Close one session, optionally half-closing after flushing `dataBase64`. */
export interface DesktopNetSocketCloseOptions {
    sessionId: string
    /** Bytes to write before closing (e.g. a protocol `LOGOUT`). */
    dataBase64?: string
    /**
     * Wait for the remote to close first (`end()`) instead of destroying the
     * socket. Defaults to false: `close` means close.
     */
    graceful?: boolean
}

/**
 * One socket event, delivered on the `net` desktop event channel.
 *
 * `data` is base64 for the same reason `ssh.shell`'s is: chunks split multi-byte
 * characters, so a plugin must decode bytes rather than trust a JSON string.
 */
export type DesktopNetSocketEvent =
    | { type: 'socket-open'; sessionId: string; session: DesktopNetSocketSession }
    | { type: 'socket-data'; sessionId: string; dataBase64: string }
    | {
          type: 'socket-close'
          sessionId: string
          /** True when the local side initiated the close. */
          local: boolean
          /** True for an orderly close (`end`/FIN), false for a reset/abort. */
          graceful: boolean
          bytesIn: number
          bytesOut: number
      }
    | { type: 'socket-error'; sessionId: string; message: string; code?: string }

/** The raw-socket surface of the desktop bridge (feature-detect `desktop.net`). */
export interface NetBridge {
    /** Open a connection. Resolves once the socket is established. */
    open(options: DesktopNetSocketOpenOptions): Promise<DesktopNetSocketSession>
    /** Send bytes. Resolves when the chunk is flushed to the kernel. */
    write(options: DesktopNetSocketWriteOptions): Promise<boolean>
    /** Close a session (idempotent; unknown ids resolve `false`). */
    close(options: DesktopNetSocketCloseOptions): Promise<boolean>
    /** Sessions that are currently open. */
    sessions(): Promise<DesktopNetSocketSession[]>
    /** Subscribe to socket events; returns an unsubscribe function. */
    onEvent(listener: (event: DesktopNetSocketEvent) => void): () => void
}
