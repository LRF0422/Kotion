import { useCallback, useSyncExternalStore } from "react"
import type { PinnedPage, PinnedPageInput, PinnedPagesSnapshot } from "../core/pinned-pages"
import { useOptionalService } from "./use-service"

/** Shared fallback state: a fresh object would re-render on every read. */
const EMPTY_SNAPSHOT: PinnedPagesSnapshot = Object.freeze({
    pages: Object.freeze([]) as unknown as PinnedPage[],
    home: null,
    hydrated: false,
    persistent: false,
})

const noopUnsubscribe = (): void => { }

/**
 * Pinned pages (`Services['pinnedPages']`) plus the actions that mutate them.
 *
 * The snapshot is cached by the service and only replaced on commit, which is
 * what lets `useSyncExternalStore` treat it as the store's state; building the
 * object here would return a new one on every read and re-render forever.
 *
 * Every action degrades to a no-op when the service is absent (a host without
 * the shortcuts feature, a check harness). Callers are UI surfaces: a disabled
 * button is not worth a thrown error at render time.
 */
export function usePinnedPages() {
    const service = useOptionalService("pinnedPages")

    const subscribe = useCallback(
        (onChange: () => void) => (service ? service.subscribe(onChange) : noopUnsubscribe),
        [service],
    )
    const getSnapshot = useCallback(
        () => (service ? service.snapshot() : EMPTY_SNAPSHOT),
        [service],
    )
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    const isPinned = useCallback((pageId: string) => service?.isPinned(pageId) ?? false, [service])
    const isHome = useCallback((pageId: string) => service?.isHome(pageId) ?? false, [service])
    const pin = useCallback(async (input: PinnedPageInput) => {
        await service?.pin(input)
    }, [service])
    const unpin = useCallback(async (pageId: string) => {
        await service?.unpin(pageId)
    }, [service])
    const toggle = useCallback(
        async (input: PinnedPageInput) => (service ? service.toggle(input) : false),
        [service],
    )
    const setHome = useCallback(async (page: PinnedPageInput | null) => {
        await service?.setHome(page)
    }, [service])

    return {
        /**
         * Whether the host actually registered the service. Surfaces use it to
         * hide the entry points (a page tree without a rail to pin to) instead
         * of offering buttons that silently do nothing.
         */
        available: !!service,
        isPinned,
        isHome,
        pin,
        unpin,
        toggle,
        setHome,
        pages: snapshot.pages,
        home: snapshot.home,
        hydrated: snapshot.hydrated,
        persistent: snapshot.persistent,
    }
}
