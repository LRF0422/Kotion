/**
 * OffscreenEditorHost — hidden collaborative editors for off-screen sessions.
 *
 * Mounted once in the app shell (Layout). Subscribes to the session manager
 * and renders one CollaborationEditor per active session into a visually
 * hidden (but real-layout — ProseMirror needs measurable DOM, so never
 * `display:none`) fixed container. Each session mirrors PageEditWindow's
 * proven mechanics: load the latest page content, bind to the page's
 * collaborative Y.Doc room, persist through the incremental PATCH endpoint.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    CollaborationEditor,
    TiptapCollabProvider,
    Doc as YDoc,
    useIncrementalSave,
    type Editor,
    type IncrementalPayload,
} from "@kn/editor"
import { useApi, useSelector, getAccessToken, getAppEnv, type GlobalState } from "@kn/common"

import { OFFSCREEN_APIS } from "./api"
import { offscreenSessionManager } from "./session-manager"

/**
 * Collab WebSocket base URL — env-configurable; falls back to the current
 * deployment. NEVER hardcode a credential here: the auth token is the user's
 * OAuth2 access token, not the pageId (pageId-as-token let anyone join any
 * page's collaboration room).
 */
const COLLAB_WS_BASE_URL = getAppEnv('VITE_COLLABORATION_WS_URL') || 'wss://kotion.top:8877/ws'

/** Deterministic cursor colors, same palette as the visible editors. */
const CURSOR_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

const OffscreenSession: React.FC<{ pageId: string }> = ({ pageId }) => {
    const { userInfo } = useSelector((state: GlobalState) => state)

    const [page, setPage] = useState<any | null>(null)
    const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
    const [contentReady, setContentReady] = useState(false)
    const [synced, setSynced] = useState(false)
    // Render anyway if the collab server never syncs (offline / WS
    // unreachable), mirroring PageEditWindow's fallback.
    const [syncTimedOut, setSyncTimedOut] = useState(false)
    const [provider, setProvider] = useState<TiptapCollabProvider | undefined>(undefined)

    // ---- Load the target page (always fresh: editing needs latest content) ----
    useEffect(() => {
        let cancelled = false
        useApi(OFFSCREEN_APIS.GET_PAGE_CONTENT, { id: pageId })
            .then((res: any) => {
                if (cancelled) return
                if (res?.data) setPage(res.data)
                else offscreenSessionManager.markError(pageId, new Error('Failed to load page'))
            })
            .catch((err: any) => {
                if (cancelled) return
                offscreenSessionManager.markError(
                    pageId,
                    err instanceof Error ? err : new Error('Failed to load page'),
                )
            })
        return () => { cancelled = true }
    }, [pageId])

    // ---- Collaboration provider (same room as any visible editor of this page) ----
    useEffect(() => {
        const doc = new YDoc()
        const collabProvider = new TiptapCollabProvider({
            baseUrl: COLLAB_WS_BASE_URL,
            name: `page:${pageId}`,
            token: getAccessToken() || '',
            document: doc,
            onSynced: () => setSynced(true),
        })
        setProvider(collabProvider)
        return () => {
            collabProvider.awareness?.destroy()
            collabProvider.disconnect()
            collabProvider.destroy()
        }
    }, [pageId])

    useEffect(() => {
        setSyncTimedOut(false)
        const timer = setTimeout(() => setSyncTimedOut(true), 8000)
        return () => clearTimeout(timer)
    }, [pageId])

    // ---- Incremental auto-save (same PATCH contract as the main PageEditor) ----
    const handleSave = useCallback(async (payload: IncrementalPayload) => {
        const res = await useApi(OFFSCREEN_APIS.PATCH_PAGE_BLOCKS, { id: pageId }, {
            pageId,
            changes: payload.changes.map(c => ({
                blockId: c.blockId,
                action: c.action,
                type: c.type,
                content: c.action === 'upsert'
                    ? JSON.stringify({ type: c.type, attrs: c.attrs, content: c.content })
                    : undefined,
                prevVersion: c.prevVersion,
            })),
        })
        const data = (res as any)?.data
        if (data?.blockVersions) {
            const tracker = (editorInstance?.storage as any)?.dirtyTracker
            tracker?.applyServerVersions?.(data.blockVersions)
        }
    }, [pageId, editorInstance])

    const { dirty, saveNow } = useIncrementalSave({
        editor: editorInstance,
        enabled: !!page && contentReady,
        onSave: handleSave,
    })

    // Latest save state behind stable refs — the flush closure handed to the
    // manager must survive re-renders.
    const saveNowRef = useRef(saveNow)
    saveNowRef.current = saveNow
    const dirtyRef = useRef(dirty)
    dirtyRef.current = dirty

    // ---- Report readiness to the manager (once) ----
    const readyReportedRef = useRef(false)
    useEffect(() => {
        if (readyReportedRef.current) return
        if (editorInstance && contentReady && (synced || syncTimedOut)) {
            readyReportedRef.current = true
            offscreenSessionManager.markReady(pageId, {
                editor: editorInstance,
                title: page?.title,
                flush: async () => {
                    if (dirtyRef.current) await saveNowRef.current()
                },
            })
        }
    }, [editorInstance, contentReady, synced, syncTimedOut, pageId, page?.title])

    // Unmount safety net: the manager flushes before dropping a session, but
    // an eviction/teardown race could still leave a dirty tracker behind.
    useEffect(() => () => {
        if (dirtyRef.current) {
            void saveNowRef.current().catch(() => { /* best effort */ })
        }
    }, [])

    // ---- Content pre-processing (unescape like the main PageEditor) ----
    const parsedContent = useMemo(() => {
        if (!page?.content) return undefined
        try {
            return JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">"))
        } catch {
            return undefined
        }
    }, [page?.content])

    // ---- Collaboration user identity ----
    const collaborationUser = useMemo(() => {
        const id = userInfo?.id || userInfo?.name || 'anonymous'
        const hash = String(id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
        return { name: userInfo?.name || 'Anonymous', color: CURSOR_COLORS[hash % CURSOR_COLORS.length], id: userInfo?.id }
    }, [userInfo?.id, userInfo?.name])

    if (!page || !(synced || syncTimedOut)) return null

    return (
        <div style={{ width: 800, height: 600, overflow: 'hidden' }}>
            <CollaborationEditor
                pageInfo={page}
                ref={(ed: Editor | null) => setEditorInstance(ed)}
                synced={synced}
                provider={provider}
                id={pageId}
                user={collaborationUser}
                token={getAccessToken() || ''}
                toc={false}
                withTitle={true}
                width="w-full"
                content={parsedContent}
                onContentReady={() => setContentReady(true)}
            />
        </div>
    )
}

/**
 * App-shell host. Renders nothing until a session is requested; tears down
 * (flushing pending edits) when the shell unmounts.
 */
export const OffscreenEditorHost: React.FC = () => {
    const [sessionIds, setSessionIds] = useState<string[]>(() => offscreenSessionManager.getSessionIds())

    useEffect(() => {
        return offscreenSessionManager.subscribe(() => {
            setSessionIds(offscreenSessionManager.getSessionIds())
        })
    }, [])

    useEffect(() => () => { void offscreenSessionManager.destroyAll() }, [])

    if (sessionIds.length === 0) return null

    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed',
                left: -10000,
                top: 0,
                width: 800,
                height: 600,
                overflow: 'hidden',
                pointerEvents: 'none',
            }}
        >
            {sessionIds.map(id => (
                <OffscreenSession key={id} pageId={id} />
            ))}
        </div>
    )
}
