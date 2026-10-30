/**
 * Session tasks — the "what did my agents leave open" index across every chat.
 *
 * The engine persists each conversation's latest `update_todos` snapshot
 * separately from its transcript (see docs/AGENT_SESSION_TASKS.md), so a task
 * list that was still open when the user left a conversation is recoverable
 * from anywhere. This panel is the frontend surface for that index: a header
 * icon carrying the open-task count, a grouped list in a popover on desktop /
 * a bottom sheet on mobile, and one-click jump back into the owning chat.
 *
 * Everything degrades silently: a backend that predates `/session-tasks`
 * answers 404, which only flips the panel into its "load failed + retry" state.
 * It never blocks the header. The count is fetched once on mount (so the badge
 * is useful before the panel is ever opened) and on open; a failed fetch is
 * never retried on run-status ticks — only an explicit open or retry refetches.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgentClient, useTranslation } from '@kn/common'
import type { AgentSessionTask } from '@kn/common'
import { AlertCircle, ArrowUpRight, Circle, ListChecks, Loader2, RefreshCw, X } from '@kn/icon'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
    ScrollArea,
    Sheet,
    SheetContent,
    SheetTitle,
    SheetTrigger,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    cn,
    useResponsive,
} from '@kn/ui'

const client = new AgentClient()

/**
 * Opening the panel reuses a list fetched this recently (e.g. by the
 * mount-time badge fetch) instead of spending a second request.
 */
const OPEN_FRESH_MS = 3_000

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SessionTaskGroup {
    sessionId: string
    sessionTitle: string
    tasks: AgentSessionTask[]
}

/**
 * Group the flat endpoint rows by session. The server already orders rows by
 * `update_time DESC`, so keeping first-seen group order puts the most recently
 * active conversation first without an extra sort.
 */
const groupSessionTasks = (tasks: AgentSessionTask[]): SessionTaskGroup[] => {
    const groups = new Map<string, SessionTaskGroup>()
    for (const task of tasks) {
        let group = groups.get(task.sessionId)
        if (!group) {
            group = {
                sessionId: task.sessionId,
                sessionTitle: task.sessionTitle,
                tasks: [],
            }
            groups.set(task.sessionId, group)
        }
        group.tasks.push(task)
    }
    const result = Array.from(groups.values())
    for (const group of result) {
        // `position` is the index inside the session's latest whole-list
        // snapshot. Rows without one keep the endpoint order.
        group.tasks.sort(
            (a, b) =>
                (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
        )
    }
    return result
}

// ─── One task row ──────────────────────────────────────────────────

const TaskRow: React.FC<{
    task: AgentSessionTask
    onOpen: (sessionId: string) => void
}> = ({ task, onOpen }) => {
    const { t } = useTranslation()
    const running = task.status === 'in_progress'
    const statusLabel = running
        ? t('ai.chat.tasks.inProgress', { defaultValue: '进行中' })
        : t('ai.chat.tasks.pending', { defaultValue: '未开始' })
    return (
        <button
            type="button"
            onClick={() => onOpen(task.sessionId)}
            title={task.title}
            aria-label={`${task.title} · ${statusLabel} · ${t('ai.chat.tasks.jump', {
                defaultValue: '打开所在会话',
            })}`}
            className="group/row flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
            {running ? (
                <Loader2
                    aria-label={statusLabel}
                    className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                />
            ) : (
                <Circle
                    aria-hidden
                    className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40"
                />
            )}
            <span className="line-clamp-2 min-w-0 flex-1 break-words text-xs leading-5 text-foreground/80">
                {task.title}
            </span>
            <ArrowUpRight
                aria-hidden
                className="mt-1 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-60"
            />
        </button>
    )
}

// ─── Shared body (popover + sheet) ─────────────────────────────────

interface SessionTasksContentProps {
    groups: SessionTaskGroup[]
    count: number
    /** At least one successful fetch happened, so `count` is meaningful. */
    loaded: boolean
    loading: boolean
    /** The most recent request failed (with `loaded`, the list is stale). */
    failed: boolean
    onRefresh: () => void
    onOpenSession: (sessionId: string) => void
    /** Mobile sheet shows its own close button; the popover has none. */
    onClose?: () => void
}

const SessionTasksContent: React.FC<SessionTasksContentProps> = ({
    groups,
    count,
    loaded,
    loading,
    failed,
    onRefresh,
    onOpenSession,
    onClose,
}) => {
    const { t } = useTranslation()
    // A long list gets a capped, scrollable box; a handful of rows keeps the
    // panel as short as its content.
    const scrollable = count > 6 || groups.length > 3

    return (
        <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2">
                <ListChecks aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {t('ai.chat.tasks.title', { defaultValue: '未完成任务' })}
                </span>
                {loaded && count > 0 && (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {t('ai.chat.tasks.badge', {
                            count,
                            defaultValue: '{{count}} 项未完成',
                        })}
                    </span>
                )}
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    aria-label={t('ai.chat.tasks.refresh', { defaultValue: '刷新' })}
                    title={t('ai.chat.tasks.refresh', { defaultValue: '刷新' })}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                    <RefreshCw
                        aria-hidden
                        className={cn(
                            'h-3 w-3',
                            loading && 'animate-spin motion-reduce:animate-none',
                        )}
                    />
                </button>
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('ai.chat.close')}
                        className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X aria-hidden className="h-3 w-3" />
                    </button>
                )}
            </div>

            {/* A failed refresh keeps the last good list, with a slim banner. */}
            {failed && loaded && (
                <div
                    role="alert"
                    className="flex items-center gap-1.5 border-b px-3 py-1.5 text-[11px] text-destructive"
                >
                    <AlertCircle aria-hidden className="h-3 w-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                        {t('ai.chat.tasks.loadFailed', { defaultValue: '未完成任务加载失败' })}
                    </span>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="shrink-0 rounded px-1 py-0.5 font-medium underline-offset-2 hover:underline"
                    >
                        {t('ai.chat.tasks.retry', { defaultValue: '重试' })}
                    </button>
                </div>
            )}

            {!loaded && loading && (
                <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-muted-foreground"
                >
                    <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    <span>{t('ai.chat.tasks.loading', { defaultValue: '正在加载任务…' })}</span>
                </div>
            )}

            {!loaded && !loading && failed && (
                <div role="alert" className="flex flex-col items-center gap-2 px-4 py-7 text-center">
                    <AlertCircle aria-hidden className="h-5 w-5 text-destructive/70" />
                    <p className="text-xs text-muted-foreground">
                        {t('ai.chat.tasks.loadFailed', { defaultValue: '未完成任务加载失败' })}
                    </p>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="rounded-md border px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                    >
                        {t('ai.chat.tasks.retry', { defaultValue: '重试' })}
                    </button>
                </div>
            )}

            {loaded && count === 0 && (
                <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                    <ListChecks aria-hidden className="h-5 w-5 text-muted-foreground/50" />
                    <p className="text-xs font-medium text-foreground/80">
                        {t('ai.chat.tasks.empty', { defaultValue: '没有未完成任务' })}
                    </p>
                    <p className="max-w-[260px] text-[11px] leading-snug text-muted-foreground">
                        {t('ai.chat.tasks.emptyHint', {
                            defaultValue: '智能体留下的未完成任务会汇总在这里，跨会话也能找回。',
                        })}
                    </p>
                </div>
            )}

            {count > 0 && (
                <ScrollArea
                    className={cn(
                        'w-full [&_[data-radix-scroll-area-viewport]>div]:!block',
                        scrollable && 'h-[min(48vh,320px)]',
                    )}
                >
                    <div className="pb-1">
                        {groups.map((group) => (
                            <div key={group.sessionId} className="pt-0.5">
                                <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-1.5">
                                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
                                        {group.sessionTitle ||
                                            t('ai.chat.tasks.untitledSession', {
                                                defaultValue: '未命名对话',
                                            })}
                                    </span>
                                    <span
                                        aria-hidden
                                        className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60"
                                    >
                                        {group.tasks.length}
                                    </span>
                                </div>
                                {group.tasks.map((task) => (
                                    <TaskRow
                                        key={task.taskId}
                                        task={task}
                                        onOpen={onOpenSession}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    )
}

// ─── Trigger + host ────────────────────────────────────────────────

export interface SessionTasksPanelProps {
    /** Jump back to the chat that owns the task list. */
    onOpenSession: (sessionId: string) => void
    /**
     * Changes when the open tabs' run state changes (e.g. `${id}:${status}`).
     * After the endpoint has answered successfully once, that is the cue to
     * refetch — a turn that just finished may have rewritten its snapshot.
     */
    refreshKey?: string
}

/**
 * Header entry point for the cross-session unfinished-task list.
 *
 * Lives inside {@link ChatHeader}, which both hosts (side dock and the /ai
 * page) render: desktop gets a right-aligned popover, mobile a bottom sheet;
 * the list body itself is shared.
 */
export const SessionTasksPanel: React.FC<SessionTasksPanelProps> = ({
    onOpenSession,
    refreshKey,
}) => {
    const { t } = useTranslation()
    const { isMobile } = useResponsive()

    const [open, setOpen] = useState(false)
    const [tasks, setTasks] = useState<AgentSessionTask[] | null>(null)
    const [status, setStatus] = useState<LoadStatus>('idle')
    // Only the newest request may commit; opening/closing quickly or a refresh
    // during a request would otherwise race.
    const requestSeqRef = useRef(0)
    const statusRef = useRef<LoadStatus>('idle')
    statusRef.current = status
    // Opening the panel right after a fetch should reuse it instead of
    // spending a second request.
    const inFlightRef = useRef(false)
    const lastLoadedAtRef = useRef(0)
    const didInitialLoadRef = useRef(false)

    const load = useCallback(async () => {
        const seq = requestSeqRef.current + 1
        requestSeqRef.current = seq
        inFlightRef.current = true
        setStatus('loading')
        try {
            const items = await client.listOpenSessionTasks()
            if (requestSeqRef.current !== seq) return
            lastLoadedAtRef.current = Date.now()
            setTasks(items)
            setStatus('ready')
        } catch {
            // Silent to the user until the panel is looked at: the count just
            // stays at its last known value.
            if (requestSeqRef.current !== seq) return
            setStatus('error')
        } finally {
            if (requestSeqRef.current === seq) inFlightRef.current = false
        }
    }, [])

    // One silent fetch on mount so the entry badge can show the count before
    // the panel is ever opened — without it the entry gives no hint at all.
    // A failure stays quiet (badge hidden, no auto-retry); `refreshKey` only
    // refetches once a load has succeeded, so a backend without
    // `/session-tasks` (404) is never hammered.
    useEffect(() => {
        if (didInitialLoadRef.current) return
        didInitialLoadRef.current = true
        void load()
    }, [load])

    // Opening the panel is the user asking for the current list — unless the
    // mount-time request is still in flight or completed a moment ago, in
    // which case its result is fresh enough to show as-is.
    useEffect(() => {
        if (!open) return
        if (inFlightRef.current) return
        if (
            statusRef.current === 'ready' &&
            Date.now() - lastLoadedAtRef.current < OPEN_FRESH_MS
        ) {
            return
        }
        void load()
    }, [open, load])

    // A tab starting/finishing a run may have rewritten its snapshot. Only
    // refetch after the endpoint has worked once: a backend without
    // `/session-tasks` (404) would otherwise be retried on every status tick;
    // there the panel waits for an explicit open or retry instead.
    useEffect(() => {
        if (!refreshKey) return
        if (statusRef.current !== 'ready') return
        void load()
    }, [refreshKey, load])

    const groups = useMemo(() => groupSessionTasks(tasks ?? []), [tasks])
    const count = tasks?.length ?? 0
    const loaded = tasks !== null
    const failed = status === 'error'
    const loading = status === 'loading'

    const handleOpenSession = useCallback(
        (sessionId: string) => {
            setOpen(false)
            onOpenSession(sessionId)
        },
        [onOpenSession],
    )

    const handleRefresh = useCallback(() => {
        void load()
    }, [load])

    const label = t('ai.chat.tasks.button', { defaultValue: '未完成任务' })
    const triggerAriaLabel =
        count > 0
            ? `${label} · ${t('ai.chat.tasks.badge', {
                  count,
                  defaultValue: '{{count}} 项未完成',
              })}`
            : label

    const trigger = (
        <button
            type="button"
            aria-label={triggerAriaLabel}
            className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60 data-[state=open]:text-foreground"
        >
            <ListChecks aria-hidden className="h-3.5 w-3.5" />
            {count > 0 && (
                <span
                    aria-hidden
                    className="absolute -right-1 -top-1 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground"
                >
                    {count > 99 ? '99+' : count}
                </span>
            )}
        </button>
    )

    const renderContent = (onClose?: () => void) => (
        <SessionTasksContent
            groups={groups}
            count={count}
            loaded={loaded}
            loading={loading}
            failed={failed}
            onRefresh={handleRefresh}
            onOpenSession={handleOpenSession}
            onClose={onClose}
        />
    )

    if (isMobile) {
        return (
            <TooltipProvider>
                <Sheet open={open} onOpenChange={setOpen}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <SheetTrigger asChild>{trigger}</SheetTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {label}
                        </TooltipContent>
                    </Tooltip>
                    <SheetContent
                        side="bottom"
                        hideClose
                        className="max-h-[80vh] rounded-t-2xl p-0 pb-safe-bottom"
                    >
                        <SheetTitle className="sr-only">
                            {t('ai.chat.tasks.title', { defaultValue: '未完成任务' })}
                        </SheetTitle>
                        <div
                            aria-hidden
                            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25"
                        />
                        {renderContent(() => setOpen(false))}
                    </SheetContent>
                </Sheet>
            </TooltipProvider>
        )
    }

    return (
        <TooltipProvider>
            <Popover open={open} onOpenChange={setOpen}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                        {label}
                    </TooltipContent>
                </Tooltip>
                <PopoverContent
                    align="end"
                    sideOffset={6}
                    className="w-[320px] max-w-[calc(100vw-2rem)] p-0"
                >
                    {renderContent()}
                </PopoverContent>
            </Popover>
        </TooltipProvider>
    )
}
