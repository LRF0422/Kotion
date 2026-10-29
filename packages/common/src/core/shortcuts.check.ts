/**
 * Pinned pages + the runtime-menu registry: the rules, the service, the rail.
 *
 * Two things are pinned here that a UI test could not say as cheaply:
 * (1) identity and order — a pin is a `pageId`, refresh keeps the slot, new pins
 * append and the cap trims from the front; (2) the *contract* the shell and
 * `plugin-main` both rely on — optimistic state, one durable read at startup,
 * `persistent=false` when a write cannot land, and rail entries that are
 * republished when the host registers its presentation.
 */
import {
    MAX_PINNED_PAGES,
    PINNED_HOME_KEY,
    PINNED_PAGES_KEY,
    PINNED_PAGES_NAMESPACE,
    hasPinnedPage,
    parsePinnedPages,
    pinnedMenuKey,
    pinnedPageRoute,
    removePinnedPage,
    toPinnedPage,
    upsertPinnedPage,
    type PinnedPage,
} from "./pinned-pages";
import { createPinnedPagesService, PINNED_PAGES_MENU_OWNER } from "./pinned-pages-service";
import { RuntimeMenuRegistry, type RuntimeMenuRejection } from "./runtime-menu";
import type { StorageService } from "../storage/types";

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
};

const equal = (actual: unknown, expected: unknown, message: string): void => {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    if (left !== right) throw new Error(`${message} (expected ${right}, got ${left})`);
};

// ---------------------------------------------------------------------------
// A storage double: enough of `StorageService` for the service, and a way to
// make writes fail (the "shortcut that cannot survive a restart" case).
// ---------------------------------------------------------------------------

class FakeStorage {
    engine = "memory" as const;
    durable: boolean;
    writes = 0;
    failWrites = false;
    private readonly data = new Map<string, unknown>();

    constructor(options: { durable?: boolean; seed?: Record<string, unknown> } = {}) {
        this.durable = options.durable ?? true;
        for (const [key, value] of Object.entries(options.seed ?? {})) {
            this.data.set(`${PINNED_PAGES_NAMESPACE}.${key}`, value);
        }
    }

    private entry(namespace: string, key: string): unknown {
        if (!this.data.has(`${namespace}.${key}`)) return null;
        return {
            namespace,
            key,
            value: this.data.get(`${namespace}.${key}`),
            rev: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        };
    }

    async get(namespace: string, key: string): Promise<unknown> {
        return this.entry(namespace, key);
    }

    async getMany(namespace: string, keys: string[]): Promise<unknown[]> {
        return keys.map((key) => this.entry(namespace, key)).filter(Boolean);
    }

    async set(namespace: string, key: string, value: unknown): Promise<unknown> {
        if (this.failWrites) throw new Error("disk full");
        this.writes += 1;
        this.data.set(`${namespace}.${key}`, value);
        return this.entry(namespace, key);
    }

    async delete(namespace: string, key: string): Promise<boolean> {
        return this.data.delete(`${namespace}.${key}`);
    }

    stored(key: string): unknown {
        return this.data.get(`${PINNED_PAGES_NAMESPACE}.${key}`);
    }
}

const asStorage = (fake: FakeStorage): StorageService => fake as unknown as StorageService;

const page = (id: string, spaceId = "space-1", title = id): PinnedPage => ({
    pageId: id,
    spaceId,
    title,
});

// ---------------------------------------------------------------------------
// 1. RuntimeMenuRegistry
// ---------------------------------------------------------------------------

function checkRuntimeMenuRegistry(): void {
    const rejections: Array<{ reason: RuntimeMenuRejection; owner: string; key: string }> = [];
    const registry = new RuntimeMenuRegistry((reason, owner, key) => rejections.push({ reason, owner, key }));

    let notifications = 0;
    const unsubscribe = registry.subscribe(() => { notifications += 1; });

    registry.register("pinned-pages", {
        key: pinnedMenuKey("p1"),
        id: pinnedPageRoute({ pageId: "p1", spaceId: "s1" }),
        name: "Page 1",
        icon: "1",
    });
    registry.register("pinned-pages", {
        key: pinnedMenuKey("p2"),
        id: pinnedPageRoute({ pageId: "p2", spaceId: "s1" }),
        name: "Page 2",
        icon: "2",
    });

    const first = registry.list();
    assert(registry.list() === first, "list() must return a stable snapshot between commits");
    equal(first.map((item) => item.key), ["pin:p1", "pin:p2"], "entries keep registration order");
    assert(first[0].owner === "pinned-pages", "the registry stamps the owner");

    // Re-registering the same (owner, key) replaces in place — a rename must not
    // reorder the rail.
    registry.register("pinned-pages", {
        key: pinnedMenuKey("p1"),
        id: pinnedPageRoute({ pageId: "p1", spaceId: "s1" }),
        name: "Renamed",
        icon: "1",
    });
    equal(
        registry.list().map((item) => [item.key, item.name]),
        [["pin:p1", "Renamed"], ["pin:p2", "Page 2"]],
        "re-registering keeps position and replaces the entry",
    );

    // Two owners, one key: the rail keys children by `key`, so the loser is
    // rejected instead of silently fighting the winner.
    registry.register("someone-else", {
        key: pinnedMenuKey("p1"),
        id: "/elsewhere",
        name: "Clash",
        icon: "x",
    });
    assert(rejections.some((entry) => entry.reason === "key-taken" && entry.owner === "someone-else"), "duplicate key must be rejected");
    equal(registry.list().length, 2, "a rejected registration must not appear");

    registry.register("", { key: "pin:x", id: "/x", name: "x", icon: "x" });
    assert(rejections.some((entry) => entry.reason === "missing-owner"), "owner is required");
    registry.register("pinned-pages", { key: "", id: "/x", name: "x", icon: "x" });
    assert(rejections.some((entry) => entry.reason === "missing-identity"), "key/id are required");

    // Ownership is actionable: one contributor cannot remove another's entry.
    const other = new RuntimeMenuRegistry();
    other.register("a", { key: "k", id: "/a", name: "A", icon: "a" });
    assert(!other.unregister("b", "k"), "another owner cannot unregister the entry");
    assert(other.unregister("a", "k"), "the owner can unregister its entry");
    equal(other.list().length, 0, "unregister removes the entry");

    other.register("a", { key: "k1", id: "/1", name: "1", icon: "1" });
    other.register("a", { key: "k2", id: "/2", name: "2", icon: "2" });
    other.register("b", { key: "k3", id: "/3", name: "3", icon: "3" });
    other.clear("a");
    equal(other.list().map((item) => item.owner), ["b"], "clear removes exactly one owner's entries");

    const before = notifications;
    unsubscribe();
    other.register("c", { key: "k4", id: "/4", name: "4", icon: "4" });
    assert(notifications === before, "unsubscribed listeners must stop being notified");
}

// ---------------------------------------------------------------------------
// 2. The pure rules
// ---------------------------------------------------------------------------

function checkPinnedPageRules(): void {
    assert(toPinnedPage({ pageId: "p", spaceId: "" }) === null, "a pin without a space has no route and must be dropped");
    assert(toPinnedPage({ pageId: "", spaceId: "s" }) === null, "a pin without a page id is meaningless");

    const normalized = toPinnedPage(
        { pageId: " p1 ", spaceId: " s1 ", title: "Title", icon: { type: "EMOJI", icon: "📄", junk: true } },
        "2026-01-01T00:00:00.000Z",
    );
    assert(normalized !== null, "a complete pin must normalize");
    equal(normalized, {
        pageId: "p1",
        spaceId: "s1",
        title: "Title",
        icon: { icon: "📄", type: "EMOJI" },
        pinnedAt: "2026-01-01T00:00:00.000Z",
    }, "identity is trimmed and unknown icon fields are dropped");

    assert(toPinnedPage({ pageId: "p", spaceId: "s", icon: "junk" })?.icon === undefined, "non-object icons are dropped");

    // Identity is the page id; title is display data.
    const pages = [page("p1"), page("p2")];
    assert(hasPinnedPage(pages, "p1") && !hasPinnedPage(pages, "p3"), "hasPinnedPage works by id");

    // Refresh keeps the slot and the original pinnedAt.
    const refreshed = upsertPinnedPage(
        [{ ...page("p1", "s1", "Old"), pinnedAt: "2026-01-01T00:00:00.000Z" }, page("p2")],
        { ...page("p1", "s1", "New"), pinnedAt: "2026-02-02T00:00:00.000Z" },
    );
    equal(refreshed.map((entry) => [entry.pageId, entry.title]), [["p1", "New"], ["p2", "p2"]], "refresh keeps the slot in place");
    assert(refreshed[0].pinnedAt === "2026-01-01T00:00:00.000Z", "refresh keeps when the page was first pinned");

    // New pins append; the cap trims from the front (oldest shortcuts are the
    // ones the user stopped needing).
    const appended = upsertPinnedPage([page("a"), page("b")], page("c"));
    equal(appended.map((entry) => entry.pageId), ["a", "b", "c"], "new pins append");
    const capped = upsertPinnedPage(
        Array.from({ length: MAX_PINNED_PAGES }, (_, index) => page(`p${index}`)),
        page("newest"),
    );
    assert(capped.length === MAX_PINNED_PAGES, `the rail holds at most ${MAX_PINNED_PAGES} entries`);
    assert(capped[capped.length - 1].pageId === "newest" && capped[0].pageId === "p1", "the cap drops the oldest entry");

    equal(removePinnedPage([page("a"), page("b")], "a").map((entry) => entry.pageId), ["b"], "unpin removes exactly one entry");

    // Persisted data is user-writable: parse defensively.
    equal(
        parsePinnedPages([
            { pageId: "a", spaceId: "s", title: "A" },
            { pageId: "a", spaceId: "s", title: "duplicate" },
            { pageId: "", spaceId: "s" },
            "junk",
            { pageId: "b", spaceId: "s", title: "B", icon: { icon: "📄" }, pinnedAt: "2026-01-01T00:00:00.000Z" },
        ]).map((entry) => [entry.pageId, entry.title]),
        [["a", "A"], ["b", "B"]],
        "parsePinnedPages drops junk and collapses duplicates (first wins)",
    );
    equal(parsePinnedPages("not an array"), [], "non-array storage data degrades to no pins");
    assert(parsePinnedPages(Array.from({ length: 20 }, (_, index) => page(`p${index}`))).length === MAX_PINNED_PAGES, "a larger stored list is re-capped");
}

// ---------------------------------------------------------------------------
// 3. The service: optimistic state, durability, rail publication
// ---------------------------------------------------------------------------

async function checkPinnedPagesService(): Promise<void> {
    const storage = new FakeStorage();
    const menus = new RuntimeMenuRegistry();
    let menuTitle = (target: PinnedPage) => target.title;

    const service = createPinnedPagesService({
        storage: asStorage(storage),
        menus,
        presentation: {
            title: (target) => menuTitle(target),
            icon: (target) => `icon:${target.pageId}`,
            menu: (target) => `menu:${target.pageId}`,
        },
    });

    // State starts empty; the rail is still consistent (no entries).
    assert(!service.snapshot().hydrated, "nothing is hydrated before hydrate() runs");
    assert(service.snapshot().persistent, "durable storage promises persistence up front");
    equal(menus.list().length, 0, "an empty set publishes no rail entries");

    const pinInput = { pageId: "p1", spaceId: "s1", title: "Page 1", icon: { type: "EMOJI", icon: "📄" } };

    // Optimistic: the snapshot and the rail change before the write settles.
    const pending = service.pin(pinInput);
    assert(service.isPinned("p1"), "pin applies in memory immediately");
    equal(service.snapshot().pages.map((entry) => entry.pageId), ["p1"], "the snapshot carries the new pin");
    assert(menus.list().length === 1, "the rail is notified optimistically");
    const railEntry = menus.list()[0];
    equal(
        {
            owner: railEntry.owner,
            key: railEntry.key,
            id: railEntry.id,
            name: railEntry.name,
            icon: railEntry.icon,
            contextMenu: railEntry.contextMenu,
        },
        {
            owner: PINNED_PAGES_MENU_OWNER,
            key: pinnedMenuKey("p1"),
            id: pinnedPageRoute({ pageId: "p1", spaceId: "s1" }),
            name: "Page 1",
            icon: "icon:p1",
            contextMenu: "menu:p1",
        },
        "the rail entry is built from the presentation",
    );
    await pending;
    equal(parsePinnedPages(storage.stored(PINNED_PAGES_KEY)).map((entry) => entry.pageId), ["p1"], "the pin is written to storage");

    // Snapshot identity is stable between commits and replaced by one.
    const quiet = service.snapshot();
    assert(service.snapshot() === quiet, "snapshot is cached until a commit");

    await service.pin({ pageId: "p2", spaceId: "s1", title: "Page 2" });
    assert(service.snapshot() !== quiet, "a commit replaces the snapshot object");
    equal(service.snapshot().pages.map((entry) => entry.pageId), ["p1", "p2"], "pins keep insertion order");

    // Toggle reports the resulting state.
    await service.unpin("p2");
    assert(await service.toggle({ pageId: "p2", spaceId: "s1" }), "toggle pins an absent page");
    assert(!(await service.toggle({ pageId: "p2", spaceId: "s1" })), "toggle unpins a present page");
    assert(!service.isPinned("p2"), "the toggled page is gone");
    assert(await service.toggle({ pageId: "p2", spaceId: "s1" }), "a second toggle pins it again");

    // The startup page is always pinned, and unpinning clears it.
    await service.setHome({ pageId: "p3", spaceId: "s1", title: "Page 3" });
    assert(service.isPinned("p3") && service.isHome("p3"), "setHome pins the page it opens");
    await service.unpin("p3");
    assert(!service.isHome("p3"), "unpinning the startup page clears it");
    await service.setHome(null);
    assert(service.snapshot().home === null, "setHome(null) clears the startup page");

    // Presentation can arrive after hydration: the rail must be republished.
    menuTitle = (target) => `«${target.title}»`;
    (service as unknown as { setPresentation: (value: unknown) => void }).setPresentation({
        title: menuTitle,
        icon: (target: PinnedPage) => `glyph:${target.pageId}`,
        menu: () => null,
    });
    equal(menus.list()[0]?.name, "«Page 1»", "a late presentation republishes the rail");
    equal(menus.list()[0]?.icon, "glyph:p1", "the rail uses the registered glyph");

    // Non-durable storage: the shortcuts work, but the service says so.
    const ephemeral = createPinnedPagesService({ storage: asStorage(new FakeStorage({ durable: false })) });
    await ephemeral.pin({ pageId: "e1", spaceId: "s1" });
    assert(ephemeral.isPinned("e1"), "an ephemeral pin still works for this session");
    assert(!ephemeral.snapshot().persistent, "non-durable storage reports persistent=false");

    // A failed write must not make the shortcut look saved.
    const failing = new FakeStorage();
    const failingService = createPinnedPagesService({ storage: asStorage(failing) });
    failing.failWrites = true;
    await failingService.pin({ pageId: "f1", spaceId: "s1" });
    assert(failingService.isPinned("f1"), "a failed write keeps the optimistic pin");
    assert(!failingService.snapshot().persistent, "a failed write flips persistent=false");

    // Hydration reads the durable copy exactly once.
    const seeded = new FakeStorage({
        seed: {
            [PINNED_PAGES_KEY]: [{ pageId: "a", spaceId: "s1", title: "A" }, { pageId: "b", spaceId: "s1", title: "B" }],
            [PINNED_HOME_KEY]: { pageId: "b", spaceId: "s1", title: "B" },
        },
    });
    const hydratedMenus = new RuntimeMenuRegistry();
    const restoring = createPinnedPagesService({ storage: asStorage(seeded), menus: hydratedMenus });
    await restoring.hydrate();
    await restoring.hydrate();
    assert(restoring.snapshot().hydrated, "hydrate marks the set as readable");
    equal(restoring.snapshot().pages.map((entry) => entry.pageId), ["a", "b"], "hydrate restores the stored order");
    assert(restoring.snapshot().home?.pageId === "b", "hydrate restores the startup page");
    equal(hydratedMenus.list().map((entry) => entry.key), ["pin:a", "pin:b"], "hydration publishes the restored rail");

    // A stored startup page that is no longer pinned is state the user cannot
    // see or undo — drop it rather than opening a hidden page.
    const staleHome = new FakeStorage({
        seed: {
            [PINNED_PAGES_KEY]: [{ pageId: "a", spaceId: "s1", title: "A" }],
            [PINNED_HOME_KEY]: { pageId: "gone", spaceId: "s1", title: "Gone" },
        },
    });
    const staleService = createPinnedPagesService({ storage: asStorage(staleHome) });
    await staleService.hydrate();
    assert(staleService.snapshot().home === null, "a startup page outside the pinned set is dropped");

    // Unpin / clear semantics survive a restart: the write reflects the removal.
    await restoring.unpin("a");
    equal(parsePinnedPages(seeded.stored(PINNED_PAGES_KEY)).map((entry) => entry.pageId), ["b"], "unpin rewrites the stored list");
}

async function run(): Promise<void> {
    checkRuntimeMenuRegistry();
    checkPinnedPageRules();
    await checkPinnedPagesService();
    console.log("pinned pages / runtime menu checks passed");
}

run().catch((error) => {
    console.error(error);
    throw error;
});
