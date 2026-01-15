import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger, Label, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator } from "@kn/ui";
import { useDebounce, useKeyPress, useToggle } from "@kn/core";
import { AnyExtension, computePosition, Content, createNodeFromContent, Editor, EditorContent, flip, getText, Node, PageContext, posToDOMRect, StyledEditor, useEditor, useEditorExtension } from "@kn/editor";
import { ArrowRightIcon } from "@kn/icon";
import { useSpaceService } from "../../hooks";
import type { BlockInfo, SpaceInfo } from "../../types";

interface BlockSelectorProps {
    onCancel: () => void;
    editor: Editor;
}

/**
 * BlockSelector component for selecting and referencing blocks
 * Optimized with proper memoization and cleanup
 */
export const BlockSelector: React.FC<BlockSelectorProps> = React.memo(({ onCancel, editor }) => {
    const [blocks, setBlocks] = useState<BlockInfo[]>([]);
    const [searchValue, setSearchValue] = useState<string>("");
    const ref = useRef<HTMLDivElement>(null);
    const pageInfo = useContext(PageContext);
    const [loading, { toggle }] = useToggle(false);
    const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
    const [spaceId, setSpaceId] = useState<string | undefined>(pageInfo.spaceId);
    const value = useDebounce(searchValue, { wait: 500 });
    const spaceService = useSpaceService();

    // Handle Esc key press
    useKeyPress(["Esc"], () => {
        onCancel();
    });

    // Fetch blocks when search value or space changes
    useEffect(() => {
        if (!spaceService) return;

        const fetchBlocks = async () => {
            toggle();
            try {
                const res = await spaceService.queryBlocks({ spaceId, searchValue: value });
                setBlocks(res.records);
            } catch (err) {
                console.error('Failed to fetch blocks:', err);
                setBlocks([]);
            } finally {
                toggle();
            }
        };

        fetchBlocks();
    }, [value, spaceService, spaceId, toggle]);

    // Fetch spaces on mount
    useEffect(() => {
        if (!spaceService) return;

        const fetchSpaces = async () => {
            try {
                const res = await spaceService.querySpaces();
                setSpaces(res.records);
            } catch (err) {
                console.error('Failed to fetch spaces:', err);
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

    // Parse block content for preview
    const parseBlockContent = useCallback((block: BlockInfo): Content => {
        if (!block.content) return {};
        try {
            const parsed = JSON.parse(block.content);
            return block.type === 'doc' ? parsed : { type: "doc", content: [parsed] };
        } catch (err) {
            console.error('Failed to parse block content:', err);
            return {};
        }
    }, []);

    return (
        <div
            className="w-[400px] z-50 p-2 bg-popover shadow-md rounded-lg flex flex-col gap-1 relative border"
            ref={ref}
        >
            <Label htmlFor="spaceSelector" className="mb-1">Spaces</Label>
            <Select defaultValue={pageInfo.spaceId} onValueChange={(value) => setSpaceId(value)}>
                <SelectTrigger>
                    <SelectValue id="spaceSelector" />
                </SelectTrigger>
                <SelectContent>
                    {spaces.map((space, index) => (
                        <SelectItem key={space.id || index} value={space.id}>
                            {space.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <ScrollArea className="h-[300px] pr-3">
                {loading && (
                    <div className="p-4 text-center text-muted-foreground">
                        Loading blocks...
                    </div>
                )}
                {!loading && blocks.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground">
                        No blocks found
                    </div>
                )}
                {!loading && blocks.map((block, index) => (
                    <HoverCard
                        key={block.id || index}
                        onOpenChange={(open) => {
                            if (open && innerEditor) {
                                innerEditor.commands.setContent(parseBlockContent(block));
                            }
                        }}
                    >
                        <HoverCardTrigger asChild>
                            <div
                                className="rounded-sm hover:bg-muted p-1 cursor-pointer"
                                onClick={() => handleBlockSelect(block)}
                            >
                                <div className="flex items-center gap-1 h-[30px]">
                                    <div className="hover:underline cursor-pointer text-nowrap text-ellipsis overflow-hidden w-[100px]">
                                        {block.spaceName}
                                    </div>
                                    <ArrowRightIcon className="h-4 w-4" />
                                    <div className="text-nowrap text-ellipsis overflow-hidden w-[150px] hover:underline cursor-pointer">
                                        {block.pageTitle}
                                    </div>
                                    <Separator orientation="vertical" />
                                    <div className="text-muted-foreground text-sm italic">
                                        {block.type}
                                    </div>
                                </div>
                                <div className="text-nowrap text-ellipsis overflow-hidden w-[350px] text-muted-foreground text-sm italic">
                                    {block.content && (() => {
                                        try {
                                            const node = createNodeFromContent(
                                                JSON.parse(block.content),
                                                editor.schema
                                            ) as Node;
                                            return getText(node);
                                        } catch (err) {
                                            return 'Invalid content';
                                        }
                                    })()}
                                </div>
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
        </div>
    );
});