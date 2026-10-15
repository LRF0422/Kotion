/**
 * React bindings for the background-task board.
 *
 * The board is a module-level store, so the UI reads it through
 * `useSyncExternalStore` (same pattern as the theme/style stores): a build that
 * finishes while the user is looking at the conversation updates the card and
 * the artifacts shelf in place, with no event plumbing per surface.
 *
 * A task is not just a status line — it carries the artifact it produces (see
 * `StartBackgroundTaskOptions.artifact`), which is how "the plugin I am
 * building" stays the conversation's working target while it is still building.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { backgroundTasks, type BackgroundTaskView } from './background-tasks'

/** Stable across renders: React resubscribes whenever this identity changes. */
const subscribe = (listener: () => void): (() => void) => backgroundTasks.subscribe(listener)

/**
 * Every task of one conversation (or the whole board when no id is passed),
 * oldest first, kept referentially stable between changes.
 */
export function useBackgroundTasks(conversationId?: string | null): BackgroundTaskView[] {
    return useSyncExternalStore(
        subscribe,
        () => backgroundTasks.listSnapshot(conversationId === undefined ? undefined : { conversationId }),
        () => backgroundTasks.listSnapshot(conversationId === undefined ? undefined : { conversationId }),
    )
}

/** One task by id, or undefined. Used by a conversation card to follow its build. */
export function useBackgroundTask(taskId?: string | null): BackgroundTaskView | undefined {
    const tasks = useBackgroundTasks()
    return useMemo(
        () => (taskId ? tasks.find(task => task.id === taskId) : undefined),
        [tasks, taskId],
    )
}
