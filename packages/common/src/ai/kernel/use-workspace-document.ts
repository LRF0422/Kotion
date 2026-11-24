/**
 * useWorkspaceDocumentTarget — gives the workspace surface a document to work on.
 *
 * <p>The kernel home is where users say things like "帮我在 XX 空间建个页面，先查资料
 * 再写" or "做一份可视化报表". Every one of those needs a document: reading and
 * writing blocks, and inserting plugin content (charts, bitables). A workspace run
 * with no editor has NO such capability — page-scoped plugin tools refuse to
 * instantiate without an editor, so their skills are not even registered, and the
 * model is left with web search and file-centre tools while the UI promises
 * document work.
 *
 * <p>So the surface acquires a page's hidden collaborative editor on demand,
 * exactly the way a chat conversation retargets one (see Chat.tsx): `editPage`
 * acquires an off-screen handle for the page, the surface rebinds the capability
 * providers to that editor, and from then on the full document + page-scoped
 * plugin tool set exists. Nothing navigates: the user keeps working at the
 * workbench while the agent edits the page in the background.
 *
 * <p>Sessions are held for the life of the surface and released on unmount; the
 * engine also reaps idle ones.
 *
 * <p>Visible editors win. The side peek renders a full editor for the working
 * target and registers it in the app-global `agent-editor-registry`; this hook
 * consults that registry before acquiring a hidden session, and switches to the
 * pane's editor when it appears. That is what prevents the old failure mode:
 * the page was open in the pane while the agent held (or failed to hold) a
 * second, hidden writer for it — "页面已就位但正文为空".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    getOffscreenEditorBridge,
    type OffscreenEditorHandle,
} from '../offscreen-editor-bridge'
import type {
    SessionPageBinding,
    SessionPageBindingPage,
} from '../session-page-binding'
import {
    findAgentEditor,
    getAgentEditor,
    subscribeAgentEditors,
} from '../agent-editor-registry'
import { documentTargetUnavailableMessage, isSamePage } from '../document-target'
import { isLiveEditor } from '../plugin-agent/live-editor'

export interface WorkspaceDocumentTarget {
    /**
     * The editor document tools must act on, or null while the target's editor
     * is not ready. A page target with a temporarily missing editor is still a
     * target: tools get a "retry / editPage" error instead of writing elsewhere.
     */
    editor: any | null
    /** Page id of the current target, for memory scoping and the write lease. */
    pageId: string | undefined
    /** Session binding the page tools steer (createPage binds, editPage retargets). */
    binding: SessionPageBinding
    /** Drop the current target and its off-screen session. */
    release: () => void
    /**
     * Make `page` the target and resolve its editor (visible claim first,
     * otherwise a hidden session). Rejects with an actionable error when the
     * page cannot be edited; the target page id is still recorded so a later
     * attempt can retry instead of silently falling back to the previous page.
     */
    focusPage: (page: SessionPageBindingPage) => Promise<any>
}

export interface WorkspaceDocumentTargetOptions {
    /**
     * The page the conversation's working target names (a page artifact opened
     * in the side peek). Focusing it is what makes "开在旁边" mean "edit this".
     */
    focusedPage?: SessionPageBindingPage | null
}

export function useWorkspaceDocumentTarget(
    options: WorkspaceDocumentTargetOptions = {},
): WorkspaceDocumentTarget {
    const [editor, setEditor] = useState<any | null>(null)
    const [pageId, setPageId] = useState<string | undefined>(undefined)
    const handleRef = useRef<OffscreenEditorHandle | null>(null)
    const boundRef = useRef<SessionPageBindingPage | null>(null)
    const acquireRef = useRef<Promise<any> | null>(null)
    /**
     * Editors acquired for cross-page tool actions (insert a link into the
     * parent, write into a page named by an argument). They must NOT change the
     * conversation target, so they are held separately and released on teardown.
     */
    const auxHandlesRef = useRef<Map<string, OffscreenEditorHandle>>(new Map())

    const dropHandle = useCallback(() => {
        const handle = handleRef.current
        handleRef.current = null
        if (handle) {
            try { handle.release() } catch { /* already released */ }
        }
    }, [])

    const dropAux = useCallback((pageId?: string) => {
        const releaseOne = (id: string): void => {
            const handle = auxHandlesRef.current.get(id)
            if (!handle) return
            auxHandlesRef.current.delete(id)
            try { handle.release() } catch { /* already released */ }
        }
        if (pageId === undefined) {
            for (const id of [...auxHandlesRef.current.keys()]) releaseOne(id)
            return
        }
        releaseOne(String(pageId))
    }, [])

    const release = useCallback(() => {
        dropHandle()
        dropAux()
        boundRef.current = null
        setEditor(null)
        setPageId(undefined)
    }, [dropHandle, dropAux])

    /**
     * Acquire (or reuse) the page's editor and rebind the surface to it.
     * Synchronous for the caller's purposes once it resolves, so document tools
     * later in the same backend batch already act on the right document.
     */
    const focusPage = useCallback(async (page: SessionPageBindingPage): Promise<any> => {
        const id = String(page.pageId)
        const previousId = boundRef.current?.pageId
        const record: SessionPageBindingPage = {
            pageId: id,
            title: page.title,
            spaceId: page.spaceId,
        }
        boundRef.current = record
        setPageId(id)
        // Retargeting must clear the previous page's editor from the provider
        // binding immediately; a stale editor is how a tool used to write the
        // page the user just left.
        if (!isSamePage(previousId, id)) setEditor(null)

        // A visible pane/window is the page's single writer.
        const claimed = getAgentEditor(id)?.editor
        if (isLiveEditor(claimed)) {
            dropHandle()
            dropAux(id)
            setEditor(claimed)
            return claimed
        }

        // An editor acquired earlier for a cross-page action can become the
        // target without another acquisition round trip.
        const aux = auxHandlesRef.current.get(id)
        if (aux && isLiveEditor(aux.editor)) {
            auxHandlesRef.current.delete(id)
            dropHandle()
            handleRef.current = aux
            setEditor(aux.editor)
            return aux.editor
        }

        // Coalesce concurrent acquisitions (the focus effect and a tool call can
        // race right after a page artifact opens).
        if (acquireRef.current) {
            try { await acquireRef.current } catch { /* a fresh attempt below */ }
            if (isSamePage(boundRef.current?.pageId, id) && isLiveEditor(handleRef.current?.editor)) {
                return handleRef.current!.editor
            }
        }

        const existing = handleRef.current
        if (existing && isSamePage(existing.pageId, id) && isLiveEditor(existing.editor)) {
            setEditor(existing.editor)
            return existing.editor
        }
        if (existing) {
            dropHandle()
            setEditor(null)
        }

        const bridge = getOffscreenEditorBridge()
        if (!bridge) {
            // No off-screen engine in this host: keep the binding page-only so
            // tools that need only a page id still work. Document tools will
            // report the missing editor rather than write somewhere else.
            setEditor(null)
            throw new Error(documentTargetUnavailableMessage(record, '当前环境不支持离屏编辑器'))
        }

        const run = bridge.acquire(id).then(handle => {
            if (!isSamePage(boundRef.current?.pageId, id)) {
                // The user/agent retargeted while this acquisition was in flight.
                try { handle.release() } catch { /* already released */ }
                throw new Error(`页面 ${id} 的编辑器已就绪，但编辑目标已经切换`)
            }
            // A visible pane claimed the page while we were acquiring: it is the
            // single writer, so drop the hidden session we just obtained.
            const claim = getAgentEditor(id)?.editor
            if (isLiveEditor(claim)) {
                try { handle.release() } catch { /* already released */ }
                setEditor(claim)
                return claim
            }
            handleRef.current = handle
            setEditor(handle.editor)
            return handle.editor
        }).catch(error => {
            handleRef.current = null
            setEditor(null)
            throw new Error(documentTargetUnavailableMessage(record, error))
        }).finally(() => {
            if (acquireRef.current === run) acquireRef.current = null
        })
        acquireRef.current = run
        return run
    }, [dropHandle, dropAux])

    // Release on unmount so a closed workbench does not hold a hidden writer.
    useEffect(() => () => { dropHandle(); dropAux() }, [dropHandle, dropAux])

    // A visible editor claimed or released a page: move the target to it, and
    // fall back to a hidden session when the visible one goes away.
    useEffect(() => subscribeAgentEditors(() => {
        // Cross-page aux leases lose to a visible editor too.
        for (const auxPageId of [...auxHandlesRef.current.keys()]) {
            if (getAgentEditor(auxPageId)?.editor) dropAux(auxPageId)
        }
        const bound = boundRef.current
        if (!bound) return
        const id = String(bound.pageId)
        const claimed = getAgentEditor(id)?.editor
        if (isLiveEditor(claimed)) {
            dropHandle()
            dropAux(id)
            getOffscreenEditorBridge()?.destroyIdle?.(id)
            setEditor(claimed)
            return
        }
        if (isLiveEditor(handleRef.current?.editor)) return
        void focusPage(bound).catch(error => {
            console.warn('[agent] could not re-acquire the workspace target editor:', error)
        })
    }), [dropHandle, dropAux, focusPage])

    // The conversation's working target is a page: focus it. This is the bridge
    // between the kernel pane ("this is what the conversation is working on")
    // and the document tools ("this is the page I write to").
    const focusedPage = options.focusedPage
    const focusKey = focusedPage
        ? `${String(focusedPage.pageId)}|${focusedPage.title ?? ''}|${focusedPage.spaceId ?? ''}`
        : ''
    const focusRef = useRef<SessionPageBindingPage | null>(focusedPage ?? null)
    focusRef.current = focusedPage ?? null
    useEffect(() => {
        const page = focusRef.current
        if (!focusKey || !page) return
        const id = String(page.pageId)
        if (isSamePage(boundRef.current?.pageId, id) && isLiveEditor(handleRef.current?.editor)) {
            return
        }
        void focusPage(page).catch(error => {
            console.warn('[agent] could not focus the conversation page target:', error)
        })
    }, [focusKey, focusPage])

    const binding = useMemo<SessionPageBinding>(() => {
        const getTargetEditor = (): any | null => {
            const bound = boundRef.current
            if (!bound) return null
            const claimed = getAgentEditor(bound.pageId)?.editor
            if (isLiveEditor(claimed)) return claimed
            const handle = handleRef.current
            if (handle && isSamePage(handle.pageId, bound.pageId) && isLiveEditor(handle.editor)) {
                return handle.editor
            }
            return null
        }

        return {
            bindPage: (page) => {
                const id = String(page.pageId)
                if (!isSamePage(boundRef.current?.pageId, id)) {
                    if (handleRef.current && !isSamePage(handleRef.current.pageId, id)) {
                        dropHandle()
                    }
                    setEditor(null)
                }
                boundRef.current = { ...page, pageId: id }
                setPageId(id)
                const claimed = getAgentEditor(id)?.editor
                if (isLiveEditor(claimed)) {
                    dropHandle()
                    setEditor(claimed)
                }
            },
            getBoundPage: () => boundRef.current,
            // Exact target only: a workspace run has no visible editor to fall
            // back to, and returning one would be the wrong-document bug again.
            getEditor: () => getTargetEditor(),
            editPage: focusPage,
            // This surface has no floating editor window; `openPage` must not
            // pretend otherwise (a no-op navigates nowhere and lies about the
            // target).
            openPageWindow: () => { /* not supported at the workbench */ },
            getPageFor: (owner) => (owner ? null : boundRef.current),
            getEditorFor: (owner) => (owner ? null : getTargetEditor()),
            // Retry acquisition instead of returning null: a transient failure
            // (room not synced yet, right after createPage) must not leave the
            // target permanently editor-less.
            getEditorForAsync: async (owner) => {
                if (owner) return null
                const bound = boundRef.current
                if (!bound) return null
                return focusPage(bound)
            },
            // Cross-page actions must not move the target. Hold the editor in
            // the auxiliary lease map (released on teardown or when a visible
            // editor claims the page); it is promoted to the target lease if the
            // agent later focuses that page.
            getEditorForPage: async (page) => {
                const id = String(page.pageId)
                const bound = boundRef.current
                if (isSamePage(bound?.pageId, id)) {
                    return focusPage({ ...page, pageId: id })
                }
                const claimed = getAgentEditor(id)?.editor
                if (isLiveEditor(claimed)) return claimed
                const aux = auxHandlesRef.current.get(id)
                if (aux && isLiveEditor(aux.editor)) return aux.editor
                const bridge = getOffscreenEditorBridge()
                if (!bridge) return null
                try {
                    const handle = await bridge.acquire(id)
                    const claim = getAgentEditor(id)?.editor
                    if (isLiveEditor(claim)) {
                        try { handle.release() } catch { /* already released */ }
                        return claim
                    }
                    auxHandlesRef.current.set(id, handle)
                    return handle.editor
                } catch (error) {
                    console.warn('[agent] could not acquire a cross-page editor:', error)
                    return null
                }
            },
            // Delegated children share this surface's single document target;
            // silently moving the parent's target for one child is worse than an
            // explicit refusal.
            editPageFor: async () => {
                throw new Error('工作台的委派子 agent 共享同一编辑目标，不能单独切换页面')
            },
            getPageForEditor: (targetEditor: any) => {
                if (!targetEditor) return null
                const claim = findAgentEditor(targetEditor)
                if (claim) {
                    return { pageId: claim.pageId, title: claim.title, spaceId: claim.spaceId }
                }
                const handle = handleRef.current
                if (handle && handle.editor === targetEditor) {
                    return { pageId: handle.pageId, title: boundRef.current?.title, spaceId: boundRef.current?.spaceId }
                }
                return null
            },
        }
    }, [dropHandle, focusPage])

    return { editor, pageId, binding, release, focusPage }
}