/**
 * OAuth2 token storage utilities.
 * Centralizes all token read/write operations for the application.
 */

const ACCESS_TOKEN_KEY = 'knowledge-access-token';
const REFRESH_TOKEN_KEY = 'knowledge-refresh-token';

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
