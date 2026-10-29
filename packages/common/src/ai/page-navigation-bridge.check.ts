/**
 * The "which page is the user looking at" store behind `PageNavigationBridge`.
 *
 * Agent tools resolve their default target from this bridge at call time, and
 * UI surfaces (the agent panel, the chat's "current page" chip) subscribe to it.
 * Both must agree, and both must change exactly when the user navigates — this
 * check pins that contract without a DOM.
 */
import {
    clearPageNavigationBridge,
    getCurrentPageSnapshot,
    getPageNavigationBridge,
    setPageNavigationBridge,
    subscribeCurrentPage,
    type PageNavigationBridge,
} from "./page-navigation-bridge";

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
};

const equal = (actual: unknown, expected: unknown, message: string): void => {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    if (left !== right) throw new Error(`${message} (expected ${right}, got ${left})`);
};

const pageBridge = (pageId: string, title?: string): PageNavigationBridge => ({
    getCurrentPage: () => ({ pageId, spaceId: "space-1", title }),
    openPage: () => { },
});

const run = (): void => {
    // Nothing in view: a null snapshot, not a stale one.
    assert(getCurrentPageSnapshot() === null, "no page surface means no current page");
    assert(getPageNavigationBridge() === null, "the imperative getter agrees");

    let notifications = 0;
    const unsubscribe = subscribeCurrentPage(() => { notifications += 1; });

    const first = pageBridge("p1", "Page 1");
    setPageNavigationBridge(first);
    equal(getCurrentPageSnapshot(), { pageId: "p1", spaceId: "space-1", title: "Page 1" }, "publishing a page updates the snapshot");
    assert(getPageNavigationBridge() === first, "imperative readers see the same bridge");
    assert(notifications === 1, "subscribers are notified when the page changes");

    // Stable identity between commits: `useSyncExternalStore` compares by
    // reference, so a fresh object per read would re-render forever.
    const quiet = getCurrentPageSnapshot();
    assert(getCurrentPageSnapshot() === quiet, "the snapshot is cached between commits");

    // Re-registering the very same bridge is a no-op (an effect re-running for
    // unrelated reasons must not churn every subscriber).
    setPageNavigationBridge(first);
    assert(notifications === 1, "publishing the same bridge does not notify again");

    // A *different* bridge for the same page (title arrived late) does notify.
    setPageNavigationBridge(pageBridge("p1", "Renamed"));
    equal(getCurrentPageSnapshot()?.title, "Renamed", "late metadata replaces the snapshot");
    assert(notifications === 2, "metadata changes notify subscribers");

    // One surface leaving must not clear another's publication (ownership is by
    // identity, not by "clear whatever is there").
    const current = getPageNavigationBridge();
    const other = pageBridge("p2");
    clearPageNavigationBridge(other);
    assert(getPageNavigationBridge() === current, "a foreign bridge cannot clear the current one");

    clearPageNavigationBridge(current ?? undefined);
    assert(getCurrentPageSnapshot() === null, "leaving the page clears the current page");
    assert(getPageNavigationBridge() === null, "imperative readers see null after leaving");
    assert(notifications === 3, "clearing notifies subscribers");

    // `clear()` without an argument is the unconditional form used by hosts.
    setPageNavigationBridge(pageBridge("p3"));
    clearPageNavigationBridge();
    assert(getCurrentPageSnapshot() === null, "unconditional clear works without a handle");

    unsubscribe();
    const before = notifications;
    setPageNavigationBridge(pageBridge("p4"));
    assert(notifications === before, "unsubscribed listeners stop being notified");
    clearPageNavigationBridge();

    console.log("page navigation bridge checks passed");
};

run();
