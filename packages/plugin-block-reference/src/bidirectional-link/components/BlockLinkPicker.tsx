/**
 * BlockLinkPicker — cursor-anchored command menu (slash-menu style)
 * Allows users to search and select a block to link to via (( )).
 *
 * Rendered as a floating dropdown anchored at the caret (positioned by
 * LinkTrigger), NOT a modal dialog.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import { Input, ScrollArea, cn, Skeleton } from '@kn/ui';
import { SquareDashedBottom, SearchIcon, Loader2 } from '@kn/icon';
import { PageContext } from '@kn/editor';
import { useClickAway } from '@kn/common';
import { searchBlocks, BlockInfo } from '../services/linkService';

interface BlockLinkPickerProps {
    visible: boolean;
    /** Space ID - if not provided, will use PageContext */
    spaceId?: number | string;
    onSelect: (block: { id: string }) => void;
    onCancel: () => void;
}

/** Extract text preview from block content */
const getBlockPreview = (block: BlockInfo): string => {
    try {
        const content = typeof block.content === 'string'
            ? JSON.parse(block.content)
            : block.content;

        // Recursively extract all text from content
        const extractText = (node: any): string => {
            if (!node) return '';
            if (typeof node === 'string') return node;
            if (node.text) return node.text;
            if (Array.isArray(node)) {
                return node.map(extractText).filter(Boolean).join('');
            }
            if (node.content) {
                return extractText(node.content);
            }
            return '';
        };

        const text = extractText(content).trim();
        if (text) {
            return text.slice(0, 120);
        }
        return '';
    } catch {
        return '';
    }
};

/** Get block type label */
const getBlockTypeLabel = (type: string): string => {
    const typeLabels: Record<string, string> = {
        'title': 'Title',
        'heading': 'Heading',
        'paragraph': 'Paragraph',
        'bulletList': 'List',
        'orderedList': 'Numbered List',
        'taskList': 'Task List',
        'codeBlock': 'Code',
        'blockquote': 'Quote',
        'table': 'Table',
        'mermaid': 'Diagram',
        'image': 'Image',
        'video': 'Video',
    };
    return typeLabels[type] || type;
};

/** Block item — slash-menu look (icon chip + hover shift). */
const BlockItem = React.memo<{
    block: BlockInfo;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    onHover: () => void;
}>(({ block, index, isSelected, onSelect, onHover }) => {
    const preview = getBlockPreview(block);
    const typeLabel = getBlockTypeLabel(block.type);

    return (
        <div
            data-index={index}
            className={cn(
                "flex items-start gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer",
                "transition-all duration-150",
                "hover:bg-muted/60 hover:translate-x-0.5",
                isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/30 translate-x-0.5"
            )}
            onClick={onSelect}
            onMouseEnter={onHover}
            role="option"
            aria-selected={isSelected}
        >
            <span
                className={cn(
                    "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md",
                    "bg-purple-500/10 text-purple-500 transition-transform duration-150",
                    isSelected && "scale-105"
                )}
            >
                <SquareDashedBottom className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
                {preview ? (
                    <>
                        <div className="text-sm line-clamp-2">{preview}</div>
                        <div className="mt-1 flex items-center gap-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                {typeLabel}
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="text-sm italic text-muted-foreground">
                            {typeLabel} block
                        </span>
                        <span className="font-mono text-xs text-muted-foreground/70">
                            ({block.id.slice(0, 8)}…)
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
});
BlockItem.displayName = 'BlockItem';

/** Loading skeleton */
const LoadingSkeleton = React.memo(() => (
    <div className="space-y-1.5 p-1">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-2.5 px-2 py-1.5">
                <Skeleton className="h-7 w-7 rounded-md" />
                <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-full" />
                </div>
            </div>
        ))}
    </div>
));
LoadingSkeleton.displayName = 'LoadingSkeleton';

/**
 * BlockLinkPicker Component
 *
 * Floating command menu for selecting blocks to create ((block-id)) links.
 */
export const BlockLinkPicker: React.FC<BlockLinkPickerProps> = ({
    visible,
    spaceId: propSpaceId,
    onSelect,
    onCancel,
}) => {
    const pageInfo = useContext(PageContext);
    const spaceId = propSpaceId || pageInfo?.spaceId;

    const [query, setQuery] = useState('');
    const [blocks, setBlocks] = useState<BlockInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Close when clicking outside the floating menu.
    useClickAway(() => onCancel(), containerRef);

    // Auto-focus the search field on mount.
    useEffect(() => {
        const timer = setTimeout(() => inputRef.current?.focus(), 50);
        return () => clearTimeout(timer);
    }, []);

    // Fetch blocks when visible.
    useEffect(() => {
        if (visible && spaceId) {
            setLoading(true);
            searchBlocks(spaceId)
                .then((data) => {
                    setBlocks(data.records || []);
                    setSelectedIndex(0);
                })
                .finally(() => setLoading(false));
        }
    }, [visible, spaceId]);

    // Filter blocks by query
    const filteredBlocks = useMemo(() => {
        if (!query) return blocks;
        const lowerQuery = query.toLowerCase();
        return blocks.filter((block) => {
            const preview = getBlockPreview(block).toLowerCase();
            return preview.includes(lowerQuery) || block.id.includes(lowerQuery);
        });
    }, [blocks, query]);

    // Keep the keyboard-selected item scrolled into view.
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, filteredBlocks.length]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => (filteredBlocks.length ? (prev + 1) % filteredBlocks.length : 0));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => (filteredBlocks.length ? (prev - 1 + filteredBlocks.length) % filteredBlocks.length : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredBlocks[selectedIndex]) {
                    onSelect({ id: filteredBlocks[selectedIndex].id });
                }
                break;
            case 'Escape':
                e.preventDefault();
                onCancel();
                break;
        }
    }, [filteredBlocks, selectedIndex, onSelect, onCancel]);

    return (
        <div
            ref={containerRef}
            onKeyDown={handleKeyDown}
            className={cn(
                "w-[420px] p-2 rounded-xl backdrop-blur-sm",
                "bg-popover text-popover-foreground",
                "border border-border/60 shadow-xl dark:shadow-2xl"
            )}
            role="dialog"
            aria-label="插入块链接"
        >
            {/* Search input */}
            <div className="relative">
                <Input
                    ref={inputRef}
                    placeholder="搜索块…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-9 pr-8"
                />
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                        <SearchIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                </div>
            </div>

            {/* Block list */}
            <ScrollArea className="mt-2 max-h-[300px]">
                <div ref={listRef} className="space-y-0.5 pr-1">
                    {loading ? (
                        <LoadingSkeleton />
                    ) : filteredBlocks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-1 py-8 text-sm text-muted-foreground">
                            <SquareDashedBottom className="mb-1 h-7 w-7 opacity-40" />
                            <span>未找到块</span>
                            <span className="text-xs opacity-70">换个关键词试试</span>
                        </div>
                    ) : (
                        filteredBlocks.map((block, index) => (
                            <BlockItem
                                key={block.id}
                                block={block}
                                index={index}
                                isSelected={selectedIndex === index}
                                onSelect={() => onSelect({ id: block.id })}
                                onHover={() => setSelectedIndex(index)}
                            />
                        ))
                    )}
                </div>
            </ScrollArea>

            {/* Footer hint */}
            <div className="mt-2 flex items-center justify-between border-t border-border/60 px-1 pt-2 text-xs text-muted-foreground">
                <span>↑↓ 导航</span>
                <span>Enter 选择 · Esc 关闭</span>
            </div>
        </div>
    );
};
