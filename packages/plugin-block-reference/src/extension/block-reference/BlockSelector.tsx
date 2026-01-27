import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger, Label, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Skeleton, cn } from "@kn/ui";
import { useDebounce, useToggle } from "@kn/core";
import { AnyExtension, computePosition, Content, createNodeFromContent, Editor, EditorContent, flip, getText, Node, PageContext, posToDOMRect, StyledEditor, useEditor, useEditorExtension } from "@kn/editor";
import { ArrowRightIcon, Loader2 } from "@kn/icon";
import { useSpaceService, useKeyboardNavigation } from "../../hooks";
import type { BlockInfo, SpaceInfo } from "../../types";

interface BlockSelectorProps {
    onCancel: () => void;
    editor: Editor;
}

/** Memoized block item component */
const BlockItem = React.memo<{
    block: BlockInfo;
    isSelected: boolean;
    onSelect: () => void;
    onHover: () => void;
    getTextContent: (content: string) => string;
}>(({ block, isSelected, onSelect, onHover, getTextContent }) => (
    <div
        className={cn(
            "rounded-sm hover:bg-muted p-2 cursor-pointer transition-colors",
            isSelected && "bg-muted ring-1 ring-primary/20"
        )}
        onClick={onSelect}
        onMouseEnter={onHover}
        role="option"
        aria-selected={isSelected}
        tabIndex={0}
    >
        <div className="flex items-center gap-1 h-[24px]">
            <span className="text-sm text-nowrap text-ellipsis overflow-hidden max-w-[100px] text-muted-foreground">
                {block.spaceName}
            </span>
            <ArrowRightIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-nowrap text-ellipsis overflow-hidden max-w-[150px] font-medium">
                {block.pageTitle}
            </span>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {block.type}
            </span>
        </div>
        <div className="text-nowrap text-ellipsis overflow-hidden text-muted-foreground text-xs mt-1">
            {block.content ? getTextContent(block.content) : '无内容'}
        </div>
    </div>
));
BlockItem.displayName = 'BlockItem';

/** Loading skeleton */
const LoadingSkeleton = React.memo(() => (
    <div className="space-y-2 p-2">
        {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
            </div>
        ))}
    </div>
));
LoadingSkeleton.displayName = 'LoadingSkeleton';

/**
 * BlockSelector component for selecting and referencing blocks
 * 
 * Features:
 * - Space filtering
 * - Debounced search
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Hover preview with editor
 * - Full accessibility support
 */
export const BlockSelector: React.FC<BlockSelectorProps> = React.memo(({ onCancel, editor }) => {
    const [blocks, setBlocks] = useState<BlockInfo[]>([]);
    const [searchValue, setSearchValue] = useState<string>("");
    const ref = useRef<HTMLDivElement>(null);
    const pageInfo = useContext(PageContext);
    const [loading, { set: setLoading }] = useToggle(false);
    const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
    const [spaceId, setSpaceId] = useState<string | undefined>(pageInfo.spaceId);
    const value = useDebounce(searchValue, { wait: 500 });
    const spaceService = useSpaceService();

    // Handle block selection
    const handleBlockSelect = useCallback((block: BlockInfo) => {
        const { state } = editor.view;
        const { $head, $from } = state.selection;

        const end = $from.pos;
        const from = $head?.nodeBefore?.text
            ? end - $head.nodeBefore.text.substring($head.nodeBefore.text.indexOf("(")).length
            : $from.start();

        editor.chain()
            .deleteRange({ from, to: end })
            .insertContent({
                type: "BlockReference",
                attrs: {
                    blockId: block.id,
                    spaceId: block.spaceId,
                    pageId: block.pageId
                }
            })
            .run();

        onCancel();
    }, [editor, onCancel]);

    // Keyboard navigation
    const { selectedIndex, setSelectedIndex } = useKeyboardNavigation({
        items: blocks,
        onSelect: handleBlockSelect,
        onClose: onCancel,
        enabled: true,
    });

    // Fetch blocks when search value or space changes
    useEffect(() => {
        if (!spaceService) return;

        const fetchBlocks = async () => {
            setLoading(true);
            try {
                const res = await spaceService.queryBlocks({ spaceId, searchValue: value });
                setBlocks(res.records);
            } catch {
                setBlocks([]);
            } finally {
                setLoading(false);
            }
        };

        fetchBlocks();
    }, [value, spaceService, spaceId, setLoading]);

    // Fetch spaces on mount
    useEffect(() => {
        if (!spaceService) return;

        const fetchSpaces = async () => {
            try {
                const res = await spaceService.querySpaces();
                setSpaces(res.records);
            } catch {
                setSpaces([]);
            }
        };

        fetchSpaces();
    }, [spaceService]);

    // Position selector relative to cursor
    useEffect(() => {
        if (!ref.current) return;

        const updatePosition = () => {
            const currentNode = editor.state.selection.$head.parent;
            if (currentNode) {
                const text = getText(currentNode);
                setSearchValue(text.replace("(", ""));
            }

            const domRect = posToDOMRect(
                editor.view,
                editor.state.selection.from,
                editor.state.selection.to
            );

            const virtualElement = {
                getBoundingClientRect: () => domRect,
                getClientRects: () => [domRect],
            };

            computePosition(virtualElement, ref.current as HTMLElement, {
                placement: "bottom-start",
                middleware: [flip()],
            }).then(({ x, y, strategy }) => {
                if (ref.current) {
                    ref.current.style.zIndex = '1000';
                    ref.current.style.position = strategy;
                    ref.current.style.left = `${x + 2}px`;
                    ref.current.style.top = `${y}px`;
                }
            });
        };

        editor.on("selectionUpdate", updatePosition);

        return () => {
            editor.off("selectionUpdate", updatePosition);
        };
    }, [editor]);

    // Memoize editor extensions
    const [extensions] = useEditorExtension();

    const innerEditor = useEditor({
        editable: false,
        extensions: extensions as AnyExtension[]
    });

    // Parse block content for preview
    const parseBlockContent = useCallback((block: BlockInfo): Content => {
        if (!block.content) return {};
        try {
            const parsed = JSON.parse(block.content);
            return block.type === 'doc' ? parsed : { type: "doc", content: [parsed] };
        } catch {
            return {};
        }
    }, []);

    // Get text content from block
    const getTextContent = useCallback((content: string): string => {
        try {
            const node = createNodeFromContent(
                JSON.parse(content),
                editor.schema
            ) as Node;
            return getText(node) || '无内容';
        } catch {
            return '无法解析';
        }
    }, [editor.schema]);

    // Memoize space options
    const spaceOptions = useMemo(() =>
        spaces.map((space) => (
            <SelectItem key={space.id} value={space.id}>
                {space.name}
            </SelectItem>
        )),
        [spaces]);

    return (
        <div
            className="w-[420px] z-50 p-3 bg-popover shadow-lg rounded-lg flex flex-col gap-2 relative border"
            ref={ref}
            role="dialog"
            aria-label="选择块"
            aria-modal="true"
        >
            {/* Space selector */}
            <div className="space-y-1">
                <Label htmlFor="spaceSelector" className="text-xs text-muted-foreground">空间</Label>
                <Select defaultValue={pageInfo.spaceId} onValueChange={setSpaceId}>
                    <SelectTrigger className="h-9">
                        <SelectValue id="spaceSelector" placeholder="选择空间" />
                    </SelectTrigger>
                    <SelectContent>
                        {spaceOptions}
                    </SelectContent>
                </Select>
            </div>

            {/* Block list */}
            <ScrollArea className="h-[320px]" role="listbox" aria-label="块列表">
                {loading && <LoadingSkeleton />}

                {!loading && blocks.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                        <span>未找到块</span>
                        <span className="text-xs mt-1">试试其他搜索词</span>
                    </div>
                )}

                {!loading && blocks.map((block, index) => (
                    <HoverCard
                        key={block.id || index}
                        openDelay={300}
                        onOpenChange={(open) => {
                            if (open && innerEditor) {
                                innerEditor.commands.setContent(parseBlockContent(block));
                            }
                        }}
                    >
                        <HoverCardTrigger asChild>
                            <div>
                                <BlockItem
                                    block={block}
                                    isSelected={selectedIndex === index}
                                    onSelect={() => handleBlockSelect(block)}
                                    onHover={() => setSelectedIndex(index)}
                                    getTextContent={getTextContent}
                                />
                            </div>
                        </HoverCardTrigger>
                        <HoverCardContent side="right" className="w-[400px] p-2" asChild>
                            <StyledEditor>
                                <EditorContent editor={innerEditor} />
                            </StyledEditor>
                        </HoverCardContent>
                    </HoverCard>
                ))}
            </ScrollArea>

            {/* Footer hint */}
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                <span>↑↓ 导航</span>
                <span>Enter 选择 · Esc 关闭</span>
            </div>

            {/* Loading indicator */}
            {loading && (
                <div className="absolute top-3 right-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
            )}
        </div>
    );
});

BlockSelector.displayName = 'BlockSelector';