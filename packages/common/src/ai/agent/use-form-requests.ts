/**
 * React bindings for the form-request inbox.
 *
 * The registry is a module-level store, so surfaces read it through
 * `useSyncExternalStore` (the same pattern as the background-task board): a form
 * created in one conversation, or answered from the unified inbox, updates every
 * mounted card and badge in place with no per-surface plumbing.
 *
 * Filtering semantics mirror `useBackgroundTasks`:
 *  - no argument  → the WHOLE inbox (all conversations, what the header board shows);
 *  - `string`/`null` → only that conversation's requests (what a chat panel shows inline).
 */

import { useMemo, useSyncExternalStore } from 'react'
import {
    formRequests,
    sortFormRequests,
    type FormRequestView,
} from './form-requests'

/** Stable across renders: React resubscribes whenever this identity changes. */
const subscribe = (listener: () => void): (() => void) => formRequests.subscribe(listener)

const snapshotOf = (conversationId?: string | null): FormRequestView[] =>
    formRequests.listSnapshot(conversationId === undefined ? undefined : { conversationId })

/** Every request in the inbox (or one conversation's), pending first. */
export function useFormRequests(conversationId?: string | null): FormRequestView[] {
    const raw = useSyncExternalStore(
        subscribe,
        () => snapshotOf(conversationId),
        () => snapshotOf(conversationId),
    )
    return useMemo(() => sortFormRequests(raw), [raw])
}

/** One request by id, or undefined. Used by a card that follows its own form. */
export function useFormRequest(formId?: string | null): FormRequestView | undefined {
    const requests = useFormRequests()
    return useMemo(
        () => (formId ? requests.find(request => request.id === formId) : undefined),
        [requests, formId],
    )
}

/** Only what still needs the user: the inline cards and the header badge. */
export function usePendingFormRequests(conversationId?: string | null): FormRequestView[] {
    const requests = useFormRequests(conversationId)
    return useMemo(
        () => requests.filter(request => request.status === 'pending'),
        [requests],
    )
}