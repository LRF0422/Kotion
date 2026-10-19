/**
 * Electron wiring for the generic capability groups added for plugin authors:
 *
 *   - `net.socket*`   — raw TCP / TLS byte streams (the transport a plugin builds
 *                       its own protocol client on; the host has no mail.* layer)
 *   - `shell.*`       — open the system browser, and receive an OAuth redirect
 *                       on a loopback port
 *   - `storage.secret*` — plugin-scoped, keychain-encrypted key/value storage
 *   - `notification.*` — OS notifications + the app badge
 *   - `background.*`   — host-driven timers that survive a closed plugin panel
 *
 * Everything here is *generic*: none of it knows what a plugin uses it for. The
 * two standing rules of this codebase apply unchanged — the network policy gates
 * every outbound connection, and the user is asked before a plugin reaches a new
 * host or opens a browser tab.
 */

import { app, BrowserWindow, dialog, ipcMain, Notification, powerSaveBlocker, safeStorage, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { createSecretStore, secretFilePath } from './secrets.mjs'
import {
    SOCKET_MAX_SESSIONS,
    normalizeSessionId,
    normalizeSocketOpenOptions,
    normalizeSocketWritePayload,
    socketErrorMessage,
} from './socket-params.mjs'
import { closeSocket, openSocket, writeSocket } from './socket-client.mjs'
import {
    OAUTH_MAX_SESSIONS,
    normalizeOAuthStartOptions,
    startOAuthListener,
    type OAuthCallbackResult,
} from './oauth-callback.mjs'
import { createTaskScheduler } from './scheduler.mjs'
import { badgeIsEmpty, normalizeBadgeOptions, normalizeNotificationOptions } from './notifications.mjs'
// The HTTP body decision helpers live in their own module (no electron, no
// fetch). Re-exported here so the Electron smoke test can drive them from the
// same bundle it already loads for the capability handlers.
export {
    chooseBodyRepresentation,
    decodeBody,
    detectCharset,
    looksLikeUtf8Text,
} from './http-body.mjs'

/**
 * The user-facing permission prompts, injected.
 *
 * `setupIpcHandlers` passes the real Electron dialogs; the Electron smoke test
 * passes deterministic stubs, which is how a headless run can exercise the
 * allowed *and* the refused path of every gate without a human at the keyboard.
 * Keeping them injectable is also what makes "the prompt named the right
 * target" assertable.
 *
 * `prompt` receives an already-localized request and answers "may I?".
 */
export interface CapabilityConfirm {
    /** Before dialling a new `host:port` (once per target and app run). */
    socket(prompt: {
        label: string
        host: string
        port: number
        protocol: 'tcp' | 'tls'
        tlsMode: 'strict' | 'relaxed'
    }): Promise<boolean>
    /** Before opening a new origin in the system browser (once per app run). */
    browser(prompt: { origin: string; url: string }): Promise<boolean>
}

/** Injected by `setupIpcHandlers` (the fs allowlist and dialogs live there). */
export interface CapabilityHostDeps {
    /** Shared fs allowlist validator (for the notification icon path). */
    assertAllowedPath: (value: unknown, field?: string) => string
    /**
     * The network-policy + DNS gate implemented in ./.. (shared with
     * `http.request` / `ssh.*`). Injected as a bare host so this module never
     * re-implements — and cannot accidentally diverge from — the SSRF decision;
     * `reason` builds the message for the private-address case.
     */
    assertHostAllowed: (
        host: string,
        reason: (detail: { resolved: boolean }) => string,
    ) => Promise<string>
    confirm: CapabilityConfirm
}

const asRecord = (value: unknown): Record<string, any> =>
    value && typeof value === 'object' ? (value as Record<string, any>) : {}

const handle = (capability: string, fn: (event: Electron.IpcMainInvokeEvent, params: unknown) => unknown): void => {
    ipcMain.handle('desktop:' + capability, (event, params) => fn(event, params))
}

/* ------------------------------------------------------------------ *
 * Dialog copy
 *
 * The main process has no i18n runtime, so each user-facing prompt carries both
 * locales — same approach as the SSH gate.
 * ------------------------------------------------------------------ */
const copy = (locale: string) => {
    const zh = locale.toLowerCase().startsWith('zh')
    return {
        zh,
        socket: {
            title: zh ? '网络连接授权' : 'Network connection request',
            allow: zh ? '允许' : 'Allow',
            deny: zh ? '拒绝' : 'Deny',
            message: (target: string) =>
                zh
                    ? `有插件请求与 ${target} 建立原始网络连接`
                    : `A plugin wants to open a raw network connection to ${target}`,
            detail: (protocol: string, tlsMode: string) =>
                (zh
                    ? `用途：在那条连接上发送和接收任意字节（插件自己实现协议，宿主只搬运数据）。\n` +
                      `协议：${protocol}${tlsMode}\n` +
                      `连接由本应用建立，目标可以读取你通过它发送的一切。`
                    : `Purpose: send and receive arbitrary bytes on that connection (the plugin speaks the protocol; the host only moves data).\n` +
                      `Protocol: ${protocol}${tlsMode}\n` +
                      `The connection is made by this app, and the remote end can read everything you send through it.`) +
                (zh
                    ? '\n\n允许后，本次运行内该目标的后续连接不再询问。'
                    : '\n\nAllowing covers later connections to this target for this app run.'),
        },
        browser: {
            title: zh ? '打开系统浏览器' : 'Open the system browser',
            allow: zh ? '打开' : 'Open',
            deny: zh ? '取消' : 'Cancel',
            message: (origin: string) =>
                zh ? `有插件请求在系统浏览器中打开 ${origin}` : `A plugin wants to open ${origin} in your browser`,
            detail: (url: string) =>
                (zh
                    ? `地址：${url}\n浏览器会以你的身份访问该站点（例如授权登录）。确认地址无误后再继续。`
                    : `URL: ${url}\nYour browser will visit this site with your credentials (e.g. to authorize sign-in). Check the address before continuing.`),
        },
    }
}

/* ------------------------------------------------------------------ *
 * Consent + policy gates
 * ------------------------------------------------------------------ */
/**
 * The network-policy + DNS gate implemented in ./.. (shared with
 * `http.request` / `ssh.*`). Declared on {@link CapabilityHostDeps}.
 */

/**
 * The real prompts: a modal dialog per decision, with locale-appropriate copy.
 * Refusing — or having no window to ask in — fails closed.
 */
export function createElectronConfirm(): CapabilityConfirm {
    const t = () => copy(app.getLocale())

    /**
     * One modal question. A dialog that cannot be shown (no window, a platform
     * that refuses the call) answers `false` — every gate here fails closed.
     */
    const ask = async (options: Electron.MessageBoxOptions): Promise<boolean> => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        if (!win) return false
        try {
            const { response } = await dialog.showMessageBox(win, options)
            return response === 0
        } catch (error) {
            console.warn('[capabilities] consent dialog failed:', error)
            return false
        }
    }

    return {
        async socket(prompt) {
            const strings = t().socket
            const tlsNote =
                prompt.protocol === 'tls'
                    ? prompt.tlsMode === 'strict'
                        ? t().zh
                            ? '（TLS：校验证书与主机名）'
                            : ' (TLS: certificate and hostname verified)'
                        : t().zh
                          ? '（TLS：已放开证书校验）'
                          : ' (TLS: certificate verification relaxed)'
                    : ''
            return ask({
                type: 'question',
                buttons: [strings.allow, strings.deny],
                defaultId: 1,
                cancelId: 1,
                noLink: true,
                title: strings.title,
                message: strings.message(prompt.label),
                detail: strings.detail(prompt.protocol.toUpperCase(), tlsNote),
            })
        },
        async browser(prompt) {
            const strings = t().browser
            return ask({
                type: 'question',
                buttons: [strings.allow, strings.deny],
                defaultId: 1,
                cancelId: 1,
                noLink: true,
                title: strings.title,
                message: strings.message(prompt.origin),
                detail: strings.detail(prompt.url),
            })
        },
    }
}

/**
 * Register every handler. Returns a disposer so `app.on('will-quit')` can stop
 * the timers and close open sockets instead of leaving them to process teardown.
 */
export function setupCapabilityHandlers(deps: CapabilityHostDeps) {
    /* ============================ net.socket ============================ */

    interface SocketSession {
        id: string
        host: string
        port: number
        protocol: 'tcp' | 'tls'
        serverName: string
        encrypted: boolean
        openedAt: number
        bytesIn: number
        bytesOut: number
        socket: import('node:net').Socket
        markLocalClose: (graceful: boolean) => void
        /**
         * The renderer that opened it. Sessions are per-window: another window's
         * plugin must not be able to write to or close a socket it does not
         * hold, and its events must not be broadcast to everyone.
         */
        owner: number
    }

    const sockets = new Map<string, SocketSession>()
    /** Grants for this app run: `label` → when it was granted. */
    const socketGrants = new Map<string, number>()

    /** Send one event to one renderer (never to every window: a socket belongs
     * to the window that opened it). */
    const sendTo = (owner: number, channel: string, payload: Record<string, unknown>) => {
        const window = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed() && item.webContents.id === owner)
        if (window) window.webContents.send(`desktop:event:${channel}`, payload)
    }

    /** The session, when this renderer owns it. */
    const ownedSocket = (owner: number, value: unknown): SocketSession => {
        const session = sockets.get(normalizeSessionId(value))
        if (!session || session.owner !== owner) throw new Error('net.socket: no such session')
        return session
    }

    const socketsOf = (owner: number) => [...sockets.values()].filter((session) => session.owner === owner)

    const publicSocket = (session: SocketSession) => ({
        sessionId: session.id,
        host: session.host,
        port: session.port,
        protocol: session.protocol,
        serverName: session.serverName,
        encrypted: session.encrypted,
        openedAt: session.openedAt,
        bytesIn: session.bytesIn,
        bytesOut: session.bytesOut,
    })

    /** Ask the user once per target per app run. Refusal fails closed. */
    const requireSocketGrant = async (
        target: { host: string; port: number; label: string; protocol: 'tcp' | 'tls'; tlsMode: 'strict' | 'relaxed' },
    ) => {
        if (socketGrants.has(target.label)) return
        const allowed = await deps.confirm.socket({
            label: target.label,
            host: target.host,
            port: target.port,
            protocol: target.protocol,
            tlsMode: target.tlsMode,
        })
        if (!allowed) throw new Error(`net.socket: the user refused the connection to "${target.label}"`)
        socketGrants.set(target.label, Date.now())
    }

    handle('net.socketOpen', async (event, raw) => {
        const options = normalizeSocketOpenOptions(raw)
        if (socketsOf(event.sender.id).length >= SOCKET_MAX_SESSIONS) {
            throw new Error(`net.socket: this window already has ${SOCKET_MAX_SESSIONS} open sessions; close one first`)
        }
        // Policy first (cheap, no dialog), then consent, then connect.
        const host = await deps.assertHostAllowed(options.serverName, (detail) =>
            detail.resolved
                ? `net.socket: "${options.serverName}" resolves to a private address`
                : 'net.socket: private address is blocked',
        )
        await requireSocketGrant(options)

        const sessionId = randomUUID().replace(/-/g, '').slice(0, 24)
        const openedAt = Date.now()
        const owner = event.sender.id
        let session: SocketSession | undefined
        try {
            const opened = await openSocket({
                host,
                port: options.port,
                protocol: options.protocol,
                serverName: options.serverName,
                tlsMode: options.tlsMode,
                connectTimeoutMs: options.connectTimeoutMs,
                onData: (chunk) => {
                    if (!session) return
                    session.bytesIn += chunk.length
                    sendTo(owner, 'net', {
                        type: 'socket-data',
                        sessionId: session.id,
                        dataBase64: chunk.toString('base64'),
                    })
                },
                onError: (error) => {
                    if (!session) return
                    sendTo(owner, 'net', {
                        type: 'socket-error',
                        sessionId: session.id,
                        message: error.message,
                        ...(typeof (error as NodeJS.ErrnoException).code === 'string'
                            ? { code: (error as NodeJS.ErrnoException).code }
                            : {}),
                    })
                },
                onClose: (info) => {
                    if (!session) return
                    const closed = session
                    sockets.delete(closed.id)
                    sendTo(owner, 'net', {
                        type: 'socket-close',
                        sessionId: closed.id,
                        local: info.local,
                        graceful: info.graceful,
                        bytesIn: closed.bytesIn,
                        bytesOut: closed.bytesOut,
                    })
                },
            })
            session = {
                id: sessionId,
                host: options.host,
                port: options.port,
                protocol: options.protocol,
                serverName: options.serverName,
                encrypted: opened.encrypted,
                openedAt,
                bytesIn: 0,
                bytesOut: 0,
                socket: opened.socket,
                markLocalClose: opened.markLocalClose,
                owner,
            }
            sockets.set(sessionId, session)
            if (options.timeoutMs > 0) {
                // Idle timeout, refreshed on traffic: a stalled protocol socket
                // must not sit in the session table forever.
                opened.socket.setTimeout(options.timeoutMs, () => {
                    opened.socket.destroy(new Error(`idle for ${options.timeoutMs}ms`))
                })
            }
            const payload = publicSocket(session)
            sendTo(owner, 'net', { type: 'socket-open', sessionId, session: payload })
            return payload
        } catch (error) {
            if (session) sockets.delete(session.id)
            throw new Error(socketErrorMessage(options.host, options.port, error as Error))
        }
    })

    handle('net.socketWrite', async (event, raw) => {
        const params = asRecord(raw)
        const session = ownedSocket(event.sender.id, params.sessionId)
        const buffer = normalizeSocketWritePayload(params.dataBase64)
        const ok = await writeSocket(session.socket, buffer)
        if (ok) session.bytesOut += buffer.length
        return ok
    })

    handle('net.socketClose', async (event, raw) => {
        const params = asRecord(raw)
        let session: SocketSession
        try {
            session = ownedSocket(event.sender.id, params.sessionId)
        } catch {
            return false
        }
        const sessionId = session.id
        if (typeof params.dataBase64 === 'string' && params.dataBase64.length) {
            try {
                await writeSocket(session.socket, normalizeSocketWritePayload(params.dataBase64))
            } catch {
                // A malformed farewell must not keep the socket open.
            }
        }
        return closeSession(session.id, params.graceful === true)
    })

    const closeSession = (sessionId: string, graceful: boolean) => {
        const session = sockets.get(sessionId)
        if (!session) return false
        // The `close` listener owns removal + the event, so an orderly FIN and a
        // destroy both report exactly once.
        return closeSocket(session.socket, { graceful, markLocalClose: session.markLocalClose })
    }

    handle('net.socketSessions', (event) => socketsOf(event.sender.id).map(publicSocket))

    /* ======================= shell: browser + OAuth ====================== */

    interface OAuthSession {
        sessionId: string
        host: string
        port: number
        path: string
        redirectUri: string
        createdAt: number
        expiresAt: number
        result?: OAuthCallbackResult
        waiting: Array<(value: OAuthCallbackResult) => void>
        cancel: () => void
        /** True once the port is bound and the session is in the map. */
        bound: boolean
        /** The renderer that started it; another window may not cancel or wait. */
        owner: number
    }

    const oauthSessions = new Map<string, OAuthSession>()
    /** Origins the user has already approved this run (per origin, not per URL). */
    const browserGrants = new Set<string>()

    /**
     * Drop a finished session once nobody can still be waiting for it. The grace
     * period exists so a plugin that called `oauthStart` and then `oauthWait` a
     * moment later still finds its result.
     */
    const scheduleOAuthReap = (sessionId: string) => {
        const timer = setTimeout(() => oauthSessions.delete(sessionId), 60_000)
        timer.unref?.()
    }

    /** The OAuth session, when this renderer owns it. */
    const ownedOAuth = (owner: number, value: unknown): OAuthSession | undefined => {
        const session = oauthSessions.get(String(value ?? ''))
        return session && session.owner === owner ? session : undefined
    }

    const publicOAuth = (session: OAuthSession) => ({
        sessionId: session.sessionId,
        host: session.host,
        port: session.port,
        redirectUri: session.redirectUri,
        path: session.path,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
    })

    /** Open a URL in the system browser, after asking (once per origin per run). */
    const openExternal = async (event: Electron.IpcMainInvokeEvent, raw: unknown) => {
        const params = asRecord(raw)
        if (typeof params.url !== 'string' || !params.url.trim()) {
            throw new Error('shell.browserOpen: "url" is required')
        }
        let url: URL
        try {
            url = new URL(params.url.trim())
        } catch {
            throw new Error('shell.browserOpen: "url" is not a valid URL')
        }
        // Only web links. `file:`, `javascript:`, an OS handler scheme, and
        // anything else are refused: the browser is not a general-purpose
        // launcher, and handing it an arbitrary scheme is a local attack.
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('shell.browserOpen: only http/https URLs may be opened')
        }
        const normalized = url.toString()
        if (!browserGrants.has(url.origin)) {
            const allowed = await deps.confirm.browser({ origin: url.origin, url: normalized })
            if (!allowed) throw new Error('shell.browserOpen: the user refused to open the URL')
            browserGrants.add(url.origin)
        }
        await shell.openExternal(normalized)
        return { opened: true, url: normalized, origin: url.origin }
    }

    handle('shell.browserOpen', openExternal)

    handle('shell.oauthStart', async (event, raw) => {
        // Count against the map that is the source of truth; a session is
        // registered the moment the port is bound, not when this call returns.
        const live = () => [...oauthSessions.values()].filter((session) => !session.result).length
        if (live() >= OAUTH_MAX_SESSIONS) {
            throw new Error(`shell.oauth: ${OAUTH_MAX_SESSIONS} redirect listeners are already open`)
        }
        const options = normalizeOAuthStartOptions(raw)
        // Insert into the map BEFORE the listener can settle: an immediate
        // redirect (or cancel) must find the session, and `oauthWait` must be
        // able to arrive while this call is still in flight.
        const session: OAuthSession = {
            sessionId: '',
            host: '127.0.0.1',
            port: 0,
            path: options.callbackPath,
            redirectUri: '',
            createdAt: Date.now(),
            expiresAt: 0,
            waiting: [],
            cancel: () => {},
            bound: false,
            owner: event.sender.id,
        }
        await new Promise<void>((resolve, reject) => {
            startOAuthListener({
                ...options,
                locale: app.getLocale(),
                onResult: (result) => {
                    session.result = result
                    for (const waiter of session.waiting.splice(0)) waiter(result)
                    scheduleOAuthReap(session.sessionId)
                },
            })
                .then((listener) => {
                    session.sessionId = listener.sessionId
                    session.port = listener.port
                    session.redirectUri = listener.redirectUri
                    session.createdAt = listener.createdAt
                    session.expiresAt = listener.expiresAt
                    session.cancel = listener.cancel
                    session.bound = true
                    oauthSessions.set(session.sessionId, session)
                    // A redirect that arrived before the port was reported still
                    // has to produce a reap timer for the id we now know.
                    if (session.result) scheduleOAuthReap(session.sessionId)
                    resolve()
                })
                .catch(reject)
        })
        return publicOAuth(session)
    })

    handle('shell.oauthWait', (event, raw) => {
        const params = asRecord(raw)
        const session = ownedOAuth(event.sender.id, params.sessionId)
        if (!session) throw new Error('shell.oauth: no such redirect session')
        if (session.result) return session.result
        return new Promise((resolve) => session.waiting.push(resolve))
    })

    handle('shell.oauthSessions', (event) =>
        [...oauthSessions.values()]
            // A session that already has its result is finished work, not a
            // listener the user still has open.
            .filter((session) => !session.result && session.owner === event.sender.id)
            .map(publicOAuth),
    )

    handle('shell.oauthCancel', (event, raw) => {
        const params = asRecord(raw)
        const session = ownedOAuth(event.sender.id, params.sessionId)
        if (!session || session.result) return false
        session.cancel()
        return true
    })

    /* ========================= storage.secret ========================== */

    const secrets = createSecretStore({
        filePath: () => secretFilePath(app.getPath('userData')),
        canEncrypt: () => {
            try {
                if (!safeStorage.isEncryptionAvailable()) return false
                if (process.platform === 'linux') {
                    const backend = (safeStorage as { getSelectedStorageBackend?: () => string })
                        .getSelectedStorageBackend?.()
                    if (backend === 'basic_text') return false
                }
                return true
            } catch {
                return false
            }
        },
        encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
        decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64')),
        log: (message) => console.warn(message),
    })

    handle('storage.secretAvailable', () => secrets.available())
    handle('storage.secretSet', (_event, raw) => secrets.set(asRecord(raw)))
    handle('storage.secretGet', (_event, raw) => secrets.get(asRecord(raw)))
    handle('storage.secretHas', (_event, raw) => secrets.has(asRecord(raw)))
    handle('storage.secretList', (_event, raw) => secrets.list(asRecord(raw)))
    handle('storage.secretRemove', (_event, raw) => secrets.remove(asRecord(raw)))
    handle('storage.secretClear', (_event, raw) => secrets.clear(asRecord(raw)))
    handle('storage.secretNamespaces', () => secrets.namespaces())

    /* ========================= notifications =========================== */

    /** Live notifications by id, so a plugin can replace rather than stack. */
    const liveNotifications = new Map<string, Notification>()

    const notificationsAvailable = () => {
        try {
            return Notification.isSupported()
        } catch {
            return false
        }
    }

    handle('notification.available', () => notificationsAvailable())

    handle('notification.show', (event, raw) => {
        if (!notificationsAvailable()) {
            return { shown: false, id: '', clicked: false, dismissed: false, error: 'notifications are not supported' }
        }
        let options: ReturnType<typeof normalizeNotificationOptions>
        try {
            options = normalizeNotificationOptions(raw, randomUUID(), (candidate) => {
                // The icon is read by the OS, so it obeys the same allowlist as
                // `fs.*`: standard user directories, or a path the user picked.
                try {
                    deps.assertAllowedPath(candidate, 'iconPath')
                    return true
                } catch {
                    return false
                }
            })
        } catch (error) {
            return {
                shown: false,
                id: '',
                clicked: false,
                dismissed: false,
                error: error instanceof Error ? error.message : String(error),
            }
        }
        if (liveNotifications.size >= 32) {
            const oldest = liveNotifications.keys().next().value
            if (oldest) {
                liveNotifications.get(oldest)?.close()
                liveNotifications.delete(oldest)
            }
        }
        liveNotifications.get(options.id)?.close()

        return new Promise<Record<string, unknown>>((resolve) => {
            const notification = new Notification({
                title: options.title,
                body: options.body,
                silent: options.silent,
                ...(options.iconPath ? { icon: options.iconPath } : {}),
                ...(options.group ? { group: options.group } : {}),
                ...(options.timeoutMs > 0 ? { timeoutType: 'default' as const } : {}),
            })
            liveNotifications.set(options.id, notification)
            let done = false
            const finish = (clicked: boolean) => {
                if (done) return
                done = true
                liveNotifications.delete(options.id)
                clearTimeout(timer)
                resolve({ shown: true, id: options.id, clicked, dismissed: !clicked })
            }
            const timer = setTimeout(
                () => finish(false),
                options.timeoutMs > 0 ? options.timeoutMs : 10 * 60 * 1000,
            )
            timer.unref?.()
            notification.on('click', () => {
                // Bring the app forward: a click on "3 new messages" means "show
                // me", and a notification that focuses nothing feels broken.
                const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0]
                if (win && !win.isDestroyed()) {
                    if (win.isMinimized()) win.restore()
                    win.show()
                    win.focus()
                }
                finish(true)
            })
            notification.on('close', () => finish(false))
            try {
                notification.show()
            } catch (error) {
                liveNotifications.delete(options.id)
                clearTimeout(timer)
                resolve({
                    shown: false,
                    id: options.id,
                    clicked: false,
                    dismissed: false,
                    error: error instanceof Error ? error.message : String(error),
                })
            }
        })
    })

    handle('notification.setBadge', (_event, raw) => {
        const badge = normalizeBadgeOptions(raw)
        try {
            if (process.platform === 'darwin') {
                app.dock?.setBadge(badgeIsEmpty(badge) ? '' : badge.text || String(badge.count))
                return true
            }
            if (process.platform === 'win32') {
                const win = BrowserWindow.getAllWindows()[0]
                if (!win) return false
                win.setOverlayIcon(
                    null,
                    badgeIsEmpty(badge) ? '' : badge.text || String(badge.count),
                )
                return true
            }
            // Linux: Unity-style launchers read the same API; harmless elsewhere.
            const launcher = (app as unknown as { setBadgeCount?: (count: number) => boolean }).setBadgeCount
            if (typeof launcher === 'function') return Boolean(launcher.call(app, badge.count))
            return false
        } catch {
            return false
        }
    })

    handle('notification.clear', () => {
        for (const notification of liveNotifications.values()) notification.close()
        liveNotifications.clear()
        return true
    })

    /* ========================== background ============================= */

    /** One scheduler per renderer, so a window reload cannot leak timers. */
    const schedulers = new Map<number, ReturnType<typeof createTaskScheduler>>()
    const powerBlockers = new Map<string, number>()

    const setKeepAwake = (taskId: string, wants: boolean) => {
        const existing = powerBlockers.get(taskId)
        if (wants) {
            if (existing !== undefined) return true
            try {
                const id = powerSaveBlocker.start('prevent-app-suspension')
                powerBlockers.set(taskId, id)
                return powerSaveBlocker.isStarted(id)
            } catch {
                return false
            }
        }
        if (existing === undefined) return false
        powerBlockers.delete(taskId)
        try {
            powerSaveBlocker.stop(existing)
        } catch {
            /* already stopped */
        }
        return false
    }

    const schedulerFor = (event: Electron.IpcMainInvokeEvent) => {
        const key = event.sender.id
        let scheduler = schedulers.get(key)
        if (!scheduler) {
            const owner = event.sender
            scheduler = createTaskScheduler({
                onTick: (tick) => {
                    // The window may have gone away between the timer firing and
                    // the send; drop the tick rather than throw.
                    if (owner.isDestroyed()) return
                    owner.send('desktop:event:background', tick)
                },
                setKeepAwake: (taskId, wants) => setKeepAwake(`${key}:${taskId}`, wants),
                log: (message) => console.warn(message),
            })
            schedulers.set(key, scheduler)
            owner.once('destroyed', () => {
                scheduler?.dispose()
                schedulers.delete(key)
                for (const id of [...powerBlockers.keys()]) {
                    if (id.startsWith(`${key}:`)) setKeepAwake(id, false)
                }
            })
        }
        return scheduler
    }

    handle('background.schedule', (event, raw) => schedulerFor(event).schedule(raw))
    handle('background.list', (event) => schedulerFor(event).list())
    handle('background.cancel', (event, raw) =>
        schedulerFor(event).cancel(String(asRecord(raw).taskId ?? '')),
    )
    handle('background.cancelAll', (event, raw) => {
        const scheduler = schedulerFor(event)
        // `scope: 'all'` is accepted for forward compatibility; every task in a
        // scheduler already belongs to the caller's window.
        void asRecord(raw)
        return scheduler.cancelAll()
    })

    /** Stop timers, close sockets, and drop notification handles on quit. */
    const dispose = () => {
        for (const scheduler of schedulers.values()) scheduler.dispose()
        schedulers.clear()
        for (const id of [...powerBlockers.keys()]) setKeepAwake(id, false)
        for (const session of [...sockets.values()]) closeSession(session.id, false)
        for (const session of oauthSessions.values()) session.cancel()
        oauthSessions.clear()
        for (const notification of liveNotifications.values()) notification.close()
        liveNotifications.clear()
    }

    return { dispose }
}
