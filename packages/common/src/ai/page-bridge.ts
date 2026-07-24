/**
 * PageBridge — decouples page-level AI tools from the app shell.
 *
 * Page operations (search/create/open pages) live in the main app plugin
 * (spaceService + router), while the AI tools live in @kn/core. The bridge is
 * a tiny global registry — the page editor registers an implementation when a
 * page is open, and the tools read it at execution time. Mirrors the
 * tool-factory-registry pattern used for editor tools.
 */

export interface PageSummary {
    id: string
    title: string
    spaceId?: string
    spaceName?: string
}

export interface PageBridge {
    /** Info about the page currently open in the editor. */
    getCurrentPage: () => {
        pageId?: string
        spaceId?: string
        title?: string
        parentId?: string
    }
    /** Search pages across all spaces by keyword. */
    searchPages: (query?: string) => Promise<PageSummary[]>
    /** Create a page. When parentId is given the page becomes a sub-page. */
    createPage: (params: {
        spaceId: string
        title: string
        parentId?: string
    }) => Promise<{ id: string; title: string }>
    /** Navigate the app to the given page. */
    openPage: (pageId: string, spaceId?: string) => Promise<void> | void
}

let currentBridge: PageBridge | null = null

/** Register the active bridge (called by the page editor on mount). */
export const setPageBridge = (bridge: PageBridge): void => {
    currentBridge = bridge
}

/** Unregister the bridge (called by the page editor on unmount). */
export const clearPageBridge = (bridge?: PageBridge): void => {
    // Guard against an unmounting editor clearing a newer editor's bridge.
    if (!bridge || currentBridge === bridge) {
        currentBridge = null
    }
}

/** The active bridge, or null when no page is open. */
export const getPageBridge = (): PageBridge | null => currentBridge
