import axios from 'axios'
import { getAccessToken } from './auth'
import { applyBearerAuthorization, shouldHandleUnauthorized } from './request-auth'
import {
    API_BASE_URL,
    handleSessionExpired,
    isSessionRedirecting,
    refreshAccessToken,
    resetSessionExpiredGuard,
    setSessionExpiredHandler,
} from './session'

// Re-export the session-expired controls so existing import sites
// (`@kn/common` → './utils/request') keep working unchanged.
export { setSessionExpiredHandler, resetSessionExpiredGuard }

// ---------------------------------------------------------------------------
// Configurable toast handler (injected by the app to avoid @kn/ui dependency)
// ---------------------------------------------------------------------------

type ToastFn = (message: string, options?: { position?: string; duration?: number }) => void

let _toastError: ToastFn = (msg) => { console.error('[request]', msg) }

/** Call once at app startup to wire up the real toast implementation */
export function setRequestToast(toastError: ToastFn) {
    _toastError = toastError
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = API_BASE_URL
const TIMEOUT = 50_000

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const axiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: TIMEOUT,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeErrorMessage(message: string): string {
    if (message === 'Network Error') {
        return '后端接口连接异常'
    }
    if (message.includes('timeout')) {
        return '系统接口请求超时'
    }
    if (message.includes('Request failed with status code')) {
        return `系统接口${message.slice(-3)}异常`
    }
    return message
}

// ---------------------------------------------------------------------------
// Request interceptor — inject auth header
// ---------------------------------------------------------------------------

axiosInstance.interceptors.request.use(
    config => {
        applyBearerAuthorization(config.headers, config.url, getAccessToken())
        return config
    },
    error => Promise.reject(error)
)

// ---------------------------------------------------------------------------
// Response interceptor — success path
// ---------------------------------------------------------------------------

axiosInstance.interceptors.response.use(
    res => {
        // Pass binary responses through as-is
        if (res.request.responseType === 'blob' || res.request.responseType === 'arraybuffer') {
            return res.data
        }

        // Business-level status code (defaults to 200 when absent)
        const code: number = res.data?.code ?? 200
        const msg: string = res.data?.msg ?? ''

        console.log('[Response Interceptor]', res.config.url, '| HTTP:', res.status, '| code:', code, '| data:', JSON.stringify(res.data)?.slice(0, 200))

        if (code === 401) {
            if (shouldHandleUnauthorized(res.config.url)) handleSessionExpired()
            return Promise.reject(new Error(msg || '无效的会话，或者会话已过期，请重新登录。'))
        }

        if (code === 500) {
            return Promise.reject(new Error(msg || '服务器内部错误'))
        }

        if (code !== 200) {
            _toastError(msg, { position: 'top-center' })
            return Promise.reject(new Error(msg))
        }

        return res.data
    },

    // ---------------------------------------------------------------------------
    // Response interceptor — error path (HTTP-level errors)
    // ---------------------------------------------------------------------------
    async error => {
        const { response, config } = error
        const httpStatus: number | undefined = response?.status
        console.log('[Response Error Interceptor]', config?.url, '| HTTP:', httpStatus, '| data:', JSON.stringify(response?.data)?.slice(0, 200))

        // --- Silent token refresh on HTTP 401 ---
        if (httpStatus === 401 && !config?._retried && shouldHandleUnauthorized(config?.url)) {
            config._retried = true

            // A session-expired flow is already running — don't loop.
            if (isSessionRedirecting()) {
                return Promise.reject(error)
            }

            // Concurrent 401s share a single in-flight refresh.
            const newToken = await refreshAccessToken()
            if (newToken) {
                config.headers['Authorization'] = `Bearer ${newToken}`
                return axiosInstance(config)
            }

            handleSessionExpired()
            return Promise.reject(new Error('登录已过期，请重新登录。'))
        }

        // --- Generic error handling ---
        const rawMessage: string = error.message ?? ''
        const friendlyMessage = normalizeErrorMessage(rawMessage)

        if (response?.data?.msg) {
            _toastError(response.data.msg, { position: 'top-right', duration: 2000 })
        } else if (friendlyMessage !== rawMessage) {
            _toastError(friendlyMessage, { position: 'top-right', duration: 2000 })
        }

        return Promise.reject(error)
    }
)

export default axiosInstance
