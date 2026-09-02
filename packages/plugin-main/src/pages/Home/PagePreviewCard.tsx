/**
 * PagePreviewCard — hover preview for page rows (Home recent/favorite lists).
 *
 * A single floating card is shared by all rows (via PagePreviewProvider):
 * hovering a row shows the card, and moving to another row keeps it mounted —
 * the card slides to the new row while the fresh content crossfades in,
 * instead of the close-and-reopen flicker of per-row popovers. Content is
 * fetched lazily (short-TTL cache) and rendered with a real read-only Tiptap
 * editor, so the preview matches actual page rendering. The card body is
 * non-interactive; clicking it opens the page.
 */
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    AnyExtension,
    Content,
    EditorContent,
    StyledEditor,
    useEditor,
    useEditorExtension,
} from "@kn/editor";
import { Skeleton, cn } from "@kn/ui";
import { FileText } from "@kn/icon";
import {
    FileService,
    useOptionalService,
    useSpacePageService,
    useTranslation,
} from "@kn/common";
import { PageIconData, PageItemIcon } from "../SpaceDetail/components/PageItemIcon";

/** Page metadata supplied by the already-loaded Home row plus PAGE_DOC content. */
interface PreviewPage {
    id: string;
    title?: string;
    icon?: PageIconData;
    spaceName?: string;
    doc?: Content | null;
}

// Short-lived content cache: hovering the same row twice within the TTL
// reuses the fetched page instead of hitting the API again.
const TTL_MS = 60_000;
const MAX_ENTRIES = 50;
const previewCache = new Map<string, { page: PreviewPage; at: number }>();

const readCache = (pageId: string): PreviewPage | null => {
    const hit = previewCache.get(pageId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.page;
    if (hit) previewCache.delete(pageId);
    return null;
};

const writeCache = (pageId: string, page: PreviewPage) => {
    if (previewCache.size >= MAX_ENTRIES) {
        const oldest = previewCache.keys().next().value;
        if (oldest !== undefined) previewCache.delete(oldest);
    }
    previewCache.set(pageId, { page, at: Date.now() });
};

/** Cover config persisted on the title node's attrs (see PageHeader). */
interface CoverConfig {
    url: string;
    /** 0-100 vertical position percentage, default 50 */
    position?: number;
}

/**
 * Parse the stored content JSON into a body-only doc plus the cover config.
 * The `title` node is stripped from the body: the card header already shows
 * the title, and the read-only editor here uses the plain Document top node
 * (no title schema) — but its attrs carry the page cover, so it's read first.
 */
const parsePage = (doc?: Content | null): { body: Content | null; cover: CoverConfig | null } => {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { body: null, cover: null };
    const nodes: any[] = Array.isArray((doc as any)?.content) ? (doc as any).content : [];
    const title = nodes.find((n) => n?.type === "title");
    const cover = title?.attrs?.cover?.url ? (title.attrs.cover as CoverConfig) : null;
    const body = nodes.filter((n) => n?.type !== "title");
    return { body: body.length > 0 ? { type: "doc", content: body } : null, cover };
};

/** Read-only Tiptap instance rendering the page body at preview scale. */
const PreviewEditor: React.FC<{ content: Content }> = ({ content }) => {
    const [extensions] = useEditorExtension("trailingNode");
    const editor = useEditor(
        {
            editable: false,
            content,
            extensions: extensions as AnyExtension[],
            editorProps: {
                attributes: {
                    class: "magic-editor",
                    spellcheck: "false",
                },
            },
        },
        [content, extensions]
    );

    return (
        // Inline font-size shrinks the whole prose scale (children size in em);
        // pointer-events-none keeps embedded node views from swallowing clicks.
        <StyledEditor
            className="pointer-events-none select-none"
            style={{ fontSize: "13px", padding: 0 }}
        >
            <EditorContent editor={editor} />
        </StyledEditor>
    );
};

const PreviewSkeleton: React.FC = () => (
    <div className="space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
    </div>
);

/** Card body — mounted only while the hover card is open, so the fetch and
 *  the read-only editor spin up lazily on first hover. */
const PreviewBody: React.FC<{
    pageId: string;
    title?: string;
    spaceName?: string;
    icon?: PageIconData | null;
    pageType?: string;
}> = ({ pageId, title, spaceName, icon, pageType }) => {
    const { t } = useTranslation();
    const service = useSpacePageService();
    const fileService = useOptionalService("fileService") as FileService | undefined;
    const [page, setPage] = useState<PreviewPage | null>(() => readCache(pageId));
    const [error, setError] = useState(false);

    useEffect(() => {
        if (pageType || readCache(pageId)) return;
        let cancelled = false;
        service.documents.getPageDocument(pageId)
            .then((document) => {
                if (cancelled) return;
                const doc = (document.doc ?? null) as Content | null;
                if (doc) {
                    const preview = { id: pageId, title, spaceName, icon: icon || undefined, doc };
                    writeCache(pageId, preview);
                    setPage(preview);
                } else {
                    setError(true);
                }
            })
            .catch(() => {
                if (!cancelled) setError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [service, pageId, title, spaceName, icon, pageType]);

    const { body, cover } = useMemo(() => parsePage(page?.doc), [page?.doc]);
    // Prefer the icon the hovered row already knows (emoji/image/date all
    // render identically to the list), and fall back to the fetched page.
    const pageIcon = icon || page?.icon || null;

    // Same URL resolution chain as PageHeader: absolute/data URLs pass through,
    // stored file names go through fileService's download endpoint.
    const coverUrl = useMemo(() => {
        const url = cover?.url;
        if (!url) return null;
        if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
            return url;
        }
        if (fileService) return fileService.getDownloadUrl(url);
        return `https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName=${url}`;
    }, [cover?.url, fileService]);

    return (
        <div className="flex flex-col">
            {/* Cover banner — mirrors the page's own cover crop position */}
            {coverUrl && (
                <div className="h-[96px] w-full shrink-0 overflow-hidden bg-muted/30">
                    <img
                        src={coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ objectPosition: `center ${cover?.position ?? 50}%` }}
                        draggable={false}
                    />
                </div>
            )}
            {/* Header: icon + title + space name */}
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                {pageIcon?.icon ? (
                    <PageItemIcon icon={pageIcon} size={16} />
                ) : (
                    <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {title || page?.title || t("home.untitled", "Untitled")}
                </span>
                {(spaceName || page?.spaceName) && (
                    <span className="max-w-[120px] shrink-0 truncate text-[11px] text-muted-foreground">
                        {spaceName || page?.spaceName}
                    </span>
                )}
            </div>
            {/* Body: read-only editor clamped in height with a bottom fade */}
            <div className="relative max-h-[280px] overflow-hidden px-4 py-3">
                {pageType ? (
                    <div className="py-5 text-center">
                        <p className="text-sm font-medium">{t("home.custom-page", "Custom page")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t("home.custom-page-open", "Open the page to view its plugin content")}</p>
                    </div>
                ) : error ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                        {t("home.preview-error", "Failed to load preview")}
                    </p>
                ) : !page ? (
                    <PreviewSkeleton />
                ) : body ? (
                    <PreviewEditor content={body} />
                ) : (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                        {t("home.preview-empty", "This page is empty")}
                    </p>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-popover to-transparent" />
            </div>
        </div>
    );
};

export interface PagePreviewCardProps {
    pageId: string;
    /** Metadata already present on the Home row; PAGE_DOC supplies only content. */
    title?: string;
    spaceName?: string;
    /** Row icon reused in the card header so it matches the list exactly. */
    icon?: PageIconData | null;
    /** Component pages use a metadata-only preview and never mount plugin content. */
    pageType?: string;
    /** Skip the hover card entirely (e.g. on touch devices). */
    disabled?: boolean;
    /** Invoked when the card body is clicked — callers navigate to the page. */
    onOpenPage?: () => void;
    children: React.ReactElement;
}

/** What a hovered row hands to the shared floating card. */
interface PreviewTarget {
    pageId: string;
    title?: string;
    spaceName?: string;
    icon?: PageIconData | null;
    pageType?: string;
    rect: { top: number; left: number; right: number };
    onOpenPage?: () => void;
}

interface PreviewContextValue {
    open: (target: PreviewTarget) => void;
    isOpen: () => boolean;
    scheduleClose: () => void;
    cancelClose: () => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

// Card geometry used for viewport collision handling. Height is an estimate
// (content-driven), good enough to keep the card fully on screen.
const CARD_WIDTH = 400;
const CARD_EST_HEIGHT = 440;
const CARD_GAP = 12;
const VIEWPORT_MARGIN = 8;
const OPEN_DELAY = 500;
const CLOSE_DELAY = 300;
const EXIT_MS = 200;

/**
 * Hosts the single shared preview card. Wrap it around a list whose rows use
 * PagePreviewCard — the card is position:fixed, so placement in the tree only
 * scopes which triggers share it.
 */
export const PagePreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [target, setTarget] = useState<PreviewTarget | null>(null);
    const [visible, setVisible] = useState(false);
    // "Open" means the card is mounted (target set) — NOT the post-rAF visible
    // flag. Basing isOpen() on visibility raced with the enter animation: a row
    // switch during those frames scheduled a fresh delayed open while the old
    // row's leave scheduled a close, so the card flashed and vanished.
    const targetRef = useRef<PreviewTarget | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout>>();
    const removeTimer = useRef<ReturnType<typeof setTimeout>>();

    const setCard = useCallback((t: PreviewTarget | null) => {
        targetRef.current = t;
        setTarget(t);
    }, []);

    const cancelClose = useCallback(() => {
        clearTimeout(closeTimer.current);
        clearTimeout(removeTimer.current);
    }, []);

    const open = useCallback(
        (next: PreviewTarget) => {
            cancelClose();
            const wasMounted = targetRef.current !== null;
            setCard(next);
            if (wasMounted) {
                // Already on screen (possibly mid-exit): keep/restore visibility
                // so switching rows never blanks the card.
                setVisible(true);
            } else {
                // Mount hidden at the final position first, then flip visible on
                // the next frame so the enter transition (fade + scale) plays.
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => {
                        if (targetRef.current) setVisible(true);
                    })
                );
            }
        },
        [cancelClose, setCard]
    );

    const close = useCallback(() => {
        cancelClose();
        setVisible(false);
        removeTimer.current = setTimeout(() => setCard(null), EXIT_MS);
    }, [cancelClose, setCard]);

    const scheduleClose = useCallback(() => {
        cancelClose();
        closeTimer.current = setTimeout(close, CLOSE_DELAY);
    }, [cancelClose, close]);

    const isOpen = useCallback(() => targetRef.current !== null, []);

    const ctx = useMemo(
        () => ({ open, isOpen, scheduleClose, cancelClose }),
        [open, isOpen, scheduleClose, cancelClose]
    );

    // The fixed-position card goes stale as soon as the page scrolls/resizes —
    // dismiss immediately. Scrolls that originate inside the card itself (code
    // blocks/tables/embeds in the rendered content can adjust their scroll on
    // mount) must NOT dismiss it, or the card self-closes right after opening.
    useEffect(() => {
        if (!target) return;
        const dismiss = (e?: Event) => {
            if (e?.target instanceof Node && cardRef.current?.contains(e.target)) return;
            cancelClose();
            setVisible(false);
            setCard(null);
        };
        window.addEventListener("scroll", dismiss, true);
        window.addEventListener("resize", dismiss);
        return () => {
            window.removeEventListener("scroll", dismiss, true);
            window.removeEventListener("resize", dismiss);
        };
    }, [!!target, cancelClose, setCard]);

    useEffect(() => () => cancelClose(), [cancelClose]);

    // Prefer the row's right side; flip to the left when it would overflow,
    // and clamp vertically so the (estimated) card stays inside the viewport.
    const pos = useMemo(() => {
        if (!target) return null;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = target.rect.right + CARD_GAP;
        if (left + CARD_WIDTH > vw - VIEWPORT_MARGIN) {
            left = target.rect.left - CARD_GAP - CARD_WIDTH;
        }
        if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
        let top = target.rect.top;
        if (top + CARD_EST_HEIGHT > vh - VIEWPORT_MARGIN) {
            top = Math.max(VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - CARD_EST_HEIGHT);
        }
        return { left, top };
    }, [target]);

    return (
        <PreviewContext.Provider value={ctx}>
            {children}
            {target && pos && (
                <div
                    ref={cardRef}
                    className={cn(
                        "fixed z-50 w-[400px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
                        // top/left transition makes the card glide between rows;
                        // opacity/scale handle enter and exit.
                        "transition-[top,left,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]",
                        target.onOpenPage && "cursor-pointer"
                    )}
                    style={{ top: pos.top, left: pos.left }}
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                    onClick={() => {
                        const go = target.onOpenPage;
                        if (!go) return;
                        close();
                        go();
                    }}
                >
                    {/* Keyed by page id: switching rows remounts the body, so the
                        new page's content fades in while the card slides over. */}
                    <div key={target.pageId} className="animate-in fade-in-0 duration-200">
                        <PreviewBody
                            pageId={target.pageId}
                            title={target.title}
                            spaceName={target.spaceName}
                            icon={target.icon}
                            pageType={target.pageType}
                        />
                    </div>
                </div>
            )}
        </PreviewContext.Provider>
    );
};

PagePreviewProvider.displayName = "PagePreviewProvider";

export const PagePreviewCard: React.FC<PagePreviewCardProps> = ({
    pageId,
    title,
    spaceName,
    icon,
    pageType,
    disabled,
    onOpenPage,
    children,
}) => {
    const ctx = useContext(PreviewContext);
    const openTimer = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => () => clearTimeout(openTimer.current), []);

    if (disabled || !ctx) return children;

    const openAt = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        ctx.open({
            pageId,
            title,
            spaceName,
            icon,
            pageType,
            rect: { top: r.top, left: r.left, right: r.right },
            onOpenPage,
        });
    };

    const childProps = children.props as {
        onMouseEnter?: React.MouseEventHandler<HTMLElement>;
        onMouseLeave?: React.MouseEventHandler<HTMLElement>;
    };

    return React.cloneElement(children, {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
            childProps.onMouseEnter?.(e);
            ctx.cancelClose();
            clearTimeout(openTimer.current);
            const el = e.currentTarget;
            if (ctx.isOpen()) {
                // Card already up: switch instantly so it glides to this row.
                openAt(el);
            } else {
                openTimer.current = setTimeout(() => openAt(el), OPEN_DELAY);
            }
        },
        onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
            childProps.onMouseLeave?.(e);
            clearTimeout(openTimer.current);
            ctx.scheduleClose();
        },
    } as Partial<React.HTMLAttributes<HTMLElement>>);
};

PagePreviewCard.displayName = "PagePreviewCard";
