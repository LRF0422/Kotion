/**
 * Loopback redirect listener for OAuth (and any other browser round trip).
 *
 * Why the host has to own this: a desktop shell cannot use a custom URL scheme
 * without registering it with the OS (and then any app can hijack it), and it
 * cannot use the cloud origin as a redirect without leaking the authorization
 * code through a third party. `127.0.0.1` + an ephemeral port is the one
 * redirect target that is private to this machine, needs no registration, and
 * works with every OAuth provider that supports the "desktop / native app" flow.
 *
 * The listener is intentionally minimal:
 *   - bound to `127.0.0.1` only (never `0.0.0.0`);
 *   - serves exactly one path, answers 404 to anything else and 405 to every
 *     method but GET/HEAD;
 *   - caps the request head, so a hostile local process cannot stream a huge
 *     header into the app;
 *   - hands the plugin ONLY the path + query — never the body, never a page the
 *     plugin controls;
 *   - closes itself on the first matching request, on timeout, or on cancel.
 *
 * `state`/PKCE verification is the plugin's job: the host cannot know which
 * parameter is the CSRF token. It does parse `code`/`error` so the common case
 * needs no string surgery, and always hands back the raw URL for the rest.
 */

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

/** Bounds, exported so the docs and the UI agree with the code. */
export const OAUTH_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
export const OAUTH_MAX_TIMEOUT_MS = 30 * 60 * 1000
export const OAUTH_MIN_TIMEOUT_MS = 10 * 1000
/** Cap on the request line + headers we are willing to read. */
export const OAUTH_MAX_HEAD_BYTES = 32 * 1024
/** Live listeners at once. */
export const OAUTH_MAX_SESSIONS = 4

const CALLBACK_PATH_RE = /^\/[A-Za-z0-9._~/-]{0,128}$/

/** Attribute/text escaping for the tiny landing page below. */
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
        switch (char) {
            case '&':
                return '&amp;'
            case '<':
                return '&lt;'
            case '>':
                return '&gt;'
            case '"':
                return '&quot;'
            default:
                return '&#39;'
        }
    })
}

/** The page the user's browser shows after the redirect. No scripts, no data. */
const landingPage = (title, message, ok) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:26rem;padding:2rem;text-align:center}
.badge{width:2.5rem;height:2.5rem;border-radius:9999px;margin:0 auto 1rem;display:flex;align-items:center;justify-content:center;
font-size:1.25rem;color:#fff;background:${ok ? '#16a34a' : '#dc2626'}}
h1{font-size:1.05rem;margin:0 0 .5rem}
p{margin:0;opacity:.7;font-size:.9rem}
</style></head>
<body><main><div class="badge">${ok ? '&#10003;' : '&#10005;'}</div>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`

/** Locale-aware copy; the main process has no i18n runtime. */
const strings = (locale) =>
    locale.toLowerCase().startsWith('zh')
        ? {
              title: '授权完成',
              done: '可以关闭这个页面了，请回到 KNOTION 继续。',
              refusedTitle: '授权未完成',
              refused: '提供方返回了错误，请回到 KNOTION 查看详情。',
          }
        : {
              title: 'Authorization complete',
              done: 'You can close this tab and return to KNOTION.',
              refusedTitle: 'Authorization failed',
              refused: 'The provider returned an error. Return to KNOTION for details.',
          }

/**
 * Normalize the options for one listener.
 *
 * @param {unknown} raw
 * @returns {{ callbackPath: string, port: number, timeoutMs: number, title: string }}
 */
export function normalizeOAuthStartOptions(raw) {
    const params = raw && typeof raw === 'object' ? raw : {}
    const callbackPath =
        typeof params.callbackPath === 'string' && params.callbackPath.trim()
            ? params.callbackPath.trim()
            : '/oauth/callback'
    if (!CALLBACK_PATH_RE.test(callbackPath) || callbackPath.includes('//')) {
        throw new Error('shell.oauth: "callbackPath" must be a single absolute path without a query or fragment')
    }
    const port = Number(params.port)
    if (
        params.port !== undefined &&
        params.port !== null &&
        (!Number.isInteger(port) || port < 0 || port > 65535)
    ) {
        throw new Error('shell.oauth: "port" must be an integer in 0..65535')
    }
    const requested = Number(params.timeoutMs)
    const timeoutMs = Number.isFinite(requested)
        ? Math.min(Math.max(Math.trunc(requested), OAUTH_MIN_TIMEOUT_MS), OAUTH_MAX_TIMEOUT_MS)
        : OAUTH_DEFAULT_TIMEOUT_MS
    const title = typeof params.title === 'string' ? params.title.slice(0, 120) : ''
    return {
        callbackPath,
        port: Number.isInteger(port) && port > 0 ? port : 0,
        timeoutMs,
        title,
    }
}

/**
 * Parse a callback URL into the shape the capability returns.
 *
 * @param {string} rawUrl
 * @returns {{ callbackUrl: string, path: string, query: Record<string, string>, kind: 'oauth'|'unknown', error?: string, errorDescription?: string }}
 */
export function parseOAuthCallback(rawUrl) {
    const url = new URL(rawUrl)
    /** First value wins; a repeated parameter is provider noise, not ours to resolve. */
    const query = {}
    for (const [key, value] of url.searchParams.entries()) {
        if (!(key in query)) query[key] = value
    }
    const error = typeof query.error === 'string' ? query.error : undefined
    const errorDescription =
        typeof query.error_description === 'string' ? query.error_description : undefined
    const hasOAuthShape = Boolean(error) || typeof query.code === 'string'
    return {
        callbackUrl: url.toString(),
        path: url.pathname,
        query,
        kind: hasOAuthShape ? 'oauth' : 'unknown',
        ...(error ? { error } : {}),
        ...(errorDescription ? { errorDescription } : {}),
    }
}

/**
 * Start one loopback listener.
 *
 * @param {{
 *   callbackPath: string, port: number, timeoutMs: number, title: string,
 *   locale?: string,
 *   onResult: (result: {
 *     ok: boolean, callbackUrl: string, path: string, query: Record<string,string>,
 *     kind: 'oauth'|'unknown', error?: string, errorDescription?: string,
 *     timedOut: boolean, cancelled: boolean, durationMs: number,
 *   }) => void,
 * }} options
 * @returns {Promise<{
 *   sessionId: string, host: '127.0.0.1', port: number, path: string,
 *   redirectUri: string, createdAt: number, expiresAt: number, cancel: () => void,
 * }>}
 */
export function startOAuthListener(options) {
    const callbackPath = options.callbackPath
    const startedAt = Date.now()
    const sessionId = randomBytes(12).toString('base64url')

    return new Promise((resolve, reject) => {
        /** Set once a result exists, so timeout/cancel/redirect cannot race. */
        let outcome = null
        /** Set once `onResult` has been delivered, so the safety timer is harmless. */
        let delivered = false
        let timer
        let closeTimer

        const server = createServer((request, response) => {
            // HEAD is allowed so a link preview cannot leave the port occupied;
            // every other method is refused without reading a body.
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                response.writeHead(405, {
                    allow: 'GET, HEAD',
                    'content-type': 'text/plain; charset=utf-8',
                })
                response.end('method not allowed')
                return
            }
            let parsed
            try {
                parsed = parseOAuthCallback(`http://127.0.0.1${request.url || '/'}`)
            } catch {
                response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
                response.end('bad request')
                return
            }
            if (parsed.path !== callbackPath) {
                response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
                response.end('not found')
                return
            }
            const t = strings(options.locale || 'en')
            const refused = Boolean(parsed.error)
            response.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                // The code in the URL must not end up in a cache or a referrer.
                'cache-control': 'no-store',
                'referrer-policy': 'no-referrer',
            })
            response.end(
                landingPage(
                    refused ? t.refusedTitle : options.title || t.title,
                    refused
                        ? parsed.errorDescription || t.refused
                        : t.done,
                    !refused,
                ),
            )
            settle({ ok: !refused && parsed.kind === 'oauth', ...parsed, timedOut: false, cancelled: false })
        })

        // Any local process could in principle race for a fixed port; the
        // ephemeral default avoids that, and a bind failure is reported rather
        // than retried behind the plugin's back.
        server.on('error', (error) => {
            if (outcome) return
            outcome = { bindFailed: true }
            clearTimeout(timer)
            clearTimeout(closeTimer)
            reject(
                new Error(
                    `shell.oauth: cannot listen on 127.0.0.1:${options.port} (${error.message})`,
                ),
            )
        })

        /** Stop listening and deliver the outcome exactly once. */
        const settle = (result) => {
            if (outcome) return
            outcome = result
            clearTimeout(timer)
            const deliver = () => {
                if (delivered) return
                delivered = true
                options.onResult({
                    ...result,
                    timedOut: Boolean(result.timedOut),
                    cancelled: Boolean(result.cancelled),
                    durationMs: Date.now() - startedAt,
                })
            }
            // `close` waits for the in-flight response to finish; the timer is
            // the backstop in case the browser holds the connection open.
            server.close(deliver)
            closeTimer = setTimeout(deliver, 1000)
            closeTimer.unref?.()
        }

        server.listen({ host: '127.0.0.1', port: options.port }, () => {
            const address = server.address()
            const port = typeof address === 'object' && address ? address.port : options.port
            timer = setTimeout(
                () =>
                    settle({
                        ok: false,
                        callbackUrl: '',
                        path: callbackPath,
                        query: {},
                        kind: 'unknown',
                        timedOut: true,
                        cancelled: false,
                    }),
                options.timeoutMs,
            )
            timer.unref?.()
            resolve({
                sessionId,
                host: '127.0.0.1',
                port,
                path: callbackPath,
                redirectUri: `http://127.0.0.1:${port}${callbackPath}`,
                createdAt: startedAt,
                expiresAt: startedAt + options.timeoutMs,
                cancel: () => {
                    settle({
                        ok: false,
                        callbackUrl: '',
                        path: callbackPath,
                        query: {},
                        kind: 'unknown',
                        timedOut: false,
                        cancelled: true,
                    })
                },
            })
        })
    })
}

/**
 * Guard against a client that opens a connection and dribbles headers forever.
 * Called from the server's `connection` handler with the socket.
 *
 * @param {import('node:net').Socket} socket
 */
export function guardOAuthConnection(socket) {
    let headBytes = 0
    const onData = (chunk) => {
        headBytes += chunk.length
        if (headBytes > OAUTH_MAX_HEAD_BYTES) {
            socket.destroy()
            return
        }
        // Stop counting once the head is complete; a body is refused anyway.
        if (chunk.includes('\r\n\r\n')) socket.off('data', onData)
    }
    socket.on('data', onData)
    const timer = setTimeout(() => socket.destroy(), 30_000)
    timer.unref?.()
    socket.once('close', () => {
        clearTimeout(timer)
        socket.off('data', onData)
    })
}
