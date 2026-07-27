/**
 * PageEditWindow — draggable floating window for editing a page in place.
 *
 * Lives in @kn/editor so any package can open a page in a floating editor
 * without navigating away (used by plugin-block-reference's page links and
 * plugin-ai's chat @-page chip). The window hosts a full CollaborationEditor
 * bound to the target page's Y.Doc (same room as the main editor, so edits
 * sync live with anyone viewing that page) and persists changes through the
 * same incremental PATCH endpoint the main PageEditor uses.
 *
 * - Drag by the header bar; resize from the bottom-right corner. Geometry is
 *   mutated directly on the DOM node (no React re-renders while dragging).
 * - Multiple windows can be open at once: they cascade on open, and any
 *   pointerdown inside a window raises it above its siblings (click-to-focus).
 * - Auto-saves via useIncrementalSave; a pending save is flushed on close.
 * - `onPageMutated` lets callers drop their own page caches when the window
 *   loads or persists content (e.g. hover-preview caches).
 *
 * @module @kn/editor/editor
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import { Doc as YDoc } from "yjs";
import { useApi, useNavigator, useSelector, useService, useTranslation, type API, type GlobalState } from "@kn/common";
import { ArrowUpRight, Check, CloudOff, FileText, LoaderCircle, Pencil, X } from "@kn/icon";
import { cn, Button } from "@kn/ui";
import { CollaborationEditor } from "./collaboration";
import { useIncrementalSave, type IncrementalPayload } from "../hooks";

/** Incremental save endpoint — same contract as the main PageEditor. */
const PATCH_PAGE_BLOCKS: API = {
    url: '/knowledge-wiki/space/page/:id/blocks',
    method: 'PATCH',
    name: 'Patch Page Blocks',
};

/** The page fields this window needs (matches spaceService.getPage's shape). */
export interface PageEditWindowPageInfo {
    id: string;
    title: string;
    icon?: { icon: string };
    spaceId: string;
    /** JSON string of page content */
    content?: string;
}

interface SpaceServiceLike {
    getPage: (pageId: string) => Promise<PageEditWindowPageInfo | null | undefined>;
}

// Local translation table bridged to the app's current language, so the
// window works in packages that don't register their own i18n resources.
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

export interface PageEditWindowProps {
    pageId: string;
    onClose: () => void;
    /**
     * Invoked whenever this window may have changed the page's persisted
     * content (on load, after each save, on close) so callers can invalidate
     * their own caches of that page.
     */
    onPageMutated?: (pageId: string) => void;
}

export const PageEditWindow: React.FC<PageEditWindowProps> = ({ pageId, onClose, onPageMutated }) => {
    const t = useWindowI18n();
    const navigator = useNavigator();
    // "spaceService" is added to the Services interface via module augmentation
    // in the app layer, which this package doesn't see — look it up untyped.
    const spaceService = (useService as (name: string) => unknown)("spaceService") as SpaceServiceLike;
    const { userInfo } = useSelector((state: GlobalState) => state);

    const winRef = useRef<HTMLDivElement>(null);
    const [page, setPage] = useState<PageEditWindowPageInfo | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
    const [contentReady, setContentReady] = useState(false);
    const [synced, setSynced] = useState(false);
    // Render anyway if the collab server never syncs (offline / WS unreachable),
    // mirroring the main PageEditor's fallback.
    const [syncTimedOut, setSyncTimedOut] = useState(false);
    const [provider, setProvider] = useState<TiptapCollabProvider | undefined>(undefined);

    // Keep the latest callback out of effect deps — cache invalidation must
    // not retrigger page loads.
    const onPageMutatedRef = useRef(onPageMutated);
    onPageMutatedRef.current = onPageMutated;

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
        };
    }, [bringToFront]);

    // ---- Load the target page (always fresh: editing needs latest content) ----
    useEffect(() => {
        let cancelled = false;
        onPageMutatedRef.current?.(pageId);
        spaceService.getPage(pageId)
            .then((res) => {
                if (cancelled) return;
                if (res) setPage(res);
                else setLoadError(true);
            })
            .catch(() => { if (!cancelled) setLoadError(true); });
        return () => { cancelled = true; };
    }, [pageId, spaceService]);

    // ---- Collaboration provider (same room as the main editor for this page) ----
    useEffect(() => {
        const doc = new YDoc();
        const collabProvider = new TiptapCollabProvider({
            baseUrl: 'wss://kotion.top:8877/ws',
            name: `page:${pageId}`,
            token: pageId,
            document: doc,
            onSynced: () => setSynced(true),
        });
        setProvider(collabProvider);
        return () => {
            collabProvider.awareness?.destroy();
            collabProvider.disconnect();
            collabProvider.destroy();
        };
    }, [pageId]);

    useEffect(() => {
        setSyncTimedOut(false);
        const timer = setTimeout(() => setSyncTimedOut(true), 8000);
        return () => clearTimeout(timer);
    }, [pageId]);

    // ---- Incremental auto-save (same PATCH contract as the main PageEditor) ----
    const handleSave = useCallback(async (payload: IncrementalPayload) => {
        const res = await useApi(PATCH_PAGE_BLOCKS, { id: pageId }, {
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
        });
        const data = (res as any)?.data;
        if (data?.blockVersions) {
            const tracker = (editorInstance?.storage as any)?.dirtyTracker;
            tracker?.applyServerVersions?.(data.blockVersions);
        }
        // Callers may cache page content (e.g. hover previews) — let them
        // drop it so they show fresh text.
        onPageMutatedRef.current?.(pageId);
    }, [pageId, editorInstance]);

    const { saving, dirty, error: saveError, saveNow } = useIncrementalSave({
        editor: editorInstance,
        enabled: !!page && contentReady,
        onSave: handleSave,
    });

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

    // ---- Content pre-processing (unescape like the main PageEditor) ----
    const parsedContent = useMemo(() => {
        if (!page?.content) return undefined;
        try {
            return JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
        } catch {
            return undefined;
        }
    }, [page?.content]);

    // ---- Close / navigate ----
    const handleClose = useCallback(() => {
        // Flush pending edits. The payload is captured synchronously inside
        // saveNow (before its first await), so unmounting right after is safe.
        if (dirty) { saveNow().catch(() => { /* stays dirty server-side; nothing to do */ }); }
        onPageMutatedRef.current?.(pageId);
        onClose();
    }, [dirty, saveNow, pageId, onClose]);

    const handleOpenFullPage = useCallback(() => {
        const spaceId = page?.spaceId;
        if (!spaceId) return;
        handleClose();
        navigator.go({ to: `/space-detail/${spaceId}/page/edit/${pageId}` });
    }, [page?.spaceId, pageId, navigator, handleClose]);

    // ---- Dragging (header) — mutate style directly, no re-renders ----
    const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

    const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        // Buttons inside the header must stay clickable, not start a drag.
        if ((e.target as HTMLElement).closest('button')) return;
        const el = winRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
        e.currentTarget.setPointerCapture(e.pointerId);
    }, []);

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
            : dirty
                ? { icon: <Pencil className="h-3 w-3" />, text: t('statusEditing'), className: 'text-muted-foreground' }
                : { icon: <Check className="h-3 w-3" />, text: t('statusSaved'), className: 'text-muted-foreground' };

    const icon = page?.icon?.icon || null;

    const window_ = (
        <div
            ref={winRef}
            className={cn(
                "fixed flex flex-col overflow-hidden",
                "rounded-lg border border-border bg-background shadow-2xl",
            )}
            style={{ left: initialRect.x, top: initialRect.y, width: initialRect.w, height: initialRect.h, zIndex: BASE_Z }}
            role="dialog"
            aria-label={page?.title || t('page')}
            // Capture phase so clicks anywhere inside (header, editor, resize
            // handle) raise this window, even if a child stops propagation.
            onPointerDownCapture={bringToFront}
        >
            {/* Header — drag handle */}
            <div
                className="flex h-10 flex-shrink-0 cursor-move select-none items-center gap-2 border-b border-border bg-muted/40 px-3 touch-none"
                onPointerDown={onHeaderPointerDown}
                onPointerMove={onHeaderPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                {icon ? (
                    <span className="text-base leading-none flex-shrink-0">{icon}</span>
                ) : (
                    <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {page?.title || t('untitled')}
                </span>
                <span className={cn("flex items-center gap-1 text-xs flex-shrink-0", status.className)}>
                    {status.icon}
                    <span className="hidden sm:inline">{status.text}</span>
                </span>
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

            {/* Body — the embedded collaborative editor */}
            <div className="min-h-0 flex-1">
                {loadError ? (
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                        <CloudOff className="h-4 w-4" />
                        {t('loadPageFailed')}
                    </div>
                ) : page && (synced || syncTimedOut) ? (
                    <CollaborationEditor
                        pageInfo={page}
                        ref={(ed: Editor | null) => setEditorInstance(ed)}
                        synced={synced}
                        provider={provider}
                        className="h-full"
                        id={pageId}
                        user={collaborationUser}
                        token={pageId}
                        toc={false}
                        withTitle={true}
                        width="w-full"
                        content={parsedContent}
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
        </div>
    );

    return createPortal(window_, document.body);
};

PageEditWindow.displayName = 'PageEditWindow';
