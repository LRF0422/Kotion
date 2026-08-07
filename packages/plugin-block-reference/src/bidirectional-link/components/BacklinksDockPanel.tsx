/**
 * Backlinks as a side-dock panel.
 *
 * The same component the page footer uses, re-hosted in the workspace dock via
 * the `dockPanels` contribution point — so installing/uninstalling this plugin
 * adds/removes the rail icon at runtime.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React from "react";
import { DockPanelConfig, DockPanelProps } from "@kn/common";
import { Link2 } from "@kn/icon";
import { ScrollArea } from "@kn/ui";
import { PageContext } from "@kn/editor";
import { BacklinksPanel } from "./BacklinksPanel";
import { useI18n } from "../../i18n/use-i18n";

const BacklinksDockPanel: React.FC<DockPanelProps> = ({ pageId, spaceId }) => {
    const { t } = useI18n();

    // BacklinksPanel reads the page from PageContext, which only exists inside
    // the editor subtree. The dock lives outside it, so supply the equivalent
    // from the dock context.
    const pageInfo = React.useMemo(() => ({ id: pageId, spaceId }), [pageId, spaceId]);

    return (
        <PageContext.Provider value={pageInfo}>
            <ScrollArea className="h-full">
                <BacklinksPanel
                    pageId={pageId}
                    // Strip the footer chrome (top rule + spacing) the inline
                    // placement needs; the dock supplies its own frame.
                    className="border-t-0 mt-0 pt-2 px-1 pb-4"
                    emptyFallback={
                        <div className="flex h-full items-center justify-center px-6 py-12 text-center text-xs text-muted-foreground">
                            {t("bidirectionalLink.noBacklinks")}
                        </div>
                    }
                />
            </ScrollArea>
        </PageContext.Provider>
    );
};

export const backlinksDockPanel: DockPanelConfig = {
    id: "backlinks",
    title: "dock.backlinks",
    icon: <Link2 className="h-4 w-4" />,
    order: 40,
    defaultWidth: 300,
    visible: (ctx) => !!ctx.pageId,
    component: BacklinksDockPanel,
};
