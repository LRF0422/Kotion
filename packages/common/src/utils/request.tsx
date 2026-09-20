import axios from 'axios'
import { getAccessToken } from './auth'
import { i18n } from '../locales'

// Allow callers to opt out of the global error toast for expected failures
// (e.g. probing a plugin config that has never been saved yet).
declare module 'axios' {
    interface AxiosRequestConfig {
        silent?: boolean
    }
}
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
// Entitlement-required handler (injected by the app to open the upgrade prompt)
// ---------------------------------------------------------------------------

/** 与后端 EntitlementErrorCodes 保持一致。 */
export const ENTITLEMENT_ERROR_CODES = [40301, 40302] as const

type EntitlementHandler = (payload: { code: number; message: string }) => void

let _entitlementRequiredHandler: EntitlementHandler | null = null

/** Call once at app startup to wire up the upgrade prompt. */
export function setEntitlementRequiredHandler(handler: EntitlementHandler | null) {
    _entitlementRequiredHandler = handler
}

/** 判断一个请求错误是否由权益/额度触发。 */
export function isEntitlementError(error: unknown): boolean {
    const code = (error as { code?: number } | undefined)?.code
    return typeof code === 'number' && (ENTITLEMENT_ERROR_CODES as readonly number[]).includes(code)
}

const isSensitiveResponse = (url?: string): boolean =>
    !!url && (
        /\/file\/upload-sessions\/[^/]+\/parts\/sign(?:\?|$)/.test(url)
        || /\/file\/[^/]+\/access-urls(?:\?|$)/.test(url)
    )

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
    if (!message) {
        return t('apiError.unknown', '请求失败，请稍后重试')
    }
    if (message === 'Network Error') {
        return t('apiError.network', '后端接口连接异常')
    }
    if (message.includes('timeout')) {
        return t('apiError.timeout', '系统接口请求超时')
    }
    const status = /Request failed with status code (\d{3})/.exec(message)?.[1]
    if (status) {
        return t('apiError.status', `系统接口 ${status} 异常`, { status })
    }
    return message
}

// ---------------------------------------------------------------------------
// Error messages: the backend's own message wins, localized fallbacks second
// ---------------------------------------------------------------------------

/**
 * Translate a fallback message. `defaultValue` keeps the request layer usable
 * before i18n is initialized (or when called outside the app, e.g. in desktop
 * bootstrap code).
 */
function t(key: string, defaultValue: string, options?: Record<string, unknown>): string {
    try {
        const translated = i18n?.t?.(key, { defaultValue, ...(options || {}) })
        if (typeof translated === 'string' && translated.length > 0) {
            return translated
        }
    } catch {
        // i18n not ready — the default text is still correct
    }
    return defaultValue
}

/** BCP-47 tag for the current UI language, so the backend localizes its errors. */
function acceptLanguage(): string | undefined {
    const language = i18n?.language
    if (!language) return undefined
    const lower = language.toLowerCase()
    if (lower.startsWith('zh')) return 'zh-CN'
    if (lower.startsWith('en')) return 'en-US'
    return language
}

/**
 * The backend's own error text. Blade-style responses carry `msg`; other
 * services and proxies may use `message`/`error` (or a bare string body).
 */
export function extractBackendMessage(data: unknown): string | undefined {
    if (typeof data === 'string') {
        const text = data.trim()
        return text && text.length <= 500 ? text : undefined
    }
    if (!data || typeof data !== 'object') return undefined
    const record = data as Record<string, unknown>
    for (const key of ['msg', 'message', 'error', 'errorMessage']) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) {
            return value.trim()
        }
    }
    return undefined
}

/** Localized fallback for an HTTP status whose body carried no message. */
function statusFallbackMessage(status?: number): string {
    if (status === 401) return t('apiError.unauthorized', '登录状态已失效，请重新登录')
    if (status === 403) return t('apiError.forbidden', '没有权限执行该操作')
    if (status === 404) return t('apiError.notFound', '请求的资源不存在')
    if (status && status >= 500) return t('apiError.server', '服务器内部错误，请稍后重试')
    if (status) return t('apiError.status', `系统接口 ${status} 异常`, { status })
    return t('apiError.unknown', '请求失败，请稍后重试')
}

/**
 * Message a UI should show for a failed API call: the backend's own message
 * when it sent one, otherwise the (already localized) transport fallback.
 */
export function getApiErrorMessage(error: unknown, fallback?: string): string {
    const message = (error as { message?: unknown } | undefined)?.message
    if (typeof message === 'string' && message.trim()) {
        return message
    }
    return fallback ?? t('apiError.unknown', '请求失败，请稍后重试')
}

/**
 * Rejection shape of this client: `message` is always the text to show (backend
 * message or localized fallback), while axios' `response`/`config` stay intact
 * for callers that inspect status codes.
 */
function enrichError(error: unknown, message: string, code?: number, httpStatus?: number): Error {
    const enriched = (error instanceof Error ? error : new Error(message)) as Error & {
        code?: number
        status?: number
        httpStatus?: number
    }
    enriched.message = message
    if (typeof code === 'number') {
        enriched.code = code
    }
    if (typeof httpStatus === 'number') {
        enriched.status = httpStatus
        enriched.httpStatus = httpStatus
    }
    return enriched
}

// ---------------------------------------------------------------------------
// Request interceptor — inject auth header
// ---------------------------------------------------------------------------

axiosInstance.interceptors.request.use(
    config => {
        applyBearerAuthorization(config.headers, config.url, getAccessToken())
        // Tell the backend which language to localize business errors in
        // (Spring resolves Accept-Language → i18n/messages_*.properties).
        const language = acceptLanguage()
        if (language) {
            config.headers['Accept-Language'] = language
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

        const responsePreview = isSensitiveResponse(res.config.url)
            ? '[REDACTED]'
            : JSON.stringify(res.data)?.slice(0, 200)
        console.log('[Response Interceptor]', res.config.url, '| HTTP:', res.status, '| code:', code, '| data:', responsePreview)

        if (code === 401) {
            const message = msg || t('apiError.sessionExpired', '无效的会话，或者会话已过期，请重新登录。')
            if (shouldHandleUnauthorized(res.config.url)) handleSessionExpired()
            return Promise.reject(enrichError(new Error(message), message, code, res.status))
        }

        if (code === 500) {
            const message = msg || t('apiError.server', '服务器内部错误，请稍后重试')
            return Promise.reject(enrichError(new Error(message), message, code, res.status))
        }

        if (code !== 200) {
            // Business error: show the backend's own (localized) message; the
            // backend localizes it from Accept-Language, so a non-empty message
            // is never replaced by a generic one.
            const message = msg || statusFallbackMessage(res.status)
            if (!res.config.silent) {
                _toastError(message, { position: 'top-center' })
            }
            if ((ENTITLEMENT_ERROR_CODES as readonly number[]).includes(code)) {
                try {
                    _entitlementRequiredHandler?.({ code, message })
                } catch {
                    // an upgrade prompt must never mask the original rejection
                }
            }
            return Promise.reject(enrichError(new Error(message), message, code, res.status))
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
            return Promise.reject(new Error(t('apiError.loginExpired', '登录已过期，请重新登录。')))
        }

        // --- Generic error handling ---
        const rawMessage: string = error.message ?? ''
        // The backend's own message wins over axios' transport text: the UI must
        // show WHY the call failed (and the backend localizes it via
        // Accept-Language), not "Request failed with status code 500". Callers
        // that show `error.message` themselves get the same text.
        const backendMessage = extractBackendMessage(response?.data)
        const message = backendMessage
            || (httpStatus ? statusFallbackMessage(httpStatus) : normalizeErrorMessage(rawMessage))
        const backendCode = (response?.data as { code?: unknown } | undefined)?.code
        const code = typeof backendCode === 'number' ? backendCode : httpStatus

        if (!config?.silent) {
            _toastError(message, { position: 'top-right', duration: 2000 })
        }

        // Business failures now arrive as HTTP 400 + the original business code
        // (see KnowledgeRestExceptionTranslator), so entitlement codes must also
        // open the upgrade prompt on this path — not only on HTTP 200 + code.
        if (typeof code === 'number' && (ENTITLEMENT_ERROR_CODES as readonly number[]).includes(code)) {
            try {
                _entitlementRequiredHandler?.({ code, message })
            } catch {
                // an upgrade prompt must never mask the original rejection
            }
        }

        return Promise.reject(enrichError(error, message, code, httpStatus))
    }
)

export default axiosInstance
