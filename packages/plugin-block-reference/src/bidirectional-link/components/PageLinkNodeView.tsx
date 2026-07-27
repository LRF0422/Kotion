/**
 * PageLinkNodeView — inline pill for the `pageLinkNode` atom.
 *
 * - Resolves the live page title/icon at render time (cached via usePageInfo),
 *   so renames never leave stale text in documents.
 * - Hover shows a preview card (icon, title, space, content excerpt) with
 *   edit and jump actions; a plain click while editing opens the same card
 *   instead of navigating (avoids accidental jumps). The card's Edit button
 *   opens the target page in a draggable floating window (PageEditWindow)
 *   for in-place editing — no navigation.
 * - Cmd/Ctrl+Click, or any click in read-only mode, navigates immediately.
 * - Broken links (target deleted) render struck-through with a remove action.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NodeViewWrapper, type NodeViewProps, PageContext } from "@kn/editor";
import { useNavigator } from "@kn/common";
import { ArrowUpRight, FileText, Loader2, Pencil, Trash2 } from "@kn/icon";
import { cn, HoverCard, HoverCardContent, HoverCardTrigger, Button } from "@kn/ui";
import { usePageInfo, useSpaceService } from "../../hooks";
import { useI18n } from "../../i18n/use-i18n";
import { PageEditWindow } from "@kn/common";
import { invalidatePage } from "../../utils/cache";

/** Flatten a ProseMirror JSON tree into a short plain-text excerpt. */
const extractExcerpt = (content: string | undefined, maxLen = 140): string => {
    if (!content) return '';
    try {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        const parts: string[] = [];
        const walk = (node: any) => {
            if (!node || typeof node !== 'object' || parts.join(' ').length > maxLen) return;
            // Skip the title node — it duplicates the card header.
            if (node.type === 'title') return;
            if (typeof node.text === 'string') parts.push(node.text);
            if (Array.isArray(node.content)) node.content.forEach(walk);
        };
        walk(parsed);
        const text = parts.join(' ').replace(/\s+/g, ' ').trim();
        return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
    } catch {
        return '';
    }
};

export const PageLinkNodeView: React.FC<NodeViewProps> = React.memo((props) => {
    const { node, editor, deleteNode, updateAttributes } = props;
    const pageId = node.attrs.pageId as string | null;
    const titleAttr = node.attrs.title as string | null;

    const pageCtx = useContext(PageContext);
    const navigator = useNavigator();
    const spaceService = useSpaceService();
    const { t } = useI18n();
    const [cardOpen, setCardOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);

    const { pageInfo, loading, error, refetch } = usePageInfo(pageId);
    const isBroken = !loading && !!error;
    const displayTitle = pageInfo?.title || titleAttr || t('bidirectionalLink.untitled');
    const icon = pageInfo?.icon?.icon || null;

    // Keep the serialized [[Title]] snapshot in sync with the live title so
    // backend text parsing and exports see the current name. Editable-only:
    // read-only viewers must not mutate the doc.
    useEffect(() => {
        if (editor.isEditable && pageInfo?.title && pageInfo.title !== titleAttr) {
            updateAttributes({ title: pageInfo.title });
        }
    }, [editor.isEditable, pageInfo?.title, titleAttr, updateAttributes]);

    const excerpt = useMemo(() => extractExcerpt(pageInfo?.content), [pageInfo?.content]);

    const handleJump = useCallback(async () => {
        if (!pageId || isBroken) return;
        // Resolve the target's own space for cross-space links.
        let spaceId = pageInfo?.spaceId || pageCtx.spaceId;
        if (!pageInfo?.spaceId) {
            try {
                const page = await spaceService.getPage(pageId);
                if (page?.spaceId) spaceId = String(page.spaceId);
            } catch { /* fall back to the current space */ }
        }
        if (spaceId) {
            setCardOpen(false);
            navigator.go({ to: `/space-detail/${spaceId}/page/edit/${pageId}` });
        }
    }, [pageId, isBroken, pageInfo?.spaceId, pageCtx.spaceId, spaceService, navigator]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isBroken) {
            setCardOpen(true);
            return;
        }
        if (e.metaKey || e.ctrlKey || !editor.isEditable) {
            handleJump();
        } else {
            // Plain click while editing: open the preview card; editing is an
            // explicit action via the card's Edit button.
            setCardOpen(true);
        }
    }, [isBroken, editor.isEditable, handleJump]);

    const handleRemove = useCallback(() => {
        setCardOpen(false);
        deleteNode();
    }, [deleteNode]);

    const handleEdit = useCallback(() => {
        if (!pageId || isBroken) return;
        setCardOpen(false);
        setEditOpen(true);
    }, [pageId, isBroken]);

    const handleEditClose = useCallback(() => {
        setEditOpen(false);
        // The popup invalidated the page cache; refresh the preview data.
        refetch();
    }, [refetch]);

    return (
        <NodeViewWrapper as="span" className="wiki-page-link-node inline align-baseline">
            <HoverCard open={cardOpen} onOpenChange={setCardOpen} openDelay={300} closeDelay={150}>
                <HoverCardTrigger asChild>
                    <span
                        className={cn(
                            "inline-flex items-center gap-1 align-middle px-1 py-0.5 max-w-full",
                            "rounded-sm cursor-pointer transition-colors duration-150",
                            "text-primary hover:bg-primary/10",
                            isBroken && "text-muted-foreground line-through opacity-70 hover:bg-muted"
                        )}
                        onClick={handleClick}
                        role="link"
                        tabIndex={0}
                        aria-label={`${t('bidirectionalLink.page')}: ${displayTitle}`}
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleJump();
                            }
                        }}
                    >
                        {loading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                        ) : icon ? (
                            <span className="text-sm leading-none flex-shrink-0">{icon}</span>
                        ) : (
                            <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        <span className="truncate max-w-[280px] underline decoration-primary/40 decoration-1 underline-offset-2">
                            {displayTitle}
                        </span>
                    </span>
                </HoverCardTrigger>
                <HoverCardContent side="top" align="start" className="w-80 p-0" sideOffset={6}>
                    {isBroken ? (
                        <div className="p-3">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <FileText className="h-4 w-4 flex-shrink-0" />
                                {t('bidirectionalLink.pageDeleted')}
                            </div>
                            {editor.isEditable && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-2 h-7 w-full text-xs"
                                    onClick={handleRemove}
                                >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    {t('bidirectionalLink.removeLink')}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="p-3">
                            {/* Header: icon + title + space */}
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                                    {icon ? (
                                        <span className="text-lg leading-none">{icon}</span>
                                    ) : (
                                        <FileText className="h-4 w-4" />
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{displayTitle}</div>
                                    {pageInfo?.spaceName && (
                                        <div className="truncate text-xs text-muted-foreground">
                                            {pageInfo.spaceName}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Content excerpt */}
                            {excerpt && (
                                <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                                    {excerpt}
                                </p>
                            )}
                            {/* Actions */}
                            <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
                                <span className="text-[10px] text-muted-foreground">
                                    {t('bidirectionalLink.ctrlClickHint')}
                                </span>
                                <div className="flex items-center gap-0.5">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-primary"
                                        onClick={handleEdit}
                                    >
                                        <Pencil className="mr-0.5 h-3 w-3" />
                                        {t('bidirectionalLink.edit')}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-primary"
                                        onClick={handleJump}
                                    >
                                        {t('bidirectionalLink.jumpTo')}
                                        <ArrowUpRight className="ml-0.5 h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </HoverCardContent>
            </HoverCard>
            {editOpen && pageId && (
                <PageEditWindow pageId={pageId} onClose={handleEditClose} onPageMutated={invalidatePage} />
            )}
        </NodeViewWrapper>
    );
});

PageLinkNodeView.displayName = 'PageLinkNodeView';
