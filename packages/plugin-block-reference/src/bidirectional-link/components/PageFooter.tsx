/**
 * PageFooter Component
 *
 * Mounted once below the editor content (via the `pageFooter` ExtensionWrapper
 * slot). It does two jobs:
 *   1. Renders the BacklinksPanel for the current page.
 *   2. Listens for PAGE_LINK_CLICK events emitted by the PageLink ProseMirror
 *      plugin (which cannot use React hooks) and performs the navigation,
 *      resolving the target page's spaceId on demand.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageContext } from "@kn/editor";
import { useNavigator, event } from "@kn/common";
import { FileText } from "@kn/icon";
import { cn } from "@kn/ui";
import { BacklinksPanel } from "./BacklinksPanel";
import { useSpaceService } from "../../hooks";
import { useI18n } from "../../i18n/use-i18n";
import { PAGE_LINK_CLICK } from "../extensions/PageLink";

interface PendingLink {
    pageId: string;
    title: string;
    left: number;
    top: number;
}

export const PageFooter: React.FC<{ editor?: any }> = () => {
    const pageCtx = useContext(PageContext);
    const navigator = useNavigator();
    const spaceService = useSpaceService();
    const { t } = useI18n();
    const [pending, setPending] = useState<PendingLink | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Clicking a [[page link]] no longer navigates immediately. The PageLink PM
    // plugin emits the click target's position/title; we surface a small tooltip
    // and only navigate when the user clicks it (avoids accidental jumps).
    useEffect(() => {
        const handler = (payload: PendingLink) => {
            if (!payload?.pageId) return;
            setPending({
                pageId: payload.pageId,
                title: payload.title || '',
                left: payload.left,
                top: payload.top,
            });
        };

        event.on(PAGE_LINK_CLICK as any, handler);
        return () => { event.off(PAGE_LINK_CLICK as any, handler); };
    }, []);

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

    const handleJump = useCallback(async () => {
        if (!pending) return;
        const pageId = pending.pageId;

        // PageLink only stores pageId; resolve the real spaceId (cross-space safe).
        let spaceId = pageCtx.spaceId;
        try {
            const page = await spaceService.getPage(pageId);
            if (page?.spaceId) spaceId = String(page.spaceId);
        } catch {
            // Fall back to the current space if resolution fails.
        }

        if (spaceId) {
            navigator.go({ to: `/space-detail/${spaceId}/page/edit/${pageId}` });
        }
        setPending(null);
    }, [pending, pageCtx.spaceId, navigator, spaceService]);

    return (
        <>
            <BacklinksPanel className="px-4 pb-8" />
            {pending && createPortal(
                <div
                    ref={tooltipRef}
                    style={{ position: 'fixed', left: pending.left, top: pending.top, zIndex: 1000 }}
                    className={cn(
                        "rounded-md bg-primary text-primary-foreground shadow-md",
                        "animate-in fade-in-0 zoom-in-95"
                    )}
                >
                    <button
                        type="button"
                        onClick={handleJump}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs hover:underline cursor-pointer"
                    >
                        <FileText className="h-3 w-3 flex-shrink-0" />
                        {t('pageReference.jumpTo')}: {pending.title || t('pageReference.page')}
                    </button>
                </div>,
                document.body
            )}
        </>
    );
};

PageFooter.displayName = "PageFooter";
