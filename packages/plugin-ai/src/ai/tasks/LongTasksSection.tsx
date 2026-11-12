/**
 * Plugin-declared long tasks (`desktop.tasks` / `@kn/common` `runLongTask`).
 *
 * The board already lists the AGENT's background tasks (the renderer registry of
 * `background: true` tool calls). This section is the other half: tasks that a
 * PLUGIN registered on the host (`desktop.tasks.start`), which live in the main
 * process and therefore survive a page refresh.
 *
 * Why it belongs next to the agent board rather than inside each plugin: a long
 * task is exactly the thing the user wants to check while doing something else,
 * and the header entry is the one place that is always reachable. It also gives
 * plugin authors progress/log/cancel UI for free instead of every plugin
 * reinventing it.
 *
 * Reading model: `task.list` for the rows, `task.logsSince` for the incremental
 * log (cursor per row, never re-read the whole tail). Events would be more
 * efficient, but a 1s poll while the row is expanded keeps this component
 * self-contained and works identically for tasks owned by another window.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    monitorSourceKey,
    useOptionalService,
    useTaskMonitorEvents,
    useTranslation,
    type DesktopTaskLogEntry,
    type DesktopTaskSnapshot,
} from '@kn/common'
import {
    Ban,
    CheckCircle2,
    ChevronDown,
    Loader2,
    XCircle,
} from '@kn/icon'
import { cn, useAutoScroll } from '@kn/ui'

const DETAIL_MAX_CHARS = 1_200
const MAX_RENDERED_LINES = 200
const LOG_TAIL_KEEP = 400

const clip = (text: string, max = DETAIL_MAX_CHARS): string =>
    text.length > max ? `${text.slice(0, max)}…` : text

/** Human duration; deliberately local so the board's formatting stays unified. */
const formatDuration = (ms: number): string => {
    const safe = Math.max(0, ms)
    if (safe < 1_000) return `${safe}ms`
    if (safe < 60_000) return `${(safe / 1_000).toFixed(1)}s`
    if (safe < 3_600_000) {
        const seconds = Math.floor((safe % 60_000) / 1_000)
        return `${Math.floor(safe / 60_000)}m ${String(seconds).padStart(2, '0')}s`
    }
    return `${Math.floor(safe / 3_600_000)}h ${String(Math.floor((safe % 3_600_000) / 60_000)).padStart(2, '0')}m`
}

const isTerminal = (task: DesktopTaskSnapshot): boolean =>
    task.state === 'succeeded' || task.state === 'failed' || task.state === 'cancelled'

const StateIcon: React.FC<{ state: DesktopTaskSnapshot['state'] }> = ({ state }) => {
    if (state === 'running' || state === 'cancelling') {
        return (
            <Loader2
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
            />
        )
    }
    if (state === 'succeeded') {
        return <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
    }
    if (state === 'cancelled') {
        return <Ban aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    }
    return <XCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
}

const formatResult = (value: unknown): string => {
    if (typeof value === 'string') return clip(value)
    try {
        return clip(JSON.stringify(value, null, 2) ?? String(value))
    } catch {
        return clip(String(value))
    }
}

/** Incremental log tail for one task (one `logsSince` cursor per mounted row). */
const LongTaskLog: React.FC<{ taskId: string; live: boolean }> = ({ taskId, live }) => {
    const { t } = useTranslation()
    const desktop = useOptionalService('desktop')
    const [lines, setLines] = useState<DesktopTaskLogEntry[]>([])
    const [dropped, setDropped] = useState(0)
    const [missing, setMissing] = useState(false)
    const cursor = useRef(0)
    const session = useRef<string | null>(null)
    const { scrollRef } = useAutoScroll({ content: lines.length })

    useEffect(() => {
        const tasks = desktop?.tasks
        if (!tasks) return
        let alive = true
        const pull = async () => {
            try {
                const page = await tasks.logsSince({ taskId, sinceSeq: cursor.current, limit: 200 })
                if (!alive) return
                if (page.sessionId === null) {
                    setMissing(true)
                    return
                }
                // A new sessionId means a new run on the same id: reset the cursor.
                if (session.current && session.current !== page.sessionId) {
                    cursor.current = 0
                    setLines([])
                    setDropped(0)
                }
                session.current = page.sessionId
                cursor.current = page.nextSeq
                if (page.dropped > 0) setDropped(previous => previous + page.dropped)
                if (page.entries.length > 0) {
                    setLines(previous => [...previous, ...page.entries].slice(-LOG_TAIL_KEEP))
                }
            } catch {
                // Host going away (quit/reload): stop quietly, the task list will follow.
            }
        }
        void pull()
        const timer = live ? setInterval(() => { void pull() }, 1_000) : null
        return () => {
            alive = false
            if (timer) clearInterval(timer)
        }
    }, [desktop, taskId, live])

    const visible = lines.length > MAX_RENDERED_LINES
        ? lines.slice(lines.length - MAX_RENDERED_LINES)
        : lines

    if (missing) {
        return (
            <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                {t('ai.chat.backgroundTasks.longTaskGone', { defaultValue: '任务已不在宿主保留列表中。' })}
            </p>
        )
    }
    if (visible.length === 0) {
        return (
            <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                {t('ai.chat.backgroundTasks.longTaskNoLogs', { defaultValue: '暂无日志。' })}
            </p>
        )
    }
    return (
        <div
            ref={scrollRef}
            className="mt-1 max-h-36 overflow-auto rounded border bg-muted/40 px-1.5 py-1 font-mono text-[10px] leading-4"
        >
            {dropped > 0 && (
                <div className="mb-0.5 select-none text-[9px] text-muted-foreground/50">
                    {t('ai.chat.backgroundTasks.liveLogDropped', {
                        count: dropped,
                        defaultValue: '… 已丢弃 {{count}} 行 …',
                    })}
                </div>
            )}
            {visible.map(line => (
                <div
                    key={line.seq}
                    className={cn(
                        'whitespace-pre-wrap break-words',
                        line.level === 'error' && 'text-destructive',
                        line.level === 'warn' && 'text-amber-600 dark:text-amber-400',
                        line.level === 'info' && 'text-foreground/80',
                    )}
                >
                    {line.message}
                </div>
            ))}
        </div>
    )
}

const stateLabel = (state: DesktopTaskSnapshot['state']): string => {
    switch (state) {
        case 'running': return 'running'
        case 'cancelling': return 'cancelling'
        case 'succeeded': return 'succeeded'
        case 'failed': return 'failed'
        default: return 'cancelled'
    }
}

const LongTaskRow: React.FC<{
    task: DesktopTaskSnapshot
    now: number
    expanded: boolean
    onToggle: () => void
    onCancel: () => void
}> = ({ task, now, expanded, onToggle, onCancel }) => {
    const { t } = useTranslation()
    const percent = typeof task.progress.percent === 'number'
        ? Math.max(0, Math.min(100, Math.round(task.progress.percent)))
        : null
    const end = task.finishedAt ?? now
    const duration = formatDuration(end - task.createdAt)
    const title = task.title || task.id
    // The host auto-attaches a task monitor per running task; its `trigger`
    // events are the rule hits ("errors appeared"). A row that is not monitored
    // (or has nothing hit yet) shows no badge at all — never a "not watched" one.
    const monitorEvents = useTaskMonitorEvents(monitorSourceKey({ kind: 'task', taskId: task.id }))
    const alertCount = useMemo(
        () => monitorEvents.reduce((count, event) => (event.kind === 'trigger' ? count + 1 : count), 0),
        [monitorEvents],
    )

    return (
        <div className="group/row">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            >
                <StateIcon state={task.state} />
                <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium leading-5 text-foreground/90" title={title}>
                            {title}
                        </span>
                        {alertCount > 0 && (
                            <span
                                className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium tabular-nums text-amber-600 dark:text-amber-400"
                                title={t('ai.chat.backgroundTasks.longTaskAlertHint', {
                                    defaultValue: '监控规则命中（默认：错误日志）',
                                })}
                            >
                                {t('ai.chat.backgroundTasks.longTaskAlertBadge', {
                                    count: alertCount,
                                    defaultValue: '{{count}} 条告警',
                                })}
                            </span>
                        )}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
                        <span className="truncate">{task.kind}</span>
                        {percent !== null && (
                            <>
                                <span aria-hidden className="shrink-0 opacity-60">·</span>
                                <span className="tabular-nums">{percent}%</span>
                            </>
                        )}
                        <span aria-hidden className="shrink-0 opacity-60">·</span>
                        <span className="truncate">
                            {t(`ai.chat.backgroundTasks.longTaskStates.${stateLabel(task.state)}`, {
                                defaultValue: task.state,
                            })}
                        </span>
                    </span>
                    {task.progress.message && (
                        <span className="line-clamp-1 text-[11px] leading-4 text-foreground/70">
                            {clip(task.progress.message, 400)}
                        </span>
                    )}
                </span>
                <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
                    <span>{duration}</span>
                    <ChevronDown
                        aria-hidden
                        className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
                    />
                </span>
            </button>

            {expanded && (
                <div className="pb-2 pl-[30px] pr-3 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground/80">{task.id}</span>
                        {(task.state === 'running' || task.state === 'cancelling') && (
                            <button
                                type="button"
                                onClick={onCancel}
                                className="rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                            >
                                {t('ai.chat.backgroundTasks.longTaskCancel', { defaultValue: '请求取消' })}
                            </button>
                        )}
                    </div>

                    {task.error && (
                        <div className="mt-1.5">
                            <div className="mb-0.5 font-medium text-destructive">
                                {t('ai.chat.backgroundTasks.error', { defaultValue: '错误' })}
                            </div>
                            <div className="break-words text-muted-foreground">{clip(task.error)}</div>
                        </div>
                    )}

                    {task.result !== undefined && (
                        <div className="mt-1.5">
                            <div className="mb-0.5 font-medium text-muted-foreground">
                                {t('ai.chat.backgroundTasks.result', { defaultValue: '结果' })}
                            </div>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border bg-muted/40 p-1.5 text-[10px] leading-4 text-foreground/80">
                                {formatResult(task.result)}
                            </pre>
                        </div>
                    )}

                    <div className="mt-1.5">
                        <div className="mb-0.5 font-medium text-muted-foreground">
                            {t('ai.chat.backgroundTasks.longTaskLogs', { defaultValue: '日志' })}
                        </div>
                        <LongTaskLog taskId={task.id} live={!isTerminal(task)} />
                    </div>
                </div>
            )}
        </div>
    )
}

export interface LongTasksSectionProps {
    /** Snapshot rows from the board's single `useLongTasks` subscription. */
    tasks: DesktopTaskSnapshot[]
    loading?: boolean
    error?: string | null
    refresh: () => void
    /** Shared clock so durations tick together with the rest of the board. */
    now: number
    expandedId: string | null
    onToggle: (taskId: string) => void
}

/**
 * The plugin-task section of the board. Renders nothing when the host has no
 * `task.*` capability (web build / older desktop), so the board is unchanged
 * there.
 */
export const LongTasksSection: React.FC<LongTasksSectionProps> = ({
    tasks,
    loading = false,
    error = null,
    refresh,
    now,
    expandedId,
    onToggle,
}) => {
    const { t } = useTranslation()
    const desktop = useOptionalService('desktop')
    const hasBridge = Boolean(desktop?.tasks)
    const ordered = useMemo(() => {
        // Running first (oldest first), then terminal by recency — same reading
        // order as the rest of the board.
        const running = tasks
            .filter(task => !isTerminal(task))
            .sort((a, b) => a.createdAt - b.createdAt)
        const finished = tasks
            .filter(task => isTerminal(task))
            .sort((a, b) => (b.finishedAt ?? b.updatedAt) - (a.finishedAt ?? a.updatedAt))
        return [...running, ...finished]
    }, [tasks])

    const cancel = useCallback((taskId: string) => {
        void desktop?.tasks?.cancel({ taskId }).then(() => refresh()).catch(() => undefined)
    }, [desktop, refresh])

    if (!hasBridge) return null

    return (
        <div className="pb-1">
            <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
                    {t('ai.chat.backgroundTasks.longTasksSection', { defaultValue: '插件任务' })}
                </span>
                <span aria-hidden className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                    {ordered.length}
                </span>
            </div>
            {ordered.length === 0 ? (
                <p className="px-3 py-1 text-[10px] leading-snug text-muted-foreground/70">
                    {loading
                        ? t('ai.chat.backgroundTasks.longTaskLoading', { defaultValue: '加载中…' })
                        : error
                            ? t('ai.chat.backgroundTasks.longTaskLoadFailed', { defaultValue: '无法读取插件任务' })
                            : t('ai.chat.backgroundTasks.longTaskEmpty', {
                                defaultValue: '插件启动的长任务会出现在这里（刷新页面也不会丢）。',
                            })}
                </p>
            ) : (
                ordered.map(task => (
                    <LongTaskRow
                        key={`${task.id}:${task.sessionId}`}
                        task={task}
                        now={now}
                        expanded={expandedId === `long:${task.id}`}
                        onToggle={() => onToggle(`long:${task.id}`)}
                        onCancel={() => cancel(task.id)}
                    />
                ))
            )}
        </div>
    )
}