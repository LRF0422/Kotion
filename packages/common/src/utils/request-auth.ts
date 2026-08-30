const OAUTH_TOKEN_ENDPOINT = '/knowledge-auth/oauth2/token'

/** Whether a request targets the public OAuth login / refresh endpoint. */
export function isOAuthTokenRequest(url?: string): boolean {
    if (!url) return false
    try {
        return new URL(url, 'https://knowledge.local').pathname.endsWith(OAUTH_TOKEN_ENDPOINT)
    } catch {
        const path = url.split(/[?#]/, 1)[0]
        return path.endsWith(OAUTH_TOKEN_ENDPOINT)
    }
}

/** Build the application Bearer value without authenticating the token endpoint. */
export function getBearerAuthorization(url: string | undefined, token: string | null): string | undefined {
    if (!token || isOAuthTokenRequest(url)) return undefined
    return `Bearer ${token}`
}

type MutableHeaders = {
    set(name: string, value: string): unknown
    delete(name: string): unknown
}

/** Apply the stored credential while always stripping it from login / refresh. */
export function applyBearerAuthorization(headers: MutableHeaders, url: string | undefined, token: string | null): void {
    if (isOAuthTokenRequest(url)) {
        headers.delete('Authorization')
        return
    }
    const authorization = getBearerAuthorization(url, token)
    if (authorization) headers.set('Authorization', authorization)
}

/** Token-endpoint 401s are credential failures, not expired-session signals. */
export function shouldHandleUnauthorized(url?: string): boolean {
    return !isOAuthTokenRequest(url)
}
