import { NodeViewWrapper, NodeViewProps, PageContext } from "@kn/editor";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigator, useToggle } from "@kn/common";
import { event, useParams } from "@kn/common";
import { FileText, Loader2 } from "@kn/icon";
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { usePageInfo, useSpaceService } from "../../hooks";
import { useI18n } from "../../i18n/use-i18n";
import type { PageReferenceAttrs } from "../../types";

/**
 * PageReferenceView component displays a reference to another page
 * 
 * Features:
 * - Auto-creates new page if pageId is null
 * - Cached page info fetching
 * - Click to navigate
 * - Shows page's own icon
 * - Tooltip with page title
 * - Full accessibility support
 */
export const PageReferenceView: React.FC<NodeViewProps> = React.memo((props) => {
    const params = useParams();
    const pageInfo = useContext(PageContext);
    const { pageId, spaceId: attrsSpaceId, type } = props.node.attrs as PageReferenceAttrs;
    const [title, setTitle] = useState<string>();
    const [icon, setIcon] = useState<string | null>(null);
    const navigator = useNavigator();
    const [creating, { toggle: toggleCreating }] = useToggle(false);
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const spaceService = useSpaceService();
    const { t } = useI18n();

    // Create new page if pageId is null
    useEffect(() => {
        if (pageId || !params.id || !spaceService) return;

        const createNewPage = async () => {
            toggleCreating();
            try {
                const res = await spaceService.createPage({
                    spaceId: params.id!,
                    parentId: type === "CHILD" ? pageInfo.id : pageInfo.parentId,
                    title: t('pageReference.untitled')
                });

                props.updateAttributes({
                    pageId: res.id,
                    spaceId: pageInfo.spaceId
                });
                event.emit("ON_PAGE_REFRESH");
                setTitle(t('pageReference.untitled'));
                setIcon(res.icon?.icon || null);
            } catch {
                setTitle(t('pageReference.createFailed'));
            } finally {
                toggleCreating();
            }
        };

        createNewPage();
    }, [pageId, params.id, type, pageInfo, spaceService, props, toggleCreating, t]);

    // Fetch existing page info
    const { pageInfo: fetchedPageInfo, loading: fetchLoading, error } = usePageInfo(pageId);

    useEffect(() => {
        if (fetchedPageInfo) {
            setTitle(fetchedPageInfo.title);
            setIcon(fetchedPageInfo.icon?.icon || null);
        } else if (error) {
            setTitle(t('pageReference.deleted'));
            setIcon(null);
        }
    }, [fetchedPageInfo, error, t]);

    // Backfill spaceId for legacy references created before cross-space support:
    // once we resolve the page's real space, persist it onto the node so future
    // navigation is correct. Runs once per ref (guarded by attrsSpaceId being null).
    useEffect(() => {
        if (!attrsSpaceId && fetchedPageInfo?.spaceId) {
            props.updateAttributes({ spaceId: fetchedPageInfo.spaceId });
        }
    }, [attrsSpaceId, fetchedPageInfo?.spaceId, props]);

    // Clicking the reference no longer navigates immediately; it just opens the
    // tooltip. Navigation happens only when the user clicks the tooltip's jump
    // action, preventing accidental jumps while editing.
    const handleRefClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (pageId) {
            setTooltipOpen(true);
        }
    }, [pageId]);

    const handleJump = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (pageId) {
            // Navigate into the referenced page's own space, not the current one.
            // Fall back to the resolved page info, then the current space (legacy).
            const targetSpaceId = attrsSpaceId || fetchedPageInfo?.spaceId || pageInfo.spaceId;
            navigator.go({
                to: `/space-detail/${targetSpaceId}/page/edit/${pageId}`
            });
            setTooltipOpen(false);
        }
    }, [pageId, attrsSpaceId, fetchedPageInfo?.spaceId, pageInfo.spaceId, navigator]);

    const isLoading = creating || fetchLoading;
    const isDeleted = !isLoading && error;
    const displayTitle = title || t('pageReference.untitled');

    // Render icon - use page's own icon or fallback to FileText
    const renderIcon = useMemo(() => {
        if (icon) {
            return (
                <span className={cn("text-base leading-none", isDeleted && "opacity-50")}>
                    {icon}
                </span>
            );
        }
        return <FileText className={cn("h-4 w-4 flex-shrink-0", isDeleted && "text-muted-foreground")} />;
    }, [icon, isDeleted]);

    // Memoized content
    const content = useMemo(() => {
        if (isLoading) {
            return <Loader2 className="h-4 w-4 animate-spin" />;
        }
        return (
            <>
                {renderIcon}
                <span className={cn(
                    "truncate max-w-[200px]",
                    isDeleted && "line-through text-muted-foreground"
                )}>
                    {displayTitle}
                </span>
            </>
        );
    }, [isLoading, isDeleted, displayTitle, renderIcon]);

    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
                <TooltipTrigger asChild>
                    <NodeViewWrapper
                        as="span"
                        className={cn(
                            "inline-flex items-center gap-1 align-middle px-1 py-0.5",
                            "rounded-sm transition-colors duration-150",
                            "hover:bg-muted cursor-pointer",
                            isDeleted && "opacity-60"
                        )}
                        onClick={handleRefClick}
                        role="link"
                        aria-label={`${t('pageReference.referenceLabel')}: ${displayTitle}`}
                        tabIndex={0}
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleJump(e as unknown as React.MouseEvent);
                            }
                        }}
                    >
                        {content}
                    </NodeViewWrapper>
                </TooltipTrigger>
                <TooltipContent side="top" className="p-0">
                    {isDeleted ? (
                        <span className="block px-3 py-1.5 text-xs">{t('pageReference.deleted')}</span>
                    ) : (
                        <button
                            type="button"
                            onClick={handleJump}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs hover:underline cursor-pointer"
                        >
                            <FileText className="h-3 w-3 flex-shrink-0" />
                            {t('pageReference.jumpTo')}: {displayTitle}
                        </button>
                    )}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
});

PageReferenceView.displayName = 'PageReferenceView';