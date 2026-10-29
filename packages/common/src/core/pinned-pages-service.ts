/**
 * Pinned pages: state, persistence and the rail mirror — in the kernel.
 *
 * Why here and not in the shell: a pin is user state about a *page*
 * (`pageId` + `spaceId`) and nothing else. It has no opinion about what a rail
 * looks like, and both sides of the app need the same answer —
 * `plugin-main` to paint "固定到主菜单 / 设为主页", the shell rail to paint the
 * shortcuts. One implementation in `@kn/common` means the page surfaces never
 * re-implement the state, and a host cannot lose the user's pins by wiring a
 * piece of it wrong.
 *
 * Presentation is injected (`PinnedPagesPresentation`): the kernel owns *what*
 * is pinned and where it is stored; the host owns *how a row looks*. Nothing in
 * this file imports a component library.
 */
import { logger } from "../utils/logger"
import type { StorageService } from "../storage/types"
import {
    MAX_PINNED_PAGES,
    PINNED_HOME_KEY,
    PINNED_PAGES_KEY,
    PINNED_PAGES_NAMESPACE,
    hasPinnedPage,
    isSamePinnedPage,
    parsePinnedPage,
    parsePinnedPages,
    pinnedMenuKey,
    pinnedPageRoute,
    removePinnedPage,
    toPinnedPage,
    upsertPinnedPage,
    type PinnedPage,
    type PinnedPageInput,
    type PinnedPagesPresentation,
    type PinnedPagesService,
    type PinnedPagesSnapshot,
} from "./pinned-pages"
import type { RuntimeMenuService } from "./runtime-menu"

/** Owner of every `runtimeMenus` entry this feature publishes. */
export const PINNED_PAGES_MENU_OWNER = "pinned-pages"

export interface CreatePinnedPagesServiceOptions {
    /** Absent on hosts without durable storage: pins then live for one session. */
    storage?: StorageService
    /** Where the entries are published; the shell rail renders them. */
    menus?: RuntimeMenuService
    /** How a pinned page is drawn. May also be registered later. */
    presentation?: PinnedPagesPresentation
}

/**
 * Dependency-free rendering, used until (or instead of) the host's presentation.
 *
 * The title is the one that was stored with the pin, the glyph is the page's own
 * emoji when it is a plain emoji and the generic page glyph otherwise — an
 * `IMAGE`/`DATE` glyph is a resolved asset, not a string a kernel can draw.
 */
const FALLBACK_PRESENTATION: PinnedPagesPresentation = {
    title: (page) => page.title.trim() || "Untitled",
    icon: (page) => {
        const type = page.icon?.type
        if (page.icon && type !== "IMAGE" && type !== "DATE") return page.icon.icon
        return "📄"
    },
    menu: () => null,
}

/**
 * Build the pinned-page service.
 *
 * State lives in memory and is mirrored to `storage` best-effort: the rail has
 * to react to a pin *before* the write lands, and losing the write must not
 * make the button appear to do nothing. The durable copy is read once at
 * startup (`hydrate`), which is what makes pins survive a restart.
 */
export function createPinnedPagesService({
    storage,
    menus,
    presentation: initialPresentation,
}: CreatePinnedPagesServiceOptions): PinnedPagesService {
    let pages: PinnedPage[] = []
    let home: PinnedPage | null = null
    let hydrated = false
    /** Mutated before hydration finished: the live session wins over the stored copy. */
    let dirty = false
    /** A write failed (or storage is not durable): shortcuts won't survive a restart. */
    let writeFailed = false

    let presentation: PinnedPagesPresentation | null = initialPresentation ?? null
    const listeners = new Set<() => void>()
    let snapshot: PinnedPagesSnapshot = {
        pages,
        home,
        hydrated,
        persistent: isPersistent(),
    }
    let hydration: Promise<void> | null = null

    function isPersistent(): boolean {
        return !!storage?.durable && !writeFailed
    }

    const draw = (): PinnedPagesPresentation => presentation ?? FALLBACK_PRESENTATION

    /** Mirror the current set into the rail registry. */
    function publish(): void {
        if (!menus) return
        menus.clear(PINNED_PAGES_MENU_OWNER)
        const render = draw()
        for (const page of pages) {
            menus.register(PINNED_PAGES_MENU_OWNER, {
                key: pinnedMenuKey(page.pageId),
                id: pinnedPageRoute(page),
                name: render.title(page),
                icon: render.icon(page),
                contextMenu: render.menu(page),
            })
        }
    }

    function commit(): void {
        // The snapshot object is replaced only here, so `useSyncExternalStore`
        // sees a new value exactly when something changed.
        snapshot = {
            pages: pages.slice(),
            home,
            hydrated,
            persistent: isPersistent(),
        }
        for (const listener of [...listeners]) {
            try {
                listener()
            } catch {
                // One broken subscriber must not stop the others from rendering.
            }
        }
        publish()
    }

    async function persist(): Promise<void> {
        if (!storage || !storage.durable) {
            writeFailed = true
            return
        }
        try {
            await storage.set(PINNED_PAGES_NAMESPACE, PINNED_PAGES_KEY, pages)
            if (home) {
                await storage.set(PINNED_PAGES_NAMESPACE, PINNED_HOME_KEY, home)
            } else {
                await storage.delete(PINNED_PAGES_NAMESPACE, PINNED_HOME_KEY)
            }
            if (writeFailed) {
                writeFailed = false
                commit()
            }
        } catch (error) {
            logger.warn("pinnedPages: failed to persist shortcuts", error)
            if (!writeFailed) {
                writeFailed = true
                commit()
            }
        }
    }

    /** Optimistic mutation: render first, persist after. */
    function mutate(apply: () => void): Promise<void> {
        dirty = true
        apply()
        commit()
        return persist()
    }

    const service: PinnedPagesService = {
        snapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        isPinned: (pageId) => hasPinnedPage(pages, pageId),
        isHome: (pageId) => home?.pageId === pageId,

        async pin(input) {
            const page = toPinnedPage(input, new Date().toISOString())
            if (!page) return
            // `upsertPinnedPage` keeps an existing slot in place, so re-pinning
            // is really "refresh the cached title/icon" — including the copy the
            // startup page holds, or `/` would reopen the old title.
            await mutate(() => {
                const previousHome = home
                pages = upsertPinnedPage(pages, page)
                if (previousHome?.pageId === page.pageId) {
                    home = pages.find((candidate) => candidate.pageId === page.pageId) ?? previousHome
                }
            })
        },

        async unpin(pageId) {
            if (!hasPinnedPage(pages, pageId)) return
            await mutate(() => {
                pages = removePinnedPage(pages, pageId)
                if (home?.pageId === pageId) home = null
            })
        },

        async toggle(input) {
            const page = toPinnedPage(input, new Date().toISOString())
            if (!page) return false
            if (hasPinnedPage(pages, page.pageId)) {
                await service.unpin(page.pageId)
                return false
            }
            await mutate(() => {
                const previousHome = home
                pages = upsertPinnedPage(pages, page)
                if (previousHome?.pageId === page.pageId) {
                    home = pages.find((candidate) => candidate.pageId === page.pageId) ?? previousHome
                }
            })
            return true
        },

        async setHome(input) {
            if (!input) {
                if (!home) return
                await mutate(() => {
                    home = null
                })
                return
            }
            const page = toPinnedPage(input, new Date().toISOString())
            if (!page) return
            await mutate(() => {
                // The startup page is always a pinned page: setting it pins it,
                // which is also what keeps the choice visible and undoable.
                pages = upsertPinnedPage(pages, page)
                home = pages.find((candidate) => isSamePinnedPage(candidate, page)) ?? page
            })
        },

        async hydrate() {
            if (hydrated) return
            if (hydration) return hydration
            hydration = (async () => {
                try {
                    if (!storage) {
                        writeFailed = true
                    } else {
                        const entries = await storage.getMany(PINNED_PAGES_NAMESPACE, [
                            PINNED_PAGES_KEY,
                            PINNED_HOME_KEY,
                        ])
                        const stored = new Map(entries.map((entry) => [entry.key, entry.value]))
                        // A pin made while the read was in flight is newer than the
                        // stored copy; don't throw the user's action away.
                        if (!dirty) {
                            pages = parsePinnedPages(stored.get(PINNED_PAGES_KEY), MAX_PINNED_PAGES)
                            const storedHome = parsePinnedPage(stored.get(PINNED_HOME_KEY))
                            home = storedHome && hasPinnedPage(pages, storedHome.pageId)
                                ? pages.find((candidate) => candidate.pageId === storedHome.pageId) ?? storedHome
                                : null
                        }
                    }
                } catch (error) {
                    logger.warn("pinnedPages: failed to read stored shortcuts", error)
                    writeFailed = true
                } finally {
                    hydrated = true
                    commit()
                }
            })()
            return hydration
        },

        setPresentation(next) {
            presentation = next
            // The rail is drawn from the registry, not from the snapshot, so a
            // late presentation has to republish the entries.
            publish()
        },
    }

    return service
}
