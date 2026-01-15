import { NodeViewWrapper, NodeViewProps, PageContext } from "@kn/editor";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { useNavigator, useToggle } from "@kn/core";
import { event, useParams } from "@kn/common";
import { Loader2, SquareArrowOutUpRight } from "@kn/icon";
import { usePageInfo, useSpaceService } from "../../hooks";
import type { PageReferenceAttrs } from "../../types";

/**
 * PageReferenceView component displays a reference to another page
 * Optimized with proper hooks and error handling
 */
export const PageReferenceView: React.FC<NodeViewProps> = React.memo((props) => {
    const params = useParams();
    const pageInfo = useContext(PageContext);
    const { pageId, type } = props.node.attrs as PageReferenceAttrs;
    const [title, setTitle] = useState<string>();
    const navigator = useNavigator();
    const [loading, { toggle }] = useToggle(false);
    const spaceService = useSpaceService();

    // Create new page if pageId is null
    useEffect(() => {
        if (pageId || !params.id || !spaceService) return;

        const createNewPage = async () => {
            toggle();
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
            } catch (err) {
                console.error('Failed to create page:', err);
                setTitle("Failed to create page");
            } finally {
                toggle();
            }
        };

        createNewPage();
    }, [pageId, params.id, type, pageInfo, spaceService, props, toggle]);

    // Fetch existing page info
    const { pageInfo: fetchedPageInfo, loading: fetchLoading, error } = usePageInfo(pageId);

    useEffect(() => {
        if (fetchedPageInfo) {
            setTitle(fetchedPageInfo.title);
        } else if (error) {
            setTitle("该页面已经被删除");
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

    const isLoading = loading || fetchLoading;

    return (
        <NodeViewWrapper
            as="span"
            className="inline-flex items-center gap-1 align-middle cursor-pointer hover:underline"
            onClick={handleClick}
        >
            {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <>
                    <SquareArrowOutUpRight className="h-4 w-4" />
                    {title || 'Untitled'}
                </>
            )}
        </NodeViewWrapper>
    );
});