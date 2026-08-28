/**
 * 平台运营端使用独立的登录态，避免与租户知识库前台共享 token。
 */
const ACCESS_TOKEN_KEY = 'knowledge-operator-access-token'
const REFRESH_TOKEN_KEY = 'knowledge-operator-refresh-token'
const USER_INFO_KEY = 'kn-operator-user'

export const OPERATOR_AUDIENCE = 'kotion-platform-admin'

const PLATFORM_OPERATOR_AUTHORITIES = [
  'administrator',
  'PLATFORM_SUPER_ADMIN',
  'PLATFORM_OPERATOR',
  'PLATFORM_AUDITOR',
]

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY)

export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)

export const saveTokens = (accessToken: string, refreshToken?: string) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }
}

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_INFO_KEY)
}

export const isLoggedIn = () => Boolean(getAccessToken())

const normalizeAuthority = (authority: string) => authority.trim().replace(/^ROLE_/i, '').toLowerCase()

export const hasAuthority = (authority: string | undefined, expected: string) =>
  Boolean(authority?.split(',').map(normalizeAuthority).includes(normalizeAuthority(expected)))

export const hasAnyAuthority = (authority: string | undefined, expected: string[]) =>
  expected.some((item) => hasAuthority(authority, item))

export const hasPermission = (permissions: string[] | undefined, expected: string) =>
  Boolean(permissions?.includes('*') || permissions?.includes(expected))

export const getTokenPermissions = (accessToken: string): string[] | undefined => {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return undefined
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const permissions = (JSON.parse(atob(padded)) as { permissions?: string | string[] }).permissions
    if (Array.isArray(permissions)) return permissions.length > 0 ? permissions : undefined
    const parsed = permissions?.split(',').map((item) => item.trim()).filter(Boolean)
    return parsed && parsed.length > 0 ? parsed : undefined
  } catch {
    return undefined
  }
}

export interface AuthUser {
  userId?: string
  userName?: string
  account?: string
  avatar?: string
  authority?: string
  tenantId?: string
  /** Auth API may expose permission codes in a future compatible response. */
  permissions?: string[]
}

export const saveAuthUser = (user: AuthUser) => {
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(user))
}

export const getAuthUser = (): AuthUser | null => {
  const raw = localStorage.getItem(USER_INFO_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const hasOperatorAccess = (user: AuthUser | null | undefined) =>
  Boolean(user?.permissions?.some((permission) => permission === 'PLATFORM_ADMIN' || permission.startsWith('platform.')))
  || hasAnyAuthority(user?.authority, PLATFORM_OPERATOR_AUTHORITIES)

export const isOperatorLoggedIn = () => isLoggedIn() && hasOperatorAccess(getAuthUser())
