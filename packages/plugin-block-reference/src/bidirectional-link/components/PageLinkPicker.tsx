/**
 * PageLinkPicker — caret-anchored suggestion list for [[ page links.
 *
 * Driven by the LinkTrigger suggestion plugin: the query is typed inline in
 * the editor (after `[[`), not in a separate input. Selecting an item calls
 * the suggestion `command`, which replaces the typed range with a
 * pageLinkNode. When nothing matches, offers a "create page and link" action.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, {
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { ScrollArea, cn, Skeleton } from '@kn/ui';
import { FileText, FilePlus2, Loader2 } from '@kn/icon';
import { PageContext, type SuggestionProps } from '@kn/editor';
import { useSpacePageService } from '@kn/common';
import type { PageSummary } from '@kn/common';
import { useI18n } from '../../i18n/use-i18n';
import { PagePreviewPane } from './PagePreviewPane';
import type { LinkSuggestionListHandle, LinkSuggestionCommandProps } from '../extensions/LinkTrigger';

/** Page item — matches the slash menu's item look (icon chip + hover shift). */
const PageItem = React.memo<{
    page: PageSummary;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    onHover: () => void;
    untitledLabel: string;
}>(({ page, index, isSelected, onSelect, onHover, untitledLabel }) => (
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
        <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{page.title || untitledLabel}</div>
            {page.spaceName && (
                <div className="truncate text-xs text-muted-foreground">{page.spaceName}</div>
            )}
        </div>
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

type PickerProps = SuggestionProps<unknown, LinkSuggestionCommandProps>;

export const PageLinkPicker = forwardRef<LinkSuggestionListHandle, PickerProps>(
    ({ query, command }, ref) => {
        const pageCtx = useContext(PageContext);
        const service = useSpacePageService();
        const { t } = useI18n();

        const [pages, setPages] = useState<PageSummary[]>([]);
        const [loading, setLoading] = useState(true);
        const [creating, setCreating] = useState(false);
        const [selectedIndex, setSelectedIndex] = useState(0);
        // Debounced id of the highlighted page — drives the side preview pane
        // without refetching on every arrow-key/hover step through the list.
        const [previewPageId, setPreviewPageId] = useState<string | null>(null);
        const listRef = useRef<HTMLDivElement>(null);

        // Fetch pages across all spaces when the inline query changes (debounced).
        useEffect(() => {
            setLoading(true);
            const timer = setTimeout(() => {
                service.pages.queryPages({ searchValue: query.trim() || undefined, pageSize: 50 })
                    .then((data) => {
                        setPages(data.records);
                        setSelectedIndex(0);
                    })
                    .catch(() => setPages([]))
                    .finally(() => setLoading(false));
            }, 250);
            return () => clearTimeout(timer);
        }, [query, service]);

        // The trailing "create page" action only appears with a non-empty query.
        const showCreate = query.trim().length > 0;
        const totalCount = pages.length + (showCreate ? 1 : 0);
        const createIndex = pages.length;

        // Keep the keyboard-selected item scrolled into view.
        useEffect(() => {
            const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
            el?.scrollIntoView({ block: 'nearest' });
        }, [selectedIndex, totalCount]);

        // Editor-rendered preview of the highlighted page (create action → none).
        useEffect(() => {
            const page = pages[selectedIndex];
            if (!page) {
                setPreviewPageId(null);
                return;
            }
            const timer = setTimeout(() => setPreviewPageId(String(page.id)), 250);
            return () => clearTimeout(timer);
        }, [pages, selectedIndex]);

        const handleCreate = useCallback(async () => {
            const title = query.trim();
            if (!title || creating || !pageCtx.spaceId) return;
            setCreating(true);
            try {
                const page = await service.pages.createPage({
                    spaceId: String(pageCtx.spaceId),
                    title,
                });
                command({ page: { id: String(page.id), title: page.title || title } });
            } catch {
                // Keep the menu open so the user can retry or pick another page.
            } finally {
                setCreating(false);
            }
        }, [query, creating, pageCtx.spaceId, service, command]);

        const selectAt = useCallback((index: number) => {
            if (index === createIndex && showCreate) {
                handleCreate();
                return;
            }
            const page = pages[index];
            if (page) {
                command({ page: { id: String(page.id), title: page.title || t('bidirectionalLink.untitled') } });
            }
        }, [pages, createIndex, showCreate, handleCreate, command, t]);

        useImperativeHandle(ref, () => ({
            onKeyDown: ({ event: e }) => {
                if (e.key === 'ArrowDown') {
                    setSelectedIndex((prev) => (totalCount ? (prev + 1) % totalCount : 0));
                    return true;
                }
                if (e.key === 'ArrowUp') {
                    setSelectedIndex((prev) => (totalCount ? (prev - 1 + totalCount) % totalCount : 0));
                    return true;
                }
                if (e.key === 'Enter') {
                    selectAt(selectedIndex);
                    return true;
                }
                return false;
            },
        }), [totalCount, selectedIndex, selectAt]);

        return (
            <div
                className={cn(
                    "flex items-stretch overflow-hidden rounded-xl backdrop-blur-sm",
                    "bg-popover text-popover-foreground",
                    "border border-border/60 shadow-xl dark:shadow-2xl"
                )}
            >
            <div
                className="w-[320px] flex-shrink-0 p-2"
                role="listbox"
                aria-label={t('bidirectionalLink.searchPagesPlaceholder')}
            >
                {/* Inline query indicator */}
                <div className="flex items-center gap-1.5 px-2 pb-1.5 text-xs text-muted-foreground border-b border-border/60">
                    <span className="font-mono">[[</span>
                    <span className="truncate">{query || t('bidirectionalLink.searchPagesPlaceholder')}</span>
                    {loading && <Loader2 className="ml-auto h-3 w-3 animate-spin" />}
                </div>

                {/* Page list */}
                <ScrollArea className="link-panel-scroll mt-1.5 max-h-[280px]">
                    <div ref={listRef} className="space-y-0.5 pr-1">
                        {loading && pages.length === 0 ? (
                            <LoadingSkeleton />
                        ) : (
                            <>
                                {pages.length === 0 && !showCreate && (
                                    <div className="flex flex-col items-center justify-center gap-1 py-8 text-sm text-muted-foreground">
                                        <FileText className="mb-1 h-7 w-7 opacity-40" />
                                        <span>{t('bidirectionalLink.noPages')}</span>
                                        <span className="text-xs opacity-70">{t('bidirectionalLink.tryDifferentSearch')}</span>
                                    </div>
                                )}
                                {pages.map((page, index) => (
                                    <PageItem
                                        key={page.id}
                                        page={page}
                                        index={index}
                                        isSelected={selectedIndex === index}
                                        onSelect={() => selectAt(index)}
                                        onHover={() => setSelectedIndex(index)}
                                        untitledLabel={t('bidirectionalLink.untitled')}
                                    />
                                ))}
                                {showCreate && (
                                    <div
                                        data-index={createIndex}
                                        className={cn(
                                            "flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer",
                                            "transition-all duration-150",
                                            "hover:bg-muted/60 hover:translate-x-0.5",
                                            selectedIndex === createIndex && "bg-primary/10 ring-1 ring-inset ring-primary/30 translate-x-0.5",
                                            pages.length > 0 && "border-t border-border/60 mt-1 pt-2 rounded-t-none"
                                        )}
                                        onClick={handleCreate}
                                        onMouseEnter={() => setSelectedIndex(createIndex)}
                                        role="option"
                                        aria-selected={selectedIndex === createIndex}
                                    >
                                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                            {creating ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <FilePlus2 className="h-4 w-4" />
                                            )}
                                        </span>
                                        <span className="truncate text-sm">
                                            {creating
                                                ? t('bidirectionalLink.creating')
                                                : `${t('bidirectionalLink.createPagePrefix')} "${query.trim()}"`}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </ScrollArea>

                {/* Footer hint */}
                <div className="mt-2 flex items-center justify-between border-t border-border/60 px-1 pt-2 text-xs text-muted-foreground">
                    <span>{t('bidirectionalLink.navHint')}</span>
                    <span>{t('bidirectionalLink.selectHint')}</span>
                </div>
            </div>

            {/* Side preview — editor-rendered content of the highlighted page */}
            {previewPageId && (
                <PagePreviewPane
                    pageId={previewPageId}
                    className="w-[340px] flex-shrink-0 border-l border-border/60 max-h-[380px]"
                />
            )}
            </div>
        );
    }
);

PageLinkPicker.displayName = 'PageLinkPicker';
