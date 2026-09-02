/**
 * PageEditWindow implementation — draggable floating window for editing a
 * page in place.
 *
 * Lives in @kn/core (which owns the full editor stack) and is published to
 * consumers through @kn/common's PageEditWindow bridge component: plugins
 * never import @kn/core, so `registerPageEditWindow()` injects this
 * implementation at application startup, mirroring registerOffscreenEditorBridge.
 *
 * The window hosts a full CollaborationEditor bound to the target page's
 * Y.Doc (same room as the main editor, so edits sync live with anyone viewing
 * that page) and persists changes through the same incremental PATCH endpoint
 * the main PageEditor uses.
 *
 * - Drag by the header bar; resize from the bottom-right corner. Geometry is
 *   mutated directly on the DOM node (no React re-renders while dragging).
 * - Minimize (header button or double-click the header) collapses the window to
 *   a compact title pill docked bottom-right; minimized windows queue upward so
 *   several can sit there at once. The editor stays mounted while collapsed, so
 *   unsaved edits and the collab connection survive a minimize/restore round
 *   trip. Click the pill (or its restore button) to bring the window back to
 *   the geometry it had before.
 * - Collapse/expand is eased; the editor's box is frozen at a fixed pixel size
 *   for the duration so a long document isn't re-laid-out on every frame (it
 *   just gets clipped). Open/close reuse the dialog-in/out keyframes.
 * - Multiple windows can be open at once: they cascade on open, and any
 *   pointerdown inside a window raises it above its siblings (click-to-focus).
 * - Auto-saves via the shared op-save session hook; a pending write is flushed
 *   before the lease is released on close.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
    type Editor,
    type BlockStoreRead,
} from "@kn/editor";
import {
    useNavigator,
    useSelector,
    useSpacePageService,
    useTranslation,
    getAccessToken,
    getAppEnv,
    setPageEditWindowImpl,
    type GlobalState,
    type PageEditWindowProps,
    type PageRecord,
} from "@kn/common";
import { ArrowUpRight, Check, CloudOff, FileText, LoaderCircle, Maximize2, Minus, Pencil, X } from "@kn/icon";
import { cn, Button, FlatEmoji } from "@kn/ui";

/** The page fields this window renders, with a narrowed icon shape for the header. */
type PageInfoLike = Omit<PageRecord, "icon"> & {
    icon?: { type?: string; icon?: string };
};

const mapPageRecord = (page: PageRecord): PageInfoLike => ({
    ...page,
    icon: page.icon as PageInfoLike["icon"],
});

// Local translation table bridged to the app's current language, so the
// window works regardless of which i18n resources the host app registered.
const MESSAGES = {
    en: {
        page: 'Page',
        untitled: 'Untitled',
        close: 'Close',
        openFullPage: 'Open full page',
        loadPageFailed: 'Failed to load page',
        statusSaving: 'Saving',
        statusSaved: 'Saved',
        statusSaveFailed: 'Save failed',
        statusEditing: 'Editing',
        statusSavedByHost: 'Saved by host',
        statusReadOnly: 'Read-only',
        componentPage: 'This page type can only be opened in the full-page view.',
        minimize: 'Minimize',
        restore: 'Restore',
    },
    zh: {
        page: '页面',
        untitled: '未命名',
        close: '关闭',
        openFullPage: '打开完整页面',
        loadPageFailed: '页面加载失败',
        statusSaving: '保存中',
        statusSaved: '已保存',
        statusSaveFailed: '保存失败',
        statusEditing: '编辑中',
        statusSavedByHost: '已由主机保存',
        statusReadOnly: '只读',
        componentPage: '此页面类型只能在完整页面中打开。',
        minimize: '缩小',
        restore: '还原',
    },
} as const;

type MessageKey = keyof typeof MESSAGES.en;

const useWindowI18n = () => {
    const { i18n } = useTranslation();
    const lang = i18n?.language?.startsWith('zh') ? 'zh' : 'en';
    return useCallback((key: MessageKey) => MESSAGES[lang as 'zh' | 'en'][key], [lang]);
};

const MIN_WIDTH = 480;
const MIN_HEIGHT = 320;
/** Keep at least this many px of the window inside the viewport when dragging. */
const DRAG_MARGIN = 80;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// Shared window-manager stack across all open edit windows (module-level so
// every instance sees the same stack). Windows are stacked from BASE_Z upward
// in click order. BASE_Z must stay below 50: Radix popups (Select, Dropdown,
// HoverCard…) portal to document.body at z-50, and the embedded editor's
// toolbar dropdowns would otherwise render *behind* the window.
const BASE_Z = 40;
const windowStack: HTMLElement[] = [];

const restack = () => {
    windowStack.forEach((el, i) => { el.style.zIndex = String(BASE_Z + i); });
};

// ---- Minimized "taskbar" ----
// Collapsed windows dock bottom-right and queue upward in minimize order. The
// right offset clears the floating AI button that sits in that corner.
const HEADER_HEIGHT = 40; // the header's h-10
const MINIMIZED_WIDTH = 232;
const MINIMIZED_HEIGHT = HEADER_HEIGHT;
const MINIMIZED_RIGHT = 96;
const MINIMIZED_BOTTOM = 16;
const MINIMIZED_GAP = 8;

// ---- Collapse / expand animation ----
// Only minimize/restore animates the box: dragging and resizing must stay
// pinned to the pointer, so the transition is added around the mutation and
// removed after. Note this inline transition overrides the container's
// class-based opacity/transform transition while it is attached.
const ANIM_MS = 220;
const GEOMETRY_TRANSITION = ['left', 'top', 'width', 'height']
    .map((prop) => `${prop} ${ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`)
    .join(', ');
/** Matches the dialog-out keyframe duration (0.15s) used on close. */
const CLOSE_ANIM_MS = 150;

const geometryTimers = new WeakMap<HTMLElement, number>();

/** Apply a geometry change with the collapse easing, then drop the transition. */
const animateGeometry = (el: HTMLElement, apply: () => void) => {
    const pending = geometryTimers.get(el);
    // Re-triggered mid-flight (minimize → restore in quick succession): the
    // stale timer would strip the transition partway through the new run.
    if (pending !== undefined) window.clearTimeout(pending);
    el.style.transition = GEOMETRY_TRANSITION;
    apply();
    geometryTimers.set(el, window.setTimeout(() => {
        el.style.transition = '';
        geometryTimers.delete(el);
    }, ANIM_MS + 30));
};

const minimizedStack: HTMLElement[] = [];

const layoutMinimized = (animate = false) => {
    const left = Math.max(8, window.innerWidth - MINIMIZED_RIGHT - MINIMIZED_WIDTH);
    minimizedStack.forEach((el, i) => {
        const top = Math.max(8, window.innerHeight - MINIMIZED_BOTTOM - (i + 1) * (MINIMIZED_HEIGHT + MINIMIZED_GAP));
        const apply = () => {
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
            el.style.width = `${MINIMIZED_WIDTH}px`;
            el.style.height = `${MINIMIZED_HEIGHT}px`;
        };
        // Pills below a restored window slide down into the freed slot.
        if (animate) animateGeometry(el, apply);
        else apply();
    });
};

// Bottom-anchored pills must follow viewport resizes. Attached once for the
// lifetime of the module: per-instance listeners would be torn down by the
// first window to restore, leaving still-minimized siblings mispositioned.
// Never animated — pills should track the viewport, not lag behind it.
const onViewportResize = () => layoutMinimized();
let minimizedResizeBound = false;
const bindMinimizedResize = () => {
    if (minimizedResizeBound) return;
    window.addEventListener('resize', onViewportResize);
    minimizedResizeBound = true;
};

const PageEditWindowImpl: React.FC<PageEditWindowProps> = ({ pageId, onClose }) => {
    const t = useWindowI18n();
    const navigator = useNavigator();
    const service = useSpacePageService();
    const { userInfo } = useSelector((state: GlobalState) => state);

    const winRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const [page, setPage] = useState<PageInfoLike | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
    const [contentReady, setContentReady] = useState(false);
    const [synced, setSynced] = useState(false);
    // Render anyway if the collab server never syncs (offline / WS unreachable),
    // mirroring the main PageEditor's fallback.
    const [syncTimedOut, setSyncTimedOut] = useState(false);
    const [provider, setProvider] = useState<TiptapCollabProvider | undefined>(undefined);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    const [minimized, setMinimized] = useState(false);
    // Live emoji from the editor's title node (see the sync effect below).
    const [docIcon, setDocIcon] = useState<string | null>(null);
    // Set while the close animation plays, just before the parent unmounts us.
    const [closing, setClosing] = useState(false);
    // Geometry to hand back on restore, captured the moment we collapse.
    const restoreRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

    // Initial geometry: centered, sized to the viewport, cascaded by the number
    // of windows already open. Computed once — all later moves/resizes mutate
    // the DOM node's style directly.
    const initialRect = useMemo(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = clamp(Math.round(vw * 0.55), MIN_WIDTH, Math.max(MIN_WIDTH, vw - 48));
        const h = clamp(Math.round(vh * 0.72), MIN_HEIGHT, Math.max(MIN_HEIGHT, vh - 64));
        const cascade = (windowStack.length % 6) * 28;
        return {
            w,
            h,
            x: clamp(Math.max(24, Math.round((vw - w) / 2)) + cascade, 0, Math.max(0, vw - w)),
            y: clamp(Math.max(24, Math.round((vh - h) / 2)) + cascade, 0, Math.max(0, vh - 44)),
        };
    }, []);

    // ---- Window stacking (click-to-focus across multiple windows) ----
    const bringToFront = useCallback(() => {
        const el = winRef.current;
        if (!el) return;
        const idx = windowStack.indexOf(el);
        if (idx === windowStack.length - 1 && idx !== -1) return; // already topmost
        if (idx !== -1) windowStack.splice(idx, 1);
        windowStack.push(el);
        restack();
    }, []);

    // Register in the stack on mount (new windows open on top); deregister on
    // unmount so remaining windows compact back down toward BASE_Z.
    useEffect(() => {
        bringToFront();
        return () => {
            const el = winRef.current;
            const idx = el ? windowStack.indexOf(el) : -1;
            if (idx !== -1) windowStack.splice(idx, 1);
            restack();
            const minIdx = el ? minimizedStack.indexOf(el) : -1;
            if (minIdx !== -1) {
                minimizedStack.splice(minIdx, 1);
                layoutMinimized(true);
            }
        };
    }, [bringToFront]);

    // ---- Minimize / restore ----
    // Geometry lives on the DOM node, so collapsing and expanding is a style
    // mutation here rather than a re-render of the (expensive) editor subtree.

    // While the window's box animates, pin the editor's box to a fixed pixel
    // size: otherwise every frame reflows the whole document to a new width.
    // Frozen at the *expanded* size in both directions — collapsing clips it,
    // expanding reveals it — so the document lays out at most once per toggle.
    const bodyFreezeTimerRef = useRef<number | null>(null);
    const freezeBody = useCallback((width: number, height: number) => {
        const body = bodyRef.current;
        if (!body) return;
        if (bodyFreezeTimerRef.current !== null) window.clearTimeout(bodyFreezeTimerRef.current);
        body.style.flex = '0 0 auto';
        body.style.width = `${width}px`;
        body.style.height = `${Math.max(0, height)}px`;
        bodyFreezeTimerRef.current = window.setTimeout(() => {
            body.style.flex = '';
            body.style.width = '';
            body.style.height = '';
            bodyFreezeTimerRef.current = null;
        }, ANIM_MS + 30);
    }, []);

    useEffect(() => () => {
        if (bodyFreezeTimerRef.current !== null) window.clearTimeout(bodyFreezeTimerRef.current);
    }, []);

    useEffect(() => {
        const el = winRef.current;
        if (!el) return;
        const rect = restoreRectRef.current;
        const idx = minimizedStack.indexOf(el);
        if (minimized) {
            if (idx === -1) minimizedStack.push(el);
            bindMinimizedResize();
            if (rect) freezeBody(rect.w, rect.h - HEADER_HEIGHT);
            layoutMinimized(true);
            return;
        }
        if (idx !== -1) minimizedStack.splice(idx, 1);
        // Also the mount-time run: nothing to expand back to, and no pill of
        // ours in the taskbar to relayout.
        if (!rect) return;
        layoutMinimized(true);
        // The viewport may have shrunk while we were docked.
        const w = clamp(rect.w, MIN_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - 16));
        const h = clamp(rect.h, MIN_HEIGHT, Math.max(MIN_HEIGHT, window.innerHeight - 16));
        freezeBody(w, h - HEADER_HEIGHT);
        animateGeometry(el, () => {
            el.style.width = `${w}px`;
            el.style.height = `${h}px`;
            el.style.left = `${clamp(rect.x, DRAG_MARGIN - w, Math.max(0, window.innerWidth - DRAG_MARGIN))}px`;
            el.style.top = `${clamp(rect.y, 0, Math.max(0, window.innerHeight - 44))}px`;
        });
    }, [minimized, freezeBody]);

    const handleMinimize = useCallback(() => {
        const el = winRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        restoreRectRef.current = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
        // The editor is only clipped, not unmounted — drop the caret so
        // keystrokes can't land in a window the user can no longer see.
        editorInstance?.commands.blur();
        setMinimized(true);
    }, [editorInstance]);

    const handleRestore = useCallback(() => {
        setMinimized(false);
        bringToFront();
    }, [bringToFront]);

    // Clicking anywhere on the collapsed pill restores it, except on its buttons.
    const onPillClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button')) return;
        handleRestore();
    }, [handleRestore]);

    // ---- Keep the header/pill icon in sync with the editor doc ----
    // The page's emoji lives on the title node (`firstChild.attrs.icon`, see
    // PageHeader), and `getPage()` only returns the last persisted copy — which
    // is missing or stale while the window is open, leaving the collapsed pill
    // with the generic file fallback. Read it straight from the doc and refresh
    // on every `docChanged` transaction (focus/blur meta transactions are
    // filtered out — see `Tiptap transaction listener filtering practice`).
    useEffect(() => {
        if (!editorInstance || !contentReady) return;
        const ed = editorInstance;

        const readIcon = () => {
            const node = ed.state.doc.firstChild;
            if (!node || node.type.name !== 'title') return;
            const iconAttr = (node.attrs as any)?.icon;
            // IMAGE icons store a file name, which isn't renderable as a glyph.
            const next = iconAttr?.type === 'IMAGE' ? null : iconAttr?.icon || null;
            setDocIcon((prev) => (prev === next ? prev : next));
        };

        readIcon();

        const onTx = ({ transaction }: { transaction: any }) => {
            if (!transaction.docChanged) return;
            readIcon();
        };
        ed.on('transaction', onTx);
        return () => { ed.off('transaction', onTx); };
    }, [editorInstance, contentReady]);

    // ---- Load the target page (always fresh: editing needs latest content) ----
    useEffect(() => {
        let cancelled = false;
        service.pages.getPage(pageId)
            .then((record) => {
                if (cancelled) return;
                setPage(mapPageRecord(record));
                service.changes.emit("page.updated", {
                    page: record,
                    spaceId: record.spaceId,
                });
            })
            .catch(() => { if (!cancelled) setLoadError(true); });
        return () => { cancelled = true; };
    }, [pageId, service]);

    const metadataRequestRef = useRef(0);
    useEffect(() => {
        metadataRequestRef.current += 1;
    }, [pageId]);

    const refreshPageMetadata = useCallback(async () => {
        const requestId = ++metadataRequestRef.current;
        try {
            const metadata = await service.pages.getPageMetadata(pageId);
            if (requestId !== metadataRequestRef.current) return;
            setPage((current) => current ? mapPageRecord({ ...current, ...metadata }) : current);
        } catch {
            // Saving the document succeeded; a metadata refresh failure must not
            // turn the editor's save state into an error.
        }
    }, [pageId, service]);

    // ---- Collaboration provider (same room as the main editor for this page) ----
    useEffect(() => {
        if (!page || page.pageType) {
            setProvider(undefined);
            return;
        }
        const doc = new YDoc();
        const collabProvider = new TiptapCollabProvider({
            // Env-configurable collab endpoint; auth token is the user's OAuth2
            // access token — never the pageId (pageId-as-token lets anyone join
            // any page's collaboration room).
            baseUrl: getAppEnv('VITE_COLLABORATION_WS_URL') || 'wss://kotion.top:8877/ws',
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
        });
        setProvider(collabProvider);
        return () => {
            collabProvider.awareness?.destroy();
            collabProvider.disconnect();
            collabProvider.destroy();
        };
    }, [pageId, page?.id, page?.pageType]);

    useEffect(() => {
        if (page?.pageType) return;
        setSyncTimedOut(false);
        const timer = setTimeout(() => setSyncTimedOut(true), 8000);
        return () => clearTimeout(timer);
    }, [pageId, page?.pageType]);

    // ---- Legacy fallback pre-processing ----
    // PageRecord carries the old page-row content only as a migration fallback;
    // the document store below remains authoritative.
    const legacyContent = useMemo(() => {
        const content = page?.legacyContent;
        if (content == null) return undefined;
        if (typeof content !== 'string') return content;
        try {
            return JSON.parse(content.replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
        } catch {
            return undefined;
        }
    }, [page?.legacyContent]);

    // ---- Seed content: read from the block store, which is the authority ----
    // `undefined` while the read is in flight, `null` once it has failed.
    const [blockDoc, setBlockDoc] = useState<BlockStoreRead | null | undefined>(undefined)

    useEffect(() => {
        setBlockDoc(undefined)
        if (!page || page.pageType) return
        let cancelled = false
        service.documents.getPageDocument(pageId)
            .then((document) => {
                if (cancelled) return
                setBlockDoc({
                    doc: document.doc ?? document.content ?? null,
                    rev: toRev(document.rev),
                })
            })
            .catch(() => {
                if (cancelled) return
                setBlockDoc(null)
            })
        return () => { cancelled = true }
    }, [pageId, page?.id, page?.pageType, service])

    // `null` means "not decided yet", holding the editor back from mounting so
    // the first reconcile cannot persist an unseeded document (see the main
    // PageEditor for the reasoning).
    const seed = useMemo(
        () => (page ? chooseSeed(blockDoc, legacyContent) : null),
        [blockDoc, page, legacyContent],
    )

    // ---- Op-based auto-save, same session model as the main PageEditor ----
    const clientId = useMemo(
        () => `${userInfo?.id ?? 'anon'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pageId],
    )

    const { hostPresent, hostSeen } = useHostPresence(provider?.awareness as any)

    const { saving, dirty, error: saveError, session, flushNow } = usePageSave({
        editor: editorInstance,
        pageId,
        enabled: !!page && !page.pageType && contentReady && !!seed?.trusted,
        clientId,
        presence: { connected: connectionStatus === 'connected', hostPresent, hostSeen },
        reconcileOnly: syncTimedOut && !synced,
        documents: service.documents,
        onSaved: ({ titleChanged }) => {
            if (titleChanged) void refreshPageMetadata();
        },
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

    // ---- Collaboration user identity ----
    const collaborationUser = useMemo(() => {
        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
        ];
        const id = userInfo?.id || userInfo?.name || 'anonymous';
        const hash = String(id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return { name: userInfo?.name || 'Anonymous', color: colors[hash % colors.length], id: userInfo?.id };
    }, [userInfo?.id, userInfo?.name]);

    // ---- Close / navigate ----
    // Flush anything still owed (the session's own unmount close does the
    // authoritative flush-then-release; this just gets it out earlier).
    const flushPending = useCallback(() => {
        void flushNow?.()
    }, [flushNow]);

    // The parent owns our mount, so the exit animation runs here and onClose
    // fires once it finishes.
    const closeTimer = useRef<number | null>(null);

    const handleClose = useCallback(() => {
        if (closing) return;
        flushPending();
        setClosing(true);
        closeTimer.current = window.setTimeout(onClose, CLOSE_ANIM_MS);
    }, [closing, flushPending, onClose]);

    useEffect(() => () => {
        if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    }, []);

    const handleOpenFullPage = useCallback(() => {
        const spaceId = page?.spaceId;
        if (!spaceId) return;
        // The route change replaces the whole view — animating out would only
        // delay the navigation.
        flushPending();
        onClose();
        navigator.go({ to: `/space-detail/${spaceId}/page/edit/${pageId}` });
    }, [page?.spaceId, pageId, navigator, flushPending, onClose]);

    // ---- Dragging (header) — mutate style directly, no re-renders ----
    const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

    const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        // Collapsed pills are parked by the taskbar layout, not by the user.
        if (minimized) return;
        // Buttons inside the header must stay clickable, not start a drag.
        if ((e.target as HTMLElement).closest('button')) return;
        const el = winRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
        // A collapse/expand transition may still be attached: the window must
        // track the pointer exactly, not ease behind it.
        el.style.transition = '';
        e.currentTarget.setPointerCapture(e.pointerId);
    }, [minimized]);

    const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragRef.current;
        const el = winRef.current;
        if (!d || !el) return;
        const w = el.offsetWidth;
        const x = clamp(d.origX + (e.clientX - d.startX), DRAG_MARGIN - w, window.innerWidth - DRAG_MARGIN);
        const y = clamp(d.origY + (e.clientY - d.startY), 0, window.innerHeight - 44);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    }, []);

    const endDrag = useCallback(() => { dragRef.current = null; }, []);

    // ---- Resizing (bottom-right corner) ----
    const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

    const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const el = winRef.current;
        if (!el) return;
        e.preventDefault();
        resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: el.offsetWidth, origH: el.offsetHeight };
        el.style.transition = '';
        e.currentTarget.setPointerCapture(e.pointerId);
    }, []);

    const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const r = resizeRef.current;
        const el = winRef.current;
        if (!r || !el) return;
        const w = clamp(r.origW + (e.clientX - r.startX), MIN_WIDTH, window.innerWidth - 16);
        const h = clamp(r.origH + (e.clientY - r.startY), MIN_HEIGHT, window.innerHeight - 16);
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
    }, []);

    const endResize = useCallback(() => { resizeRef.current = null; }, []);

    // ---- Save status pill ----
    const status = saving
        ? { icon: <LoaderCircle className="h-3 w-3 animate-spin" />, text: t('statusSaving'), className: 'text-muted-foreground' }
        : saveError
            ? { icon: <CloudOff className="h-3 w-3" />, text: t('statusSaveFailed'), className: 'text-destructive' }
            : seed && !seed.trusted
                ? { icon: <CloudOff className="h-3 w-3" />, text: t('statusReadOnly'), className: 'text-muted-foreground' }
                : session.alive && !session.isHost
                    ? { icon: <Check className="h-3 w-3" />, text: t('statusSavedByHost'), className: 'text-muted-foreground' }
                    : dirty
                        ? { icon: <Pencil className="h-3 w-3" />, text: t('statusEditing'), className: 'text-muted-foreground' }
                        : { icon: <Check className="h-3 w-3" />, text: t('statusSaved'), className: 'text-muted-foreground' };

    // Prefer the doc's emoji; the page metadata copy covers the window's first
    // frames, before the editor is content-ready.
    // IMAGE icons store a file name, which isn't renderable as a glyph.
    const icon = docIcon ?? (page?.icon?.type === 'IMAGE' ? null : page?.icon?.icon || null);

    const window_ = (
        <div
            ref={winRef}
            className={cn(
                "fixed flex flex-col overflow-hidden",
                "rounded-lg border border-border bg-background shadow-2xl",
                // Enter reuses the Dialog keyframes; exit is a transition rather
                // than the paired keyframe so the faded-out state holds until
                // the parent unmounts us (no animation-fill-mode ordering
                // dependency). Both touch opacity/transform only — GPU-composited.
                "animate-dialog-in transition-[opacity,transform] duration-150",
                closing && "pointer-events-none scale-95 opacity-0",
            )}
            style={{ left: initialRect.x, top: initialRect.y, width: initialRect.w, height: initialRect.h, zIndex: BASE_Z }}
            role="dialog"
            aria-label={page?.title || t('page')}
            // Capture phase so clicks anywhere inside (header, editor, resize
            // handle) raise this window, even if a child stops propagation.
            onPointerDownCapture={bringToFront}
        >
            {/* Header — drag handle (collapsed: the taskbar pill itself) */}
            <div
                className={cn(
                    "flex h-10 flex-shrink-0 select-none items-center gap-2 border-b border-border bg-muted/40 px-3 touch-none",
                    minimized ? "cursor-pointer border-b-transparent" : "cursor-move",
                )}
                onPointerDown={onHeaderPointerDown}
                onPointerMove={onHeaderPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClick={minimized ? onPillClick : undefined}
                onDoubleClick={minimized ? undefined : handleMinimize}
                title={minimized ? t('restore') : undefined}
            >
                {/* Flat (Twemoji) rendering, same as the sidebar and page header —
                    the native glyph would look different on every platform. */}
                {icon ? (
                    <FlatEmoji emoji={icon} size={16} className="flex-shrink-0" />
                ) : (
                    <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {page?.title || t('untitled')}
                </span>
                <span className={cn("flex items-center gap-1 text-xs flex-shrink-0", status.className)}>
                    {status.icon}
                    {/* The pill is too narrow for the label — icon only there. */}
                    <span className={cn("hidden", !minimized && "sm:inline")}>{status.text}</span>
                </span>
                {!minimized && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={handleOpenFullPage}
                        disabled={!page?.spaceId}
                        title={t('openFullPage')}
                        aria-label={t('openFullPage')}
                    >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={minimized ? handleRestore : handleMinimize}
                    title={minimized ? t('restore') : t('minimize')}
                    aria-label={minimized ? t('restore') : t('minimize')}
                >
                    {minimized ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3.5 w-3.5" />}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={handleClose}
                    title={t('close')}
                    aria-label={t('close')}
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Body — the embedded collaborative editor. Kept mounted while
                minimized (flex clips it to zero height) so unsaved edits and
                the collab connection survive collapsing. */}
            <div
                ref={bodyRef}
                className={cn(
                    "min-h-0 flex-1 transition-opacity",
                    minimized ? "opacity-0 duration-150" : "opacity-100 duration-200",
                )}
            >
                {loadError ? (
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                        <CloudOff className="h-4 w-4" />
                        {t('loadPageFailed')}
                    </div>
                ) : page?.pageType ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <p className="max-w-sm text-sm text-muted-foreground">{t('componentPage')}</p>
                        <Button variant="outline" size="sm" onClick={handleOpenFullPage} disabled={!page.spaceId}>
                            <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                            {t('openFullPage')}
                        </Button>
                    </div>
                ) : page && seed && (synced || syncTimedOut) ? (
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
                        pageDocuments={service.documents}
                        className="h-full"
                        id={pageId}
                        user={collaborationUser}
                        token={getAccessToken() || ''}
                        toc={true}
                        tocContained={true}
                        withTitle={true}
                        width="w-full"
                        content={seed.doc as any}
                        onContentReady={() => setContentReady(true)}
                    />
                ) : (
                    <div className="space-y-3 p-6 animate-pulse">
                        <div className="h-7 w-2/3 rounded bg-muted" />
                        <div className="h-4 w-full rounded bg-muted" />
                        <div className="h-4 w-5/6 rounded bg-muted" />
                        <div className="h-4 w-full rounded bg-muted" />
                        <div className="h-24 w-full rounded bg-muted" />
                    </div>
                )}
            </div>

            {/* Resize handle */}
            {!minimized && (
                <div
                    className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
                    onPointerDown={onResizePointerDown}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={endResize}
                    onPointerCancel={endResize}
                    aria-hidden="true"
                >
                    <svg viewBox="0 0 16 16" className="h-full w-full text-muted-foreground/60">
                        <path d="M14 6 L6 14 M14 10 L10 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                    </svg>
                </div>
            )}
        </div>
    );

    return createPortal(window_, document.body);
};

PageEditWindowImpl.displayName = 'PageEditWindowImpl';

/**
 * Publish the implementation through @kn/common's PageEditWindow bridge.
 * Must be called once at application startup (alongside
 * registerOffscreenEditorBridge).
 */
export function registerPageEditWindow(): void {
    setPageEditWindowImpl(PageEditWindowImpl);
}
