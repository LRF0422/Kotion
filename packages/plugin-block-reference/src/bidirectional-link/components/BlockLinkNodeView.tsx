/**
 * BlockLinkView Component
 * Renders a block link node showing the actual block content.
 * Similar to BlockReferenceView but for bidirectional links.
 * 
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useMemo, useCallback, useRef, useContext, useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps, AnyExtension, EditorContent, StyledEditor, useEditor, useEditorExtension, PageContext } from "@kn/editor";
import { useHover, useNavigator } from "@kn/core";
import { ArrowUpRight, RefreshCcw, Trash2 } from "@kn/icon";
import { cn, IconButton, Skeleton, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@kn/ui";
import { useBidirectionalBlockInfo } from "../hooks/useBidirectionalBlockInfo";

/** Memoized toolbar button with tooltip */
const ToolbarButton = React.memo<{
    icon: React.ReactNode;
    onClick: () => void;
    label: string;
    disabled?: boolean;
}>(({ icon, onClick, label, disabled }) => (
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
                <IconButton
                    icon={icon}
                    onClick={onClick}
                    aria-label={label}
                    disabled={disabled}
                />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
                {label}
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
));
ToolbarButton.displayName = 'ToolbarButton';

/** Loading skeleton for block content */
const BlockSkeleton = React.memo(() => (
    <div className="p-4 space-y-2" role="status" aria-label="Loading">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
    </div>
));
BlockSkeleton.displayName = 'BlockSkeleton';

/**
 * BlockLinkView Component
 * 
 * Displays a linked block with its full content rendered.
 * Features:
 * - Cached block data fetching with refresh
 * - Navigate, refresh, and delete controls with tooltips
 * - Skeleton loading states
 * - Hover-activated toolbar
 */
export const BlockLinkView: React.FC<NodeViewProps> = React.memo((props) => {
    const { node, deleteNode, editor } = props;
    const blockId = node.attrs.blockId as string;
    const ref = useRef<HTMLDivElement>(null);
    const hover = useHover(ref);
    const navigator = useNavigator();
    const pageInfo = useContext(PageContext);
    const [refreshKey, setRefreshKey] = useState(0);

    // Use new hook for block info fetching
    const { blockInfo, loading, error, refetch } = useBidirectionalBlockInfo(blockId, true);

    const handleRefresh = useCallback(() => {
        refetch();
        setRefreshKey(k => k + 1);
    }, [refetch]);

    const goToDetail = useCallback(() => {
        const spaceId = blockInfo?.spaceId || pageInfo?.spaceId;
        const pageId = blockInfo?.pageId || pageInfo?.id;
        if (spaceId && pageId) {
            navigator.go({
                to: `/space-detail/${spaceId}/page/${pageId}?blockId=${blockId}`
            });
        }
    }, [blockInfo, pageInfo, blockId, navigator]);

    // Parse content with memoization
    const content = useMemo(() => {
        if (!blockInfo?.content) return null;
        try {
            return blockInfo.content;
        } catch {
            return null;
        }
    }, [blockInfo?.content]);

    // Memoize editor extensions
    const [extensions] = useEditorExtension('trailingNode');

    // Create editor with proper content structure
    const editorContent = useMemo(() => {
        if (!content) return { type: "doc", content: [] };
        // If the block type is 'doc', use it directly; otherwise wrap in doc
        return { type: "doc", content: content };
    }, [content]);

    const blockEditor = useEditor({
        editable: false,
        content: editorContent,
        extensions: extensions as AnyExtension[],
        editorProps: {
            attributes: {
                class: "magic-editor",
                spellcheck: "false",
                suppressContentEditableWarning: "false",
            }
        }
    }, [editorContent, extensions, refreshKey]);

    // Update editor content when it changes
    useEffect(() => {
        if (blockEditor && content) {
            blockEditor.commands.setContent(editorContent);
        }
    }, [blockEditor, editorContent, content]);

    // Memoized refresh icon
    const refreshIcon = useMemo(() => (
        <RefreshCcw className={cn("w-4 h-4", loading && 'animate-spin')} />
    ), [loading]);

    return (
        <NodeViewWrapper
            as="div"
            ref={ref}
            className="border border-dashed border-border rounded-sm relative group my-2"
            role="region"
            aria-label="Block Link"
            aria-busy={loading}
        >
            {loading && <BlockSkeleton />}

            {error && (
                <div className="p-4 text-center text-destructive text-sm" role="alert">
                    <span className="font-medium">Load failed:</span> {error}
                </div>
            )}

            {!loading && !error && content && (
                <StyledEditor className="px-0" style={{ padding: "5px" }}>
                    {blockEditor && <EditorContent editor={blockEditor} />}
                </StyledEditor>
            )}

            {!loading && !error && !content && (
                <div className="p-4 text-center text-muted-foreground text-sm italic">
                    Block not found or deleted
                </div>
            )}

            {/* Toolbar - shows on hover */}
            <div
                className={cn(
                    "absolute right-1 top-1 flex items-center gap-0.5 p-1",
                    "bg-background/80 dark:bg-background/90 backdrop-blur-sm",
                    "border border-border rounded-md shadow-sm",
                    "transition-opacity duration-200",
                    hover ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                role="toolbar"
                aria-label="Block link actions"
            >
                <ToolbarButton
                    icon={refreshIcon}
                    onClick={handleRefresh}
                    label="Refresh"
                    disabled={loading}
                />
                <ToolbarButton
                    icon={<ArrowUpRight className="w-4 h-4" />}
                    onClick={goToDetail}
                    label="Go to source"
                />
                {editor.isEditable && (
                    <ToolbarButton
                        icon={<Trash2 className="w-4 h-4" />}
                        onClick={deleteNode}
                        label="Delete"
                    />
                )}
            </div>
        </NodeViewWrapper>
    );
});

BlockLinkView.displayName = 'BlockLinkView';
