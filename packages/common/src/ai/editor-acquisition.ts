/**
 * Editor acquisition with a health check — the one place that answers
 * "give me a LIVE editor for this page".
 *
 * <p>Why this module exists: the hidden off-screen editor is a lease on a
 * collaborative session, and a lease can outlive its editor. React/HMR can
 * replace the editor instance under a session, a visible editor can claim the
 * page while an acquisition is in flight, and a session can be torn down just
 * before it is handed out. Consumers used to trust "the record says ready" and
 * received a destroyed Tiptap instance; every document tool then failed with
 * "无法取得编辑目标…的编辑器" and nothing repaired the session.
 *
 * <p>This helper makes liveness part of the acquisition contract:
 *  - a visible claim (pane, floating window, route editor) always wins;
 *  - a hidden session is accepted only when its editor is still live;
 *  - a dead handle is released and its idle session destroyed, then the
 *    acquisition is retried so the manager can mount a fresh generation.
 *
 * <p>It deliberately does NOT retry acquisition errors. Those carry the host's
 * reason (component page, read-only invitation, page in trash, room not synced)
 * and most of them are permanent; retrying would delay the model with a
 * pointless 15-second wait. Dead-ready records are the transient case, and they
 * are repaired inside the manager's `acquire` before it resolves.
 */

import {
    getOffscreenEditorBridge,
    type OffscreenEditorHandle,
} from './offscreen-editor-bridge'
import { getAgentEditor } from './agent-editor-registry'
import { isLiveEditor } from './plugin-agent/live-editor'

export interface LiveEditorAcquisition {
    /** A live Tiptap editor bound to the page's collaborative document. */
    editor: any
    /** Where it came from; diagnostics and lease handling. */
    source: 'claim' | 'hidden'
    /** The hidden-session handle, absent for a visible claim. */
    handle: OffscreenEditorHandle | null
    /** Release this acquisition (no-op for a claim: the surface owns it). */
    release: () => void
}

export interface AcquireLiveEditorOptions {
    /** Extra attempts after a dead handle / transient sync failure (default 1). */
    attempts?: number
    /** Base backoff between attempts (default 250 ms, linear). */
    retryDelayMs?: number
    /** Skip the hidden session entirely (callers that must only use claims). */
    allowHidden?: boolean
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Failures that a rebuild can plausibly fix: the room/provider was still
 * connecting, or the acquisition window closed before readiness arrived. A
 * permanent page-type/trash/read-only failure must NOT match this.
 */
const TRANSIENT_ACQUISITION_REASON = /timed out|did not sync|not ready|尚未就绪|正在加载|session timed out/i

export const isRetryableEditorAcquisitionError = (error: unknown): boolean =>
    TRANSIENT_ACQUISITION_REASON.test(error instanceof Error ? error.message : String(error))

/**
 * Wait briefly for a VISIBLE editor to claim the page.
 *
 * A page that is on screen but whose editor is still loading used to fall
 * through to "no editor" immediately: the claim is published one render later
 * (and in another route-cache slot). Polling the app-global claim registry for
 * a short window is what makes "the user is looking at this page" win over
 * spawning a hidden second writer, without adding latency when the claim is
 * already there.
 */
export async function waitForAgentEditor(
    pageId: string,
    timeoutMs = 1_200,
    intervalMs = 50,
): Promise<any | null> {
    const id = String(pageId)
    const deadline = Date.now() + Math.max(0, timeoutMs)
    for (;;) {
        const claimed = claimFor(id)
        if (claimed) return claimed
        if (Date.now() >= deadline) return null
        await sleep(intervalMs)
    }
}

const claimFor = (pageId: string): any | undefined => {
    const claimed = getAgentEditor(pageId)?.editor
    return isLiveEditor(claimed) ? claimed : undefined
}

/**
 * Acquire a LIVE editor for `pageId`.
 *
 * Rejects only when no editor can be obtained: no bridge and no claim, or the
 * hidden session reports a permanent failure. `cause` is the host's reason.
 */
export async function acquireLiveEditorForPage(
    pageId: string,
    options: AcquireLiveEditorOptions = {},
): Promise<LiveEditorAcquisition> {
    const id = String(pageId)

    const claimed = claimFor(id)
    if (claimed) {
        return { editor: claimed, source: 'claim', handle: null, release: () => { /* surface owns it */ } }
    }

    if (options.allowHidden === false) {
        throw new Error('页面没有可见编辑器（该调用不允许使用离屏编辑器）')
    }

    const bridge = getOffscreenEditorBridge()
    if (!bridge) throw new Error('当前环境不支持离屏编辑器')

    const attempts = Math.max(0, options.attempts ?? 1)
    const retryDelayMs = Math.max(0, options.retryDelayMs ?? 250)
    let lastError: unknown

    for (let attempt = 0; attempt <= attempts; attempt += 1) {
        if (attempt > 0) await sleep(retryDelayMs * attempt)
        // A visible editor may have claimed the page while we waited/acquired.
        const lateClaim = claimFor(id)
        if (lateClaim) {
            return { editor: lateClaim, source: 'claim', handle: null, release: () => { /* surface owns it */ } }
        }
        try {
            const handle = await bridge.acquire(id)
            if (isLiveEditor(handle.editor)) {
                // The page's visible editor may have claimed it while the
                // hidden session was syncing. The claim is the single writer:
                // drop the hidden lease instead of returning a second one.
                const claimedMidFlight = claimFor(id)
                if (claimedMidFlight) {
                    try { handle.release() } catch { /* already released */ }
                    bridge.destroyIdle?.(id)
                    return {
                        editor: claimedMidFlight,
                        source: 'claim',
                        handle: null,
                        release: () => { /* surface owns it */ },
                    }
                }
                return {
                    editor: handle.editor,
                    source: 'hidden',
                    handle,
                    release: () => {
                        try { handle.release() } catch { /* already released */ }
                    },
                }
            }
            // The manager should never hand this out (it validates), but if it
            // ever does: release, drop the idle session, and retry a fresh
            // generation instead of failing a tool call over a dead instance.
            console.warn('[agent] offscreen session returned a destroyed editor; retrying', {
                pageId: id,
                attempt,
            })
            try { handle.release() } catch { /* already released */ }
            bridge.destroyIdle?.(id)
            lastError = new Error('离屏编辑会话已失效（编辑器已销毁）')
        } catch (error) {
            lastError = error
            // A transient failure (room still connecting, readiness window
            // closed) is worth one rebuild: the next `acquire` starts a fresh
            // generation and may sync in time. Permanent failures (component
            // page, trash, read-only) are reported immediately.
            if (attempt < attempts && isRetryableEditorAcquisitionError(error)) continue
            break
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? '无法取得页面编辑器'))
}