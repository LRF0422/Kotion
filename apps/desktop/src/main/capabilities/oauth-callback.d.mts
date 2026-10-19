/** Types for `oauth-callback.mjs`. Keep in step with the implementation. */

export interface OAuthCallbackResult {
    ok: boolean
    callbackUrl: string
    path: string
    query: Record<string, string>
    kind: 'oauth' | 'unknown'
    error?: string
    errorDescription?: string
    timedOut: boolean
    cancelled: boolean
    durationMs: number
}

export interface OAuthListenerSession {
    sessionId: string
    host: '127.0.0.1'
    port: number
    path: string
    redirectUri: string
    createdAt: number
    expiresAt: number
    cancel: () => void
}

export const OAUTH_DEFAULT_TIMEOUT_MS: number
export const OAUTH_MAX_TIMEOUT_MS: number
export const OAUTH_MIN_TIMEOUT_MS: number
export const OAUTH_MAX_HEAD_BYTES: number
export const OAUTH_MAX_SESSIONS: number

export function normalizeOAuthStartOptions(raw: unknown): {
    callbackPath: string
    port: number
    timeoutMs: number
    title: string
}

export function parseOAuthCallback(rawUrl: string): {
    callbackUrl: string
    path: string
    query: Record<string, string>
    kind: 'oauth' | 'unknown'
    error?: string
    errorDescription?: string
}

export function startOAuthListener(options: {
    callbackPath: string
    port: number
    timeoutMs: number
    title: string
    locale?: string
    onResult: (result: OAuthCallbackResult) => void
}): Promise<OAuthListenerSession>

export function guardOAuthConnection(socket: import('node:net').Socket): void
