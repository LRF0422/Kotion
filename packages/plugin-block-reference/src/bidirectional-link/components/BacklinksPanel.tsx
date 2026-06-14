/**
 * BacklinksPanel Component
 * Displays a list of pages/blocks that link to the current page.
 * 
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useState, useEffect, useCallback, useContext } from 'react';
import { cn, ScrollArea, Skeleton } from '@kn/ui';
import { Link2, FileText, SquareDashedBottom } from '@kn/icon';
import { useNavigator } from "@kn/common";
import { PageContext } from "@kn/editor";
import { getPageBacklinks } from '../services/linkService';
import { getLocalPageBacklinks } from '../services/localBacklinkIndex';
import { useSpaceService } from '../../hooks';
import type { BacklinkVO } from '../../types';

interface BacklinksPanelProps {
    /**
     * Page ID to fetch backlinks for. Falls back to the current PageContext when
     * omitted. Kept as string|number: page ids are 19-digit snowflakes that
     * exceed Number.MAX_SAFE_INTEGER, so they must NOT be coerced to Number.
     */
    pageId?: string | number;
    /** Optional className for styling */
    className?: string;
}

/** Backlink item component */
const BacklinkItem = React.memo<{
    backlink: BacklinkVO;
    onClick: () => void;
}>(({ backlink, onClick }) => (
    <div
        className={cn(
            "flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors",
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
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
            {backlink.sourcePageIcon ? (
                <span className="text-lg">{backlink.sourcePageIcon.icon}</span>
            ) : (
                <FileText className="h-5 w-5 text-muted-foreground" />
            )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">
                    {backlink.sourcePageTitle}
                </span>
                {backlink.sourceType === 'BLOCK' && (
                    <span className="flex items-center gap-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                        <SquareDashedBottom className="h-3 w-3" />
                        Block
                    </span>
                )}
            </div>
            {backlink.snippet && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {backlink.snippet}
                </p>
            )}
        </div>
    </div>
));
BacklinkItem.displayName = 'BacklinkItem';

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

/**
 * BacklinksPanel Component
 * 
 * Displays backlinks (references from other pages/blocks) to the current page.
 * Hidden when there are no backlinks.
 * 
 * @example
 * <BacklinksPanel pageId={123} />
 */
export const BacklinksPanel: React.FC<BacklinksPanelProps> = ({
    pageId: pageIdProp,
    className,
}) => {
    const pageCtx = useContext(PageContext);
    const spaceService = useSpaceService();
    // Keep the raw (string) id. Page ids are 19-digit snowflakes > 2^53, so
    // Number(id) corrupts the last digits — the backlinks request then 404s and
    // the global interceptor pops a "页面不存在" toast on every page open.
    const pageId = pageIdProp ?? pageCtx.id ?? undefined;
    const currentSpaceId = pageCtx.spaceId;

    const [backlinks, setBacklinks] = useState<BacklinkVO[]>([]);
    const [loading, setLoading] = useState(false);
    const navigator = useNavigator();

    // Fetch backlinks when the target page changes.
    // Prefer the backend index; fall back to a local scan of the current space
    // while the backend backlinks endpoint is not yet available.
    useEffect(() => {
        if (!pageId) {
            setBacklinks([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const remote = await getPageBacklinks(pageId);
                const result = remote.length
                    ? remote
                    : await getLocalPageBacklinks(currentSpaceId, pageId, spaceService);
                if (!cancelled) setBacklinks(result);
            } catch {
                if (!cancelled) setBacklinks([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [pageId, currentSpaceId, spaceService]);

    // Handle click to navigate to the source page (resolving cross-space targets).
    const handleClick = useCallback((link: BacklinkVO) => {
        const targetSpaceId = link.sourceSpaceId ?? currentSpaceId;
        if (!targetSpaceId) return;
        const suffix = link.sourceBlockId ? `?blockId=${link.sourceBlockId}` : '';
        navigator.go({
            to: `/space-detail/${targetSpaceId}/page/edit/${link.sourcePageId}${suffix}`
        });
    }, [navigator, currentSpaceId]);

    // Don't render if loading or no backlinks
    if (loading) {
        return (
            <div className={cn("border-t mt-6 pt-4", className)}>
                <div className="flex items-center gap-2 mb-3 px-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">反向链接</span>
                </div>
                <LoadingSkeleton />
            </div>
        );
    }

    // Hide panel when no backlinks
    if (backlinks.length === 0) {
        return null;
    }

    return (
        <div className={cn("border-t mt-6 pt-4", className)}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 px-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Backlinks</span>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {backlinks.length}
                </span>
            </div>

            {/* Backlinks list */}
            <ScrollArea className="max-h-[300px]">
                <div className="space-y-1">
                    {backlinks.map((backlink, index) => (
                        <BacklinkItem
                            key={`${backlink.sourceId}-${index}`}
                            backlink={backlink}
                            onClick={() => handleClick(backlink)}
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};
