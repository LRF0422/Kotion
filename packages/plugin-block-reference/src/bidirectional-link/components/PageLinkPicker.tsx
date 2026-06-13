/**
 * PageLinkPicker — cursor-anchored command menu (slash-menu style)
 * Allows users to search and select a page to link to via [[ ]].
 *
 * Rendered as a floating dropdown anchored at the caret (positioned by
 * LinkTrigger), NOT a modal dialog.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import { Input, ScrollArea, cn, Skeleton } from '@kn/ui';
import { FileText, SearchIcon, Loader2 } from '@kn/icon';
import { PageContext } from '@kn/editor';
import { useClickAway } from '@kn/common';
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

/** Page item — matches the slash menu's item look (icon chip + hover shift). */
const PageItem = React.memo<{
    page: PageTreeNode;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    onHover: () => void;
}>(({ page, index, isSelected, onSelect, onHover }) => (
    <div
        data-index={index}
        className={cn(
            "flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer",
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
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md",
                "bg-accent text-accent-foreground transition-transform duration-150",
                isSelected && "scale-105"
            )}
        >
            <FileText className="h-4 w-4" />
        </span>
        <span className="truncate text-sm">{page.name || '未命名'}</span>
    </div>
));
PageItem.displayName = 'PageItem';

/** Loading skeleton */
const LoadingSkeleton = React.memo(() => (
    <div className="space-y-1.5 p-1">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-4 flex-1" />
            </div>
        ))}
    </div>
));
LoadingSkeleton.displayName = 'LoadingSkeleton';

/**
 * PageLinkPicker Component
 *
 * Floating command menu for selecting pages to create [[Page Title]] links.
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

    // Fetch pages when visible or query changes (debounced).
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
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [visible, spaceId, query]);

    const flatPages = useMemo(() => flattenPages(pages), [pages]);

    // Keep the keyboard-selected item scrolled into view.
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, flatPages.length]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => (flatPages.length ? (prev + 1) % flatPages.length : 0));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => (flatPages.length ? (prev - 1 + flatPages.length) % flatPages.length : 0));
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
        <div
            ref={containerRef}
            onKeyDown={handleKeyDown}
            className={cn(
                "w-[320px] p-2 rounded-xl backdrop-blur-sm",
                "bg-popover text-popover-foreground",
                "border border-border/60 shadow-xl dark:shadow-2xl"
            )}
            role="dialog"
            aria-label="插入页面链接"
        >
            {/* Search input */}
            <div className="relative">
                <Input
                    ref={inputRef}
                    placeholder="搜索页面…"
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

            {/* Page list */}
            <ScrollArea className="mt-2 max-h-[280px]">
                <div ref={listRef} className="space-y-0.5 pr-1">
                    {loading ? (
                        <LoadingSkeleton />
                    ) : flatPages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-1 py-8 text-sm text-muted-foreground">
                            <FileText className="mb-1 h-7 w-7 opacity-40" />
                            <span>未找到页面</span>
                            <span className="text-xs opacity-70">换个关键词试试</span>
                        </div>
                    ) : (
                        flatPages.map((page, index) => (
                            <PageItem
                                key={page.id}
                                page={page}
                                index={index}
                                isSelected={selectedIndex === index}
                                onSelect={() => onSelect({ id: page.id, title: page.name })}
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
