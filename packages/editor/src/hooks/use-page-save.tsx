import { useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import type {
    ApplyOpsRequest,
    ApplyOpsResult,
    PageDocResult,
    PageDocumentOperations,
    PageSessionState,
    ReconcileRequest,
} from '@kn/common'
import { useOpSave } from './use-op-save'
import type { UsePageSessionReturn } from './use-page-session'
import { usePageSession } from './use-page-session'

type PageSaveDocumentOperations = Pick<
    PageDocumentOperations,
    | 'claimPageSession'
    | 'heartbeatPageSession'
    | 'releasePageSession'
    | 'applyPageOperations'
    | 'reconcilePageDocument'
    | 'getPageDocument'
    | 'flushPageOperations'
>

/** Backend code for PAGE_REVISION_CONFLICT (see WikiException). */
const REVISION_CONFLICT_CODE = 3016

/**
 * Backend code for NOT_SESSION_HOST (see WikiException): the write arrived from
 * a client that does not hold the page's write lease.
 *
 * For an invited guest this is the normal way a lease handover is observed: the
 * inviter opened the page, the server preempted the guest's lease, and this
 * client's next write is refused. It is not a document conflict, so it must not
 * trigger a reconcile — it is a demotion, and the guest's edits are safe in the
 * shared Y.Doc for the host to persist.
 */
const NOT_SESSION_HOST_CODE = 4010

/**
 * Whether the backend refused a write because this client does not hold the
 * page's write lease.
 */
const isNotSessionHost = (error: unknown): boolean =>
    (error as { code?: unknown } | null)?.code === NOT_SESSION_HOST_CODE

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
     * Whether this client may take the write lease at all. False for a
     * read-only invited collaborator. A guest with write access may claim: the
     * inviter may never open the page, and the guest then hosts it itself.
     */
    canHost?: boolean
    /**
     * Whether this client is an invited collaborator (a guest). Passed through
     * to the session, where it means "take the lease when nobody holds it, and
     * never latch `sessionEnded`".
     */
    guest?: boolean
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
    documents: PageSaveDocumentOperations
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
    const { editor, pageId, enabled, clientId, canHost = true, guest = false, presence, reconcileOnly, documents, onSaved } = options

    // Read at call time rather than captured, so the caller can hand in a fresh
    // service capability (or a stable one) without this hook re-subscribing.
    const documentsRef = useRef(documents)
    documentsRef.current = documents
    const onSavedRef = useRef(onSaved)
    onSavedRef.current = onSaved

    const noteSaved = useCallback((titleChanged: boolean) => {
        onSavedRef.current?.({ titleChanged })
    }, [])

    // ---- Session: who is allowed to write this page ----

    const handleClaim = useCallback(async (cid: string): Promise<PageSessionState> => {
        if (!pageId) throw new Error('No pageId')
        return documentsRef.current.claimPageSession({ pageId, clientId: cid })
    }, [pageId])

    const handleHeartbeat = useCallback(async (cid: string): Promise<PageSessionState> => {
        if (!pageId) throw new Error('No pageId')
        return documentsRef.current.heartbeatPageSession({ pageId, clientId: cid })
    }, [pageId])

    // Sent from `pagehide` as well as unmount, so it has to survive the page
    // being dismissed — hence keepalive rather than the normal request path.
    const handleRelease = useCallback((cid: string) => {
        if (!pageId) return
        void Promise.resolve(documentsRef.current.releasePageSession({ pageId, clientId: cid }))
            .catch(() => { /* best effort: the lease also expires by TTL */ })
    }, [pageId])

    // The final save has to land before the lease goes back, or the server
    // refuses it as coming from a non-host — the last thing the user typed,
    // rejected on the way out. Held in a ref because the writer is built below
    // this point: it needs the session's answer to know whether it may write at
    // all.
    const flushNowRef = useRef<(() => Promise<unknown> | null) | null>(null)
    const handleBeforeRelease = useCallback(() => flushNowRef.current?.() ?? null, [])

    // The write handlers below need the session's current answer when a write is
    // refused as NOT_SESSION_HOST, but they are memoized independently of it and
    // must not be rebuilt on every heartbeat. The ref is assigned immediately
    // after the hook so it is never a turn behind.
    const sessionRef = useRef<UsePageSessionReturn | null>(null)

    const session = usePageSession({
        enabled,
        clientId,
        canHost,
        guest,
        onClaim: handleClaim,
        onHeartbeat: handleHeartbeat,
        onRelease: handleRelease,
        onBeforeRelease: handleBeforeRelease,
        connected: presence.connected,
        hostPresent: presence.hostPresent,
        hostSeen: presence.hostSeen,
    })
    sessionRef.current = session

    // ---- Writing ----

    // ---- Concurrent-writer recovery ----
    // The backend rejects a batch whose baseRev is behind the database with
    // PAGE_REVISION_CONFLICT (3016). That is not a failure the user should see:
    // it means another editor (or another of this user's editors) moved the page
    // first, and the writer's job is then to reconcile the whole document. Turn
    // it into the same signal the stale-op path uses.
    const asReconcileSignal = useCallback((error: unknown): unknown => {
        const code = (error as { code?: unknown } | null)?.code
        const message = (error as { message?: unknown } | null)?.message
        const isConflict = code === REVISION_CONFLICT_CODE
            || (typeof message === 'string' && /revisionConflict|revision conflict/i.test(message))
        if (!isConflict) return error
        console.warn('[usePageSave] page revision conflict; reconciling instead of failing')
        const tracker = (editor?.storage as any)?.opTracker
        tracker?.requireReconcile?.()
        const signal = new Error('Page revision conflict; reconciling the document')
        ;(signal as any).staleOps = true
        return signal
    }, [editor])

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
        let data: ApplyOpsResult
        try {
            data = await documentsRef.current.applyPageOperations(pageId, req)
        } catch (error) {
            if (isNotSessionHost(error)) {
                // The lease moved to another client — typically the inviter
                // opening the page and preempting this guest's lease. Re-read
                // the role now rather than waiting up to a heartbeat, so the
                // writer switches off instead of retrying a write the server
                // will keep refusing. Rethrow unchanged: this is a demotion,
                // not a document conflict. The edits are already in the shared
                // Y.Doc for the host to persist, and reconciling (the
                // staleOps signal below) would arm a full-document write from a
                // client that is not allowed to write. Marking it `leaseLost` is
                // what tells the writer to drop this batch silently instead of
                // retrying, flashing "Save failed", or reconciling.
                ;(error as any).leaseLost = true
                void sessionRef.current?.refresh()
                throw error
            }
            throw asReconcileSignal(error)
        }
        assertApplied(data, editor)
        // The title lives in a block like any other, so a title edit is just an
        // op whose node happens to be of type `title`. Only claim "saved" when
        // the batch actually landed — a stale title op must not refresh the tree.
        noteSaved(req.ops.some(op => (op.node as any)?.type === 'title'))
        return data
    }, [pageId, noteSaved, assertApplied, editor, asReconcileSignal])

    const handleReconcile = useCallback(async (req: ReconcileRequest): Promise<ApplyOpsResult> => {
        if (!pageId) throw new Error('No pageId')
        let data: ApplyOpsResult
        try {
            data = await documentsRef.current.reconcilePageDocument(pageId, req)
        } catch (error) {
            // Same reasoning as `handleApplyOps`: a reconcile is a write too, so
            // losing the lease mid-reconcile is a demotion, not a reason to arm
            // another one.
            if (isNotSessionHost(error)) {
                ;(error as any).leaseLost = true
                void sessionRef.current?.refresh()
                throw error
            }
            throw asReconcileSignal(error)
        }
        assertApplied(data, editor)
        // A reconcile always carries the title, so "did the title change" is only
        // answerable by whether the server found anything to do at all. The first
        // write of every session is a reconcile, and on an aligned page it applies
        // nothing — which is exactly when callers must not refresh the page tree.
        noteSaved((data.opsApplied ?? 0) > 0)
        return data
    }, [pageId, noteSaved, assertApplied, editor, asReconcileSignal])

    // Read the page straight from the block table, for the host to fold a
    // write it did not make back into its own document. Deliberately not
    // `noteSaved`: nothing was saved here, and notifying on a read would put a
    // spinner on the sidebar every heartbeat.
    const handleFetchDoc = useCallback(async (): Promise<PageDocResult> => {
        if (!pageId) throw new Error('No pageId')
        return documentsRef.current.getPageDocument(pageId)
    }, [pageId])

    const handleFlush = useCallback((req: ApplyOpsRequest) => {
        if (!pageId) return
        // Returned rather than discarded so the closing session can wait for it.
        return documentsRef.current.flushPageOperations(pageId, req)
    }, [pageId])

    const save = useOpSave({
        editor,
        // Only the session host writes. A collaborator's OpTracker stays
        // switched off, so it accumulates nothing and cannot write even by
        // accident. An invited guest is a host until the inviter preempts its
        // lease; from that moment it is a collaborator again, and the edits it
        // makes still reach the database through the host's shared Y.Doc.
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
