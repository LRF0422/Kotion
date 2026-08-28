/**
 * OAuth2 token storage utilities.
 * Centralizes all token read/write operations for the application.
 */

import type { ContextTokenResponse, TokenContextState } from '../api/types'

const ACCESS_TOKEN_KEY = 'knowledge-access-token';
const REFRESH_TOKEN_KEY = 'knowledge-refresh-token';
const CONTEXT_CHANGE_KEY = 'knowledge-context-change';

/**
 * Get the stored OAuth2 access token.
 */
export function getAccessToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Get the stored OAuth2 refresh token.
 */
export function getRefreshToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Persist both tokens after a successful login or token refresh.
 */
export function saveTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function normalizeTokenResponse(data: ContextTokenResponse): { accessToken: string; refreshToken: string } {
    return {
        accessToken: data.accessToken || data.access_token || '',
        refreshToken: data.refreshToken || data.refresh_token || '',
    }
}

/**
 * Remove all auth tokens (logout / session expiry).
 */
export function clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Build a standard OAuth2 Bearer authorization header object.
 * Returns an empty object when no token is available.
 */
export function getBearerHeader(): Record<string, string> {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Clear local data that must not cross an authorization-context boundary. */
export function clearContextSensitiveClientState(): void {
    if (typeof localStorage === 'undefined') return
    try {
        const prefixes = ['kn:page-tabs:', 'agentcore:', 'kn-ai-chat-', 'kn_plugin_configs']
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index)
            if (key && prefixes.some(prefix => key.startsWith(prefix))) {
                localStorage.removeItem(key)
            }
        }
    } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
    }
}

export function notifyContextChanged(contextId: string): void {
    if (typeof localStorage === 'undefined') return
    try {
        localStorage.setItem(CONTEXT_CHANGE_KEY, JSON.stringify({ contextId, at: Date.now() }))
    } catch {
        // The initiating tab still performs a hard reload below.
    }
}

export function subscribeToContextChanges(listener: (contextId?: string) => void): () => void {
    if (typeof window === 'undefined') return () => undefined
    const handleStorage = (event: StorageEvent) => {
        if (event.key !== CONTEXT_CHANGE_KEY || !event.newValue) return
        try {
            listener((JSON.parse(event.newValue) as { contextId?: string }).contextId)
        } catch {
            listener()
        }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
}

/** Read context authorization claims for UI gating. The backend remains authoritative. */
export function getTokenContextState(token = getAccessToken()): TokenContextState {
    const fallback: TokenContextState = {}
    if (!token) return fallback
    try {
        const payload = token.split('.')[1]
        if (!payload) return fallback
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
        const decoded = decodeURIComponent(
            atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
                .split('')
                .map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
                .join('')
        )
        const claims = JSON.parse(decoded) as Record<string, unknown>
        return {
            contextId: typeof claims.ctx_id === 'string'
                ? claims.ctx_id
                : typeof claims.tenant_id === 'string' ? claims.tenant_id : undefined,
            contextType: claims.ctx_type === 'INDIVIDUAL' || claims.ctx_type === 'TEAM'
                ? claims.ctx_type
                : undefined,
        }
    } catch {
        return fallback
    }
}
