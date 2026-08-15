import { APIS } from "../../../api";
import { Button } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuPortal } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Switch } from "@kn/ui";
import { Skeleton } from "@kn/ui";
import { CollaborationEditor, exportToPDF, useIncrementalSave, TiptapCollabProvider } from "@kn/editor";
import type { IncrementalPayload } from "@kn/editor";
import { event, ON_PAGE_REFRESH, ON_FAVORITE_CHANGE } from "../../../event";
import { useApi, useService, deepEqual, useUploadFile, parseMarkdownToNodes, useTranslation, request, getBearerHeader, getAccessToken, getAppEnv } from "@kn/common";
import { useNavigator, usePageTabs } from "@kn/common";
import { setPageBridge, clearPageBridge, type PageBridge } from "@kn/common";
import { setActiveEditor, clearActiveEditor } from "@kn/common";
// The host-wide bus, distinct from this plugin's local `event` emitter above.
import { event as hostEvent, TOGGLE_DOCK_PANEL } from "@kn/common";
import { GlobalState } from "@kn/common";
import { Editor } from "@kn/editor";
import * as Y from "@kn/editor";
import { useKeyPress, useToggle } from "@kn/common";
import {
    BookTemplate, Check, Pencil,
    Download, FileIcon, FileText,
    Link, LoaderCircle,
    MoreHorizontal, Trash2, Upload, List,
    CloudOff, UserPlus, Star, Network, MoveHorizontal, History, Presentation
} from "@kn/icon";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@kn/common";
import { useParams } from "@kn/common";
import { toast } from "@kn/ui";
import { SharePanel } from "../../components/SharePanel";
import { PageBreadcrumb } from "../../../components/PageBreadcrumb";
import { TemplateCreator } from "../TemplateCreator";
import { PageVersionHistory } from "./PageVersionHistory";
import { PresentationMode } from "./PresentationMode";
import { resolveUserBrief } from "../../../utils/userBrief";

// Status display configuration for save state
const getStatusDisplay = (saving: boolean, dirty: boolean, error: Error | null, progress?: { done: number; total: number } | null) => {
    if (saving) {
        const text = progress ? `Saving ${progress.done}/${progress.total}` : 'Saving';
        return { text, icon: <LoaderCircle className="h-3 w-3 animate-spin text-muted-foreground" />, className: 'text-muted-foreground' };
    }
    if (error) {
        return { text: 'Save failed', icon: <CloudOff className="h-3 w-3 text-destructive" />, className: 'text-destructive' };
    }
    if (dirty) {
        return { text: 'Editing', icon: <Pencil className="h-3 w-3 text-muted-foreground" />, className: 'text-muted-foreground' };
    }
    return { text: 'Saved', icon: <Check className="h-3 w-3 text-muted-foreground" />, className: 'text-muted-foreground' };
};

// Custom hook: wraps useIncrementalSave with the actual PATCH API call
// Includes prevVersion for optimistic concurrency and applies server
// version info after each successful save.
function usePageSave(editor: Editor | null, pageId: string | null, enabled: boolean, onSaved?: () => void) {
    const { t } = useTranslation()
    // Throttle ON_PAGE_REFRESH emissions caused by rapid title typing
    const titleRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Throttle conflict warnings — one toast per burst, not one per save.
    const lastConflictToastRef = useRef(0)

    // Shared post-save logic: apply server-returned version info, surface
    // version conflicts, and throttle title-refresh notifications. Used by
    // both handleSave and handleBulkSave.
    const applySaveResult = useCallback((res: any, hasTitleChange: boolean) => {
        const data = res?.data
        if (data?.blockVersions) {
            const tracker = (editor?.storage as any)?.dirtyTracker
            if (tracker?.applyServerVersions) {
                tracker.applyServerVersions(data.blockVersions)
            }
        }
        // Optimistic-concurrency conflicts: the backend applied our (Yjs-merged)
        // content anyway but flagged the stale prevVersion — tell the user so a
        // silent last-writer-wins doesn't go unnoticed in non-collab sessions.
        if (Array.isArray(data?.conflictBlockIds) && data.conflictBlockIds.length > 0) {
            const now = Date.now()
            if (now - lastConflictToastRef.current > 5000) {
                lastConflictToastRef.current = now
                toast.warning(t('editor.saveConflict', 'Some blocks were modified elsewhere — latest content was kept'))
            }
        }
        if (hasTitleChange) {
            if (titleRefreshTimerRef.current) {
                clearTimeout(titleRefreshTimerRef.current)
            }
            titleRefreshTimerRef.current = setTimeout(() => {
                event.emit(ON_PAGE_REFRESH)
                titleRefreshTimerRef.current = null
            }, 400)
        }
        onSaved?.()
    }, [editor, t, onSaved])

    const mapChanges = useCallback((payload: IncrementalPayload) =>
        payload.changes.map(c => ({
            blockId: c.blockId,
            action: c.action,
            type: c.type,
            content: c.action === 'upsert'
                ? JSON.stringify({ type: c.type, attrs: c.attrs, content: c.content })
                : undefined,
            prevVersion: c.prevVersion,
        })), [])

    const handleSave = useCallback(async (payload: IncrementalPayload) => {
        if (!pageId) throw new Error('No pageId')
        const hasTitleChange = payload.changes.some(c => c.type === 'title')
        const res = await useApi(APIS.PATCH_PAGE_BLOCKS, { id: pageId }, {
            pageId,
            changes: mapChanges(payload),
        })
        applySaveResult(res, hasTitleChange)
    }, [pageId, mapChanges, applySaveResult])

    // Bulk fast path for a first import/paste of a huge document: one POST that
    // the backend persists in chunked transactions and seals as a single page
    // version. Applies returned versions so later incremental patches are valid.
    const handleBulkSave = useCallback(async (payload: IncrementalPayload) => {
        if (!pageId) throw new Error('No pageId')
        const hasTitleChange = payload.changes.some(c => c.type === 'title')
        const res = await useApi(APIS.BULK_PATCH_PAGE_BLOCKS, { id: pageId }, {
            pageId,
            changes: mapChanges(payload),
        })
        applySaveResult(res, hasTitleChange)
    }, [pageId, mapChanges, applySaveResult])

    useEffect(() => {
        return () => {
            if (titleRefreshTimerRef.current) {
                clearTimeout(titleRefreshTimerRef.current)
                titleRefreshTimerRef.current = null
            }
        }
    }, [])

    // Dismissal-time flush (pagehide): async requests are killed by the
    // browser at that point, so send the pending patch with `keepalive`.
    // keepalive bodies are capped (~64KB) — larger payloads fall back to the
    // normal async request as a best effort.
    const handleFlush = useCallback((payload: IncrementalPayload) => {
        if (!pageId) return
        const body = JSON.stringify({ pageId, changes: mapChanges(payload) })
        if (body.length > 60_000) {
            void useApi(APIS.PATCH_PAGE_BLOCKS, { id: pageId }, { pageId, changes: mapChanges(payload) })
        } else {
            const base = (request as any)?.defaults?.baseURL ?? '/api'
            const url = base + APIS.PATCH_PAGE_BLOCKS.url.replace(':id', pageId)
            void fetch(url, {
                method: 'PATCH',
                keepalive: true,
                headers: { 'Content-Type': 'application/json', ...getBearerHeader() },
                body,
            }).catch(() => { /* best effort — page is going away */ })
        }
    }, [pageId, mapChanges])

    return useIncrementalSave({
        editor,
        enabled,
        onSave: handleSave,
        onBulkSave: handleBulkSave,
        onFlush: handleFlush,
    })
}

export interface PageEditorProps {
    /** Explicit page id (tab mode). Falls back to the route `:pageId`. */
    pageId?: string
    /** Explicit space id (tab mode). Falls back to the route `:id`. */
    spaceId?: string
    /** Whether this editor is the visible/active tab. Inactive tabs skip auto-focus. */
    active?: boolean
}

export const PageEditor: React.FC<PageEditorProps> = (props) => {
    const { t } = useTranslation()
    const [showToc, setShowToc] = useState(true)
    // 宽窄模式：持久化在 title 节点的 fullWidth attr 上（随 PATCH 入库、随 Yjs 协作同步）。
    const [fullWidth, setFullWidth] = useState(false)
    const [page, setPage] = useState<any>()
    const params = useParams()
    // Prefer explicit props (rendered inside the tab container) and fall back to
    // the route params (legacy / direct route render). Everything below uses
    // these locals — never `params.*` directly — so a backgrounded tab keeps
    // editing its own page even though the URL points at the active tab.
    const pageId = props.pageId ?? params.pageId
    const spaceId = props.spaceId ?? params.id
    const { updateMeta } = usePageTabs(spaceId)
    const { userInfo } = useSelector((state: GlobalState) => state)
    const [pageLoading, { toggle: toggleLoading }] = useToggle(false)
    const [syncStatus, setSyncStatus] = useState(false)
    // Fallback so the editor still renders if the collab server never syncs
    // (offline / WS unreachable). CollaborationEditor waits for sync internally
    // before seeding, so rendering on timeout is safe and avoids a blank page.
    const [syncTimedOut, setSyncTimedOut] = useState(false)
    const lastAwarenessRef = useRef<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
    const editor = useRef<Editor>(null)
    const navigator = useNavigator()
    const spaceService = useService("spaceService")
    const { usePath } = useUploadFile();
    const [editorContentReady, setEditorContentReady] = useState(false)
    const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
    const [presentationOpen, setPresentationOpen] = useState(false)

    // Generate stable user color based on user ID
    const userColor = useMemo(() => {
        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
        ];
        const id = userInfo?.id || userInfo?.name || 'anonymous';
        const hash = String(id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }, [userInfo?.id, userInfo?.name]);

    // Memoize user object to prevent infinite loop in CollaborationEditor
    const collaborationUser = useMemo(() => ({
        name: userInfo?.name || 'Anonymous',
        color: userColor,
        id: userInfo?.id,
        avatar: userInfo?.avatar ? usePath(userInfo.avatar) : undefined,
    }), [userInfo?.name, userInfo?.id, userColor, userInfo?.avatar, usePath]);

    // Create collaboration provider - deferred to avoid blocking on page switch
    const [deferredPageId, setDeferredPageId] = useState<string | undefined>(undefined);

    // Delay provider creation to next tick to avoid blocking UI
    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDeferredPageId(pageId);
        }, 50);
        return () => clearTimeout(timer);
    }, [pageId]);

    // Provider is created in an effect (not useMemo) because it has side effects
    // (WebSocket connection, awareness setup). The effect cleanup tears down the
    // previous provider when deferredPageId changes or the component unmounts.
    const [provider, setProvider] = useState<TiptapCollabProvider | undefined>(undefined);

    React.useEffect(() => {
        if (!deferredPageId) {
            setProvider(undefined);
            return;
        }

        const doc = new Y.Doc();
        const collabProvider = new TiptapCollabProvider({
            // Env-configurable collab endpoint; auth token is the user's
            // OAuth2 access token — never the pageId (pageId-as-token lets
            // anyone join any page's collaboration room).
            baseUrl: getAppEnv('VITE_COLLABORATION_WS_URL') || 'wss://kotion.top:8877/ws',
            name: `page:${deferredPageId}`,
            token: getAccessToken() || '',
            document: doc,
            onAwarenessUpdate: ({ states }) => {
                const updatedUsers = states
                    .map((state) => ({
                        clientId: state.clientId,
                        user: state.user
                    }))
                    .filter(u => u.user); // Filter out states without user info

                if (!deepEqual(updatedUsers, lastAwarenessRef.current)) {
                    setUsers(updatedUsers);
                    lastAwarenessRef.current = updatedUsers;
                }
            },
            onSynced: () => {
                setSyncStatus(true);
                setConnectionStatus('connected');
            },
            onStatus: (status: any) => {
                if (status.status === 'connected') {
                    setConnectionStatus('connected');
                } else if (status.status === 'disconnected') {
                    setConnectionStatus('disconnected');
                } else {
                    setConnectionStatus('connecting');
                }
            }
        });

        setProvider(collabProvider);

        return () => {
            collabProvider.awareness?.destroy();
            collabProvider.disconnect();
            collabProvider.destroy();
        };
    }, [deferredPageId]);

    useEffect(() => {
        setSyncTimedOut(false)
        const t = setTimeout(() => setSyncTimedOut(true), 8000)
        return () => clearTimeout(t)
    }, [pageId])

    useEffect(() => {
        toggleLoading()
        spaceService.getPage(pageId!).then((res: any) => {
            setPage(res)
            // Backfill the tab title + icon now that the page has loaded.
            // IMAGE icons store a file name; only emoji text is usable as a tab icon.
            if (pageId) updateMeta(pageId, { title: res?.title, icon: res?.icon?.type === 'IMAGE' ? undefined : res?.icon?.icon })
            // Enrich with author display info (name/avatar) for the PageHeader
            // metadata row. Non-blocking: the page renders first, names fill in.
            Promise.all([resolveUserBrief(res?.createUser), resolveUserBrief(res?.updateUser)]).then(([creator, updater]) => {
                if (!creator && !updater) return
                setPage((prev: any) => prev && prev.id === res.id ? {
                    ...prev,
                    createUserName: creator?.name,
                    createUserAvatar: creator?.avatar,
                    updateUserName: updater?.name,
                } : prev)
            })
        }).catch((err: any) => {
            console.error('Failed to load page:', err)
            toast.error('Failed to load page content')
        }).finally(() => {
            toggleLoading()
        })

        return () => {
            setPage(null)
            setEditorContentReady(false)
        }
    }, [pageId])

    // Favorite state for the current page
    const [isFavorited, setIsFavorited] = useState(false)
    const [favoriteToggling, setFavoriteToggling] = useState(false)

    const refreshFavoriteState = useCallback(async () => {
        if (!pageId) return
        try {
            const res = await useApi(APIS.QUERY_FAVORITE, { pageSize: 1000 })
            const data = res?.data
            const list = Array.isArray(data) ? data : (data?.records || [])
            const pid = String(pageId)
            setIsFavorited(list.some((item: any) => String(item.id) === pid))
        } catch (err) {
            console.error('Failed to load favorite state:', err)
        }
    }, [pageId])

    useEffect(() => {
        refreshFavoriteState()
    }, [refreshFavoriteState])

    useEffect(() => {
        const handler = () => { refreshFavoriteState() }
        event.on(ON_FAVORITE_CHANGE, handler)
        return () => { event.off(ON_FAVORITE_CHANGE, handler) }
    }, [refreshFavoriteState])

    // Expose page-level capabilities (search/create/open pages) to the AI
    // agent's page tools via the PageBridge registry. Only the active tab
    // registers, so tools always act on the page the user is looking at.
    useEffect(() => {
        if (props.active === false || !pageId) return

        const bridge: PageBridge = {
            getCurrentPage: () => ({
                pageId: pageId ? String(pageId) : undefined,
                spaceId: spaceId ? String(spaceId) : undefined,
                title: page?.title,
                parentId: page?.parentId ? String(page.parentId) : undefined
            }),
            searchPages: async (query?: string) => {
                const res: any = await spaceService.queryPage({ searchValue: query, pageSize: 30 })
                const records = Array.isArray(res) ? res : res?.records ?? []
                return records.map((p: any) => ({
                    id: String(p.id),
                    title: p.title,
                    spaceId: p.spaceId !== undefined ? String(p.spaceId) : undefined,
                    spaceName: p.spaceName
                }))
            },
            createPage: async ({ spaceId: targetSpaceId, title, parentId }) => {
                const created: any = await spaceService.createPage({
                    spaceId: targetSpaceId,
                    title,
                    parentId
                })
                return { id: String(created?.id ?? created), title }
            },
            openPage: (targetPageId: string, targetSpaceId?: string) => {
                navigator.go({ to: `/space-detail/${targetSpaceId ?? spaceId}/page/edit/${targetPageId}` })
            }
        }

        setPageBridge(bridge)
        return () => clearPageBridge(bridge)
    }, [pageId, spaceId, page, props.active, spaceService, navigator])

    // Publish this tab's editor for views living outside the editor subtree —
    // dock panels such as the outline. Same rule as the PageBridge above: only
    // the active tab publishes, so panels always follow the visible document.
    useEffect(() => {
        if (props.active === false || !pageId || !editorContentReady) return
        const instance = editor.current
        if (!instance) return

        setActiveEditor(instance, { pageId: String(pageId), spaceId: spaceId ? String(spaceId) : undefined })
        return () => clearActiveEditor(String(pageId))
    }, [pageId, spaceId, props.active, editorContentReady])

    const toggleFavorite = useCallback(async () => {
        if (!pageId || favoriteToggling) return
        setFavoriteToggling(true)
        const prev = isFavorited
        // Optimistic update
        setIsFavorited(!prev)
        try {
            if (prev) {
                await useApi(APIS.REMOVE_FAVORITE, { id: pageId })
                toast.success('Removed from favorites')
            } else {
                await useApi(APIS.ADD_FAVORITE_PAGE, { id: pageId })
                toast.success('Added to favorites')
            }
            event.emit(ON_FAVORITE_CHANGE)
        } catch (err) {
            // Revert on failure
            setIsFavorited(prev)
            console.error('Failed to toggle favorite:', err)
            toast.error(prev ? 'Failed to remove favorite' : 'Failed to add favorite')
        } finally {
            setFavoriteToggling(false)
        }
    }, [pageId, isFavorited, favoriteToggling])

    // Seed the wide/narrow toggle from the page's persisted state once the
    // editor content is ready (the title node attr is the source of truth,
    // synced from the Y.Doc / backend). Re-runs per page.
    useEffect(() => {
        if (!editorContentReady) return
        const node = editor.current?.state.doc.firstChild
        if (node && node.type.name === 'title') {
            setFullWidth(!!node.attrs.fullWidth)
        }
    }, [editorContentReady, pageId])

    // Keep the tab strip's icon (and title) in sync with the editor doc.
    //
    // The definitive source of truth for a page's emoji + title is the title
    // node inside the editor (see PageHeader — icon is stored under
    // `firstChild.attrs.icon`; the display title is the node's text content).
    // `getPage()` returns the last persisted values, but between the initial
    // fetch and every subsequent local/remote edit the tab strip would
    // otherwise show a stale (or missing) icon until page reload.
    //
    // Subscribe once the editor is content-ready and push updates on every
    // `docChanged` transaction (Tiptap's focus/blur meta transactions are
    // filtered out — see `Tiptap transaction listener filtering practice`).
    // Shallow-diff before dispatching so we don't churn Redux for unrelated
    // block edits, which fire many transactions per keystroke.
    useEffect(() => {
        if (!editorContentReady || !pageId) return
        const ed = editor.current
        if (!ed) return

        let lastIcon: string | undefined
        let lastTitle: string | undefined

        const readAndPush = () => {
            const node = ed.state.doc.firstChild
            if (!node || node.type.name !== 'title') return
            const iconAttr = (node.attrs as any)?.icon
            // IMAGE icons store a file name; only emoji text is usable as a tab icon.
            const icon = iconAttr?.type === 'IMAGE' ? undefined : iconAttr?.icon ?? undefined
            const title = node.textContent || undefined
            if (icon === lastIcon && title === lastTitle) return
            lastIcon = icon
            lastTitle = title
            updateMeta(pageId, { title, icon })
        }

        readAndPush()

        const onTx = ({ transaction }: { transaction: any }) => {
            if (!transaction.docChanged) return
            readAndPush()
        }
        ed.on('transaction', onTx)
        return () => { ed.off('transaction', onTx) }
    }, [editorContentReady, pageId, updateMeta])

    // Toggle wide/narrow mode. Persists by writing the `fullWidth` attr onto the
    // title node, which marks it dirty and rides the existing PATCH + Yjs sync
    // chain (same path as cover/icon). Store `null` for the default narrow mode
    // to match the attr's default and avoid persisting a redundant `false`.
    const toggleFullWidth = useCallback((next: boolean) => {
        setFullWidth(next)
        const ed = editor.current
        if (!ed) return
        const node = ed.state.doc.firstChild
        if (!node || node.type.name !== 'title') return
        ed.chain().command(({ tr }) => {
            tr.setNodeMarkup(0, undefined, { ...node.attrs, fullWidth: next || null })
            return true
        }).run()
    }, [])


    // Incremental auto-save via new hook (PATCH blocks only, no ON_PAGE_REFRESH)
    // After each successful save, mirror the backend's update stamp locally so
    // the PageHeader metadata row shows a fresh "updated at" without a reload.
    const handleSaved = useCallback(() => {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
        setPage((prev: any) => prev ? {
            ...prev,
            updateTime: stamp,
            updateUser: userInfo?.id ?? prev.updateUser,
            updateUserName: userInfo?.name ?? prev.updateUserName,
        } : prev)
    }, [userInfo?.id, userInfo?.name])

    const { saving, dirty, error: saveError, progress: saveProgress, saveNow } = usePageSave(
        editor.current,
        pageId || null,
        // NOT gated on `active`: backgrounded tabs must keep auto-saving.
        !!page && !!pageId && editorContentReady,
        handleSaved
    )

    // Copy a shareable link to the current page to the clipboard
    const handleCopyLink = useCallback(async () => {
        const url = `${window.location.origin}/space-detail/${spaceId}/page/edit/${pageId}`
        try {
            await window.navigator.clipboard.writeText(url)
            toast.success(t('editor.linkCopied', 'Link copied'))
        } catch (err) {
            console.error('Failed to copy link:', err)
            toast.error(t('editor.linkCopyFailed', 'Failed to copy link'))
        }
    }, [spaceId, pageId, t])

    // Move the current page to trash, then return to the space
    const handleMoveToTrash = useCallback(async () => {
        if (!pageId) return
        try {
            await useApi(APIS.MOVE_TO_TRASH, { id: pageId })
            toast.success(t('editor.movedToTrash', 'Moved to trash'))
            event.emit(ON_PAGE_REFRESH)
            navigator.go({ to: `/space-detail/${spaceId}` })
        } catch (err) {
            console.error('Failed to move page to trash:', err)
            toast.error(t('editor.moveToTrashFailed', 'Failed to move to trash'))
        }
    }, [pageId, spaceId, navigator, t])

    // After a server-side rollback the editor's collab doc still holds the
    // pre-rollback content. Re-fetch the persisted page and push it into the
    // editor (updates the Y.Doc so peers converge too), then re-baseline the
    // dirty tracker so autosave doesn't immediately patch the restored
    // content back to the server.
    const handleVersionRestored = useCallback(async () => {
        if (!pageId) return
        try {
            const res: any = await spaceService.getPage(pageId)
            setPage(res)
            const ed = editor.current
            if (ed && res?.content) {
                const restored = JSON.parse((res.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">"))
                ed.commands.setContent(restored)
                const tracker = (ed.storage as any)?.dirtyTracker
                tracker?.commit?.()
            }
            event.emit(ON_PAGE_REFRESH)
        } catch (err) {
            console.error('Failed to refresh page after restore:', err)
            toast.error(t('editor.version.refreshFailed', 'Restored on server — reload the page to see it'))
        }
    }, [pageId, spaceService, t])

    // Markdown import handler
    const handleImportMarkdown = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.markdown,.txt';
        input.style.display = 'none';

        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const editorInstance = editor.current;
                if (!editorInstance) return;

                // Parse the markdown to extract title and body
                const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const lines = normalizedText.split('\n');
                let title = file.name.replace(/\.(md|markdown|txt)$/i, '');
                let bodyStartIndex = 0;

                // Extract first H1 as title
                for (let i = 0; i < lines.length; i++) {
                    const trimmed = lines[i].trim();
                    if (trimmed === '') continue;
                    if (trimmed.startsWith('# ')) {
                        title = trimmed.substring(2).trim();
                        bodyStartIndex = i + 1;
                    }
                    break;
                }

                const bodyMarkdown = lines.slice(bodyStartIndex).join('\n').trim();

                // Parse body markdown to ProseMirror-compatible nodes
                const contentNodes = bodyMarkdown ? parseMarkdownToNodes(bodyMarkdown) : [];

                // Construct proper document JSON with title + content
                const docContent = {
                    type: 'doc',
                    content: [
                        {
                            type: 'title',
                            content: [{
                                type: 'heading',
                                content: [{ type: 'text', text: title }]
                            }]
                        },
                        ...(contentNodes.length > 0 ? contentNodes : [{ type: 'paragraph' }])
                    ]
                };

                editorInstance.commands.setContent(docContent);
                toast.success(`Imported "${file.name}" successfully`);
            } catch (err) {
                console.error('Error importing markdown:', err);
                toast.error('Failed to import markdown file');
            }
        };

        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    }, [editor]);

    useKeyPress(["ctrl.s"], (e) => {
        e.preventDefault()
        saveNow()
    })

    // Markdown export: serialize the doc via the built-in tiptap-markdown
    // extension and download it as a .md file. The custom `title` node is
    // stripped from the serialized body and re-emitted as a proper H1 so the
    // output round-trips with `handleImportMarkdown` above.
    const handleExportMarkdown = useCallback(() => {
        const ed = editor.current
        if (!ed) return
        try {
            const markdownStorage = (ed.storage as any)?.markdown
            const doc = ed.state.doc
            const first = doc.firstChild
            const title = (first?.type.name === 'title' && first.textContent) || page?.title || 'document'

            let bodyMd: string
            if (markdownStorage?.serializer && first?.type.name === 'title') {
                // Serialize everything after the title node
                const bodyDoc = doc.type.create(doc.attrs, doc.content.cut(first.nodeSize, doc.content.size))
                bodyMd = markdownStorage.serializer.serialize(bodyDoc)
            } else {
                bodyMd = markdownStorage?.getMarkdown?.() ?? ed.getText()
            }

            const md = `# ${title}\n\n${bodyMd}`.trimEnd() + '\n'
            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${title}.md`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Failed to export markdown:', err)
            toast.error(t('editor.exportMarkdownFailed', 'Failed to export as Markdown'))
        }
    }, [page?.title, t])

    // Get current status display
    const statusDisplay = getStatusDisplay(saving, dirty, saveError, saveProgress)


    // Pre-process page content: parse JSON and unescape HTML entities off the main render path
    const parsedContent = React.useMemo(() => {
        if (!page?.content) return undefined;
        try {
            return JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
        } catch {
            return undefined;
        }
    }, [page?.content]);

    return pageLoading ? <div className="w-full h-full">
        <header className="h-11 w-full flex flex-row justify-between px-1 border-b relative">
            <div className="flex flex-row items-center gap-2 px-1">
                <Skeleton className="h-5 w-48" />
            </div>
            <div className="flex flex-row items-center gap-1 px-1">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
                <Separator orientation="vertical" />
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
            </div>
        </header>
        <main className="w-full flex flex-row justify-center p-8">
            <div className="w-full max-w-[900px] flex flex-col gap-6">
                {/* Title Skeleton */}
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-12 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
                {/* Content Skeleton */}
                <div className="flex flex-col gap-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-5/6" />
                    <Skeleton className="h-32 w-full rounded-lg" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-4/5" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                </div>
            </div>
        </main>
    </div> : (page && <div className="w-full h-full flex flex-col">
        <header className="h-11 flex-shrink-0 w-full flex flex-row justify-between px-1 border-b relative">
            <div className="flex flex-row items-center gap-2 px-1 text-sm flex-1 min-w-0 overflow-hidden">
                <PageBreadcrumb
                    currentPageId={pageId!}
                    pageTree={page.parents}
                    spaceId={spaceId!}
                    currentTitle={page.title}
                />
            </div>
            <div className="flex flex-row items-center gap-1 px-1 flex-shrink-0">
                {/* Collaboration Status and Users */}
                {provider && (
                    <>
                        {/* Connection Status - minimal dot indicator */}
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-default">
                            <div className={`
                                h-2 w-2 rounded-full transition-colors
                                ${connectionStatus === 'connected'
                                    ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                                    : connectionStatus === 'connecting'
                                        ? 'bg-amber-500 animate-pulse'
                                        : 'bg-red-500'}
                            `} />
                            <span className="text-xs text-muted-foreground">
                                {connectionStatus === 'connected' ? 'Synced'
                                    : connectionStatus === 'connecting' ? 'Syncing...'
                                        : 'Offline'}
                            </span>
                        </div>

                        {/* Active Users - cleaner avatar group */}
                        {users.length > 0 && (
                            <>
                                <div className="h-5 w-px bg-border" />
                                <div className="flex -space-x-2">
                                    {users.slice(0, 3).map((u) => (
                                        <div
                                            key={u.clientId}
                                            className="relative h-6 w-6 rounded-full ring-2 ring-background flex items-center justify-center text-[10px] font-semibold text-white cursor-default transition-transform hover:scale-110 hover:z-10 shadow-sm"
                                            style={{ backgroundColor: u.user?.color || '#6366f1' }}
                                            title={u.user?.name || 'Anonymous'}
                                        >
                                            {(u.user?.name || 'A').charAt(0).toUpperCase()}
                                            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-[1.5px] ring-background" />
                                        </div>
                                    ))}
                                    {users.length > 3 && (
                                        <div className="h-6 w-6 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground transition-transform hover:scale-110 hover:z-10">
                                            +{users.length - 3}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Share Button */}
                        <SharePanel pageTitle={page?.title}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground">
                                <UserPlus className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline text-xs">Share</span>
                            </Button>
                        </SharePanel>

                        <Separator orientation="vertical" className="h-5" />
                    </>
                )}

                {/* Auto-save Status — always visible */}
                <div className={`flex items-center gap-1 px-2 py-1 text-xs ${statusDisplay.className}`}>
                    {statusDisplay.icon}
                    <span>{statusDisplay.text}</span>
                </div>
                <Separator orientation="vertical" className="h-5" />
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={toggleFavorite}
                    disabled={favoriteToggling || !pageId}
                    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                    <Star className={`h-3.5 w-3.5 ${isFavorited ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[260px]">
                        <DropdownMenuGroup>
                            <DropdownMenuItem
                                className="flex flex-row justify-between"
                                onSelect={(e) => e.preventDefault()}
                            >
                                <div className="flex flex-row items-center gap-2">
                                    <List className="h-4 w-4" />
                                    <span>{t('editor.showToc', '显示目录')}</span>
                                </div>
                                <Switch checked={showToc} onCheckedChange={setShowToc} />
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="flex flex-row justify-between"
                                onSelect={(e) => e.preventDefault()}
                            >
                                <div className="flex flex-row items-center gap-2">
                                    <MoveHorizontal className="h-4 w-4" />
                                    <span>{t('editor.fullWidth', '全宽模式')}</span>
                                </div>
                                <Switch checked={fullWidth} onCheckedChange={toggleFullWidth} />
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <TemplateCreator mode="page" pageId={pageId!} defaultName={page?.title} className="flex flex-row items-center gap-2 w-full relative select-none rounded-sm px-2 py-1.5 text-sm outline-none cursor-default hover:bg-accent hover:text-accent-foreground">
                                <BookTemplate className="h-4 w-4" />
                                <span>{t('editor.saveAsTemplate', 'Save as template')}</span>
                            </TemplateCreator>
                            <DropdownMenuItem onClick={handleCopyLink}>
                                <div className="flex flex-row items-center gap-2">
                                    <Link className="h-4 w-4" />
                                    <span>{t('editor.copyLink', 'Copy link')}</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => hostEvent.emit(TOGGLE_DOCK_PANEL, { id: 'graph' })}
                                disabled={!pageId || !spaceId}
                            >
                                <div className="flex flex-row items-center gap-2">
                                    <Network className="h-4 w-4" />
                                    <span>{t('editor.relationGraph', 'Relation graph')}</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setPresentationOpen(true)}
                                disabled={!editorContentReady}
                            >
                                <div className="flex flex-row items-center gap-2">
                                    <Presentation className="h-4 w-4" />
                                    <span>{t('editor.presentation', '演示模式')}</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setVersionHistoryOpen(true)}
                                disabled={!pageId}
                            >
                                <div className="flex flex-row items-center gap-2">
                                    <History className="h-4 w-4" />
                                    <span>{t('editor.versionHistory', 'Version history')}</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={handleMoveToTrash}
                            >
                                <div className="flex flex-row items-center gap-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span>{t('editor.moveToTrash', 'Move to trash')}</span>
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <div className="flex flex-row items-center gap-2">
                                        <Download className="h-4 w-4" />
                                        <span>{t('editor.import', 'Import')}</span>
                                    </div>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem onClick={handleImportMarkdown}>
                                            <div className="flex flex-row items-center gap-2">
                                                <FileText className="h-4 w-4" />
                                                <span>{t('editor.fromMarkdown', 'From Markdown')}</span>
                                            </div>
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <div className="flex flex-row items-center gap-2">
                                        <Upload className="h-4 w-4" />
                                        <span>{t('editor.export', 'Export')}</span>
                                    </div>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem onClick={async () => {
                                            if (editor.current) {
                                                exportToPDF(editor.current.view, {
                                                    filename: `${page.title || 'document'}.pdf`,
                                                    format: 'a4',
                                                    orientation: 'portrait',
                                                    margin: 10
                                                });
                                            }
                                        }}>
                                            <div className="flex flex-row items-center gap-2">
                                                <FileIcon className="h-4 w-4" />
                                                <span>{t('editor.asPdf', 'As PDF')}</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleExportMarkdown}>
                                            <div className="flex flex-row items-center gap-2">
                                                <FileText className="h-4 w-4" />
                                                <span>{t('editor.asMarkdown', 'As Markdown')}</span>
                                            </div>
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
        <main className="w-full flex-1 min-h-0">
            {
                page && (syncStatus || syncTimedOut) && <CollaborationEditor
                    pageInfo={page}
                    ref={editor}
                    synced={syncStatus}
                    provider={provider}
                    className="h-full"
                    id={pageId as string}
                    user={collaborationUser}
                    token={getAccessToken() || ''}
                    toc={showToc}
                    fullWidth={fullWidth}
                    withTitle={true}
                    width="w-full"
                    content={parsedContent}
                    onContentReady={() => setEditorContentReady(true)}
                />
            }
        </main>
        <PageVersionHistory
            open={versionHistoryOpen}
            onOpenChange={setVersionHistoryOpen}
            pageId={pageId}
            onRestored={handleVersionRestored}
        />
        {/* 放映模式：挂载即打开（内部自行请求浏览器全屏），关闭即卸载 */}
        {presentationOpen && (
            <PresentationMode
                editor={editor.current}
                onClose={() => setPresentationOpen(false)}
            />
        )}
    </div>)
}