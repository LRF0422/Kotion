/**
 * 统一请求封装：开发阶段各页面使用 mock 数据，
 * 接入真实后端时将 service 层切换到该方法即可（走 vite 的 /api 代理）。
 */
const API_BASE = '/api'

export interface ApiResult<T> {
  code: number
  success: boolean
  data: T
  msg: string
}

export const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const token = localStorage.getItem('kn-admin-token')
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${response.statusText}`)
  }
  const result: ApiResult<T> = await response.json()
  if (!result.success) {
    throw new Error(result.msg || '请求失败')
  }
  return result.data
}
