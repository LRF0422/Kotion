import React from 'react'
import { useParams } from '@kn/common'
import { PageHost } from './SpaceDetail/PageEditor/PageHost'

/**
 * One page, on its own: the view a pinned shortcut (and the startup page) opens.
 *
 * Deliberately *not* the workspace route with parts hidden. The workspace owns
 * things that only make sense while browsing a space — the page tree, tabs,
 * recent pages, the "open the space's home page" redirect — and every one of
 * them has to be suppressed separately if the page is rendered inside it. A
 * separate route renders the page and nothing else: no tree to hide, no tab
 * strip, no workspace redirects that could move the user off their own page.
 *
 * The page's own chrome still comes from `PageHost` (breadcrumb, share, star,
 * copy link, editor), and its breadcrumb leads into the space for anyone who
 * wants to browse from there.
 */
export const StandalonePage: React.FC = () => {
    const { spaceId, pageId } = useParams()
    if (!spaceId || !pageId) return null
    return (
        <div className="h-full w-full bg-background">
            <PageHost pageId={pageId} spaceId={spaceId} active />
        </div>
    )
}
