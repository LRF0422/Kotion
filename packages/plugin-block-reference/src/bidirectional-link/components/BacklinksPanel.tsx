/**
 * BacklinksPanel Component
 *
 * Displays references pointing at the current page:
 * - Backlinks grouped by source page (collapsible groups)
 * - Kind filter chips (all / links / mentions / embeds) when mixed
 * - Snippet keyword highlighting of the current page title
 * - Unlinked mentions (title appears in text without a structured link)
 * - Refresh (invalidates the local index) and graph entry actions
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { cn, ScrollArea, Skeleton, Collapsible, CollapsibleTrigger, CollapsibleContent } from '@kn/ui';
import { Link2, FileText, SquareDashedBottom, RefreshCcw, Waypoints, ChevronRight, AtSign } from '@kn/icon';
import { useNavigator, useSpacePageService } from "@kn/common";
import type { PageRelation } from "@kn/common";
import { PageContext } from "@kn/editor";
import { getLocalPageBacklinks, getUnlinkedMentions, invalidateBacklinkIndex } from '../services/localBacklinkIndex';
import { useI18n } from '../../i18n/use-i18n';
import { getIconText } from '../../utils';

interface BacklinksPanelProps {
    /**
     * Page ID to fetch backlinks for. Falls back to the current PageContext when
     * omitted. Domain IDs stay as strings to preserve snowflake precision.
     */
    pageId?: string;
    /** Optional className for styling */
    className?: string;
    /**
     * Rendered instead of nothing when the page has no backlinks. The inline
     * page footer wants to disappear silently; a dock panel needs to explain
     * itself, so hosts opt in.
     */
    emptyFallback?: React.ReactNode;
}

type FilterKind = 'ALL' | 'NORMAL' | 'MENTION' | 'EMBED';

/** Wrap occurrences of `keyword` inside `text` with a highlight span. */
const highlightKeyword = (text: string, keyword?: string): React.ReactNode => {
    const kw = keyword?.trim();
    if (!text || !kw) return text;
    const lower = text.toLowerCase();
    const lowerKw = kw.toLowerCase();
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let idx = lower.indexOf(lowerKw);
    while (idx >= 0) {
        if (idx > cursor) parts.push(text.slice(cursor, idx));
        parts.push(
            <span key={idx} className="backlink-snippet-highlight">
                {text.slice(idx, idx + kw.length)}
            </span>
        );
        cursor = idx + kw.length;
        idx = lower.indexOf(lowerKw, cursor);
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts.length ? parts : text;
};

/** Single backlink / mention row (snippet + kind badge). */
const BacklinkItem = React.memo<{
    backlink: PageRelation;
    keyword?: string;
    blockBadge: string;
    onClick: () => void;
}>(({ backlink, keyword, blockBadge, onClick }) => (
    <div
        className={cn(
            "flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
            "hover:bg-muted"
        )}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
            }
        }}
    >
        <div className="flex-1 min-w-0">
            {backlink.snippet ? (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {highlightKeyword(backlink.snippet, keyword)}
                </p>
            ) : (
                <p className="text-xs text-muted-foreground italic">…</p>
            )}
        </div>
        {backlink.sourceType === 'BLOCK' && backlink.linkKind === 'EMBED' && (
            <span className="flex-shrink-0 flex items-center gap-1 text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                <SquareDashedBottom className="h-3 w-3" />
                {blockBadge}
            </span>
        )}
    </div>
));
BacklinkItem.displayName = 'BacklinkItem';

/** Collapsible group of backlinks from a single source page. */
const SourcePageGroup = React.memo<{
    pageTitle: string;
    icon: string | null;
    items: PageRelation[];
    keyword?: string;
    blockBadge: string;
    onItemClick: (link: PageRelation) => void;
}>(({ pageTitle, icon, items, keyword, blockBadge, onItemClick }) => (
    <Collapsible defaultOpen>
        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            {icon ? (
                <span className="text-sm leading-none">{icon}</span>
            ) : (
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-sm font-medium truncate">{pageTitle}</span>
            {items.length > 1 && (
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {items.length}
                </span>
            )}
        </CollapsibleTrigger>
        <CollapsibleContent>
            <div className="ml-4 border-l border-border/60 pl-1 space-y-0.5">
                {items.map((link, i) => (
                    <BacklinkItem
                        key={`${link.sourceId}-${i}`}
                        backlink={link}
                        keyword={keyword}
                        blockBadge={blockBadge}
                        onClick={() => onItemClick(link)}
                    />
                ))}
            </div>
        </CollapsibleContent>
    </Collapsible>
));
SourcePageGroup.displayName = 'SourcePageGroup';

/** Loading skeleton */
const LoadingSkeleton = React.memo(() => (
    <div className="space-y-3 p-2">
        {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-5 w-5 rounded" />
                <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                </div>
            </div>
        ))}
    </div>
));
LoadingSkeleton.displayName = 'LoadingSkeleton';

interface PageGroup {
    pageId: string;
    pageTitle: string;
    icon: string | null;
    items: PageRelation[];
}

/** Group a flat backlink list by source page, preserving order. */
const groupBySourcePage = (links: PageRelation[]): PageGroup[] => {
    const map = new Map<string, PageGroup>();
    for (const link of links) {
        const key = String(link.sourcePageId);
        const group = map.get(key);
        if (group) {
            group.items.push(link);
        } else {
            map.set(key, {
                pageId: key,
                pageTitle: link.sourcePageTitle || 'Untitled',
                icon: getIconText(link.sourcePageIcon),
                items: [link],
            });
        }
    }
    return Array.from(map.values());
};

/**
 * BacklinksPanel Component
 *
 * Displays backlinks and unlinked mentions for the current page.
 * Hidden when both lists are empty.
 *
 * @example
 * <BacklinksPanel pageId={123} />
 */
export const BacklinksPanel: React.FC<BacklinksPanelProps> = ({
    pageId: pageIdProp,
    className,
    emptyFallback = null,
}) => {
    const pageCtx = useContext(PageContext);
    const service = useSpacePageService();
    const { t } = useI18n();
    const pageId = pageIdProp ?? (pageCtx.id != null ? String(pageCtx.id) : undefined);
    const currentSpaceId = pageCtx.spaceId != null ? String(pageCtx.spaceId) : undefined;
    const currentTitle = pageCtx.title;

    const [backlinks, setBacklinks] = useState<PageRelation[]>([]);
    const [mentions, setMentions] = useState<PageRelation[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<FilterKind>('ALL');
    const [refreshTick, setRefreshTick] = useState(0);
    const navigator = useNavigator();

    // Fetch backlinks + unlinked mentions when the target page changes.
    // Prefer the backend index; fall back to a local scan of the current space
    // while the backend backlinks endpoint is not yet available.
    useEffect(() => {
        if (!pageId) {
            setBacklinks([]);
            setMentions([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                let remote: PageRelation[] = [];
                try {
                    const relations = await service.relations.queryPageRelations({ pageId });
                    remote = relations.map((relation) => ({
                        ...relation,
                        sourceId: relation.sourceId != null ? String(relation.sourceId) : undefined,
                        sourcePageId: String(relation.sourcePageId),
                        sourceBlockId: relation.sourceBlockId != null ? String(relation.sourceBlockId) : null,
                        sourceSpaceId: relation.sourceSpaceId != null ? String(relation.sourceSpaceId) : undefined,
                        targetPageId: relation.targetPageId != null ? String(relation.targetPageId) : pageId,
                        targetBlockId: relation.targetBlockId != null ? String(relation.targetBlockId) : undefined,
                    }));
                } catch {
                    remote = [];
                }
                const links = remote.length
                    ? remote
                    : await getLocalPageBacklinks(currentSpaceId, pageId, service);
                if (cancelled) return;
                setBacklinks(links);
                // Mentions are always locally computed (backend has no index yet).
                const found = await getUnlinkedMentions(currentSpaceId, pageId, currentTitle, service);
                if (!cancelled) setMentions(found);
            } catch {
                if (!cancelled) {
                    setBacklinks([]);
                    setMentions([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [pageId, currentSpaceId, currentTitle, service, refreshTick]);

    const handleRefresh = useCallback(() => {
        invalidateBacklinkIndex();
        setRefreshTick((n) => n + 1);
    }, []);

    const handleViewGraph = useCallback(() => {
        if (!currentSpaceId || !pageId) return;
        navigator.go({ to: `/space-detail/${currentSpaceId}/graph?focus=${pageId}` });
    }, [navigator, currentSpaceId, pageId]);

    // Handle click to navigate to the source page (resolving cross-space targets).
    const handleClick = useCallback((link: PageRelation) => {
        const targetSpaceId = link.sourceSpaceId ?? currentSpaceId;
        if (!targetSpaceId) return;
        const suffix = link.sourceBlockId ? `?blockId=${link.sourceBlockId}` : '';
        navigator.go({
            to: `/space-detail/${targetSpaceId}/page/edit/${link.sourcePageId}${suffix}`
        });
    }, [navigator, currentSpaceId]);

    // Kinds actually present decide whether the filter chips are worth showing.
    const presentKinds = useMemo(() => {
        const kinds = new Set<FilterKind>();
        for (const link of backlinks) kinds.add(link.linkKind === 'EMBED' ? 'EMBED' : 'NORMAL');
        if (mentions.length) kinds.add('MENTION');
        return kinds;
    }, [backlinks, mentions]);

    const filteredBacklinks = useMemo(() => {
        if (filter === 'ALL') return backlinks;
        if (filter === 'MENTION') return [];
        return backlinks.filter((l) => (l.linkKind === 'EMBED' ? 'EMBED' : 'NORMAL') === filter);
    }, [backlinks, filter]);

    const showMentions = (filter === 'ALL' || filter === 'MENTION') && mentions.length > 0;
    const groups = useMemo(() => groupBySourcePage(filteredBacklinks), [filteredBacklinks]);

    if (loading) {
        return (
            <div className={cn("border-t mt-6 pt-4", className)}>
                <div className="flex items-center gap-2 mb-3 px-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{t('bidirectionalLink.backlinksTitle')}</span>
                </div>
                <LoadingSkeleton />
            </div>
        );
    }

    // Hide panel when there is nothing to show at all.
    if (backlinks.length === 0 && mentions.length === 0) {
        return <>{emptyFallback}</>;
    }

    const allChips: { kind: FilterKind; label: string }[] = [
        { kind: 'ALL', label: t('bidirectionalLink.filterAll') },
        { kind: 'NORMAL', label: t('bidirectionalLink.filterLinks') },
        { kind: 'MENTION', label: t('bidirectionalLink.filterMentions') },
        { kind: 'EMBED', label: t('bidirectionalLink.filterEmbeds') },
    ];
    const filterChips = allChips.filter((c) => c.kind === 'ALL' || presentKinds.has(c.kind));

    return (
        <div className={cn("border-t mt-6 pt-4", className)}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-2 px-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('bidirectionalLink.backlinksTitle')}</span>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {backlinks.length}
                </span>
                <div className="ml-auto flex items-center gap-0.5">
                    <button
                        type="button"
                        onClick={handleRefresh}
                        title={t('bidirectionalLink.refresh')}
                        aria-label={t('bidirectionalLink.refresh')}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                        <RefreshCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={handleViewGraph}
                        title={t('bidirectionalLink.viewGraph')}
                        aria-label={t('bidirectionalLink.viewGraph')}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                        <Waypoints className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Kind filter chips — only when more than one kind exists */}
            {presentKinds.size > 1 && (
                <div className="flex items-center gap-1 mb-2 px-2">
                    {filterChips.map((chip) => (
                        <button
                            key={chip.kind}
                            type="button"
                            onClick={() => setFilter(chip.kind)}
                            className={cn(
                                "px-2 py-0.5 rounded-full text-xs transition-colors",
                                filter === chip.kind
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Backlinks grouped by source page */}
            {groups.length > 0 && (
                <ScrollArea className="link-panel-scroll max-h-[300px]">
                    <div className="space-y-0.5">
                        {groups.map((group) => (
                            <SourcePageGroup
                                key={group.pageId}
                                pageTitle={group.pageTitle}
                                icon={group.icon}
                                items={group.items}
                                keyword={currentTitle}
                                blockBadge={t('bidirectionalLink.blockBadge')}
                                onItemClick={handleClick}
                            />
                        ))}
                    </div>
                </ScrollArea>
            )}

            {/* Unlinked mentions */}
            {showMentions && (
                <Collapsible defaultOpen className="mt-3">
                    <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                        <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{t('bidirectionalLink.unlinkedMentionsTitle')}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {mentions.length}
                        </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="ml-4 border-l border-border/60 pl-1 space-y-0.5 mt-0.5">
                            {mentions.map((mention, i) => (
                                <div key={`${mention.sourceId}-${i}`}>
                                    <div className="flex items-center gap-1.5 px-2 pt-1">
                                        {getIconText(mention.sourcePageIcon) ? (
                                            <span className="text-sm leading-none">{getIconText(mention.sourcePageIcon)}</span>
                                        ) : (
                                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                        <span className="text-sm font-medium truncate">{mention.sourcePageTitle || 'Untitled'}</span>
                                    </div>
                                    <BacklinkItem
                                        backlink={mention}
                                        keyword={currentTitle}
                                        blockBadge={t('bidirectionalLink.blockBadge')}
                                        onClick={() => handleClick(mention)}
                                    />
                                </div>
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    );
};
