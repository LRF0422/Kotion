import type { PageId, SpaceId } from "../domain/space-page";

/**
 * UI-only bridge for the active page and host navigation.
 *
 * Persistent Space/Page reads and mutations belong to SpacePageService. The
 * page surface currently on screen registers this bridge because current-page
 * selection and route navigation are application-shell concerns rather than
 * domain operations.
 *
 * ## Two audiences, one value
 *
 * - **Imperative readers** — agent tools resolve their default target at call
 *   time (`getPageNavigationBridge().getCurrentPage()`), so they always see the
 *   page that is current *right now*, not the one that was current when a
 *   component mounted.
 * - **React surfaces** — the AI panel / chat chip must re-render when the user
 *   navigates to another page. They read the observable snapshot through
 *   `useCurrentPage()` (see `use-current-page.ts`), which is why the module also
 *   keeps a cached, identity-stable snapshot and notifies subscribers.
 *
 * Ownership: exactly one page surface is visible at a time, and it publishes
 * while visible (`active` + route-cache active). Hidden/backgrounded surfaces
 * clear the bridge, so "current page" never means "a page the user cannot see".
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
    /**
     * Leave for a space's own route (its landing view).
     *
     * A space artifact is a container, not a document: it has no editor to embed
     * in the side pane, so handing the user over to the real space route is the
     * only meaningful "open". Optional, because a host that only knows pages is
     * still a valid host — the pane hides the action instead of rendering a
     * button that silently does nothing.
     */
    openSpace?: (spaceId: SpaceId) => Promise<void> | void;
}

let currentBridge: PageNavigationBridge | null = null;
/**
 * Cached snapshot of `currentBridge.getCurrentPage()`.
 *
 * `useSyncExternalStore` compares snapshots by identity: calling the bridge on
 * every read would return a fresh object and re-render forever. The snapshot is
 * therefore recomputed only when the bridge changes.
 */
let snapshot: CurrentPageContext | null = null;
const listeners = new Set<() => void>();

const refresh = (): void => {
    snapshot = currentBridge ? currentBridge.getCurrentPage() : null;
    for (const listener of [...listeners]) {
        try {
            listener();
        } catch {
            // One broken subscriber must not stop the others.
        }
    }
};

export const setPageNavigationBridge = (bridge: PageNavigationBridge): void => {
    if (currentBridge === bridge) return;
    currentBridge = bridge;
    refresh();
};

export const clearPageNavigationBridge = (bridge?: PageNavigationBridge): void => {
    if (bridge && currentBridge !== bridge) return;
    if (!currentBridge) return;
    currentBridge = null;
    refresh();
};

export const getPageNavigationBridge = (): PageNavigationBridge | null => currentBridge;

/** The stable snapshot React surfaces subscribe to (`null` = no page in view). */
export const getCurrentPageSnapshot = (): CurrentPageContext | null => snapshot;

/** Notified whenever the visible page (or its metadata) changes. */
export const subscribeCurrentPage = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
