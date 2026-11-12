/**
 * Host-mediated HTTP (`http.request`) and the network policy that gates it.
 *
 * The main process performs the request so a plugin never fights CORS; the
 * policy is the SSRF switch (loopback/LAN/metadata refused by default).
 */
export interface DesktopHttpRequest {
    method?: string
    /**
     * Target URL. The main process refuses loopback / private / link-local /
     * cloud-metadata targets unless the user enabled
     * {@link DesktopNetPolicy.allowPrivateNetwork} in Settings — the SSRF guard
     * cannot be overridden per request, so read `net.policy.get` before
     * promising the caller a LAN gateway works.
     */
    url: string
    headers?: Record<string, string>
    /** Raw request body (text). */
    body?: string
    /**
     * Base64-encoded binary request body. Takes precedence over `body` when
     * present, letting plugins stream binary uploads through the main process
     * (e.g. a release asset) without a browser CORS preflight.
     */
    bodyBase64?: string
    timeoutMs?: number
    maxResponseBytes?: number
    /**
     * How the response body should come back.
     *
     * - `auto` (default): text-ish content types (see
     *   {@link DesktopHttpResponse.isText}) fill `bodyText`; anything else fills
     *   `bodyBase64`. Either way the other field is empty, so a large binary
     *   download never doubles its memory as UTF-8 mojibake.
     * - `text`: decode as `bodyText` even when the content type says binary
     *   (lossy for non-UTF-8 bytes, lossless for the UTF-8 payloads inside
     *   JSON/HTML error pages).
     * - `base64`: always carry the bytes in `bodyBase64`.
     */
    responseType?: DesktopHttpResponseType
}

/** Body representation for one `http.request`. See {@link DesktopHttpRequest.responseType}. */
export type DesktopHttpResponseType = 'auto' | 'text' | 'base64'

export interface DesktopHttpRedirect {
    status: number
    location: string
}

/**
 * What the `http.request` SSRF guard is allowed to reach.
 *
 * `allowPrivateNetwork` is a user preference (Settings → 偏好设置), owned by the
 * desktop main process, not a per-request flag: a plugin cannot widen it by
 * asking. Cloud metadata endpoints stay refused either way.
 */
export interface DesktopNetPolicy {
    /** Allow loopback / RFC1918 / link-local / ULA targets. Default false. */
    allowPrivateNetwork: boolean
}

export interface DesktopHttpResponse {
    status: number
    statusText: string
    headers: Record<string, string>
    /**
     * Decoded body, when {@link DesktopHttpResponse.isText} is true (or the
     * caller asked for `responseType: 'text'`). Empty string for a binary body.
     */
    bodyText: string
    /**
     * Exact response bytes, base64, when {@link DesktopHttpResponse.isText} is
     * false (or the caller asked for `responseType: 'base64'`). Empty string
     * when the body travelled as text.
     */
    bodyBase64: string
    /** Which field above carries the body. */
    bodyEncoding: 'text' | 'base64'
    /**
     * Whether the body was decoded as text rather than handed over as bytes.
     *
     * `auto` decides from the content type, and falls back to a strict-UTF-8
     * sniff when the type cannot decide (no header, or a generic
     * `application/octet-stream`) — a JPEG is then binary, a log file is text.
     */
    isText: boolean
    /** `charset` used to decode the text body; defaults to `utf-8`. */
    charset: string
    bodyBytes: number
    durationMs: number
    /** True when the body hit maxResponseBytes and was cut short. */
    truncated: boolean
    redirects: DesktopHttpRedirect[]
    /** Final URL after redirects. */
    finalUrl: string
}

