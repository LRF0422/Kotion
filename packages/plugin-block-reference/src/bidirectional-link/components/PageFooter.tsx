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

import React, { useContext, useEffect } from "react";
import { PageContext } from "@kn/editor";
import { useNavigator, event } from "@kn/common";
import { BacklinksPanel } from "./BacklinksPanel";
import { useSpaceService } from "../../hooks";
import { PAGE_LINK_CLICK } from "../extensions/PageLink";

export const PageFooter: React.FC<{ editor?: any }> = () => {
    const pageCtx = useContext(PageContext);
    const navigator = useNavigator();
    const spaceService = useSpaceService();

    // Bridge [[page link]] clicks (emitted from the PageLink PM plugin) to navigation.
    useEffect(() => {
        const handler = async (payload: { pageId: string }) => {
            const pageId = payload?.pageId;
            if (!pageId) return;

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
        };

        event.on(PAGE_LINK_CLICK as any, handler);
        return () => { event.off(PAGE_LINK_CLICK as any, handler); };
    }, [pageCtx.spaceId, navigator, spaceService]);

    return <BacklinksPanel className="px-4 pb-8" />;
};

PageFooter.displayName = "PageFooter";
