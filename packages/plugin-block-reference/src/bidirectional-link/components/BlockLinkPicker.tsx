/**
 * BlockLinkPicker Modal Component
 * Allows users to search and select a block to link to.
 * 
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Input,
    ScrollArea,
    cn,
    Skeleton,
} from '@kn/ui';
import { SquareDashedBottom, SearchIcon, Loader2 } from '@kn/icon';
import { PageContext } from '@kn/editor';
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

/** Block item component */
const BlockItem = React.memo<{
    block: BlockInfo;
    isSelected: boolean;
    onSelect: () => void;
    onHover: () => void;
}>(({ block, isSelected, onSelect, onHover }) => {
    const preview = getBlockPreview(block);
    const typeLabel = getBlockTypeLabel(block.type);
    
    return (
        <div
            className={cn(
                "flex items-start gap-3 p-2.5 rounded-md cursor-pointer transition-colors",
                "hover:bg-muted",
                isSelected && "bg-muted ring-1 ring-primary/20"
            )}
            onClick={onSelect}
            onMouseEnter={onHover}
            role="option"
            aria-selected={isSelected}
        >
            <SquareDashedBottom className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                {preview ? (
                    <>
                        <div className="text-sm line-clamp-2">{preview}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {typeLabel}
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground italic">
                            {typeLabel} block
                        </span>
                        <span className="text-xs text-muted-foreground/70 font-mono">
                            ({block.id.slice(0, 8)}...)
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
    <div className="space-y-2 p-2">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-2">
                <Skeleton className="h-4 w-4 rounded" />
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
 * Modal for selecting blocks to create ((block-id)) links.
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

    // Fetch blocks when visible
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

    // Reset state when closed
    useEffect(() => {
        if (!visible) {
            setQuery('');
            setBlocks([]);
            setSelectedIndex(0);
        }
    }, [visible]);

    // Filter blocks by query
    const filteredBlocks = useMemo(() => {
        if (!query) return blocks;
        const lowerQuery = query.toLowerCase();
        return blocks.filter((block) => {
            const preview = getBlockPreview(block).toLowerCase();
            return preview.includes(lowerQuery) || block.id.includes(lowerQuery);
        });
    }, [blocks, query]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, filteredBlocks.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
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
        <Dialog open={visible} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="sm:max-w-[480px]" onKeyDown={handleKeyDown}>
                <DialogHeader>
                    <DialogTitle>Insert Block Link</DialogTitle>
                </DialogHeader>

                {/* Search input */}
                <div className="relative">
                    <Input
                        placeholder="Search blocks..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pr-8"
                        autoFocus
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                            <SearchIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                </div>

                {/* Block list */}
                <ScrollArea className="h-[300px] mt-2">
                    {loading ? (
                        <LoadingSkeleton />
                    ) : filteredBlocks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm py-8">
                            <SquareDashedBottom className="h-8 w-8 mb-2 opacity-50" />
                            <span>No blocks found</span>
                            <span className="text-xs mt-1">Try a different search term</span>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredBlocks.map((block, index) => (
                                <BlockItem
                                    key={block.id}
                                    block={block}
                                    isSelected={selectedIndex === index}
                                    onSelect={() => onSelect({ id: block.id })}
                                    onHover={() => setSelectedIndex(index)}
                                />
                            ))}
                        </div>
                    )}
                </ScrollArea>

                {/* Footer hint */}
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                    <span>↑↓ Navigate</span>
                    <span>Enter to select · Esc to close</span>
                </div>
            </DialogContent>
        </Dialog>
    );
};
