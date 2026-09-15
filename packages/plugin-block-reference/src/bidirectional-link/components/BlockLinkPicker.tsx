/**
 * BlockLinkPicker — caret-anchored suggestion list for (( block links.
 *
 * Driven by the LinkTrigger suggestion plugin: the query is typed inline in the
 * editor (after `((`). Blocks are searched server-side and paged (infinite
 * scroll + a manual "load more"), each row previews the block's text, and the
 * highlighted row is rendered full-fidelity in the side BlockPreviewPane.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, {
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Skeleton, cn, useResponsive } from '@kn/ui';
import { FileText, Loader2, SquareDashedBottom } from '@kn/icon';
import { PageContext, type SuggestionProps } from '@kn/editor';
import { useSpacePageService } from '@kn/common';
import type { BlockSummary } from '@kn/common';
import { useI18n } from '../../i18n/use-i18n';
import { BlockPreviewPane } from './BlockPreviewPane';
import { getBlockTypeIcon, getBlockTypeLabel } from './block-types';
import type { LinkSuggestionListHandle, LinkSuggestionCommandProps } from '../extensions/LinkTrigger';

/** Rows fetched per page. */
const PAGE_SIZE = 20;
/** Debounce before hitting the search endpoint for the current query. */
const SEARCH_DEBOUNCE_MS = 220;
/** Debounce before rendering the highlighted block in the preview pane. */
const PREVIEW_DEBOUNCE_MS = 220;

/** Flatten a block's text (falling back to its content JSON) into a preview line. */
const getBlockPreview = (block: BlockSummary): string => {
    const text = typeof block.text === 'string' ? block.text.trim() : '';
    if (text) return text.replace(/\s+/g, ' ').slice(0, 180);

    const content = block.content;
    if (content == null) return '';
    try {
        const parsed: any = typeof content === 'string' ? JSON.parse(content) : content;
        const extract = (node: any): string => {
            if (!node) return '';
            if (typeof node === 'string') return node;
            if (Array.isArray(node)) return node.map(extract).filter(Boolean).join('');
            if (node.type === 'text' && typeof node.text === 'string') return node.text;
            if (typeof node.text === 'string') return node.text;
            if (node.content) return extract(node.content);
            return '';
        };
        return extract(parsed).replace(/\s+/g, ' ').trim().slice(0, 180);
    } catch {
        return '';
    }
};

/** A block row: type glyph + text preview + source page. */
const BlockItem = React.memo<{
    block: BlockSummary;
    preview: string;
    typeLabel: string;
    isSelected: boolean;
    index: number;
    untitledLabel: string;
    onSelect: () => void;
    onHover: () => void;
}>(({ block, preview, typeLabel, isSelected, index, untitledLabel, onSelect, onHover }) => {
    const Icon = getBlockTypeIcon(block.type);

    return (
        <div
            data-index={index}
            className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
                isSelected
                    ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
                    : 'hover:bg-muted/60'
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSelect}
            onMouseEnter={onHover}
            role="option"
            aria-selected={isSelected}
        >
            <span
                className={cn(
                    'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
                    'bg-purple-500/10 text-purple-500 transition-transform duration-150',
                    isSelected && 'scale-105'
                )}
            >
                <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
                <div className={cn('line-clamp-2 text-sm', !preview && 'italic text-muted-foreground')}>
                    {preview || typeLabel}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{block.pageTitle || untitledLabel}</span>
                    <span className="ml-auto flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {typeLabel}
                    </span>
                </div>
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

type PickerProps = SuggestionProps<unknown, LinkSuggestionCommandProps>;

export const BlockLinkPicker = forwardRef<LinkSuggestionListHandle, PickerProps>(
    ({ query, command }, ref) => {
        const pageCtx = useContext(PageContext);
        const service = useSpacePageService();
        const { t } = useI18n();
        const { isDesktop } = useResponsive();
        const spaceId = pageCtx?.spaceId ? String(pageCtx.spaceId) : undefined;
        const searchValue = query.trim();

        const [blocks, setBlocks] = useState<BlockSummary[]>([]);
        const [total, setTotal] = useState(0);
        const [page, setPage] = useState(1);
        const [loading, setLoading] = useState(true);
        const [loadingMore, setLoadingMore] = useState(false);
        const [error, setError] = useState<string | null>(null);
        const [selectedIndex, setSelectedIndex] = useState(0);
        const [previewBlockId, setPreviewBlockId] = useState<string | null>(null);
        const listRef = useRef<HTMLDivElement>(null);
        const scrollRef = useRef<HTMLDivElement>(null);
        const requestSeq = useRef(0);

        const isSearching = searchValue.length > 0;
        // Full-text search returns a single capped batch, so it never paginates.
        const hasMore = !isSearching && total > 0 && blocks.length < total;

        const fetchBlocks = useCallback(async (targetPage: number, append: boolean) => {
            if (!spaceId) {
                setLoading(false);
                return;
            }
            const seq = ++requestSeq.current;
            if (append) setLoadingMore(true);
            else {
                setLoading(true);
                setError(null);
            }
            try {
                if (searchValue) {
                    // Server-side full-text search (RediSearch with a MySQL
                    // fallback). Ranked; the endpoint caps the batch, so this is
                    // not paginated.
                    const records = await service.relations.searchBlocks({ keyword: searchValue, spaceId });
                    if (seq !== requestSeq.current) return;
                    setTotal(records.length);
                    setPage(1);
                    setBlocks(records);
                } else {
                    const result = await service.relations.queryBlocksPage({
                        spaceId,
                        current: targetPage,
                        pageSize: PAGE_SIZE,
                    });
                    if (seq !== requestSeq.current) return;
                    setTotal(result.total ?? 0);
                    setPage(targetPage);
                    setBlocks((prev) => (append ? [...prev, ...result.records] : result.records));
                }
            } catch (err) {
                if (seq !== requestSeq.current) return;
                if (!append) {
                    setBlocks([]);
                    setTotal(0);
                }
                // Surface the failure instead of pretending the space is empty.
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (seq === requestSeq.current) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        }, [service, spaceId, searchValue]);

        // Server-side search; debounced so each keystroke doesn't hit the API.
        useEffect(() => {
            if (!spaceId) {
                setBlocks([]);
                setTotal(0);
                setLoading(false);
                return;
            }
            setLoading(true);
            const timer = setTimeout(() => { void fetchBlocks(1, false); }, SEARCH_DEBOUNCE_MS);
            return () => clearTimeout(timer);
        }, [spaceId, searchValue, fetchBlocks]);

        // Reset the highlight when the search changes.
        useEffect(() => { setSelectedIndex(0); }, [searchValue]);

        // Keep the highlight inside the loaded range (e.g. after a reset).
        useEffect(() => {
            setSelectedIndex((prev) => Math.min(prev, Math.max(0, blocks.length - 1)));
        }, [blocks.length]);

        const loadMore = useCallback(() => {
            if (!hasMore || loading || loadingMore) return;
            void fetchBlocks(page + 1, true);
        }, [hasMore, loading, loadingMore, fetchBlocks, page]);

        // Auto-load the next page when the user scrolls near the bottom.
        const handleScroll = useCallback(() => {
            const el = scrollRef.current;
            if (!el) return;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) loadMore();
        }, [loadMore]);

        // Pull the next page once the last loaded row is highlighted.
        useEffect(() => {
            if (hasMore && selectedIndex >= blocks.length - 1) loadMore();
        }, [hasMore, selectedIndex, blocks.length, loadMore]);

        // Debounced highlight preview.
        useEffect(() => {
            const block = blocks[selectedIndex];
            if (!block) {
                setPreviewBlockId(null);
                return;
            }
            const timer = setTimeout(() => setPreviewBlockId(String(block.id)), PREVIEW_DEBOUNCE_MS);
            return () => clearTimeout(timer);
        }, [blocks, selectedIndex]);

        // Keep the keyboard-selected row visible.
        useEffect(() => {
            const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
            el?.scrollIntoView({ block: 'nearest' });
        }, [selectedIndex, blocks.length]);

        const selectAt = useCallback((index: number) => {
            const block = blocks[index];
            if (block) command({ block: { id: String(block.id) } });
        }, [blocks, command]);

        useImperativeHandle(ref, () => ({
            onKeyDown: ({ event: e }) => {
                if (e.key === 'ArrowDown') {
                    setSelectedIndex((prev) => (blocks.length ? (prev + 1) % blocks.length : 0));
                    return true;
                }
                if (e.key === 'ArrowUp') {
                    setSelectedIndex((prev) => (blocks.length ? (prev - 1 + blocks.length) % blocks.length : 0));
                    return true;
                }
                if (e.key === 'Enter') {
                    selectAt(selectedIndex);
                    return true;
                }
                return false;
            },
        }), [blocks.length, selectedIndex, selectAt]);

        const showEmpty = !loading && blocks.length === 0;

        return (
            <div
                className={cn(
                    'flex items-stretch overflow-hidden rounded-xl backdrop-blur-sm',
                    'bg-popover text-popover-foreground border border-border/60 shadow-xl dark:shadow-2xl'
                )}
            >
                <div
                    className="flex w-[380px] flex-shrink-0 flex-col p-2"
                    role="listbox"
                    aria-label={t('bidirectionalLink.searchBlocksPlaceholder')}
                >
                    {/* Inline query indicator */}
                    <div className="flex items-center gap-1.5 border-b border-border/60 px-2 pb-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">((</span>
                        <span className="truncate">
                            {searchValue || t('bidirectionalLink.searchBlocksPlaceholder')}
                        </span>
                        <span className="ml-auto flex flex-shrink-0 items-center gap-1.5">
                            {isSearching && (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                    {t('bidirectionalLink.fullText')}
                                </span>
                            )}
                            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                        </span>
                    </div>

                    {/* Paged block list */}
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        className="link-panel-scroll mt-1.5 min-h-[72px] max-h-[320px] overflow-y-auto pr-1"
                    >
                        <div ref={listRef} className="space-y-0.5">
                            {loading && blocks.length === 0 ? (
                                <LoadingSkeleton />
                            ) : showEmpty ? (
                                error ? (
                                    <div className="flex flex-col items-center justify-center gap-1 py-8 text-center text-sm text-destructive">
                                        <span>{t('bidirectionalLink.loadFailed')}</span>
                                        <span className="break-all text-xs opacity-80">{error}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-1 py-8 text-sm text-muted-foreground">
                                        <SquareDashedBottom className="mb-1 h-7 w-7 opacity-40" />
                                        <span>{t('bidirectionalLink.noBlocks')}</span>
                                        <span className="text-xs opacity-70">{t('bidirectionalLink.tryDifferentSearch')}</span>
                                    </div>
                                )
                            ) : (
                                <>
                                    {blocks.map((block, index) => (
                                        <BlockItem
                                            key={block.id}
                                            block={block}
                                            preview={getBlockPreview(block)}
                                            typeLabel={getBlockTypeLabel(t, block.type)}
                                            isSelected={selectedIndex === index}
                                            index={index}
                                            untitledLabel={t('bidirectionalLink.untitled')}
                                            onSelect={() => selectAt(index)}
                                            onHover={() => setSelectedIndex(index)}
                                        />
                                    ))}
                                    {loadingMore && (
                                        <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            {t('bidirectionalLink.loadingMore')}
                                        </div>
                                    )}
                                    {hasMore && !loadingMore && (
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={loadMore}
                                            className="mt-1 w-full rounded-md py-1.5 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/60"
                                        >
                                            {t('bidirectionalLink.loadMore')}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Footer hint + loaded/total */}
                    <div className="mt-2 flex items-center justify-between border-t border-border/60 px-1 pt-2 text-xs text-muted-foreground">
                        <span className="truncate">
                            {t('bidirectionalLink.navHint')} · {t('bidirectionalLink.selectHint')}
                        </span>
                        <span className="flex-shrink-0 tabular-nums">
                            {blocks.length}
                            {!isSearching && total > 0 ? ` / ${total}` : ''}
                        </span>
                    </div>
                </div>

                {/* Full-fidelity preview of the highlighted block (desktop only) */}
                {isDesktop && previewBlockId && (
                    <BlockPreviewPane
                        blockId={previewBlockId}
                        className="max-h-[420px] w-[340px] flex-shrink-0 border-l border-border/60"
                    />
                )}
            </div>
        );
    }
);

BlockLinkPicker.displayName = 'BlockLinkPicker';
