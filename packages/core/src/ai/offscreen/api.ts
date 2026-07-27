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
    /** Incremental save — send only changed blocks instead of the full page */
    PATCH_PAGE_BLOCKS: {
        url: '/knowledge-wiki/space/page/:id/blocks',
        method: 'PATCH',
        name: 'Patch page blocks'
    } as API,
}
