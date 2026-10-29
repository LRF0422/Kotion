import { useCallback, useSyncExternalStore } from "react"
import type { RuntimeMenuItem } from "../core/runtime-menu"
import { useOptionalService } from "./use-service"

/** Shared empty snapshot: a fresh array would re-render on every read. */
const EMPTY: RuntimeMenuItem[] = []

const noopUnsubscribe = (): void => { }

/**
 * Rail entries contributed at runtime (`RuntimeMenuService`).
 *
 * Same reasoning as `usePluginMenus`: a memo over an imperative list shows
 * whatever was in it on the last unrelated render, and a `useState` +
 * `useEffect` subscription has a window between first paint and subscribing in
 * which a commit is lost for the rest of the session. Reading the registry's
 * own snapshot through `useSyncExternalStore` closes both holes — a pin added
 * while the rail is mounting still shows up.
 */
export function useRuntimeMenus(): RuntimeMenuItem[] {
    const service = useOptionalService("runtimeMenus")

    const subscribe = useCallback(
        (onChange: () => void) => (service ? service.subscribe(onChange) : noopUnsubscribe),
        [service],
    )
    const getSnapshot = useCallback(() => (service ? service.list() : EMPTY), [service])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
