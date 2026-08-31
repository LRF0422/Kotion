import type { PageId, SpaceId } from "../domain/space-page";

/**
 * UI-only bridge for the active page and host navigation.
 *
 * Persistent Space/Page reads and mutations belong to SpacePageService. The
 * active editor registers this bridge because current-page selection and route
 * navigation are application-shell concerns rather than domain operations.
 */
export interface CurrentPageContext {
    pageId?: PageId;
    spaceId?: SpaceId;
    title?: string;
    parentId?: PageId;
}

export interface PageNavigationBridge {
    getCurrentPage: () => CurrentPageContext;
    openPage: (pageId: PageId, spaceId?: SpaceId) => Promise<void> | void;
}

let currentBridge: PageNavigationBridge | null = null;

export const setPageNavigationBridge = (bridge: PageNavigationBridge): void => {
    currentBridge = bridge;
};

export const clearPageNavigationBridge = (bridge?: PageNavigationBridge): void => {
    if (!bridge || currentBridge === bridge) {
        currentBridge = null;
    }
};

export const getPageNavigationBridge = (): PageNavigationBridge | null => currentBridge;
