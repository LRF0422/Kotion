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

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
    CollaborationEditor,
    TiptapCollabProvider,
    Doc as YDoc,
    chooseSeed,
    toRev,
    useHostPresence,
    usePageSave,
    HOST_AWARENESS_FIELD,
    HOST_AWARENESS_HOST,
    AGENT_AWARENESS_FIELD,
    type Editor,
    type BlockStoreRead,
} from "@kn/editor"
import {
    isComponentPageType,
    isDocumentPageType,
    isPageInTrashError,
    useSelector,
    useSpacePageService,
    usePageType,
    useTranslation,
    getAccessToken,
    getAppEnv,
    resolveAgentPageTarget,
    subscribeAgentPageTargets,
    type AgentPageTarget,
    type GlobalState,
    type PageRecord,
} from "@kn/common"
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
    const { t } = useTranslation()
    const service = useSpacePageService()

    // The agent's single page model: identity, access, document capability,
    // room auth and reads for this page — a normal tenant page or an invited
    // collaboration page (cross-tenant, invitation-token scoped). Re-resolved
    // when the visible page or a guest capability changes.
    const [target, setTarget] = useState<AgentPageTarget | undefined>(
        () => resolveAgentPageTarget(pageId),
    )
    useEffect(() => {
        setTarget(resolveAgentPageTarget(pageId))
        return subscribeAgentPageTargets(() => setTarget(resolveAgentPageTarget(pageId)))
    }, [pageId])
    const documents = target?.documents ?? service.documents
    const canEdit = target?.canEdit ?? true
    const isGuest = target?.isGuest ?? false
    // The room re-authenticates on every (re)connect; the guest envelope must be
    // rebuilt with the current access token rather than captured. Memoized so
    // the provider effect does not see a new function on every render (that
    // would rebuild the provider and drop the live document).
    const getCollabToken = useMemo(
        () => target?.getCollabToken ?? (() => getAccessToken() || ''),
        [target],
    )

    const [page, setPage] = useState<PageRecord | null>(null)
    // A declared page type is NOT "not a document". `editor-component` types are
    // normal collaborative documents (the plugin seeds the doc, or renders one
    // node inside it) — a mind-map page, for instance — and must be editable
    // off-screen like any other page. Only a FULL-PAGE component renderer has no
    // document at all: nothing for an editor to mount, and therefore no editor
    // for the agent either. That case fails loudly and permanently instead of
    // being reported as a transient "editor not ready".
    const pageTypeInfo = usePageType(page?.pageType)
    const componentPage = Boolean(page?.pageType) && isComponentPageType(pageTypeInfo)
    const unknownPageType = Boolean(page?.pageType) && !pageTypeInfo
    // True when the record is a document this engine can host.
    const documentPage = !page?.pageType || isDocumentPageType(pageTypeInfo)
    /** Why this page can never be host-mounted here, when that is the case. */
    const blockedReason = useMemo(() => {
        if (!page?.pageType) return null
        if (unknownPageType) {
            return `页面类型「${page.pageType}」的插件当前未启用，无法打开它的编辑器`
        }
        if (componentPage) {
            // The label is an i18n key for some page types; never surface the
            // raw key to the agent.
            const label = pageTypeInfo?.label
                ? t(pageTypeInfo.label, pageTypeInfo.label)
                : page.pageType
            return `这是「${label}」整页组件页面，没有文档正文，文档编辑器无法打开它`
        }
        return null
    }, [page?.pageType, unknownPageType, componentPage, pageTypeInfo?.label, t])

    // Report the permanent condition once; the manager then drops the session
    // and the agent's pending edit fails with this reason instead of waiting for
    // an editor that can never be acquired.
    useEffect(() => {
        if (!blockedReason) return
        offscreenSessionManager.markError(pageId, new Error(blockedReason))
    }, [blockedReason, pageId])

    // The page was deleted while the agent was working on it. A hidden editor
    // has no visible surface to explain a refused save, and its write-lease
    // heartbeat would keep asking the server forever, so the session is failed
    // here and the editor torn down (which releases the lease).
    const [trashed, setTrashed] = useState(false)
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
        const load = target ? target.loadRecord() : service.pages.getPage(pageId)
        load
            .then((record) => {
                if (cancelled) return
                setPage(record)
                // A declared page type is classified on the next render (the
                // registry lookup needs `page.pageType`); only a read-only
                // invitation is decidable here. The component/unknown-type
                // failure is reported by the `blockedReason` effect above.
                if (!canEdit) {
                    offscreenSessionManager.markError(
                        pageId,
                        new Error('This collaboration invitation is read-only; the page cannot be edited'),
                    )
                }
            })
            .catch((err: unknown) => {
                if (cancelled) return
                if (isPageInTrashError(err)) {
                    setTrashed(true)
                    offscreenSessionManager.markError(
                        pageId,
                        new Error('The page is in the trash; restore it before editing'),
                    )
                    return
                }
                offscreenSessionManager.markError(
                    pageId,
                    err instanceof Error ? err : new Error('Failed to load page'),
                )
            })
        return () => { cancelled = true }
    }, [pageId, service, target, canEdit])

    // The delete may happen in this app (change event) or elsewhere (the server
    // answers PAGE_IN_TRASH on the next read/write/heartbeat). Either way this
    // hidden session can no longer legitimately edit the page.
    useEffect(() => {
        const isThisPage = (id: unknown) => String(id) === String(pageId)
        const unsubscribers = [
            service.changes.subscribe('page.trashed', ({ payload }) => {
                if (isThisPage(payload.pageId)) setTrashed(true)
            }),
            service.changes.subscribe('page.deleted', ({ payload }) => {
                if (isThisPage(payload.pageId)) setTrashed(true)
            }),
        ]
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
    }, [pageId, service])

    // ---- Collaboration provider (same room as any visible editor of this page) ----
    useEffect(() => {
        if (!page || !documentPage) {
            setProvider(undefined)
            return
        }
        const doc = new YDoc()
        const collabProvider = new TiptapCollabProvider({
            baseUrl: COLLAB_WS_BASE_URL,
            name: `page:${pageId}`,
            // Getter, not a captured value: reconnects re-authenticate, and an
            // access token captured at mount can expire before the agent is done.
            // For a collaboration guest the getter rebuilds the invitation
            // envelope the room server requires for this page.
            token: getCollabToken,
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
    }, [pageId, page?.id, page?.pageType, documentPage, getCollabToken])

    useEffect(() => {
        if (page && !documentPage) return
        // Seed from the provider's own flag: `onSynced` can fire before this
        // effect runs, and clearing that would leave the writer off for a room
        // that is synced. Reset on `provider` as well as `pageId` — the provider
        // is recreated when the guest capability (and with it the room auth
        // envelope) appears, and the old room's success must not make the new,
        // unsynced one writable.
        setSynced(provider?.synced === true)
        setSyncTimedOut(false)
        const timer = setTimeout(() => setSyncTimedOut(true), 8000)
        return () => clearTimeout(timer)
    }, [pageId, page?.pageType, documentPage, provider])

    // ---- Legacy fallback pre-processing ----
    const legacyContent = useMemo(() => {
        const content = page?.legacyContent
        if (content == null) return undefined
        if (typeof content !== 'string') return content
        try {
            return JSON.parse(content.replaceAll("&lt;", "<").replaceAll("&gt;", ">"))
        } catch {
            return undefined
        }
    }, [page?.legacyContent])

    // ---- Seed content: read from the block store, which is the authority ----
    // `undefined` while the read is in flight, `null` once it has failed.
    const [blockDoc, setBlockDoc] = useState<BlockStoreRead | null | undefined>(undefined)

    useEffect(() => {
        setBlockDoc(undefined)
        if (!page || !documentPage) return
        let cancelled = false
        documents.getPageDocument(pageId)
            .then((document) => {
                if (cancelled) return
                setBlockDoc({
                    doc: document.doc ?? document.content ?? null,
                    rev: toRev(document.rev),
                })
            })
            .catch((err: unknown) => {
                if (cancelled) return
                if (isPageInTrashError(err)) {
                    setTrashed(true)
                    offscreenSessionManager.markError(
                        pageId,
                        new Error('The page is in the trash; restore it before editing'),
                    )
                }
                setBlockDoc(null)
            })
        return () => { cancelled = true }
    }, [pageId, page?.id, page?.pageType, documentPage, documents])

    const seed = useMemo(
        () => (page ? chooseSeed(blockDoc, legacyContent) : null),
        [blockDoc, page, legacyContent],
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

    const { session, flushNow } = usePageSave({
        editor: editorInstance,
        pageId,
        enabled: !!page && documentPage && contentReady && !!seed?.trusted
            // A read-only page must not be edited through the agent.
            && canEdit
            // A trashed page refuses the write lease; asking every heartbeat
            // only produced a permanent failure stream.
            && !trashed,
        // A room that never synced holds a placeholder, not the page; writing it
        // would reconcile the page down to nothing.
        collaborationSynced: synced,
        clientId,
        // An invited collaborator follows the guest lease rules (take the page
        // when nobody holds it, never latch "session ended").
        guest: isGuest,
        presence: { connected: connectionStatus === 'connected', hostPresent, hostSeen },
        reconcileOnly: syncTimedOut && !synced,
        documents,
    })

    // Either signal means the page can no longer be edited: the local change
    // event, or the server's refusal on the next claim/heartbeat.
    const pageTrashed = trashed || session.trashed

    // Report it to the manager once. Dropping the session is what unmounts this
    // hidden editor, releases the page, and fails the agent's pending edit with
    // a reason instead of leaving it waiting on a page nobody can write.
    const trashedReportedRef = useRef(false)
    useEffect(() => {
        if (!pageTrashed || trashedReportedRef.current) return
        trashedReportedRef.current = true
        offscreenSessionManager.markError(
            pageId,
            new Error('The page is in the trash; restore it before editing'),
        )
    }, [pageTrashed, pageId])

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

    // This editor is not a person. It joins the room under the user's identity
    // (the AI acts for them), so without a marker every page the agent edits
    // shows that user a second time and looks like it is being co-edited. The
    // presence UI drops states carrying this field; the role above still keeps
    // the hidden session's write-lease/host semantics intact.
    useEffect(() => {
        const awareness = provider?.awareness
        if (!awareness) return
        awareness.setLocalStateField(AGENT_AWARENESS_FIELD, true)
    }, [provider])

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
            if (!canEdit) {
                // Read-only invitation: fail the session instead of letting the
                // agent edit a document the backend will refuse to save.
                offscreenSessionManager.markError(
                    pageId,
                    new Error('This collaboration invitation is read-only; the page cannot be edited'),
                )
                return
            }
            if (!synced) {
                // The room never delivered the document. The writer is gated off
                // (see `collaborationSynced`), so anything the agent "edits" here
                // would only live in this in-memory placeholder and vanish with
                // the session. Fail loudly instead of reporting success.
                offscreenSessionManager.markError(
                    pageId,
                    new Error('Collaboration room did not sync; refusing to edit the page offline'),
                )
                return
            }
            offscreenSessionManager.markReady(pageId, {
                editor: editorInstance,
                title: page?.title,
                flush: async () => {
                    await flushNowRef.current?.()
                },
            })
        }
    }, [editorInstance, contentReady, seed, synced, syncTimedOut, pageId, page?.title, canEdit])

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

    if (pageTrashed || !page || !documentPage || !seed || !(synced || syncTimedOut)) return null

    return (
        <div style={{ width: 800, height: 600, overflow: 'hidden' }}>
            <CollaborationEditor
                pageInfo={{
                    id: page.id,
                    spaceId: page.spaceId,
                    parentId: page.parentId ?? undefined,
                    title: page.title,
                    createUser: page.createdById,
                    updateUser: page.updatedById,
                    createTime: page.createTime == null ? undefined : String(page.createTime),
                    updateTime: page.updateTime == null ? undefined : String(page.updateTime),
                }}
                ref={(ed: Editor | null) => setEditorInstance(ed)}
                synced={synced}
                provider={provider}
                pageDocuments={documents}
                id={pageId}
                user={collaborationUser}
                token={isGuest ? getCollabToken() : (getAccessToken() || '')}
                isEditable={canEdit}
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
