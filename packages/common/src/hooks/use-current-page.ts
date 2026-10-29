import { useSyncExternalStore } from "react"
import {
    getCurrentPageSnapshot,
    subscribeCurrentPage,
    type CurrentPageContext,
} from "../ai/page-navigation-bridge"

/**
 * The page the user is currently looking at (workspace tab, pinned/standalone
 * page, plugin page type), or `null` when no page is in view.
 *
 * This is the React-facing half of `PageNavigationBridge`: the bridge itself is
 * imperative so agent tools can read it at call time, while UI surfaces that
 * describe the target ("当前页面" chips, the agent panel) must re-render when the
 * user navigates. Reading the cached snapshot through `useSyncExternalStore`
 * closes both gaps.
 */
export function useCurrentPage(): CurrentPageContext | null {
    return useSyncExternalStore(subscribeCurrentPage, getCurrentPageSnapshot, getCurrentPageSnapshot)
}
