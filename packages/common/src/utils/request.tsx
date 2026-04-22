import axios from 'axios'
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './auth'

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

const BASE_URL = '/api'
const TIMEOUT = 50_000
const REFRESH_ENDPOINT = '/knowledge-auth/token/refresh'

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const axiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: TIMEOUT,
})

/** Bare axios instance used exclusively for the token-refresh call.
 *  It intentionally has NO interceptors so a 401 from the refresh
 *  endpoint goes straight to the catch block without looping. */
const refreshAxios = axios.create({
    baseURL: BASE_URL,
    timeout: TIMEOUT,
})

// ---------------------------------------------------------------------------
// Token-refresh concurrency control
// ---------------------------------------------------------------------------

let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []
/** Prevent duplicate redirect calls when multiple 401s arrive simultaneously */
let isRedirecting = false

function enqueueRefreshSubscriber(cb: (token: string) => void): void {
    refreshSubscribers.push(cb)
}

function flushRefreshSubscribers(token: string): void {
    refreshSubscribers.forEach(cb => cb(token))
    refreshSubscribers = []
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redirectToLogin(): void {
    if (isRedirecting) return
    isRedirecting = true
    clearTokens()
    window.location.href = '/login'
}

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
        const token = getAccessToken()
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`
        }
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
            redirectToLogin()
            return Promise.reject(new Error('无效的会话，或者会话已过期，请重新登录。'))
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
        if (httpStatus === 401 && !config?._retried) {
            const refreshToken = getRefreshToken()

            if (refreshToken && !isRedirecting) {
                // Another refresh is already in-flight — queue this request
                if (isRefreshing) {
                    return new Promise(resolve => {
                        enqueueRefreshSubscriber(token => {
                            config.headers['Authorization'] = `Bearer ${token}`
                            resolve(axiosInstance(config))
                        })
                    })
                }

                config._retried = true
                isRefreshing = true

                try {
                    const refreshRes = await refreshAxios.post(
                        REFRESH_ENDPOINT,
                        { refreshToken },
                        { headers: { Authorization: `Bearer ${refreshToken}` } }
                    )
                    const { accessToken, refreshToken: newRefreshToken } = refreshRes.data
                    saveTokens(accessToken, newRefreshToken)
                    flushRefreshSubscribers(accessToken)
                    config.headers['Authorization'] = `Bearer ${accessToken}`
                    return axiosInstance(config)
                } catch {
                    redirectToLogin()
                    return Promise.reject(new Error('登录已过期，请重新登录。'))
                } finally {
                    isRefreshing = false
                }
            }

            redirectToLogin()
            return Promise.reject(error)
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
