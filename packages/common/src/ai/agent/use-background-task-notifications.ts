/**
 * Deliver finished background tasks back to the conversation.
 *
 * A long task started with `background: true` settles long after the tool call
 * that started it returned. If the agent waited for it (`getBackgroundTask`),
 * it already has the result and nothing should interrupt it. If it did not, the
 * conversation has to be told — otherwise "build it" silently finishes and the
 * agent never mentions it again.
 *
 * This hook owns that second path:
 *
 *   - while a run is in flight (`busy`), a completion is left in the registry:
 *     the backend is parked in THINK/ACT and there is no channel to inject into;
 *   - once the run is idle, the settlement is claimed
 *     ({@link BackgroundTaskRegistry.takeUndelivered}) and handed to `onNotify`,
 *     which is the host's chance to inject a note and start a turn.
 *
 * Claiming is what keeps it exactly-once: the registry marks the task delivered,
 * so a second surface (or the same one remounting) never announces it again.
 *
 * The session id is read fresh (never captured in a long-lived closure): a chat
 * panel can switch conversations without remounting, and claiming the previous
 * session's tasks would put one conversation's build result in another's
 * transcript.
 */

import { useCallback, useEffect, useRef } from 'react'
import { backgroundTasks, flushBackgroundTaskNotes, type BackgroundTaskView } from './background-tasks'

export interface UseBackgroundTaskNotificationsOptions {
    /** Session the tasks belong to; notifications never cross conversations. */
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
     * Hand the completion to the conversation. Called on the host's terms: it is
     * the host that owns the message list and may start a turn.
     */
    onNotify: (tasks: BackgroundTaskView[], note: string) => void
    /** Defaults to true. */
    enabled?: boolean
}

export function useBackgroundTaskNotifications(options: UseBackgroundTaskNotificationsOptions): void {
    const { conversationId, busy, enabled = true } = options
    const onNotifyRef = useRef(options.onNotify)
    onNotifyRef.current = options.onNotify
    const conversationRef = useRef(conversationId)
    conversationRef.current = conversationId
    const busyRef = useRef(busy)
    busyRef.current = busy
    const isBusyRef = useRef(options.isBusy)
    isBusyRef.current = options.isBusy

    /** Claim everything terminal this conversation has not seen, and tell the host. */
    const flush = useCallback(() => {
        if (!enabled) return
        flushBackgroundTaskNotes({
            conversationId: conversationRef.current,
            // Read live: the effect that calls this may have been created for
            // another conversation, or a run may have started since the last render.
            isBusy: () => (isBusyRef.current ? isBusyRef.current() : busyRef.current),
            onNotify: (tasks, note) => onNotifyRef.current(tasks, note),
        })
    }, [enabled])

    useEffect(() => {
        if (!enabled || !conversationId) return
        // A settlement that arrived while this surface was unmounted is still the
        // conversation's to deliver, so the first pass is not only for events.
        flush()
        return backgroundTasks.on(event => {
            if (event.type !== 'settled') return
            if ((event.task.conversationId ?? null) !== (conversationRef.current ?? null)) return
            flush()
        })
    }, [conversationId, enabled, flush])

    // The run just went idle: this is the first moment a note can be injected.
    useEffect(() => {
        if (busy) return
        flush()
    }, [busy, conversationId, enabled, flush])
}
