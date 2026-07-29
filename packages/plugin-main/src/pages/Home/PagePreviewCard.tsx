/**
 * PagePreviewCard — hover preview for page rows (Home recent/favorite lists).
 *
 * Wraps a row in a HoverCard; when the card opens, the target page's content
 * is fetched (short-TTL cache so repeated hovers don't refetch) and rendered
 * with a real read-only Tiptap editor, so the preview matches actual page
 * rendering (headings, lists, code blocks, embeds…) instead of a plain-text
 * excerpt. The card body is non-interactive; clicking it opens the page.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
    AnyExtension,
    Content,
    EditorContent,
    StyledEditor,
    useEditor,
    useEditorExtension,
} from "@kn/editor";
import { HoverCard, HoverCardContent, HoverCardTrigger, Skeleton, cn } from "@kn/ui";
import { FileText } from "@kn/icon";
import { FileService, useApi, useOptionalService, useTranslation } from "@kn/common";
import { APIS } from "../../api";

/** The page fields the preview needs (subset of GET_PAGE_CONTENT's payload). */
interface PreviewPage {
    id: string;
    title?: string;
    icon?: { icon: string; type?: string };
    spaceName?: string;
    /** JSON string of page content */
    content?: string;
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
const parsePage = (raw?: string): { body: Content | null; cover: CoverConfig | null } => {
    if (!raw) return { body: null, cover: null };
    try {
        const doc = JSON.parse(raw.replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
        const nodes: any[] = Array.isArray(doc?.content) ? doc.content : [];
        const title = nodes.find((n) => n?.type === "title");
        const cover = title?.attrs?.cover?.url ? (title.attrs.cover as CoverConfig) : null;
        const body = nodes.filter((n) => n?.type !== "title");
        return { body: body.length > 0 ? { type: "doc", content: body } : null, cover };
    } catch {
        return { body: null, cover: null };
    }
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
const PreviewBody: React.FC<{ pageId: string }> = ({ pageId }) => {
    const { t } = useTranslation();
    const fileService = useOptionalService("fileService") as FileService | undefined;
    const [page, setPage] = useState<PreviewPage | null>(() => readCache(pageId));
    const [error, setError] = useState(false);

    useEffect(() => {
        if (readCache(pageId)) return;
        let cancelled = false;
        useApi(APIS.GET_PAGE_CONTENT, { id: pageId })
            .then((res) => {
                if (cancelled) return;
                const data = res?.data as PreviewPage | undefined;
                if (data) {
                    writeCache(pageId, data);
                    setPage(data);
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
    }, [pageId]);

    const { body, cover } = useMemo(() => parsePage(page?.content), [page?.content]);
    const icon = page?.icon?.type === "IMAGE" ? null : page?.icon?.icon || null;

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
                {icon ? (
                    <span className="text-base leading-none flex-shrink-0">{icon}</span>
                ) : (
                    <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {page?.title || t("home.untitled", "Untitled")}
                </span>
                {page?.spaceName && (
                    <span className="max-w-[120px] shrink-0 truncate text-[11px] text-muted-foreground">
                        {page.spaceName}
                    </span>
                )}
            </div>
            {/* Body: read-only editor clamped in height with a bottom fade */}
            <div className="relative max-h-[280px] overflow-hidden px-4 py-3">
                {error ? (
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
    /** Skip the hover card entirely (e.g. on touch devices). */
    disabled?: boolean;
    /** Invoked when the card body is clicked — callers navigate to the page. */
    onOpenPage?: () => void;
    children: React.ReactElement;
}

export const PagePreviewCard: React.FC<PagePreviewCardProps> = ({
    pageId,
    disabled,
    onOpenPage,
    children,
}) => {
    const [open, setOpen] = useState(false);

    if (disabled) return children;

    return (
        <HoverCard open={open} onOpenChange={setOpen} openDelay={500} closeDelay={150}>
            <HoverCardTrigger asChild>{children}</HoverCardTrigger>
            <HoverCardContent
                side="right"
                align="start"
                sideOffset={8}
                className={cn("w-[400px] overflow-hidden p-0", onOpenPage && "cursor-pointer")}
                onClick={() => {
                    if (!onOpenPage) return;
                    setOpen(false);
                    onOpenPage();
                }}
            >
                {open && <PreviewBody pageId={pageId} />}
            </HoverCardContent>
        </HoverCard>
    );
};

PagePreviewCard.displayName = "PagePreviewCard";
