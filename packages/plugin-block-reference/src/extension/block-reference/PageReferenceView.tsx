import { NodeViewWrapper, NodeViewProps, PageContext } from "@kn/editor";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigator, useToggle } from "@kn/core";
import { event, useParams } from "@kn/common";
import { FileText, Loader2 } from "@kn/icon";
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { usePageInfo, useSpaceService } from "../../hooks";
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
    const { pageId, type } = props.node.attrs as PageReferenceAttrs;
    const [title, setTitle] = useState<string>();
    const [icon, setIcon] = useState<string | null>(null);
    const navigator = useNavigator();
    const [creating, { toggle: toggleCreating }] = useToggle(false);
    const spaceService = useSpaceService();

    // Create new page if pageId is null
    useEffect(() => {
        if (pageId || !params.id || !spaceService) return;

        const createNewPage = async () => {
            toggleCreating();
            try {
                const res = await spaceService.createPage({
                    spaceId: params.id!,
                    parentId: type === "CHILD" ? pageInfo.id : pageInfo.parentId,
                    title: '未命名'
                });

                props.updateAttributes({
                    pageId: res.id,
                    spaceId: pageInfo.spaceId
                });
                event.emit("ON_PAGE_REFRESH");
                setTitle("未命名");
                setIcon(res.icon?.icon || null);
            } catch {
                setTitle("创建失败");
            } finally {
                toggleCreating();
            }
        };

        createNewPage();
    }, [pageId, params.id, type, pageInfo, spaceService, props, toggleCreating]);

    // Fetch existing page info
    const { pageInfo: fetchedPageInfo, loading: fetchLoading, error } = usePageInfo(pageId);

    useEffect(() => {
        if (fetchedPageInfo) {
            setTitle(fetchedPageInfo.title);
            setIcon(fetchedPageInfo.icon?.icon || null);
        } else if (error) {
            setTitle("页面已删除");
            setIcon(null);
        }
    }, [fetchedPageInfo, error]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (pageId) {
            navigator.go({
                to: `/space-detail/${pageInfo.spaceId}/page/${pageId}`
            });
        }
    }, [pageId, pageInfo.spaceId, navigator]);

    const isLoading = creating || fetchLoading;
    const isDeleted = !isLoading && error;
    const displayTitle = title || '未命名';

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
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <NodeViewWrapper
                        as="span"
                        className={cn(
                            "inline-flex items-center gap-1 align-middle px-1 py-0.5",
                            "rounded-sm transition-colors duration-150",
                            "hover:bg-muted cursor-pointer",
                            isDeleted && "opacity-60"
                        )}
                        onClick={handleClick}
                        role="link"
                        aria-label={`页面引用: ${displayTitle}`}
                        tabIndex={0}
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleClick(e as unknown as React.MouseEvent);
                            }
                        }}
                    >
                        {content}
                    </NodeViewWrapper>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                    {isDeleted ? '页面已删除' : `点击跳转到: ${displayTitle}`}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
});

PageReferenceView.displayName = 'PageReferenceView';