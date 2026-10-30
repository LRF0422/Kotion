/**
 * useToolApproval — subscribe a surface to one call's pending tool approval.
 *
 * The registry (see `agent/tool-approval.ts`) is the single channel between the
 * executor's `requestApproval` and every card anywhere in the conversation, so
 * a surface does not need the state machine to show an approval: it only needs
 * the callId. `useSyncExternalStore` gives a tear-free read and, because the
 * registry returns referentially stable entries between changes, a card that
 * is not the one being decided never re-renders.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { toolApprovals } from '../agent/tool-approval'
import type { PendingToolApproval } from '../agent/tool-approval'

/**
 * Module-level so the subscribe identity never changes: a new function every
 * render would make `useSyncExternalStore` resubscribe on every commit.
 */
const subscribeToToolApprovals = (onStoreChange: () => void): (() => void) =>
    toolApprovals.subscribe(onStoreChange)

/** Server/prerender snapshot: there is no shared registry on the server. */
const getServerSnapshot = (): undefined => undefined

/**
 * The pending approval filed for `callId`, or undefined when there is none.
 * A missing callId is always undefined — an anonymous card has nothing to
 * decide, so it must not subscribe to anyone else's approval.
 */
export function useToolApproval(callId?: string | null): PendingToolApproval | undefined {
    const getSnapshot = useCallback(
        () => (callId ? toolApprovals.get(callId) : undefined),
        [callId],
    )
    return useSyncExternalStore(subscribeToToolApprovals, getSnapshot, getServerSnapshot)
}
