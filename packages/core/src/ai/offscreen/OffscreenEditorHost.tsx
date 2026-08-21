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
    chooseSeed,
    toRev,
    useHostPresence,
    usePageSave,
    keepaliveSend,
    toSessionState,
    HOST_AWARENESS_FIELD,
    HOST_AWARENESS_HOST,
    type Editor,
    type PageSaveEndpoints,
    type BlockStoreRead,
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
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

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
            onSynced: () => {
                setSynced(true)
                setConnectionStatus('connected')
            },
            onStatus: (status: any) => {
                if (status.status === 'connected') {
                    setConnectionStatus('connected')
                } else if (status.status === 'disconnected') {
                    setConnectionStatus('disconnected')
                } else {
                    setConnectionStatus('connecting')
                }
            },
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

    // ---- Content pre-processing (unescape like the main PageEditor) ----
    const parsedContent = useMemo(() => {
        if (!page?.content) return undefined
        try {
            return JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">"))
        } catch {
            return undefined
        }
    }, [page?.content])

    // ---- Seed content: read from the block store, which is the authority ----
    // `undefined` while the read is in flight, `null` once it has failed.
    const [blockDoc, setBlockDoc] = useState<BlockStoreRead | null | undefined>(undefined)

    useEffect(() => {
        setBlockDoc(undefined)
        let cancelled = false
        useApi(OFFSCREEN_APIS.PAGE_DOC, { id: pageId })
            .then((res: any) => {
                if (cancelled) return
                const data = res?.data
                setBlockDoc({ doc: data?.doc ?? null, rev: toRev(data?.rev) })
            })
            .catch(() => {
                if (cancelled) return
                setBlockDoc(null)
            })
        return () => { cancelled = true }
    }, [pageId])

    const seed = useMemo(
        () => (page ? chooseSeed(blockDoc, parsedContent) : null),
        [blockDoc, page, parsedContent],
    )

    // An untrusted seed means the block store could not be read: an AI edit made
    // against the legacy fallback would overwrite content we could not verify.
    // Fail the session loudly instead of mounting a read-only editor.
    const seedErrorReportedRef = useRef(false)
    useEffect(() => {
        if (!seed || seed.trusted || seedErrorReportedRef.current) return
        seedErrorReportedRef.current = true
        offscreenSessionManager.markError(
            pageId,
            new Error('Page content unavailable: block store read failed'),
        )
    }, [seed, pageId])

    // ---- Op-based auto-save, same session model as the main PageEditor ----
    const clientId = useMemo(
        () => `${userInfo?.id ?? 'anon'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pageId],
    )

    const { hostPresent, hostSeen } = useHostPresence(provider?.awareness as any)

    const endpoints = useMemo<PageSaveEndpoints>(() => ({
        claim: async (pid: string, cid: string) => toSessionState((await useApi(OFFSCREEN_APIS.PAGE_SESSION_CLAIM, { id: pid }, { clientId: cid }) as any)?.data),
        heartbeat: async (pid: string, cid: string) => toSessionState((await useApi(OFFSCREEN_APIS.PAGE_SESSION_HEARTBEAT, { id: pid }, { clientId: cid }) as any)?.data),
        release: (pid: string, cid: string) => {
            void keepaliveSend(OFFSCREEN_APIS.PAGE_SESSION_RELEASE.url, 'DELETE', pid, { clientId: cid })
        },
        applyOps: async (pid: string, req: any) => {
            const res: any = await useApi(OFFSCREEN_APIS.PAGE_APPLY_OPS, { id: pid }, req)
            return res?.data ?? {}
        },
        reconcile: async (pid: string, req: any) => {
            const res: any = await useApi(OFFSCREEN_APIS.PAGE_RECONCILE, { id: pid }, req)
            return res?.data ?? {}
        },
        fetchDoc: async (pid: string) => {
            const res: any = await useApi(OFFSCREEN_APIS.PAGE_DOC, { id: pid })
            const data = res?.data
            return { doc: data?.doc ?? null, rev: toRev(data?.rev) }
        },
        flush: (pid: string, req: any) => keepaliveSend(OFFSCREEN_APIS.PAGE_APPLY_OPS.url, 'POST', pid, req),
    }), [])

    const { session, flushNow } = usePageSave({
        editor: editorInstance,
        pageId,
        enabled: !!page && contentReady && !!seed?.trusted,
        clientId,
        presence: { connected: connectionStatus === 'connected', hostPresent, hostSeen },
        reconcileOnly: syncTimedOut && !synced,
        endpoints,
    })

    // Declare the session role in awareness (same field/value as the main
    // PageEditor, so the two cannot drift).
    useEffect(() => {
        const awareness = provider?.awareness
        if (!awareness) return
        awareness.setLocalStateField(
            HOST_AWARENESS_FIELD,
            session.isHost ? HOST_AWARENESS_HOST : 'collaborator',
        )
    }, [provider, session.isHost])

    // Latest flush behind a stable ref — the closure handed to the manager must
    // survive re-renders.
    const flushNowRef = useRef(flushNow)
    flushNowRef.current = flushNow

    // ---- Report readiness to the manager (once) ----
    const readyReportedRef = useRef(false)
    useEffect(() => {
        if (readyReportedRef.current) return
        if (editorInstance && contentReady && seed && (synced || syncTimedOut)) {
            readyReportedRef.current = true
            offscreenSessionManager.markReady(pageId, {
                editor: editorInstance,
                title: page?.title,
                flush: async () => {
                    await flushNowRef.current?.()
                },
            })
        }
    }, [editorInstance, contentReady, seed, synced, syncTimedOut, pageId, page?.title])

    // Unmount safety net: the manager flushes before dropping a session, but
    // an eviction/teardown race could still leave unsaved ops behind. The
    // session's own close is the authoritative flush-then-release; this is the
    // idempotent second line (see `flushedRef` in the writer).
    useEffect(() => () => {
        void flushNowRef.current?.()
    }, [])

    // ---- Collaboration user identity ----
    const collaborationUser = useMemo(() => {
        const id = userInfo?.id || userInfo?.name || 'anonymous'
        const hash = String(id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
        return { name: userInfo?.name || 'Anonymous', color: CURSOR_COLORS[hash % CURSOR_COLORS.length], id: userInfo?.id }
    }, [userInfo?.id, userInfo?.name])

    if (!page || !seed || !(synced || syncTimedOut)) return null

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
                content={seed.doc as any}
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
