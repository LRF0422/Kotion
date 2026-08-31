/**
 * BlockLinkPicker — caret-anchored suggestion list for (( block links.
 *
 * Driven by the LinkTrigger suggestion plugin: the query is typed inline in
 * the editor (after `((`). Blocks are grouped by their source page, with the
 * current page's blocks listed first for quick self-referencing.
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
import { ScrollArea, cn, Skeleton } from '@kn/ui';
import { SquareDashedBottom, FileText, Loader2 } from '@kn/icon';
import { PageContext, type SuggestionProps } from '@kn/editor';
import { useSpacePageService } from '@kn/common';
import type { BlockSummary } from '@kn/common';
import { useI18n } from '../../i18n/use-i18n';
import type { LinkSuggestionListHandle, LinkSuggestionCommandProps } from '../extensions/LinkTrigger';

/** Extract text preview from block content */
const getBlockPreview = (block: BlockSummary): string => {
    try {
        const content = typeof block.content === 'string'
            ? JSON.parse(block.content)
            : block.content;

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
        return text ? text.slice(0, 120) : '';
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

/** A block row with its flat keyboard index. */
interface FlatBlock {
    block: BlockSummary;
    preview: string;
    index: number;
}

/** Blocks grouped under one source page. */
interface BlockGroup {
    pageId: string;
    pageTitle: string;
    isCurrentPage: boolean;
    blocks: FlatBlock[];
}

/** Block item — slash-menu look (icon chip + hover shift). */
const BlockItem = React.memo<{
    item: FlatBlock;
    isSelected: boolean;
    onSelect: () => void;
    onHover: () => void;
}>(({ item, isSelected, onSelect, onHover }) => {
    const typeLabel = getBlockTypeLabel(item.block.type || 'block');

    return (
        <div
            data-index={item.index}
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
                {item.preview ? (
                    <>
                        <div className="text-sm line-clamp-2">{item.preview}</div>
                        <div className="mt-1 flex items-center gap-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                {typeLabel}
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="text-sm italic text-muted-foreground">{typeLabel}</span>
                        <span className="font-mono text-xs text-muted-foreground/70">
                            ({item.block.id.slice(0, 8)}…)
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

type PickerProps = SuggestionProps<unknown, LinkSuggestionCommandProps>;

export const BlockLinkPicker = forwardRef<LinkSuggestionListHandle, PickerProps>(
    ({ query, command }, ref) => {
        const pageCtx = useContext(PageContext);
        const service = useSpacePageService();
        const { t } = useI18n();
        const spaceId = pageCtx?.spaceId ? String(pageCtx.spaceId) : undefined;

        const [blocks, setBlocks] = useState<BlockSummary[]>([]);
        const [loading, setLoading] = useState(true);
        const [selectedIndex, setSelectedIndex] = useState(0);
        const listRef = useRef<HTMLDivElement>(null);

        // One fetch per open; the inline query filters client-side below.
        useEffect(() => {
            if (!spaceId) {
                setLoading(false);
                return;
            }
            let cancelled = false;
            setLoading(true);
            service.relations.queryBlocks({ spaceId })
                .then((data) => {
                    if (!cancelled) setBlocks(data);
                })
                .catch(() => {
                    if (!cancelled) setBlocks([]);
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
            return () => { cancelled = true; };
        }, [service, spaceId]);

        // Filter by query, group by source page, current page first.
        const groups = useMemo<BlockGroup[]>(() => {
            const lowerQuery = query.trim().toLowerCase();
            const matched = blocks
                .map((block) => ({ block, preview: getBlockPreview(block) }))
                .filter(({ block, preview }) => {
                    if (!lowerQuery) return true;
                    return preview.toLowerCase().includes(lowerQuery) || block.id.includes(lowerQuery);
                });

            const byPage = new Map<string, BlockGroup>();
            for (const { block, preview } of matched) {
                const pid = String(block.pageId ?? '');
                let group = byPage.get(pid);
                if (!group) {
                    group = {
                        pageId: pid,
                        pageTitle: block.pageTitle || t('bidirectionalLink.untitled'),
                        isCurrentPage: pageCtx?.id != null && pid === String(pageCtx.id),
                        blocks: [],
                    };
                    byPage.set(pid, group);
                }
                group.blocks.push({ block, preview, index: -1 });
            }

            const sorted = Array.from(byPage.values()).sort((a, b) => {
                if (a.isCurrentPage !== b.isCurrentPage) return a.isCurrentPage ? -1 : 1;
                return a.pageTitle.localeCompare(b.pageTitle);
            });

            // Assign flat keyboard indices across groups.
            let i = 0;
            for (const group of sorted) {
                for (const item of group.blocks) item.index = i++;
            }
            return sorted;
        }, [blocks, query, pageCtx?.id, t]);

        const flatBlocks = useMemo(() => groups.flatMap((g) => g.blocks), [groups]);
        const totalCount = flatBlocks.length;

        // Reset selection when the result set changes.
        useEffect(() => {
            setSelectedIndex(0);
        }, [query, blocks]);

        // Keep the keyboard-selected item scrolled into view.
        useEffect(() => {
            const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
            el?.scrollIntoView({ block: 'nearest' });
        }, [selectedIndex, totalCount]);

        const selectAt = useCallback((index: number) => {
            const item = flatBlocks[index];
            if (item) {
                command({ block: { id: item.block.id } });
            }
        }, [flatBlocks, command]);

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
                    "w-[420px] p-2 rounded-xl backdrop-blur-sm",
                    "bg-popover text-popover-foreground",
                    "border border-border/60 shadow-xl dark:shadow-2xl"
                )}
                role="listbox"
                aria-label={t('bidirectionalLink.searchBlocksPlaceholder')}
            >
                {/* Inline query indicator */}
                <div className="flex items-center gap-1.5 px-2 pb-1.5 text-xs text-muted-foreground border-b border-border/60">
                    <span className="font-mono">((</span>
                    <span className="truncate">{query || t('bidirectionalLink.searchBlocksPlaceholder')}</span>
                    {loading && <Loader2 className="ml-auto h-3 w-3 animate-spin" />}
                </div>

                {/* Grouped block list */}
                <ScrollArea className="link-panel-scroll mt-1.5 max-h-[300px]">
                    <div ref={listRef} className="space-y-0.5 pr-1">
                        {loading ? (
                            <LoadingSkeleton />
                        ) : totalCount === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-1 py-8 text-sm text-muted-foreground">
                                <SquareDashedBottom className="mb-1 h-7 w-7 opacity-40" />
                                <span>{t('bidirectionalLink.noBlocks')}</span>
                                <span className="text-xs opacity-70">{t('bidirectionalLink.tryDifferentSearch')}</span>
                            </div>
                        ) : (
                            groups.map((group) => (
                                <div key={group.pageId}>
                                    <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                                        <FileText className="h-3 w-3 flex-shrink-0" />
                                        <span className="truncate">{group.pageTitle}</span>
                                        {group.isCurrentPage && (
                                            <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                                                {t('bidirectionalLink.currentPage')}
                                            </span>
                                        )}
                                    </div>
                                    {group.blocks.map((item) => (
                                        <BlockItem
                                            key={item.block.id}
                                            item={item}
                                            isSelected={selectedIndex === item.index}
                                            onSelect={() => selectAt(item.index)}
                                            onHover={() => setSelectedIndex(item.index)}
                                        />
                                    ))}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>

                {/* Footer hint */}
                <div className="mt-2 flex items-center justify-between border-t border-border/60 px-1 pt-2 text-xs text-muted-foreground">
                    <span>{t('bidirectionalLink.navHint')}</span>
                    <span>{t('bidirectionalLink.selectHint')}</span>
                </div>
            </div>
        );
    }
);

BlockLinkPicker.displayName = 'BlockLinkPicker';
