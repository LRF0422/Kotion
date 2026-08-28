/**
 * 统一请求封装：走 vite 的 /api 代理转发到网关。
 * 处理 R<T> 响应包装、Bearer 认证以及 401 时的静默刷新。
 */
import { clearTokens, getAccessToken, getRefreshToken, OPERATOR_AUDIENCE, saveTokens } from './auth'

const API_BASE = '/api'
const TOKEN_ENDPOINT = '/knowledge-auth/oauth2/token'

export interface ApiResult<T> {
  code: number
  success: boolean
  data: T
  msg: string
}

/** 后端 MyBatis-Plus IPage 分页结构 */
export interface PageResult<T> {
  records: T[]
  total: number
  size: number
  current: number
  pages: number
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  params?: QueryParams
  body?: unknown
  form?: QueryParams
  headers?: Record<string, string>
}

const buildForm = (params?: QueryParams) => {
  const search = new URLSearchParams()
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.append(key, String(value))
  })
  return search.toString()
}

const buildQuery = (params?: QueryParams) => {
  if (!params) return ''
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, String(value))
    }
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

const redirectToLogin = () => {
  clearTokens()
  if (!window.location.hash.startsWith('#/login')) {
    window.location.hash = '#/login'
  }
}

/** 刷新 token（grantType=refresh_token），并发请求只触发一次刷新 */
let refreshPromise: Promise<boolean> | null = null

const recoverConcurrentRefresh = async (originalRefreshToken: string): Promise<boolean> => {
  if (getRefreshToken() !== originalRefreshToken) return Boolean(getAccessToken())
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, 5000)
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'knowledge-operator-refresh-token') done()
    }
    function done() {
      window.clearTimeout(timeout)
      window.removeEventListener('storage', onStorage)
      resolve()
    }
    window.addEventListener('storage', onStorage)
  })
  return getRefreshToken() !== originalRefreshToken && Boolean(getAccessToken())
}

const doRefreshToken = async (): Promise<boolean> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const form = buildForm({ grantType: 'refresh_token', refreshToken, audience: OPERATOR_AUDIENCE })
    const response = await fetch(`${API_BASE}${TOKEN_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    if (!response.ok) return recoverConcurrentRefresh(refreshToken)
    const result = await response.json()
    const data = result?.data
    if (result?.code === 200 && data?.access_token && data?.refresh_token) {
      if (getRefreshToken() !== refreshToken) return Boolean(getAccessToken())
      saveTokens(data.access_token, data.refresh_token)
      return true
    }
    return recoverConcurrentRefresh(refreshToken)
  } catch {
    return recoverConcurrentRefresh(refreshToken)
  }
}

const refreshAcrossTabs = async (): Promise<boolean> => {
  const originalRefreshToken = getRefreshToken()
  const lockManager = (navigator as any).locks
  if (!lockManager?.request) return doRefreshToken()
  return lockManager.request('knowledge-operator-oauth-refresh', async () => {
    if (originalRefreshToken && getRefreshToken() !== originalRefreshToken) {
      return Boolean(getAccessToken())
    }
    return doRefreshToken()
  })
}

const refreshTokenOnce = () => {
  if (!refreshPromise) {
    refreshPromise = refreshAcrossTabs().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export const request = async <T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> => {
  const { method = 'GET', params, body, form, headers } = options
  const token = getAccessToken()
  const response = await fetch(`${API_BASE}${path}${buildQuery(params)}`, {
    method,
    headers: {
      ...(form !== undefined
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: form !== undefined ? buildForm(form) : body !== undefined ? JSON.stringify(body) : undefined,
  })

  // HTTP 401：尝试静默刷新后重放一次
  if (response.status === 401 && !retried) {
    const refreshed = await refreshTokenOnce()
    if (refreshed) {
      return request<T>(path, options, true)
    }
    redirectToLogin()
    throw new Error('登录已过期，请重新登录')
  }

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${response.statusText}`)
  }

  const result: ApiResult<T> = await response.json()
  if (result.code === 401) {
    redirectToLogin()
    throw new Error(result.msg || '登录已过期，请重新登录')
  }
  if (result.code !== 200) {
    throw new Error(result.msg || '请求失败')
  }
  return result.data
}

export const get = <T>(path: string, params?: QueryParams) => request<T>(path, { params })

export const post = <T>(path: string, body?: unknown, params?: QueryParams) =>
  request<T>(path, { method: 'POST', body, params })

export const postForm = <T>(path: string, form: QueryParams) =>
  request<T>(path, { method: 'POST', form })

export const put = <T>(path: string, body?: unknown, params?: QueryParams) =>
  request<T>(path, { method: 'PUT', body, params })

export const del = <T>(path: string, params?: QueryParams) =>
  request<T>(path, { method: 'DELETE', params })
