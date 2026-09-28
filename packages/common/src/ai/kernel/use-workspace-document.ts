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

export interface WorkspaceDocumentTarget {
    /**
     * The editor document tools must act on, or null while the surface still has
     * no document (the run then offers only document-free capabilities).
     */
    editor: any | null
    /** Page id of the current target, for memory scoping and the write lease. */
    pageId: string | undefined
    /** Session binding the page tools steer (createPage binds, editPage retargets). */
    binding: SessionPageBinding
    /** Drop the current target and its off-screen session. */
    release: () => void
}

export function useWorkspaceDocumentTarget(): WorkspaceDocumentTarget {
    const [editor, setEditor] = useState<any | null>(null)
    const [pageId, setPageId] = useState<string | undefined>(undefined)
    const handleRef = useRef<OffscreenEditorHandle | null>(null)
    const boundRef = useRef<SessionPageBindingPage | null>(null)

    const release = useCallback(() => {
        handleRef.current?.release()
        handleRef.current = null
        boundRef.current = null
        setEditor(null)
        setPageId(undefined)
    }, [])

    /**
     * Acquire (or reuse) the page's hidden editor and rebind the surface to it.
     * Synchronous for the caller's purposes once it resolves, so document tools
     * later in the same backend batch already act on the right document.
     */
    const editPage = useCallback(async (page: SessionPageBindingPage) => {
        const pageIdString = String(page.pageId)
        const current = handleRef.current
        if (current && String(current.pageId) === pageIdString) {
            boundRef.current = { ...page, pageId: pageIdString }
            setPageId(pageIdString)
            setEditor(current.editor)
            return { ...page, pageId: pageIdString, editor: current.editor }
        }

        const bridge = getOffscreenEditorBridge()
        if (!bridge) {
            // No off-screen engine in this host: keep the binding page-only so a
            // tool that can work with just a page id still does.
            boundRef.current = { ...page, pageId: pageIdString }
            setPageId(pageIdString)
            return { ...page, pageId: pageIdString, editor: null }
        }

        current?.release()
        const handle = await bridge.acquire(pageIdString)
        handleRef.current = handle
        boundRef.current = {
            pageId: pageIdString,
            title: page.title ?? handle.title,
            spaceId: page.spaceId,
        }
        setPageId(pageIdString)
        setEditor(handle.editor)
        return { ...page, pageId: pageIdString, editor: handle.editor }
    }, [])

    const binding = useMemo<SessionPageBinding>(() => ({
        bindPage: (page) => {
            boundRef.current = { ...page, pageId: String(page.pageId) }
            setPageId(String(page.pageId))
        },
        getBoundPage: () => boundRef.current,
        getEditor: () => handleRef.current?.editor ?? null,
        editPage,
        // This surface has no floating editor window; `openPage` must not pretend
        // otherwise (a no-op navigates nowhere and lies about the target).
        openPageWindow: () => { /* not supported at the workbench */ },
        getPageFor: (owner) => (owner ? null : boundRef.current),
        getEditorFor: (owner) => (owner ? null : handleRef.current?.editor ?? null),
        getEditorForAsync: async (owner) => (owner ? null : handleRef.current?.editor ?? null),
    }), [editPage])

    // Release on unmount so a closed workbench does not hold a hidden writer.
    useEffect(() => () => { handleRef.current?.release(); handleRef.current = null }, [])

    return { editor, pageId, binding, release }
}
