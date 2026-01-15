import { AnyExtension, Content, EditorContent, NodeViewProps, NodeViewWrapper, StyledEditor, useEditor, useEditorExtension } from "@kn/editor";
import React, { useCallback, useMemo, useRef } from "react";
import { useHover, useNavigator, useToggle } from "@kn/core";
import { ArrowUpRight, RefreshCcw, Trash2 } from "@kn/icon";
import { cn, IconButton } from "@kn/ui";
import { useBlockInfo } from "../../hooks";
import type { BlockReferenceAttrs } from "../../types";

/**
 * BlockReferenceView component displays a referenced block with interactive controls
 * Optimized with proper memoization and error handling
 */
export const BlockReferenceView: React.FC<NodeViewProps> = React.memo((props) => {
    const { blockId, spaceId, pageId } = props.node.attrs as BlockReferenceAttrs;
    const ref = useRef<HTMLDivElement>(null);
    const hover = useHover(ref);
    const navigator = useNavigator();
    const [refreshFlag, { toggle: toggleRefresh }] = useToggle(false);

    // Use custom hook for block info fetching
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
        } catch (err) {
            console.error('Failed to parse block content:', err);
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

    return (
        <NodeViewWrapper
            as="div"
            ref={ref}
            className="border border-dashed rounded-sm relative"
        >
            {loading && (
                <div className="p-4 text-center text-muted-foreground">
                    Loading block...
                </div>
            )}
            {error && (
                <div className="p-4 text-center text-destructive">
                    {error}
                </div>
            )}
            {!loading && !error && content ? (
                <StyledEditor className="px-0" style={{ padding: "5px" }}>
                    <EditorContent editor={editor} />
                </StyledEditor>
            ) : !loading && !error && (
                <div className="p-4 text-center text-muted-foreground">
                    The block does not exist
                </div>
            )}
            <div
                className={cn(
                    "absolute right-1 flex items-center gap-1 text-sm top-1 p-1 bg-muted/70 rounded-sm transition-opacity duration-500",
                    hover ? 'opacity-100' : 'opacity-0'
                )}
            >
                <IconButton
                    icon={<RefreshCcw className={cn("w-4 h-4", loading && 'animate-spin')} />}
                    onClick={toggleRefresh}
                />
                <IconButton
                    icon={<ArrowUpRight className="w-4 h-4" />}
                    onClick={goToDetail}
                />
                {props.editor.isEditable && (
                    <IconButton
                        icon={<Trash2 className="w-4 h-4" />}
                        onClick={props.deleteNode}
                    />
                )}
            </div>
        </NodeViewWrapper>
    );
});