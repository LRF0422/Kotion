import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Input, ScrollArea, Skeleton, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { useClickAway, useDebounce } from "@kn/common";
import { Editor, PageContext } from "@kn/editor";
import { FileText, Loader2, SearchIcon, X } from "@kn/icon";
import { useSpaceService, useKeyboardNavigation } from "../../hooks";
import type { PageInfo } from "../../types";
import { cn } from "@kn/ui";

interface PageSelectorProps {
    onCancel: () => void;
    editor: Editor;
}

/** Memoized page item component */
const PageItem = React.memo<{
    page: PageInfo;
    isSelected: boolean;
    /** Show the owning space name (when results span multiple spaces) */
    showSpace: boolean;
    onSelect: () => void;
    onHover: () => void;
}>(({ page, isSelected, showSpace, onSelect, onHover }) => (
    <div
        className={cn(
            "flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150",
            "hover:bg-muted/60 hover:translate-x-0.5",
            isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/30 translate-x-0.5"
        )}
        onClick={onSelect}
        onMouseEnter={onHover}
        role="option"
        aria-selected={isSelected}
        tabIndex={0}
    >
        <span className={cn(
            "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground text-base transition-transform duration-150",
            isSelected && "scale-105"
        )}>
            {page.icon?.icon || <FileText className="h-4 w-4" />}
        </span>
        <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{page.title || '未命名'}</span>
            {showSpace && page.spaceName && (
                <span className="truncate text-xs text-muted-foreground">{page.spaceName}</span>
            )}
        </span>
    </div>
));
PageItem.displayName = 'PageItem';

/** Loading skeleton */
const LoadingSkeleton = React.memo(() => (
    <div className="space-y-2 p-2">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 flex-1" />
            </div>
        ))}
    </div>
));
LoadingSkeleton.displayName = 'LoadingSkeleton';

/**
 * PageSelector component for selecting and linking pages
 * 
 * Features:
 * - Debounced search (500ms)
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Full accessibility support (ARIA)
 * - Click outside to close
 * - Auto-focus search input
 */
export const PageSelector: React.FC<PageSelectorProps> = React.memo(({ onCancel, editor }) => {
    const [pages, setPages] = useState<PageInfo[]>([]);
    const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
    const [searchValue, setSearchValue] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const pageInfo = useContext(PageContext);
    const value = useDebounce(searchValue, { wait: 500 });
    const spaceService = useSpaceService();

    // Handle page selection
    const handlePageSelect = useCallback((page: PageInfo) => {
        editor.commands.insertContent({
            type: "PageReference",
            attrs: {
                pageId: page.id,
                // Store the referenced page's own space so navigation lands in the
                // right space even when it differs from the current one.
                spaceId: page.spaceId,
                type: "LINK"
            }
        });
        onCancel();
    }, [editor, onCancel]);

    // Keyboard navigation
    const { selectedIndex, setSelectedIndex } = useKeyboardNavigation({
        items: pages,
        onSelect: handlePageSelect,
        onClose: onCancel,
        enabled: true,
    });

    useClickAway(() => {
        onCancel();
    }, ref);

    // Focus input on mount
    useEffect(() => {
        // Delay focus to ensure the component is mounted
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 50);
        return () => clearTimeout(timer);
    }, []);

    // Load the space list once to resolve space names for display (best-effort).
    useEffect(() => {
        if (!spaceService) return;
        let cancelled = false;
        spaceService.querySpaces()
            .then((res) => {
                if (!cancelled) setSpaces(res.records ?? []);
            })
            .catch(() => {
                if (!cancelled) setSpaces([]);
            });
        return () => { cancelled = true; };
    }, [spaceService]);

    // Resolve a spaceId -> spaceName map for the per-item subtitle.
    const spaceNameById = useMemo(() => {
        const map = new Map<string, string>();
        spaces.forEach((s) => map.set(String(s.id), s.name));
        return map;
    }, [spaces]);

    // Search pages across ALL spaces in one query (spaceId omitted = cross-space).
    useEffect(() => {
        if (!spaceService) return;
        let cancelled = false;

        const fetchPages = async () => {
            setLoading(true);
            try {
                const res = await spaceService.queryPage({
                    searchValue: value,
                    pageSize: 50,
                });
                const records = (res.records ?? []).map((p) => ({
                    ...p,
                    spaceId: String(p.spaceId),
                    spaceName: spaceNameById.get(String(p.spaceId)),
                }));

                // Surface the current space's pages first.
                records.sort((a, b) => {
                    const aCur = a.spaceId === pageInfo.spaceId ? 0 : 1;
                    const bCur = b.spaceId === pageInfo.spaceId ? 0 : 1;
                    return aCur - bCur;
                });

                if (!cancelled) setPages(records);
            } catch {
                if (!cancelled) setPages([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchPages();
        return () => { cancelled = true; };
    }, [value, spaceService, spaceNameById, pageInfo.spaceId]);

    // Memoize page list
    const pageList = useMemo(() => {
        if (loading) return <LoadingSkeleton />;

        if (pages.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm py-8">
                    <span>未找到页面</span>
                    <span className="text-xs mt-1">试试其他搜索词</span>
                </div>
            );
        }

        const multiSpace = new Set(pages.map((p) => p.spaceId)).size > 1;

        return pages.map((page, index) => (
            <PageItem
                key={`${page.spaceId}:${page.id}`}
                page={page}
                isSelected={selectedIndex === index}
                showSpace={multiSpace}
                onSelect={() => handlePageSelect(page)}
                onHover={() => setSelectedIndex(index)}
            />
        ));
    }, [loading, pages, selectedIndex, handlePageSelect, setSelectedIndex]);

    return (
        <div
            className="w-[320px] z-50 p-2 bg-popover text-popover-foreground shadow-xl dark:shadow-2xl rounded-xl backdrop-blur-sm relative border border-border/60"
            ref={ref}
            role="dialog"
            aria-label="选择页面"
            aria-modal="true"
        >
            {/* Search input */}
            <div className="relative">
                <Input
                    ref={inputRef}
                    onChange={(e) => setSearchValue(e.target.value)}
                    icon={<SearchIcon className="h-4 w-4" />}
                    placeholder="搜索页面..."
                    value={searchValue}
                    aria-label="搜索页面"
                    aria-autocomplete="list"
                    aria-controls="page-list"
                    className="pr-8"
                />
                {loading && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
            </div>

            {/* Page list */}
            <ScrollArea className="h-[280px] mt-2" id="page-list" role="listbox">
                {pageList}
            </ScrollArea>

            {/* Footer hint */}
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t mt-2 pt-2">
                <span>↑↓ 导航</span>
                <span>Enter 选择 · Esc 关闭</span>
            </div>

            {/* Close button */}
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <IconButton
                            className="absolute right-2 top-2"
                            icon={<X className="h-4 w-4" />}
                            onClick={onCancel}
                            aria-label="关闭"
                        />
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                        关闭 (Esc)
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
});

PageSelector.displayName = 'PageSelector';