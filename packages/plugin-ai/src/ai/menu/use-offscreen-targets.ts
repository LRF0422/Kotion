import { useCallback, useRef } from "react"
import type { MutableRefObject } from "react"
import {
    getAgentDocumentBridge,
    getOffscreenEditorBridge,
    getPageNavigationBridge,
} from "@kn/common"
import type {
    AgentDocumentMergeReport,
    OffscreenEditorHandle,
    SessionPageBindingPage,
} from "@kn/common"
import type { Editor } from "@kn/editor"
import type { ChatTargetPage } from "./chat-sessions"

/** Hard ceiling that mirrors the off-screen editor engine's per-session cap. */
const MAX_OFFSCREEN_TARGETS = 3

export interface UseOffscreenTargetsOptions {
    /** The visible editor; the target's own editor when it is the open page. */
    editor?: Editor
    /** The conversation's bound page, written by the binding effect in Chat. */
    boundPageRef: MutableRefObject<ChatTargetPage | undefined>
}

/**
 * Owns the off-screen editor leases behind the conversation target and every
 * delegated sub-run: acquisition, LRU eviction, per-owner ref-counting, and the
 * private-document merge on release. Extracted from Chat so the page-binding
 * policy is isolated from rendering and can be reasoned about on its own.
 */
export function useOffscreenTargets({ editor, boundPageRef }: UseOffscreenTargetsOptions) {
    const offscreenTargetsRef = useRef<Map<string, OffscreenEditorHandle>>(new Map())

    /**
     * Per-agent (delegated sub-run) edit targets. The main agent keeps using the
     * conversation target; a child that calls `editPage` gets its own page — and
     * its own editor lease — so parallel agents stop fighting over one target
     * and one document.
     */
    const ownerTargetsRef = useRef<Map<string, ChatTargetPage>>(new Map())
    const ownerHandlesRef = useRef<Map<string, OffscreenEditorHandle>>(new Map())
    /** In-flight per-agent acquisitions, so concurrent calls share one lease. */
    const ownerAcquireRef = useRef<Map<string, Promise<{ pageId: string; editor: any }>>>(new Map())
    /**
     * Pages claimed by a host-rendered editor (the side pane / the floating
     * window). While a page is claimed, THAT editor is its single writer: the
     * hidden off-screen session is destroyed and every agent path resolves to it.
     */
    const claimedEditorsRef = useRef<Map<string, any>>(new Map())

    const releaseTarget = useCallback((pageId: string) => {
        const handle = offscreenTargetsRef.current.get(pageId)
        if (!handle) return
        offscreenTargetsRef.current.delete(pageId)
        try { handle.release() } catch { /* already released */ }
    }, [])

    /** A visible editor claims the page; hand authorship over to it. */
    const claimEditor = useCallback((pageId: string, claimed: any) => {
        const id = String(pageId)
        claimedEditorsRef.current.set(id, claimed)
        // Drop the conversation's hidden lease and destroy that session now: the
        // idle timeout would otherwise leave two writers for up to a minute.
        releaseTarget(id)
        getOffscreenEditorBridge()?.destroyIdle?.(id)
    }, [releaseTarget])

    /** The claim is gone (pane closed / switched page). */
    const releaseEditor = useCallback((pageId: string, claimed: any) => {
        const id = String(pageId)
        if (claimedEditorsRef.current.get(id) === claimed) {
            claimedEditorsRef.current.delete(id)
        }
    }, [])

    const releaseAllTargets = useCallback(() => {
        const handles = [...offscreenTargetsRef.current.values()]
        offscreenTargetsRef.current.clear()
        handles.forEach(handle => { try { handle.release() } catch { /* ignore */ } })
    }, [])

    /** True while any delegated agent still edits this page. */
    const pageHeldByOwner = useCallback((pageId: string): boolean => {
        const wanted = String(pageId)
        for (const target of ownerTargetsRef.current.values()) {
            if (String(target.pageId) === wanted) return true
        }
        return false
    }, [])

    /**
     * Point ONE agent at a page: acquire (or reuse) the editor its document
     * tools must act on, without touching the conversation target. Concurrent
     * requests for the same agent share one acquisition (the pool is
     * ref-counted; two acquires would leak a reference).
     */
    const acquireOwnerTarget = useCallback(async (
        owner: string,
        page: SessionPageBindingPage,
    ): Promise<{ pageId: string; title?: string; spaceId?: string; editor: any }> => {
        const pageId = String(page.pageId)
        const pending = ownerAcquireRef.current.get(owner)
        if (pending) {
            const acquired = await pending
            if (String(acquired.pageId) === pageId) return acquired
        }

        const run = (async () => {
            const target: ChatTargetPage = {
                pageId,
                title: page.title || '',
                spaceId: page.spaceId,
            }
            const existing = ownerHandlesRef.current.get(owner)
            if (existing && existing.pageId === pageId) {
                ownerTargetsRef.current.set(owner, target)
                return { ...target, editor: existing.editor }
            }
            if (existing) {
                // Retargeting an owner that held a shared lease: drop that lease
                // inline (releaseOwner is declared later in this component).
                ownerHandlesRef.current.delete(owner)
                try { existing.release() } catch { /* already released */ }
            }
            ownerTargetsRef.current.set(owner, target)

            const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
            if (currentPageId !== undefined && String(currentPageId) === pageId) {
                // The page the user has open is its own editor.
                return { ...target, editor }
            }
            const claimed = claimedEditorsRef.current.get(pageId)
            if (claimed) {
                // A visible editor owns this page: the child shares it (no lease).
                return { ...target, editor: claimed }
            }
            const bridge = getOffscreenEditorBridge()
            if (!bridge) throw new Error('离屏编辑器不可用')
            const handle = await bridge.acquire(pageId)
            ownerHandlesRef.current.set(owner, handle)
            return { ...target, editor: handle.editor }
        })()

        ownerAcquireRef.current.set(owner, run)
        try {
            return await run
        } finally {
            if (ownerAcquireRef.current.get(owner) === run) ownerAcquireRef.current.delete(owner)
        }
    }, [editor])

    /** The page a given agent edits (owner null → the conversation target). */
    const getPageFor = useCallback((owner?: string | null): SessionPageBindingPage | null => {
        if (owner) {
            const target = ownerTargetsRef.current.get(owner)
            if (target) return { ...target }
        }
        return boundPageRef.current ? { ...boundPageRef.current } : null
    }, [])

    /** Acquire (or reuse) the live off-screen editor for a page. */
    const activateOffscreenTarget = useCallback(async (page: ChatTargetPage): Promise<OffscreenEditorHandle> => {
        const pageId = String(page.pageId)
        const cached = offscreenTargetsRef.current.get(pageId)
        if (cached) {
            // Refresh recency so eviction drops the least-recently *used* target.
            offscreenTargetsRef.current.delete(pageId)
            offscreenTargetsRef.current.set(pageId, cached)
            return cached
        }
        const bridge = getOffscreenEditorBridge()
        if (!bridge) throw new Error('离屏编辑器不可用')
        // Never exceed the engine's session cap: drop the oldest other target
        // before acquiring so the engine's own LRU can reclaim it. A page a
        // delegated agent is still editing is never dropped.
        if (offscreenTargetsRef.current.size >= MAX_OFFSCREEN_TARGETS) {
            const oldest = [...offscreenTargetsRef.current.keys()]
                .find(id => id !== pageId && !pageHeldByOwner(id))
            if (oldest) releaseTarget(oldest)
        }
        const handle = await bridge.acquire(pageId)
        offscreenTargetsRef.current.set(pageId, handle)
        return handle
    }, [releaseTarget, pageHeldByOwner])

    /**
     * The shared (live) editor for a page: the visible editor when the page is
     * open, otherwise its off-screen session. Used both to fork a private
     * document and as the merge target when an agent finishes.
     */
    const resolveSharedEditorForPage = useCallback(async (page: ChatTargetPage): Promise<any | null> => {
        // A claimed (visible) editor wins over any hidden session.
        const claimed = claimedEditorsRef.current.get(String(page.pageId))
        if (claimed) return claimed
        const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
        if (currentPageId !== undefined && String(currentPageId) === String(page.pageId)) return editor
        try {
            const handle = await activateOffscreenTarget(page)
            return handle?.editor ?? null
        } catch (error) {
            console.error('Failed to acquire the shared editor for the page:', error)
            return null
        }
    }, [editor, activateOffscreenTarget])

    /**
     * Drop one delegated agent: merge its private document back into the live
     * page (report returned), then release every editor it held.
     */
    const releaseOwner = useCallback(async (
        owner: string,
        options?: { commit?: boolean },
    ): Promise<AgentDocumentMergeReport | null> => {
        const docBridge = getAgentDocumentBridge()
        const page = ownerTargetsRef.current.get(owner) ?? null
        let report: AgentDocumentMergeReport | null = null
        const shouldCommit = options?.commit !== false

        if (shouldCommit && docBridge?.get(owner) && page) {
            const liveEditor = await resolveSharedEditorForPage(page)
            if (liveEditor) {
                try {
                    report = await docBridge.commit(owner, liveEditor)
                } catch (error) {
                    console.error('Failed to merge the agent document:', error)
                }
            }
        }
        if (docBridge?.get(owner)) docBridge.release(owner)

        // Fallback path (no private document): release the shared lease.
        const handle = ownerHandlesRef.current.get(owner)
        ownerHandlesRef.current.delete(owner)
        ownerTargetsRef.current.delete(owner)
        ownerAcquireRef.current.delete(owner)
        if (handle) {
            try { handle.release() } catch { /* already released */ }
        }
        return report
    }, [resolveSharedEditorForPage])

    // Teardown (panel close / conversation switch): discard rather than merge.
    // A private document lives in this tab only, and writing a half-finished
    // child document into the page is worse than losing it — the child run
    // itself keeps running server-side.
    const releaseAllOwners = useCallback(() => {
        const owners = [...ownerTargetsRef.current.keys()]
        owners.forEach(owner => { void releaseOwner(owner, { commit: false }) })
    }, [releaseOwner])

    return {
        offscreenTargetsRef,
        ownerTargetsRef,
        ownerHandlesRef,
        ownerAcquireRef,
        claimedEditorsRef,
        claimEditor,
        releaseEditor,
        releaseTarget,
        releaseAllTargets,
        pageHeldByOwner,
        acquireOwnerTarget,
        getPageFor,
        activateOffscreenTarget,
        resolveSharedEditorForPage,
        releaseOwner,
        releaseAllOwners,
    }
}
