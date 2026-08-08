/**
 * PageFooter Component
 *
 * Mounted once below the editor content (via the `pageFooter` ExtensionWrapper
 * slot). Listens for PAGE_LINK_CLICK events emitted by the PageLink ProseMirror
 * plugin (which cannot use React hooks) and performs the navigation, resolving
 * the target page's spaceId on demand.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigator, event } from "@kn/common";
import { FileText, FileX2 } from "@kn/icon";
import { cn } from "@kn/ui";
import { useSpaceService } from "../../hooks";
import { useI18n } from "../../i18n/use-i18n";
import { PAGE_LINK_CLICK } from "../extensions/PageLink";

interface PendingLink {
    pageId: string;
    title: string;
    left: number;
    top: number;
    /** True when the click should navigate immediately (Cmd/Ctrl or read-only). */
    direct?: boolean;
    /** Set when jump resolution found the target deleted. */
    broken?: boolean;
}

export const PageFooter: React.FC<{ editor?: any }> = () => {
    const navigator = useNavigator();
    const spaceService = useSpaceService();
    const { t } = useI18n();
    const [pending, setPending] = useState<PendingLink | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Resolve the target's spaceId and navigate. Legacy pageLink marks only
    // store the pageId, so a failed lookup means the target page was deleted —
    // in that case surface a "page deleted" tooltip instead of a dead jump.
    const jumpTo = useCallback(async (link: PendingLink) => {
        let spaceId: string | undefined;
        try {
            const page = await spaceService.getPage(link.pageId);
            if (page?.spaceId) spaceId = String(page.spaceId);
        } catch {
            // Resolution failed — treat the target as deleted.
        }
        if (!spaceId) {
            setPending({ ...link, broken: true });
            return;
        }
        setPending(null);
        navigator.go({ to: `/space-detail/${spaceId}/page/edit/${link.pageId}` });
    }, [navigator, spaceService]);

    // Clicking a legacy [[page link]] mark emits its position/title. A plain
    // click surfaces a confirmation tooltip; Cmd/Ctrl+Click or read-only clicks
    // set `direct` and navigate immediately.
    useEffect(() => {
        const handler = (payload: PendingLink) => {
            if (!payload?.pageId) return;
            const link: PendingLink = {
                pageId: payload.pageId,
                title: payload.title || '',
                left: payload.left,
                top: payload.top,
            };
            if (payload.direct) {
                jumpTo(link);
            } else {
                setPending(link);
            }
        };

        event.on(PAGE_LINK_CLICK as any, handler);
        return () => { event.off(PAGE_LINK_CLICK as any, handler); };
    }, [jumpTo]);

    // Dismiss the tooltip on outside click or Escape.
    useEffect(() => {
        if (!pending) return;
        const onPointerDown = (e: MouseEvent) => {
            if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
                setPending(null);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPending(null);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [pending]);

    const handleJump = useCallback(() => {
        if (!pending) return;
        jumpTo(pending);
    }, [pending, jumpTo]);

    return (
        <>
            {pending && createPortal(
                <div
                    ref={tooltipRef}
                    style={{ position: 'fixed', left: pending.left, top: pending.top, zIndex: 1000 }}
                    className={cn(
                        "rounded-md border border-border bg-popover text-popover-foreground shadow-md",
                        "animate-in fade-in-0 zoom-in-95"
                    )}
                >
                    {pending.broken ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
                            <FileX2 className="h-3 w-3 flex-shrink-0" />
                            {t('bidirectionalLink.pageDeleted')}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleJump}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary hover:underline cursor-pointer"
                        >
                            <FileText className="h-3 w-3 flex-shrink-0" />
                            {t('bidirectionalLink.jumpTo')}: {pending.title || t('bidirectionalLink.page')}
                        </button>
                    )}
                </div>,
                document.body
            )}
        </>
    );
};

PageFooter.displayName = "PageFooter";
