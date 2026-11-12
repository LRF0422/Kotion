/* ------------------------------------------------------------------ *
 * shell — the system browser, and a loopback redirect for OAuth
 *
 * A plugin cannot complete an OAuth authorization-code flow on its own: the
 * provider needs a *browser*, and the redirect has to land somewhere the app can
 * read. These two capabilities are the smallest pair that makes it work:
 * `browserOpen` hands a URL to the user's real browser, and `oauthStart` binds a
 * single loopback port, resolves with the `redirect_uri` to register, and
 * resolves again with the raw callback query once the browser comes back.
 *
 * The listener is deliberately tiny and short-lived: loopback only, one path,
 * a bounded header size, a timeout, and only query + path handed to the plugin —
 * never the request body, never a response the plugin controls. PKCE and `state`
 * remain the plugin's job; the host just carries the redirect.
 * ------------------------------------------------------------------ */

/** Open a URL in the user's default browser. */
export interface DesktopBrowserOpenOptions {
    url: string
}

/** What `browserOpen` reports back. */
export interface DesktopBrowserOpenResult {
    /** True when the OS accepted the URL. */
    opened: boolean
    /** The final URL handed to the OS (after normalization). */
    url: string
    /**
     * The origin the browser will visit. Present so a consent prompt can name
     * the site instead of showing a raw URL, and so a plugin can key its own
     * per-site preferences.
     */
    origin: string
}

/** Start a loopback OAuth redirect listener. */
export interface DesktopOAuthStartOptions {
    /** URL path the provider must redirect to; defaults to `/oauth/callback`. */
    callbackPath?: string
    /**
     * Fixed loopback port. Omit (the normal case) to let the OS pick one and
     * read it back from `redirectUri`. A fixed port is only useful for a
     * provider whose console requires pre-registering the exact URI.
     */
    port?: number
    /** Give up after this long (default 5min, max 30min). */
    timeoutMs?: number
    /** Shown in the OS browser tab title when the host serves the landing page. */
    title?: string
}

/** The listener, before the browser comes back. */
export interface DesktopOAuthCallbackSession {
    sessionId: string
    /** Loopback URL to register as `redirect_uri` (never leaves 127.0.0.1). */
    redirectUri: string
    host: string
    port: number
    path: string
    createdAt: number
    expiresAt: number
}

/** The completed round trip. */
export interface DesktopOAuthCallbackResult {
    sessionId: string
    ok: boolean
    /** The full URL the browser requested, including the query. */
    callbackUrl: string
    /** The path the browser requested. */
    path: string
    /** Query parameters, first value wins, as the provider sent them. */
    query: Record<string, string>
    /**
     * `oauth` for a parsed authorization response (`code`, or `error`), `unknown`
     * when the redirect carried neither (the plugin asked for a non-OAuth
     * callback — a payment return URL, say).
     */
    kind: 'oauth' | 'unknown'
    /** `error` / `error_description` when the provider refused the request. */
    error?: string
    errorDescription?: string
    /** True when the deadline passed with no redirect. */
    timedOut: boolean
    /** True when the plugin cancelled it. */
    cancelled: boolean
    /** How long the round trip took, in ms. */
    durationMs: number
}

/** The browser + loopback-redirect surface (feature-detect `desktop.browser`). */
export interface BrowserBridge {
    /** Open a URL in the system browser. Non-http(s) protocols are refused. */
    open(options: DesktopBrowserOpenOptions): Promise<DesktopBrowserOpenResult>
    /**
     * Open `url` in the system browser and wait for the loopback redirect.
     *
     * One call does the whole round trip: it binds the listener, opens the URL,
     * and resolves with the callback (or with `timedOut`/`cancelled` set). Use
     * `startOAuth` + `waitForOAuth` when the plugin needs the `redirect_uri`
     * *before* building the authorization URL.
     */
    oauth(options: DesktopOAuthAuthorizeOptions): Promise<DesktopOAuthCallbackResult>
    /** Bind the redirect listener and resolve with the `redirect_uri`. */
    startOAuth(options?: DesktopOAuthStartOptions): Promise<DesktopOAuthCallbackSession>
    /** Wait for a session created by {@link BrowserBridge.startOAuth}. */
    waitForOAuth(options: { sessionId: string }): Promise<DesktopOAuthCallbackResult>
    /** Sessions that are waiting for a redirect. */
    oauthSessions(): Promise<DesktopOAuthCallbackSession[]>
    /** Give up on a session; its pending wait resolves with `cancelled`. */
    cancelOAuth(options: { sessionId: string }): Promise<boolean>
}

/** Open the authorization URL and wait for the loopback redirect, in one call. */
export interface DesktopOAuthAuthorizeOptions extends DesktopOAuthStartOptions {
    /**
     * The authorization URL to open. Omit when the plugin builds it from a
     * `startOAuth` session; when present it is opened after the listener binds.
     */
    authorizeUrl?: string
}

