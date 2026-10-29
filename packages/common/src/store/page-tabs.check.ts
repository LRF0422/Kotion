/**
 * Page-tab reducer: the invariants the "current editing page" chain relies on.
 *
 * This is the only stateful piece between the URL and the editor, and the three
 * cases that have actually bitten are pinned here:
 *
 * 1. **Hydration must not eat a URL-activated page.** `PageRouteSync` runs in a
 *    child layout effect, so its `PAGE_TAB_ACTIVATE` lands *before* the space
 *    shell hydrates the persisted strip. If hydration replaced the strip
 *    wholesale, a deep link would open to a tab that is no longer there.
 * 2. **Closing the active tab has to pick a fallback the UI can mirror.** Both
 *    `TabbedEditorArea` and the reducer choose "most recently active remaining"
 *    — if they disagree, the tab strip and the editor point at different pages.
 * 3. **Spaces are isolated.** A page id may exist in two spaces; a bucket for
 *    one space must never see the other's tabs.
 */
import { store } from "./index";

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
};

const equal = (actual: unknown, expected: unknown, message: string): void => {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    if (left !== right) throw new Error(`${message} (expected ${right}, got ${left})`);
};

let seq = 0;
/** A space id per test case, so cases cannot see each other's buckets. */
const newSpace = () => `check-space-${++seq}`;

const dispatch = (type: string, payload: Record<string, unknown>) => store.dispatch({ type, payload });
const bucket = (spaceId: string) => store.getState().pageTabs?.bySpace?.[spaceId];
const ids = (spaceId: string) => bucket(spaceId)?.openPages.map(page => page.pageId) ?? [];

function checkActivate(): void {
    const spaceId = newSpace();
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "p1", lastActiveAt: 1 });
    equal(ids(spaceId), ["p1"], "activating an unseen page opens it");
    assert(bucket(spaceId)?.activePageId === "p1", "activating makes the page active");

    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "p2", lastActiveAt: 2 });
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "p1", lastActiveAt: 3 });
    equal(ids(spaceId), ["p1", "p2"], "re-activating keeps insertion order");
    assert(bucket(spaceId)?.activePageId === "p1", "the last activation wins");
    equal(
        bucket(spaceId)?.openPages.map(page => page.lastActiveAt),
        [3, 2],
        "activation refreshes lastActiveAt (the close fallback's input)",
    );
}

function checkOpenDoesNotActivate(): void {
    const spaceId = newSpace();
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "p1", lastActiveAt: 1 });
    dispatch("PAGE_TAB_OPEN", { spaceId, pageId: "p2", lastActiveAt: 2 });
    equal(ids(spaceId), ["p1", "p2"], "open adds the page to the strip");
    assert(bucket(spaceId)?.activePageId === "p1", "open must not steal the active tab");
}

function checkClose(): void {
    const spaceId = newSpace();
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "a", lastActiveAt: 1 });
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "b", lastActiveAt: 2 });
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "c", lastActiveAt: 3 });

    dispatch("PAGE_TAB_CLOSE", { spaceId, pageId: "b" });
    assert(bucket(spaceId)?.activePageId === "c", "closing an inactive tab keeps the active one");

    dispatch("PAGE_TAB_CLOSE", { spaceId, pageId: "c" });
    assert(bucket(spaceId)?.activePageId === "a", "closing the active tab falls back to the most recently active");
    equal(ids(spaceId), ["a"], "only the remaining tab is open");

    dispatch("PAGE_TAB_CLOSE", { spaceId, pageId: "a" });
    assert(bucket(spaceId)?.activePageId === undefined, "closing the last tab leaves no active page");
}

function checkCloseMany(): void {
    const spaceId = newSpace();
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "a", lastActiveAt: 1 });
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "b", lastActiveAt: 2 });
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "c", lastActiveAt: 3 });

    dispatch("PAGE_TAB_CLOSE_MANY", { spaceId, pageIds: ["b", "c"] });
    equal(ids(spaceId), ["a"], "batch close removes every named tab");
    assert(bucket(spaceId)?.activePageId === "a", "batch close of the active tab falls back");

    dispatch("PAGE_TAB_CLOSE_MANY", { spaceId, pageIds: ["a"] });
    assert(bucket(spaceId)?.activePageId === undefined, "batch-closing everything clears the active page");
}

function checkUpdateMeta(): void {
    const spaceId = newSpace();
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "p1", lastActiveAt: 1 });
    dispatch("PAGE_TAB_UPDATE_META", { spaceId, pageId: "p1", title: "Renamed", icon: "📄" });
    equal(
        [bucket(spaceId)?.openPages[0]?.title, bucket(spaceId)?.openPages[0]?.icon],
        ["Renamed", "📄"],
        "metadata updates reach the tab strip",
    );

    // A page that is not open must not be created by a metadata update: the
    // editor publishes metadata whenever a page loads, including from routes
    // that do not own a tab.
    dispatch("PAGE_TAB_UPDATE_META", { spaceId, pageId: "not-open", title: "Nope" });
    equal(ids(spaceId), ["p1"], "metadata for an unopened page does not open a tab");
}

function checkHydrationKeepsUrlPage(): void {
    const spaceId = newSpace();
    // What the child route layout effect does before the space shell hydrates.
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "url-page", lastActiveAt: 7 });
    dispatch("PAGE_TAB_UPDATE_META", { spaceId, pageId: "url-page", title: "Deep linked" });

    dispatch("PAGE_TABS_HYDRATE", {
        spaceId,
        openPages: [
            { pageId: "a", title: "A" },
            { pageId: "b", title: "B" },
            { pageId: "url-page", title: "Stale persisted title" },
        ],
    });

    equal(ids(spaceId), ["a", "b", "url-page"], "hydration restores the persisted order");
    assert(bucket(spaceId)?.activePageId === "url-page", "hydration preserves the URL-activated page");
    assert(bucket(spaceId)?.hydrated === true, "hydration is recorded once");
    equal(
        bucket(spaceId)?.openPages.find(page => page.pageId === "url-page")?.title,
        "Deep linked",
        "the in-memory title wins over the persisted one",
    );
}

function checkHydrationKeepsActiveOutsidePersisted(): void {
    const spaceId = newSpace();
    dispatch("PAGE_TAB_ACTIVATE", { spaceId, pageId: "url-page", lastActiveAt: 1 });
    dispatch("PAGE_TABS_HYDRATE", { spaceId, openPages: [{ pageId: "a" }, { pageId: "b" }] });
    equal(ids(spaceId), ["a", "b", "url-page"], "a URL page missing from storage is appended, not dropped");
    assert(bucket(spaceId)?.activePageId === "url-page", "the URL page stays active");
}

function checkSpaceIsolation(): void {
    const first = newSpace();
    const second = newSpace();
    dispatch("PAGE_TAB_ACTIVATE", { spaceId: first, pageId: "same-id", lastActiveAt: 1 });
    dispatch("PAGE_TAB_ACTIVATE", { spaceId: second, pageId: "other", lastActiveAt: 2 });
    equal(ids(first), ["same-id"], "a bucket only holds its own space's tabs");
    equal(ids(second), ["other"], "the second space is independent");
    assert(bucket(first)?.activePageId === "same-id", "active pages do not leak across spaces");
}

function run(): void {
    checkActivate();
    checkOpenDoesNotActivate();
    checkClose();
    checkCloseMany();
    checkUpdateMeta();
    checkHydrationKeepsUrlPage();
    checkHydrationKeepsActiveOutsidePersisted();
    checkSpaceIsolation();
    console.log("page-tabs reducer checks passed");
}

run();
