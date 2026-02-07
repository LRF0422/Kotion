/**
 * PageLinkPicker Modal Component
 * Allows users to search and select a page to link to.
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
import { FileText, SearchIcon, Loader2 } from '@kn/icon';
import { PageContext } from '@kn/editor';
import { searchPages, PageTreeNode } from '../services/linkService';

interface PageLinkPickerProps {
    visible: boolean;
    /** Space ID - if not provided, will use PageContext */
    spaceId?: number | string;
    onSelect: (page: { id: number; title: string }) => void;
    onCancel: () => void;
}

/** Flatten page tree to list */
const flattenPages = (nodes: PageTreeNode[]): PageTreeNode[] => {
    const result: PageTreeNode[] = [];
    const traverse = (list: PageTreeNode[]) => {
        list.forEach((node) => {
            result.push(node);
            if (node.children?.length) traverse(node.children);
        });
    };
    traverse(nodes);
    return result;
};

/** Page item component */
const PageItem = React.memo<{
    page: PageTreeNode;
    isSelected: boolean;
    onSelect: () => void;
    onHover: () => void;
}>(({ page, isSelected, onSelect, onHover }) => (
    <div
        className={cn(
            "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
            "hover:bg-muted",
            isSelected && "bg-muted ring-1 ring-primary/20"
        )}
        onClick={onSelect}
        onMouseEnter={onHover}
        role="option"
        aria-selected={isSelected}
    >
        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="truncate text-sm">{page.name || 'Untitled'}</span>
    </div>
));
PageItem.displayName = 'PageItem';

/** Loading skeleton */
const LoadingSkeleton = React.memo(() => (
    <div className="space-y-2 p-2">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1" />
            </div>
        ))}
    </div>
));
LoadingSkeleton.displayName = 'LoadingSkeleton';

/**
 * PageLinkPicker Component
 * 
 * Modal for selecting pages to create [[Page Title]] links.
 */
export const PageLinkPicker: React.FC<PageLinkPickerProps> = ({
    visible,
    spaceId: propSpaceId,
    onSelect,
    onCancel,
}) => {
    const pageInfo = useContext(PageContext);
    const spaceId = propSpaceId || pageInfo?.spaceId;

    const [query, setQuery] = useState('');
    const [pages, setPages] = useState<PageTreeNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Fetch pages when visible or query changes
    useEffect(() => {
        if (visible && spaceId) {
            setLoading(true);
            const timer = setTimeout(() => {
                searchPages(spaceId, query)
                    .then((data) => {
                        setPages(data);
                        setSelectedIndex(0);
                    })
                    .finally(() => setLoading(false));
            }, 300); // Debounce
            return () => clearTimeout(timer);
        }
    }, [visible, spaceId, query]);

    // Reset state when closed
    useEffect(() => {
        if (!visible) {
            setQuery('');
            setPages([]);
            setSelectedIndex(0);
        }
    }, [visible]);

    const flatPages = useMemo(() => flattenPages(pages), [pages]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, flatPages.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (flatPages[selectedIndex]) {
                    onSelect({ id: flatPages[selectedIndex].id, title: flatPages[selectedIndex].name });
                }
                break;
            case 'Escape':
                e.preventDefault();
                onCancel();
                break;
        }
    }, [flatPages, selectedIndex, onSelect, onCancel]);

    return (
        <Dialog open={visible} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="sm:max-w-[480px]" onKeyDown={handleKeyDown}>
                <DialogHeader>
                    <DialogTitle>Insert Page Link</DialogTitle>
                </DialogHeader>

                {/* Search input */}
                <div className="relative">
                    <Input
                        placeholder="Search pages..."
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

                {/* Page list */}
                <ScrollArea className="h-[300px] mt-2">
                    {loading ? (
                        <LoadingSkeleton />
                    ) : flatPages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm py-8">
                            <FileText className="h-8 w-8 mb-2 opacity-50" />
                            <span>No pages found</span>
                            <span className="text-xs mt-1">Try a different search term</span>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {flatPages.map((page, index) => (
                                <PageItem
                                    key={page.id}
                                    page={page}
                                    isSelected={selectedIndex === index}
                                    onSelect={() => onSelect({ id: page.id, title: page.name })}
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
