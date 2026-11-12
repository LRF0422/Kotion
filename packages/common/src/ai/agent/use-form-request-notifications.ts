/**
 * Deliver filled forms back to the conversation.
 *
 * A form the user fills long after the tool call returned (the wait budget
 * expired, or the user opened the unified inbox from another conversation) has
 * no waiter left to resolve. The conversation still has to learn the answer —
 * otherwise "填好了版本号" is silently lost and the agent keeps thinking the user
 * never answered.
 *
 * This hook owns that delivery path, mirroring
 * `use-background-task-notifications.ts`:
 *
 *   - while a run is in flight (`busy`) the answer stays in the registry: the
 *     backend is parked in THINK/ACT and there is no channel to inject into;
 *   - once the run is idle, `takeUndelivered` claims it (exactly-once) and hands
 *     the note to the host, which turns it into a new turn.
 *
 * The session id is read fresh, never captured: a chat panel can switch
 * conversations without remounting, and claiming the previous session's answers
 * would put one conversation's data in another conversation's transcript.
 */

import { useCallback, useEffect, useRef } from 'react'
import {
    flushFormRequestNotes,
    formRequests,
    type FormRequestEvent,
    type FormRequestView,
} from './form-requests'

export interface UseFormRequestNotificationsOptions {
    /** Session the requests belong to; notes never cross conversations. */
    conversationId: string
    /**
     * Whether a run is mid-turn. Terminal-but-not-reset phases (`completed` /
     * `failed` / `cancelled`) count as busy: the host's own cleanup runs in that
     * same commit, and a turn started there would be aborted by its `reset()`.
     * Only `idle` is truly at rest.
     */
    busy: boolean
    /**
     * Live re-check at flush time, when the caller has state that a render-time
     * boolean cannot see (e.g. a start already in flight). Defaults to `busy`.
     */
    isBusy?: () => boolean
    /**
     * Hand the answers to the conversation. Called on the host's terms: it owns
     * the message list and may start a turn.
     */
    onNotify: (requests: FormRequestView[], note: string) => void
    /** Defaults to true. */
    enabled?: boolean
}

export function useFormRequestNotifications(options: UseFormRequestNotificationsOptions): void {
    const { conversationId, busy, enabled = true } = options
    const onNotifyRef = useRef(options.onNotify)
    onNotifyRef.current = options.onNotify
    const conversationRef = useRef(conversationId)
    conversationRef.current = conversationId
    const busyRef = useRef(busy)
    busyRef.current = busy
    const isBusyRef = useRef(options.isBusy)
    isBusyRef.current = options.isBusy

    /** Claim everything answered this conversation has not seen, and tell the host. */
    const flush = useCallback(() => {
        if (!enabled) return
        flushFormRequestNotes({
            conversationId: conversationRef.current,
            // Read live: the effect may have been created for another conversation,
            // or a run may have started since the last render.
            isBusy: () => (isBusyRef.current ? isBusyRef.current() : busyRef.current),
            onNotify: (requests, note) => onNotifyRef.current(requests, note),
        })
    }, [enabled])

    useEffect(() => {
        if (!enabled || !conversationId) return
        // An answer that landed while this surface was unmounted is still the
        // conversation's to deliver, so the first pass is not only for events.
        flush()
        return formRequests.on((event?: FormRequestEvent) => {
            if (event?.type !== 'answered') return
            if ((event.request.conversationId ?? null) !== (conversationRef.current ?? null)) return
            flush()
        })
    }, [conversationId, enabled, flush])

    // The run just went idle: this is the first moment a note can be injected.
    useEffect(() => {
        if (busy) return
        flush()
    }, [busy, conversationId, enabled, flush])
}

