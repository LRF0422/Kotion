import { AnyExtension, Content, EditorContent, NodeViewProps, NodeViewWrapper, StyledEditor, useEditor, useEditorExtension } from "@kn/editor";
import React, { useCallback, useMemo, useRef } from "react";
import { useHover, useNavigator, useToggle } from "@kn/core";
import { ArrowUpRight, RefreshCcw, Trash2 } from "@kn/icon";
import { cn, IconButton, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "@kn/ui";
import { useBlockInfo } from "../../hooks";
import type { BlockReferenceAttrs } from "../../types";

/** Memoized toolbar button with tooltip */
const ToolbarButton = React.memo<{
    icon: React.ReactNode;
    onClick: () => void;
    label: string;
    disabled?: boolean;
}>(({ icon, onClick, label, disabled }) => (
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
));
ToolbarButton.displayName = 'ToolbarButton';

/** Loading skeleton for block content */
const BlockSkeleton = React.memo(() => (
    <div className="p-4 space-y-2" role="status" aria-label="加载中">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
    </div>
));
BlockSkeleton.displayName = 'BlockSkeleton';

/**
 * BlockReferenceView component displays a referenced block with interactive controls
 * 
 * Features:
 * - Cached block data fetching with LRU cache
 * - Refresh, navigate, and delete controls with tooltips
 * - Skeleton loading states
 * - Hover-activated toolbar
 * - Full accessibility support (ARIA)
 */
export const BlockReferenceView: React.FC<NodeViewProps> = React.memo((props) => {
    const { blockId, spaceId, pageId } = props.node.attrs as BlockReferenceAttrs;
    const ref = useRef<HTMLDivElement>(null);
    const hover = useHover(ref);
    const navigator = useNavigator();
    const [refreshFlag, { toggle: toggleRefresh }] = useToggle(false);

    // Use custom hook for block info fetching with caching
    const { blockInfo, loading, error } = useBlockInfo(blockId, refreshFlag);

    const goToDetail = useCallback(() => {
        if (spaceId && pageId) {
            navigator.go({
                to: `/space-detail/${spaceId}/page/${pageId}?blockId=${blockId}`
            });
        }
    }, [spaceId, pageId, blockId, navigator]);

    // Parse content with memoization to avoid unnecessary re-parsing
    const content = useMemo(() => {
        if (!blockInfo?.content) return null;
        try {
            return JSON.parse(blockInfo.content);
        } catch {
            return null;
        }
    }, [blockInfo?.content]);

    // Memoize editor extensions
    const [extensions] = useEditorExtension('trailingNode');

    // Create editor with proper content structure
    const editorContent = useMemo<Content>(() => {
        if (!content) return { type: "doc", content: [] };
        return blockInfo?.type === 'doc' ? content : { type: "doc", content: [content] };
    }, [content, blockInfo?.type]);

    const editor = useEditor({
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
    }, [editorContent, extensions]);

    // Memoized refresh icon
    const refreshIcon = useMemo(() => (
        <RefreshCcw className={cn("w-4 h-4", loading && 'animate-spin')} />
    ), [loading]);

    return (
        <NodeViewWrapper
            as="div"
            ref={ref}
            className="border border-dashed border-border rounded-sm relative group"
            role="region"
            aria-label="引用块"
            aria-busy={loading}
        >
            {loading && <BlockSkeleton />}

            {error && (
                <div className="p-4 text-center text-destructive text-sm" role="alert">
                    <span className="font-medium">加载失败:</span> {error}
                </div>
            )}

            {!loading && !error && content && (
                <StyledEditor className="px-0" style={{ padding: "5px" }}>
                    <EditorContent editor={editor} />
                </StyledEditor>
            )}

            {!loading && !error && !content && (
                <div className="p-4 text-center text-muted-foreground text-sm italic">
                    块不存在或已被删除
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
                aria-label="块引用操作"
            >
                <ToolbarButton
                    icon={refreshIcon}
                    onClick={toggleRefresh}
                    label="刷新"
                    disabled={loading}
                />
                <ToolbarButton
                    icon={<ArrowUpRight className="w-4 h-4" />}
                    onClick={goToDetail}
                    label="跳转到源页面"
                />
                {props.editor.isEditable && (
                    <ToolbarButton
                        icon={<Trash2 className="w-4 h-4" />}
                        onClick={props.deleteNode}
                        label="删除引用"
                    />
                )}
            </div>
        </NodeViewWrapper>
    );
});

BlockReferenceView.displayName = 'BlockReferenceView';