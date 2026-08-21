import { API } from "@kn/common"

/**
 * Backend endpoints used by the off-screen editing engine. URLs mirror the
 * ones plugin-main's PageEditor / space-service use — core can't import a
 * plugin, so the contracts are duplicated here.
 */
export const OFFSCREEN_APIS = {
    /** Page detail incl. content (same endpoint as spaceService.getPage). */
    GET_PAGE_CONTENT: {
        url: '/knowledge-wiki/space/page/:id/content',
        method: 'GET',
        name: 'Get page content'
    } as API,
    /** Search pages across all spaces (for the @-mention picker). */
    QUERY_PAGE: {
        url: '/knowledge-wiki/space/page/list',
        method: 'GET',
        name: 'Query Pages'
    } as API,
    /** Read the page's current document and rev straight from the block table. */
    PAGE_DOC: {
        url: '/knowledge-wiki/page/:id/doc',
        method: 'GET',
        name: 'Read page document'
    } as API,
    /** Submit a batch of ops. Accepted from the session host only. */
    PAGE_APPLY_OPS: {
        url: '/knowledge-wiki/page/:id/ops',
        method: 'POST',
        name: 'Apply page ops'
    } as API,
    /** Submit the whole document and let the server diff it. */
    PAGE_RECONCILE: {
        url: '/knowledge-wiki/page/:id/reconcile',
        method: 'POST',
        name: 'Reconcile page'
    } as API,
    /** Take the page's write lease, or learn who holds it. */
    PAGE_SESSION_CLAIM: {
        url: '/knowledge-wiki/page/:id/session/claim',
        method: 'POST',
        name: 'Claim page session'
    } as API,
    /** Renew the lease and pick up the rev watermark. */
    PAGE_SESSION_HEARTBEAT: {
        url: '/knowledge-wiki/page/:id/session/heartbeat',
        method: 'POST',
        name: 'Heartbeat page session'
    } as API,
    /** Hand the lease back on an orderly close. */
    PAGE_SESSION_RELEASE: {
        url: '/knowledge-wiki/page/:id/session',
        method: 'DELETE',
        name: 'Release page session'
    } as API,
}
