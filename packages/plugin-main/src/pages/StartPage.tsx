import React from 'react'
import { Navigate, pinnedPageRoute, usePinnedPages } from '@kn/common'
import { Home } from './Home'

/**
 * What `/` renders: either the dashboard, or the page the user set as their
 * startup page.
 *
 * `/` is the address the window opens with, so it — not `/home` — is where the
 * redirect belongs. `/home` keeps rendering the dashboard, which is what leaves
 * the rail's Home entry usable once a startup page is set.
 *
 * The redirect target is the standalone page route (`/page/…`), so the app opens
 * on the *page*: no page tree, no tab strip, nothing from the workspace to read
 * around. Getting to the space from there is the breadcrumb's job.
 *
 * Nothing renders until the stored choice has been read: painting the dashboard
 * first and then replacing the history entry would flash (and fetch) the wrong
 * page on every launch. A host without the service never hydrates, so the
 * dashboard is the fallback there.
 */
export const StartPage: React.FC = () => {
    const { available, hydrated, home } = usePinnedPages()
    // Nothing until the stored choice is read: painting the dashboard first and
    // then replacing the history entry would flash (and fetch) the wrong page.
    if (available && !hydrated) return null
    if (home) return <Navigate to={pinnedPageRoute(home)} replace />
    return <Home />
}
