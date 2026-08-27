/**
 * Token 存储：与主应用（@kn/common）使用相同的 localStorage key，
 * 便于管理后台与知识库前台共享登录态。
 */
const ACCESS_TOKEN_KEY = 'knowledge-access-token'
const REFRESH_TOKEN_KEY = 'knowledge-refresh-token'
const USER_INFO_KEY = 'kn-admin-user'

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY)

export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)

export const saveTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_INFO_KEY)
}

export const isLoggedIn = () => Boolean(getAccessToken())

export const hasAuthority = (authority: string | undefined, expected: string) =>
  Boolean(authority?.split(',').map((item) => item.trim().replace(/^ROLE_/i, '')).includes(expected))

export interface AuthUser {
  userId?: string
  userName?: string
  account?: string
  avatar?: string
  authority?: string
  tenantId?: string
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

export const isAdminLoggedIn = () => {
  const user = getAuthUser()
  return isLoggedIn() && hasAuthority(user?.authority, 'administrator')
}
