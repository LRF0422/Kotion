/**
 * Host-owned confirmation window.
 *
 * Security-sensitive capabilities (SSH grants, raw sockets, opening the system
 * browser) used to ask with `dialog.showMessageBox`. That looked native and
 * could not use the app's UI kit, but it *was* a trustworthy decision surface:
 * renderer code could not click it. A plain React modal inside the main window
 * would remove that property — plugins share the renderer realm and could answer
 * their own prompt (they can call `desktop.invoke`, and they run in the same
 * document).
 *
 * So the prompt moves into its own frameless `BrowserWindow`:
 *
 *   - it loads `confirm.html` (the app's tokens, `@kn/ui` components),
 *   - it gets its payload through `dialog.confirm.context`, which the main
 *     process answers only for that window's `webContents.id`,
 *   - it answers through `dialog.confirmResult`, which is accepted only when the
 *     sender id matches the session and the request id matches,
 *   - requests are queued, so two plugins cannot stack prompts,
 *   - any failure path (no parent, load failure, timeout, close) denies.
 *
 * The window stays hidden until the renderer reports its measured height, so it
 * never flashes at the placeholder size.
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { ConfirmRequest, ConfirmRequestPayload } from '../../shared/confirm'

const CONFIRM_WIDTH = 488
const MIN_CONTENT_HEIGHT = 220
const MAX_CONTENT_HEIGHT = 640
const ANSWER_TIMEOUT_MS = 120_000
/** If the renderer never reports a height (broken build), still show the prompt. */
const REVEAL_FALLBACK_MS = 1_500

interface ConfirmSession {
    id: string
    webContentsId: number
    request: ConfirmRequest
    window: BrowserWindow
    parent: BrowserWindow
    resolve: (allowed: boolean) => void
    timer?: NodeJS.Timeout
    revealTimer?: NodeJS.Timeout
    revealed: boolean
    settled: boolean
}

/** One session per confirmation `webContents`, so responses stay scoped. */
const sessions = new Map<number, ConfirmSession>()
/** Serialize prompts: one modal decision at a time. */
let queueTail: Promise<unknown> = Promise.resolve()

const settle = (session: ConfirmSession, allowed: boolean): void => {
    if (session.settled) return
    session.settled = true
    if (session.timer) clearTimeout(session.timer)
    if (session.revealTimer) clearTimeout(session.revealTimer)
    sessions.delete(session.webContentsId)
    session.resolve(allowed)
    if (!session.window.isDestroyed()) session.window.close()
}

/** Center the prompt over its parent window (not over the display). */
const centerOverParent = (session: ConfirmSession): void => {
    const { window, parent } = session
    if (window.isDestroyed() || parent.isDestroyed()) return
    const [parentX, parentY] = parent.getPosition()
    const [parentWidth, parentHeight] = parent.getSize()
    const [width, height] = window.getContentSize()
    window.setPosition(
        Math.round(parentX + (parentWidth - width) / 2),
        Math.round(parentY + (parentHeight - height) / 2),
    )
}

const reveal = (session: ConfirmSession): void => {
    if (session.settled || session.revealed) return
    const { window } = session
    if (window.isDestroyed()) return
    session.revealed = true
    centerOverParent(session)
    window.show()
    window.focus()
    window.webContents.focus()
}

export function setupConfirmIpcHandlers(): void {
    ipcMain.handle('desktop:dialog.confirm.context', event => {
        const session = sessions.get(event.sender.id)
        if (!session) {
            throw new Error('desktop confirm: no active confirmation for this window')
        }
        const payload: ConfirmRequestPayload = { id: session.id, ...session.request }
        return payload
    })

    ipcMain.handle('desktop:dialog.confirmResult', (event, raw) => {
        const session = sessions.get(event.sender.id)
        if (!session) {
            throw new Error('desktop confirm: no active confirmation for this window')
        }
        const params = raw && typeof raw === 'object' ? (raw as { id?: unknown; allowed?: unknown }) : {}
        const allowed = params.allowed === true
        // A deny does not need the id (the renderer uses it as the escape hatch
        // when it could not load the request); an allow must correlate exactly.
        if (allowed && params.id !== session.id) {
            throw new Error('desktop confirm: request id mismatch')
        }
        settle(session, allowed)
        return { ok: true }
    })

    ipcMain.handle('desktop:dialog.confirmResize', (event, raw) => {
        const session = sessions.get(event.sender.id)
        if (!session) {
            throw new Error('desktop confirm: no active confirmation for this window')
        }
        const requested = Number((raw as { height?: unknown } | null)?.height)
        if (!Number.isFinite(requested)) return { ok: false }
        const height = Math.max(MIN_CONTENT_HEIGHT, Math.min(MAX_CONTENT_HEIGHT, Math.round(requested)))
        if (!session.window.isDestroyed()) {
            session.window.setContentSize(CONFIRM_WIDTH, height)
            if (session.revealed) centerOverParent(session)
        }
        reveal(session)
        return { ok: true }
    })
}

const pickParent = (): BrowserWindow | undefined => {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && !focused.isDestroyed()) return focused
    return BrowserWindow.getAllWindows().find(window => !window.isDestroyed())
}

const openConfirmation = (request: ConfirmRequest, parent: BrowserWindow): Promise<boolean> =>
    new Promise(resolve => {
        const id = randomUUID()
        const win = new BrowserWindow({
            parent,
            modal: true,
            show: false,
            frame: false,
            transparent: true,
            hasShadow: true,
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            useContentSize: true,
            width: CONFIRM_WIDTH,
            height: MIN_CONTENT_HEIGHT,
            backgroundColor: '#00000000',
            webPreferences: {
                preload: join(__dirname, '../preload/index.js'),
                contextIsolation: true,
                sandbox: false,
            },
        })
        const session: ConfirmSession = {
            id,
            webContentsId: win.webContents.id,
            request,
            window: win,
            parent,
            resolve,
            revealed: false,
            settled: false,
        }
        session.timer = setTimeout(() => settle(session, false), ANSWER_TIMEOUT_MS)
        sessions.set(session.webContentsId, session)

        win.on('closed', () => settle(session, false))
        win.webContents.on('did-finish-load', () => {
            if (win.isDestroyed()) return
            // Normally the renderer reports its height first and reveals then.
            session.revealTimer = setTimeout(() => reveal(session), REVEAL_FALLBACK_MS)
        })
        win.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
            if (isMainFrame) settle(session, false)
        })

        const devUrl = process.env['ELECTRON_RENDERER_URL']
        const load =
            !app.isPackaged && devUrl
                ? win.loadURL(devUrl + '/confirm.html')
                : win.loadURL('app://./confirm.html')
        load.catch(() => settle(session, false))
    })

/**
 * Ask the user to allow one capability call. Denies when there is no window to
 * ask in, when the confirmation window cannot load, or after the timeout.
 */
export function askConfirmation(request: ConfirmRequest, parent?: BrowserWindow): Promise<boolean> {
    const run = async (): Promise<boolean> => {
        const target = parent && !parent.isDestroyed() ? parent : pickParent()
        if (!target) return false
        try {
            return await openConfirmation(request, target)
        } catch (error) {
            // A prompt that cannot be built must not turn into an allowed call.
            console.warn('[confirm] unable to show the confirmation window:', error)
            return false
        }
    }
    const result = queueTail.then(run, run)
    queueTail = result.then(
        () => undefined,
        () => undefined,
    )
    return result
}
