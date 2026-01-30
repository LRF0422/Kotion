import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Input, ScrollArea, Skeleton, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { useClickAway, useDebounce } from "@kn/core";
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
    onSelect: () => void;
    onHover: () => void;
}>(({ page, isSelected, onSelect, onHover }) => (
    <div
        className={cn(
            "rounded-sm hover:bg-muted cursor-pointer flex items-center gap-2 p-2 transition-colors",
            isSelected && "bg-muted ring-1 ring-primary/20"
        )}
        onClick={onSelect}
        onMouseEnter={onHover}
        role="option"
        aria-selected={isSelected}
        tabIndex={0}
    >
        <span className="text-base">{page.icon?.icon || <FileText className="h-4 w-4" />}</span>
        <span className="truncate">{page.title || '未命名'}</span>
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

    // Fetch pages when search value changes
    useEffect(() => {
        if (!spaceService) return;

        const fetchPages = async () => {
            setLoading(true);
            try {
                const res = await spaceService.queryPage({
                    spaceId: pageInfo.spaceId,
                    searchValue: value
                });
                setPages(res.records);
            } catch {
                setPages([]);
            } finally {
                setLoading(false);
            }
        };

        fetchPages();
    }, [value, spaceService, pageInfo.spaceId]);

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

        return pages.map((page, index) => (
            <PageItem
                key={page.id}
                page={page}
                isSelected={selectedIndex === index}
                onSelect={() => handlePageSelect(page)}
                onHover={() => setSelectedIndex(index)}
            />
        ));
    }, [loading, pages, selectedIndex, handlePageSelect, setSelectedIndex]);

    return (
        <div
            className="w-[320px] z-50 p-2 bg-popover shadow-lg rounded-lg relative border"
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