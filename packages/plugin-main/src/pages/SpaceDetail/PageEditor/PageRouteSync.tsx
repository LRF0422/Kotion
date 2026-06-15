import React, { useEffect } from "react"
import { useParams, usePageTabs } from "@kn/common"

/**
 * Mounted by the `/space-detail/:id/page/edit/:pageId` route. Its only job is
 * to translate the URL (the source of truth for the *active* tab) into Redux
 * page-tab state. The actual editor rendering is owned by `TabbedEditorArea`,
 * which keeps multiple editors alive via LRU — so this renders nothing.
 */
export const PageRouteSync: React.FC = () => {
    const params = useParams()
    const spaceId = params.id
    const pageId = params.pageId
    const { openTab, activateTab } = usePageTabs(spaceId)

    useEffect(() => {
        if (!spaceId || !pageId) return
        openTab(pageId)
        activateTab(pageId)
    }, [spaceId, pageId, openTab, activateTab])

    return null
}
