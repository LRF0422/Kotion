import { useEffect } from 'react'
import {
    clearPageNavigationBridge,
    setPageNavigationBridge,
    useNavigator,
    useRouteCacheActive,
    type PageNavigationBridge,
} from '@kn/common'

export interface PageContextInput {
    pageId?: string | number | null
    spaceId?: string | number | null
    title?: string
    parentId?: string | number | null
}

/**
 * Publish "the page the user is looking at" so the agent can act on it.
 *
 * This is the *page surface's* job, not the editor's: a page can be on screen
 * without a `PageEditor` (plugin page types such as bitable, a trashed-page
 * notice, a page still loading), and the agent must still know which page the
 * user means. It is deliberately gated on
 *
 * - `active` — an inactive keep-alive tab is not what the user is looking at;
 * - `useRouteCacheActive()` — the shell keeps visited routes mounted, and a
 *   backgrounded workspace must not claim the page while the user is on /home;
 * - changing to visibility again — a cached surface has to *re-publish* when it
 *   comes back, because another surface (a pinned `/page/...` view) cleared the
 *   global bridge in the meantime.
 *
 * Agent tools read the bridge imperatively at call time, so the target they
 * resolve is always the page that is current when the tool runs.
 */
export const usePublishPageContext = (page: PageContextInput | null, active = true): void => {
    const navigator = useNavigator()
    const routeCacheActive = useRouteCacheActive()

    const pageId = page?.pageId == null ? undefined : String(page.pageId)
    const spaceId = page?.spaceId == null ? undefined : String(page.spaceId)
    const title = page?.title
    const parentId = page?.parentId == null ? undefined : String(page.parentId)

    useEffect(() => {
        if (!active || !routeCacheActive || !pageId) return

        const bridge: PageNavigationBridge = {
            getCurrentPage: () => ({ pageId, spaceId, title, parentId }),
            openPage: (targetPageId, targetSpaceId) => {
                const target = targetSpaceId ?? spaceId
                if (!target) return
                navigator.go({ to: `/space-detail/${target}/page/edit/${targetPageId}` })
            },
            openSpace: (targetSpaceId) => {
                navigator.go({ to: `/space-detail/${targetSpaceId}` })
            },
        }

        setPageNavigationBridge(bridge)
        return () => clearPageNavigationBridge(bridge)
    }, [active, routeCacheActive, pageId, spaceId, title, parentId, navigator])
}
