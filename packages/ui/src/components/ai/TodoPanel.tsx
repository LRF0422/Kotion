/**
 * Todo Panel — the run's task list, as maintained by the agent's `update_todos`.
 *
 * Rendered under an assistant turn: a collapsible checklist whose header reads
 * "To-dos · 5 completed" and whose rows move pending → in progress → done in
 * real time. Purely presentational — it owns nothing but the open/closed state,
 * so the same component serves the live run and the transcript replayed after a
 * refresh.
 */

import React, { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Circle, ListChecks, Loader2 } from '@kn/icon'
import { cn } from '../../lib/utils'

export interface TodoItemView {
    id: string
    title: string
    status: 'pending' | 'in_progress' | 'completed'
}

export interface TodoPanelLabels {
    /** Section title, e.g. "To-dos". */
    title?: string
    /** Header counter, e.g. "5 completed". */
    completed?: (done: number, total: number) => string
    /** Accessible label for the row that is currently running. */
    inProgress?: string
}

export interface TodoPanelProps {
    todos: TodoItemView[]
    /** Expand by default; collapse once the turn is done and read. */
    defaultOpen?: boolean
    labels?: TodoPanelLabels
    className?: string
}

export const TodoPanel: React.FC<TodoPanelProps> = ({
    todos,
    defaultOpen = true,
    labels,
    className,
}) => {
    const [open, setOpen] = useState(defaultOpen)

    const done = useMemo(() => todos.filter(todo => todo.status === 'completed').length, [todos])
    if (todos.length === 0) return null

    return (
        <div
            className={cn(
                'mt-3 overflow-hidden rounded-xl border border-border/50 bg-card/40',
                className,
            )}
        >
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted/40"
            >
                <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="shrink-0">{labels?.title ?? 'To-dos'}</span>
                <span className="shrink-0 text-muted-foreground">
                    · {labels?.completed
                        ? labels.completed(done, todos.length)
                        : `${done} completed`}
                </span>
                <ChevronDown
                    className={cn(
                        'ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                        open ? '' : '-rotate-90',
                    )}
                />
            </button>

            {open && (
                <ul className="space-y-0.5 px-1.5 pb-1.5">
                    {todos.map(todo => {
                        const completed = todo.status === 'completed'
                        const running = todo.status === 'in_progress'
                        return (
                            <li
                                key={todo.id}
                                className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-[12px] leading-5"
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
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
