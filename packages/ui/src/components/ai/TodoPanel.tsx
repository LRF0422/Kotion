/**
 * Todo Panel — the run's task list, as maintained by the agent's `update_todos`.
 *
 * Rendered under an assistant turn: a collapsible checklist whose header reads
 * "To-dos · 5 completed" and whose rows move pending → in progress → done in
 * real time. A turn that ended with rows still open says so (`ended`) instead of
 * looking like a finished list. Purely presentational — it owns nothing but the
 * open/closed state, so the same component serves the live run and the
 * transcript replayed after a refresh.
 */

import React, { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, ListChecks, Loader2 } from '@kn/icon'
import { Task, TaskContent, TaskItem, TaskTrigger } from '../ai-elements/task'
import { cn } from '../../lib/utils'

export interface TodoItemView {
    id: string
    title: string
    status: 'pending' | 'in_progress' | 'completed'
}

export interface TodoPanelLabels {
    /** Section title, e.g. "To-dos". */
    title?: string
    /** Header counter, e.g. "5 completed" / "2/5 completed". */
    completed?: (done: number, total: number) => string
    /** Left-over badge, shown once the turn is over with rows still open. */
    unfinished?: (count: number) => string
    /** Accessible label for the row that is currently running. */
    inProgress?: string
}

export interface TodoPanelProps {
    todos: TodoItemView[]
    /** Expand by default; collapse once the turn is done and read. */
    defaultOpen?: boolean
    /**
     * The owning turn is over. With rows still open that is a real state the
     * user must see: the run stopped short, it did not finish the list.
     */
    ended?: boolean
    labels?: TodoPanelLabels
    className?: string
}

export const TodoPanel: React.FC<TodoPanelProps> = ({
    todos,
    defaultOpen = true,
    ended = false,
    labels,
    className,
}) => {
    const [open, setOpen] = useState(defaultOpen)

    const done = useMemo(() => todos.filter(todo => todo.status === 'completed').length, [todos])
    if (todos.length === 0) return null

    const remaining = todos.length - done
    const stoppedShort = ended && remaining > 0

    return (
        <Task
            open={open}
            onOpenChange={setOpen}
            className={cn(
                'mt-3 overflow-hidden rounded-xl border border-border/50 bg-card/40',
                className,
            )}
        >
            <TaskTrigger title={labels?.title ?? 'To-dos'}>
                <button
                    type="button"
                    aria-expanded={open}
                    className="flex min-h-8 w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted/40 lg:min-h-6"
                >
                    <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{labels?.title ?? 'To-dos'}</span>
                    <span
                        className={cn(
                            'shrink-0 text-muted-foreground',
                            stoppedShort && 'text-amber-600 dark:text-amber-500',
                        )}
                    >
                        · {labels?.completed
                            ? labels.completed(done, todos.length)
                            : `${done} completed`}
                    </span>
                    {stoppedShort && (
                        <span className="flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-px text-[11px] font-normal text-amber-600 dark:text-amber-500">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {labels?.unfinished?.(remaining) ?? `${remaining} unfinished`}
                        </span>
                    )}
                    <ChevronDown
                        className={cn(
                            'ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                            open ? '' : '-rotate-90',
                        )}
                    />
                </button>
            </TaskTrigger>

            <TaskContent className="mt-0 px-1.5 pb-1.5 [&>div]:mt-0 [&>div]:!border-0 [&>div]:!pl-0">
                {todos.map(todo => {
                    const completed = todo.status === 'completed'
                    const running = todo.status === 'in_progress'
                    return (
                        <TaskItem
                            key={todo.id}
                            className="flex items-start gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] leading-4"
                        >
                            {completed ? (
                                <CheckCircle2
                                    aria-hidden="true"
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
                                />
                            ) : running ? (
                                <Loader2
                                    aria-label={labels?.inProgress}
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                                />
                            ) : (
                                <Circle
                                    aria-hidden="true"
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40"
                                />
                            )}
                            <span
                                className={cn(
                                    'min-w-0 break-words',
                                    completed && 'text-muted-foreground line-through decoration-1',
                                    running && 'text-foreground',
                                    !completed && !running && 'text-foreground/70',
                                )}
                            >
                                {todo.title}
                            </span>
                        </TaskItem>
                    )
                })}
            </TaskContent>
        </Task>
    )
}
