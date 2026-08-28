/**
 * Session & token-refresh utilities (shared).
 *
 * Centralizes OAuth2 access-token refresh with concurrency control and the
 * session-expired handling so that BOTH the axios request layer and the raw
 * `fetch`-based AI streaming clients share the exact same logic:
 *
 * - `refreshAccessToken()` — single in-flight refresh (dedupes concurrent 401s)
 * - `authorizedFetch()`    — `fetch` wrapper that injects the Bearer header and
 *                            transparently refreshes + retries once on HTTP 401
 * - `handleSessionExpired()` — shows the injected re-login dialog (or redirects)
 *
 * The AI agent streams (V1/V2 SSE clients) do NOT go through axios interceptors,
 * so without this shared layer an expired token would surface as an opaque
 * "生成失败，请重试" error instead of a silent refresh / re-login prompt.
 */

import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './auth'

// ---------------------------------------------------------------------------
// Shared API base URL
// ---------------------------------------------------------------------------

// Desktop (Electron) renderer loads from the `app://` custom protocol in
// production, so a relative `/api` cannot be resolved — it must hit the cloud
// API via an absolute URL. The web app keeps `/api` (same-origin / dev proxy)
// to avoid browser CORS.
const isDesktop = typeof window !== 'undefined' && typeof (window as any).api !== 'undefined'
const CLOUD_API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'https://kotion.top:888/api'

/** Base URL for the auth/cloud API, shared by the axios instance and refresh. */
export const API_BASE_URL: string = isDesktop ? CLOUD_API_BASE_URL : '/api'

const REFRESH_ENDPOINT = '/knowledge-auth/oauth2/token'

// ---------------------------------------------------------------------------
// Session-expired handler (injected by the app to show a re-login dialog)
// ---------------------------------------------------------------------------

type SessionExpiredFn = () => void

let _sessionExpiredHandler: SessionExpiredFn | null = null

/** Prevent duplicate redirect/dialog when many 401s arrive simultaneously. */
let isRedirecting = false

/** Call once at app startup to wire up the session-expired dialog. */
export function setSessionExpiredHandler(handler: SessionExpiredFn): void {
    _sessionExpiredHandler = handler
}

/** Reset the session-expired guard so future 401s can trigger the dialog again.
 *  Call this when the user dismisses the dialog and chooses to stay. */
export function resetSessionExpiredGuard(): void {
    isRedirecting = false
}

/** Whether a session-expired flow is currently in progress. */
export function isSessionRedirecting(): boolean {
    return isRedirecting
}

function redirectToLogin(): void {
    clearTokens()
    if (typeof window !== 'undefined') {
        window.location.href = '/login'
    }
}

/** Called when the session is definitively expired (refresh failed or no
 *  refresh token). Shows the injected prompt if available, otherwise redirects.
 *  Guarded so only one prompt appears even when many 401s arrive at once. */
export function handleSessionExpired(): void {
    if (isRedirecting) return
    isRedirecting = true
    clearTokens()
    if (_sessionExpiredHandler) {
        _sessionExpiredHandler()
    } else {
        redirectToLogin()
    }
}

// ---------------------------------------------------------------------------
// Token refresh (single in-flight, dedupes concurrent callers)
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string | null> | null = null

async function recoverConcurrentRefresh(originalRefreshToken: string): Promise<string | null> {
    if (getRefreshToken() !== originalRefreshToken) return getAccessToken()
    if (typeof window === 'undefined') return null
    await new Promise<void>(resolve => {
        const timeout = window.setTimeout(done, 5000)
        const onStorage = (event: StorageEvent) => {
            if (event.key === 'knowledge-refresh-token') done()
        }
        function done() {
            window.clearTimeout(timeout)
            window.removeEventListener('storage', onStorage)
            resolve()
        }
        window.addEventListener('storage', onStorage)
    })
    return getRefreshToken() !== originalRefreshToken ? getAccessToken() : null
}

async function doRefresh(): Promise<string | null> {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return null

    try {
        const params = new URLSearchParams({
            grantType: 'refresh_token',
            refreshToken,
        })
        const res = await fetch(`${API_BASE_URL}${REFRESH_ENDPOINT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        })

        if (!res.ok) return recoverConcurrentRefresh(refreshToken)

        const raw = await res.json().catch(() => null)
        // Support both a flat body ({ accessToken, refreshToken }) and an
        // R<T>-wrapped body ({ code, msg, data: { ... } }), plus snake_case.
        const payload =
            raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object'
                ? raw.data
                : raw
        const accessToken: string | undefined = payload?.accessToken ?? payload?.access_token
        const newRefreshToken: string | undefined = payload?.refreshToken ?? payload?.refresh_token

        if (!accessToken || !newRefreshToken) return recoverConcurrentRefresh(refreshToken)

        // A context switch or a new login may have replaced the refresh token
        // while this request was in flight. Never let the stale response win.
        if (getRefreshToken() !== refreshToken) return getAccessToken()

        saveTokens(accessToken, newRefreshToken)
        return accessToken
    } catch {
        return recoverConcurrentRefresh(refreshToken)
    }
}

/**
 * Refresh the access token. Concurrent callers share the same in-flight
 * request, so the refresh endpoint is hit at most once per burst of 401s.
 *
 * @returns the new access token on success, or `null` when refresh is not
 *          possible (no refresh token / refresh rejected).
 */
async function refreshAcrossTabs(): Promise<string | null> {
    const originalRefreshToken = getRefreshToken()
    const lockManager = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined
    if (!lockManager?.request) return doRefresh()
    return lockManager.request('knowledge-oauth-refresh', async () => {
        if (originalRefreshToken && getRefreshToken() !== originalRefreshToken) {
            return getAccessToken()
        }
        return doRefresh()
    })
}

export function refreshAccessToken(): Promise<string | null> {
    if (!refreshPromise) {
        refreshPromise = refreshAcrossTabs().finally(() => {
            refreshPromise = null
        })
    }
    return refreshPromise
}

// ---------------------------------------------------------------------------
// authorizedFetch — fetch with Bearer injection + silent refresh on 401
// ---------------------------------------------------------------------------

/**
 * A `fetch` wrapper that mirrors the axios interceptor behaviour for the raw
 * streaming clients:
 *
 * 1. Injects `Authorization: Bearer <accessToken>` (unless already set).
 * 2. On HTTP 401, attempts a single silent token refresh and replays once.
 * 3. If the refresh fails (or the retry is still 401), triggers the
 *    session-expired flow (re-login dialog) before returning the response.
 *
 * The original request body/signal are preserved on retry.
 */
export async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    // AI streaming callers still pass relative `/api/...` URLs. On desktop the
    // renderer runs on the `app://` origin, so resolve those against the cloud
    // API base instead of letting them hit `app://api/...`.
    const resolvedUrl = isDesktop && url.startsWith('/api')
        ? new URL(url, API_BASE_URL).toString()
        : url

    const request = (token: string | null): Promise<Response> => {
        const headers = new Headers(init.headers as HeadersInit | undefined)
        if (token) {
            headers.set('Authorization', `Bearer ${token}`)
        }
        return fetch(resolvedUrl, { ...init, headers })
    }

    let response = await request(getAccessToken())

    if (response.status === 401) {
        // Don't try to refresh once a session-expired flow is already running.
        if (isSessionRedirecting()) return response

        const newToken = await refreshAccessToken()
        if (newToken) {
            response = await request(newToken)
        }

        if (response.status === 401) {
            handleSessionExpired()
        }
    }

    return response
}
