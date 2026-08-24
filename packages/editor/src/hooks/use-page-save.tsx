import { useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { getBearerHeader, request } from '@kn/common'
import type { ApplyOpsRequest, ApplyOpsResult, PageDocResult, ReconcileRequest } from './use-op-save'
import { useOpSave } from './use-op-save'
import type { PageSessionState, UsePageSessionReturn } from './use-page-session'
import { usePageSession } from './use-page-session'
import { toRev } from './rev'

/**
 * HTTP + keepalive endpoints a page writer needs. Injected rather than
 * imported so this hook stays in the editor package while URL and transport
 * policy (which backend, which token) stay with the caller.
 */
export interface PageSaveEndpoints {
    claim: (pageId: string, clientId: string) => Promise<PageSessionState>
    heartbeat: (pageId: string, clientId: string) => Promise<PageSessionState>
    /** Fire-and-forget lease release; must survive `pagehide`. */
    release: (pageId: string, clientId: string) => void
    applyOps: (pageId: string, request: ApplyOpsRequest) => Promise<ApplyOpsResult>
    reconcile: (pageId: string, request: ReconcileRequest) => Promise<ApplyOpsResult>
    fetchDoc: (pageId: string) => Promise<PageDocResult>
    /**
     * Keepalive transport for `pagehide`, where a normal async request is
     * killed by the browser. Returning the request lets the closing sequence
     * release the write lease only once the write has landed.
     */
    flush: (pageId: string, request: ApplyOpsRequest) => void | Promise<unknown>
}

export interface PageSavedInfo {
    /** Whether the acknowledged write touched the `title` node. */
    titleChanged: boolean
}

export interface UsePageSaveOptions {
    editor: Editor | null
    pageId: string | null
    enabled: boolean
    clientId: string
    /**
     * How the realtime layer sees the room. Feeds host-departure detection; see
     * `usePageSession`, which treats it as a hint and never as a verdict.
     */
    presence: { connected: boolean; hostPresent: boolean; hostSeen: boolean }
    /**
     * Forces every write through reconcile. Set when the collaboration server
     * never synced, so this client's anchors cannot be trusted.
     */
    reconcileOnly: boolean
    endpoints: PageSaveEndpoints
    /** Called after every acknowledged write; see {@link PageSavedInfo}. */
    onSaved?: (info: PageSavedInfo) => void
}

export interface UsePageSaveReturn {
    saving: boolean
    dirty: boolean
    error: Error | null
    progress: { done: number; total: number } | null
    behindServer: boolean
    catchingUp: boolean
    session: UsePageSessionReturn
    saveNow: () => Promise<void>
    adoptRev: (rev: number | string | null | undefined) => void
    flushNow: () => Promise<unknown> | null
}

/**
 * The shared page-writing stack: a write lease from the page session plus the
 * op-based writer gated on holding it. Every editor that persists a page —
 * the main PageEditor, the AI page-edit window, the off-screen editor host —
 * should go through this rather than owning its own copy.
 */
export function usePageSave(options: UsePageSaveOptions): UsePageSaveReturn {
    const { editor, pageId, enabled, clientId, presence, reconcileOnly, endpoints, onSaved } = options

    // Read at call time rather than captured, so the caller can hand in fresh
    // closures (and stable ones) without this hook re-subscribing.
    const endpointsRef = useRef(endpoints)
    endpointsRef.current = endpoints
    const onSavedRef = useRef(onSaved)
    onSavedRef.current = onSaved

    const noteSaved = useCallback((titleChanged: boolean) => {
        onSavedRef.current?.({ titleChanged })
    }, [])

    // ---- Session: who is allowed to write this page ----

    const handleClaim = useCallback(async (cid: string): Promise<PageSessionState> => {
        if (!pageId) throw new Error('No pageId')
        return endpointsRef.current.claim(pageId, cid)
    }, [pageId])

    const handleHeartbeat = useCallback(async (cid: string): Promise<PageSessionState> => {
        if (!pageId) throw new Error('No pageId')
        return endpointsRef.current.heartbeat(pageId, cid)
    }, [pageId])

    // Sent from `pagehide` as well as unmount, so it has to survive the page
    // being dismissed — hence keepalive rather than the normal request path.
    const handleRelease = useCallback((cid: string) => {
        if (!pageId) return
        endpointsRef.current.release(pageId, cid)
    }, [pageId])

    // The final save has to land before the lease goes back, or the server
    // refuses it as coming from a non-host — the last thing the user typed,
    // rejected on the way out. Held in a ref because the writer is built below
    // this point: it needs the session's answer to know whether it may write at
    // all.
    const flushNowRef = useRef<(() => Promise<unknown> | null) | null>(null)
    const handleBeforeRelease = useCallback(() => flushNowRef.current?.() ?? null, [])

    const session = usePageSession({
        enabled,
        clientId,
        onClaim: handleClaim,
        onHeartbeat: handleHeartbeat,
        onRelease: handleRelease,
        onBeforeRelease: handleBeforeRelease,
        connected: presence.connected,
        hostPresent: presence.hostPresent,
        hostSeen: presence.hostSeen,
    })

    // ---- Writing ----

    // Per-op verdicts the server returned. A request can succeed with parts of
    // its batch `stale` or `rejected` — the baseline this client trusted no
    // longer matches the database, so the next write must be a whole-document
    // reconcile rather than another op batch. Throwing puts the writer on its
    // retry path, which re-reads the tracker and finds the reconcile armed.
    const assertApplied = useCallback((data: ApplyOpsResult, editor: Editor | null) => {
        const problems = (data?.results ?? []).filter(v => v?.status !== 'applied')
        if (problems.length === 0) return
        console.warn(
            '[usePageSave] ops not fully applied:',
            JSON.stringify(problems.map(v => ({ op: v.op, blockId: v.blockId, status: v.status, reason: v.reason }))),
        )
        const tracker = (editor?.storage as any)?.opTracker
        tracker?.requireReconcile?.()
        const error = new Error(`${problems.length} op(s) ${problems.map(v => v.status).join(',')}: ${problems.map(v => v.reason ?? '').join(',')}`)
        // The writer recognises this flag: it must drop the pending batch — the
        // server just told us the baseline behind it is wrong — and let the next
        // write reconcile the whole document instead of resending stale ops.
        ;(error as any).staleOps = true
        throw error
    }, [])

    const handleApplyOps = useCallback(async (req: ApplyOpsRequest): Promise<ApplyOpsResult> => {
        if (!pageId) throw new Error('No pageId')
        const data = await endpointsRef.current.applyOps(pageId, req)
        assertApplied(data, editor)
        // The title lives in a block like any other, so a title edit is just an
        // op whose node happens to be of type `title`. Only claim "saved" when
        // the batch actually landed — a stale title op must not refresh the tree.
        noteSaved(req.ops.some(op => (op.node as any)?.type === 'title'))
        return data
    }, [pageId, noteSaved, assertApplied, editor])

    const handleReconcile = useCallback(async (req: ReconcileRequest): Promise<ApplyOpsResult> => {
        if (!pageId) throw new Error('No pageId')
        const data = await endpointsRef.current.reconcile(pageId, req)
        assertApplied(data, editor)
        // A reconcile always carries the title, so "did the title change" is only
        // answerable by whether the server found anything to do at all. The first
        // write of every session is a reconcile, and on an aligned page it applies
        // nothing — which is exactly when callers must not refresh the page tree.
        noteSaved((data.opsApplied ?? 0) > 0)
        return data
    }, [pageId, noteSaved, assertApplied, editor])

    // Read the page straight from the block table, for the host to fold a
    // write it did not make back into its own document. Deliberately not
    // `noteSaved`: nothing was saved here, and notifying on a read would put a
    // spinner on the sidebar every heartbeat.
    const handleFetchDoc = useCallback(async (): Promise<PageDocResult> => {
        if (!pageId) throw new Error('No pageId')
        return endpointsRef.current.fetchDoc(pageId)
    }, [pageId])

    const handleFlush = useCallback((req: ApplyOpsRequest) => {
        if (!pageId) return
        // Returned rather than discarded so the closing session can wait for it.
        return endpointsRef.current.flush(pageId, req)
    }, [pageId])

    const save = useOpSave({
        editor,
        // Only the host writes. A collaborator's OpTracker stays switched off, so
        // it accumulates nothing and cannot write even by accident.
        enabled: enabled && session.isHost,
        clientId,
        onApplyOps: handleApplyOps,
        onReconcile: handleReconcile,
        onFlush: handleFlush,
        serverRev: session.serverRev,
        onFetchDoc: handleFetchDoc,
        reconcileOnly,
    })
    flushNowRef.current = save.flushNow

    return { ...save, session }
}

/** Read a `PageSessionVO` off the response envelope, defaulting to "no session". */
export function toSessionState(data: any): PageSessionState {
    const role = data?.role
    return {
        role: role === 'HOST' || role === 'COLLABORATOR' ? role : 'NONE',
        alive: !!data?.alive,
        hostUserId: data?.hostUserId ?? null,
        hostName: data?.hostName ?? null,
        hostSelf: !!data?.hostSelf,
        rev: toRev(data?.rev),
    }
}

/**
 * Fire-and-forget request that survives the page being dismissed.
 *
 * `pagehide` kills normal async requests, so the last save of a session and the
 * lease release both have to go out this way. Bodies are capped around 64KB;
 * oversized ones fall back to a normal request, which is a genuine best effort
 * rather than a guarantee.
 */
export function keepaliveSend(template: string, method: string, pageId: string, body: unknown): Promise<unknown> {
    const payload = JSON.stringify(body)
    const base = (request as any)?.defaults?.baseURL ?? '/api'
    const url = base + template.replace(':id', pageId)
    if (payload.length > 60_000) {
        return fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...getBearerHeader() },
            body: payload,
        }).catch(() => { /* best effort — page is going away */ })
    }
    return fetch(url, {
        method,
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...getBearerHeader() },
        body: payload,
    }).catch(() => { /* best effort — page is going away */ })
}
