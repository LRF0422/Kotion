import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { IconButton, Input, ScrollArea } from "@kn/ui";
import { useClickAway, useDebounce } from "@kn/core";
import { Editor, PageContext } from "@kn/editor";
import { SearchIcon, X } from "@kn/icon";
import { useSpaceService } from "../../hooks";
import type { PageInfo } from "../../types";

interface PageSelectorProps {
    onCancel: () => void;
    editor: Editor;
}

/**
 * PageSelector component for selecting and linking pages
 * Optimized with proper typing and error handling
 */
export const PageSelector: React.FC<PageSelectorProps> = React.memo(({ onCancel, editor }) => {
    const [pages, setPages] = useState<PageInfo[]>([]);
    const [searchValue, setSearchValue] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const pageInfo = useContext(PageContext);
    const value = useDebounce(searchValue, { wait: 500 });
    const spaceService = useSpaceService();

    useClickAway(() => {
        onCancel();
    }, ref);

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
            } catch (err) {
                console.error('Failed to fetch pages:', err);
                setPages([]);
            } finally {
                setLoading(false);
            }
        };

        fetchPages();
    }, [value, spaceService, pageInfo.spaceId]);

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

    return (
        <div
            className="w-[300px] z-50 p-1 bg-popover shadow-md rounded-sm relative border"
            ref={ref}
        >
            <Input
                onChange={(e) => setSearchValue(e.target.value)}
                icon={<SearchIcon className="h-4 w-4" />}
                placeholder="请输入页面名称"
                value={searchValue}
            />
            <ScrollArea className="h-[300px]">
                {loading && (
                    <div className="p-4 text-center text-muted-foreground">
                        Loading pages...
                    </div>
                )}
                {!loading && pages.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground">
                        No pages found
                    </div>
                )}
                {!loading && pages.map((page) => (
                    <div
                        key={page.id}
                        className="rounded-sm hover:bg-muted cursor-pointer flex items-center gap-1 p-1"
                        onClick={() => handlePageSelect(page)}
                    >
                        <div>{page.icon?.icon}</div>
                        <div>{page.title || 'Untitled'}</div>
                    </div>
                ))}
            </ScrollArea>
            <IconButton
                className="absolute right-1 top-1"
                icon={<X className="h-4 w-4" />}
                onClick={onCancel}
            />
        </div>
    );
});