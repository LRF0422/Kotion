/**
 * Background tasks — the board for work that outlives the tool call that started it.
 *
 * A long tool (`buildPluginProject`, `installPluginDependencies`, …) may answer
 * immediately with a handle and keep working in the process-wide task registry
 * (see docs/AGENT_BACKGROUND_TASKS.md). Before this panel existed the ONLY trace
 * of such a task was the tool call that started it — which scrolls away — plus a
 * completion note, which exists only after the task is already over. So while
 * the agent sat in `getBackgroundTask({ wait: true })` for up to five minutes,
 * the user had nowhere to look at *which* tasks were running, how they were
 * doing, or how to stop waiting on one.
 *
 * The entry lives in the chat header, which both hosts render (the side dock via
 * `Chat.tsx`, the `/ai` page via `KernelHomePage`), and is therefore available
 * from every chat surface. It subscribes to the registry itself, so progress and
 * completion update in place — no per-surface event plumbing.
 *
 * Two deliberate choices:
 *  - it lists the WHOLE board, not just the focused conversation: a task started
 *    in a tab that is no longer open is exactly the one the user is looking for;
 *  - "cancel" is labelled 不再等待 / "Stop waiting", never "cancel build": the
 *    host work is not interruptible (see the module docs of the registry).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    backgroundTasks,
    formatBackgroundTaskDuration,
    groupBackgroundTasks,
    taskMonitor,
    useBackgroundTasks,
    useLongTasks,
    useTaskMonitorLines,
    useTaskMonitorSubscriptions,
    useTranslation,
    type BackgroundTaskStatus,
    type BackgroundTaskView,
    type DesktopTaskSnapshot,
    type TaskMonitorSubscription,
} from '@kn/common'
import {
    Activity,
    ArrowUpRight,
    Ban,
    CheckCircle2,
    ChevronDown,
    Loader2,
    X,
    XCircle,
} from '@kn/icon'
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
import { formatToolName } from '../chat-types'
import type { ChatSessionMeta } from '../chat-sessions'
import { ensureTaskMonitorConfigured } from '../../tasks/task-monitor-host'
import { TaskLogSection } from '../../tasks/TaskLogSection'
import { LongTasksSection } from '../../tasks/LongTasksSection'

/**
 * Result/error preview cap. This is a board, not a log viewer: a build result can
 * be tens of kilobytes of module list, and the full payload stays available to
 * the agent through `getBackgroundTask`.
 */
const DETAIL_MAX_CHARS = 1_200

/** Boards wider than this get a capped, scrollable body instead of growing. */
const SCROLLABLE_TASK_COUNT = 6

const clipText = (text: string, max = DETAIL_MAX_CHARS): string =>
    text.length > max ? `${text.slice(0, max)}…` : text

/** A task result is arbitrary JSON; show it as readable text, bounded. */
const formatTaskValue = (value: unknown): string => {
    if (typeof value === 'string') return clipText(value)
    try {
        return clipText(JSON.stringify(value, null, 2) ?? String(value))
    } catch {
        return clipText(String(value))
    }
}

/**
 * Tools whose background work writes a dev-session build log (`dev.logsSince`).
 * Installs write no running output at all (their output only exists as the final
 * tool result), so a live-log section there would be a permanently empty box.
 */
const DEV_LOG_TOOLS: ReadonlySet<string> = new Set([
    'buildPluginProject',
    'runPluginProject',
    'publishPluginProject',
])

/** The project root a task's dev-session log belongs to (studio passes `meta.root`). */
const rootOfTask = (task: BackgroundTaskView): string | null => {
    const root = task.meta?.root
    return typeof root === 'string' && root ? root : null
}

/** Mirrors the tab status lights: spinner running, dot for done, red for failed. */
const TaskStatusIcon: React.FC<{ status: BackgroundTaskStatus }> = ({ status }) => {
    if (status === 'running') {
        return (
            <Loader2
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
            />
        )
    }
    if (status === 'succeeded') {
        return (
            <CheckCircle2
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
        )
    }
    if (status === 'failed') {
        return <XCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
    }
    return <Ban aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
}

// ─── One task row (collapsed line + expandable detail) ─────────────

interface TaskRowProps {
    task: BackgroundTaskView
    /** Human label for the conversation that owns the task. */
    conversationLabel: string
    /** True only when the host can actually open that conversation. */
    canOpenConversation: boolean
    expanded: boolean
    /** Shared "now" so every running row ticks together. */
    now: number
    statusLabel: (status: BackgroundTaskStatus) => string
    onToggle: () => void
    onOpenConversation: () => void
    onStopWaiting: () => void
}

const TaskRow: React.FC<TaskRowProps> = ({
    task,
    conversationLabel,
    canOpenConversation,
    expanded,
    now,
    statusLabel,
    onToggle,
    onOpenConversation,
    onStopWaiting,
}) => {
    const { t } = useTranslation()
    const status = statusLabel(task.status)
    const duration = formatBackgroundTaskDuration(task, now)
    const title = task.title || formatToolName(task.tool)

    return (
        <div className="group/row">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-label={`${title} · ${status} · ${duration}`}
                className="flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            >
                <TaskStatusIcon status={task.status} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium leading-5 text-foreground/90" title={title}>
                        {title}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
                        <span className="truncate">{formatToolName(task.tool)}</span>
                        <span aria-hidden className="shrink-0 opacity-60">·</span>
                        <span className="truncate" title={conversationLabel}>{conversationLabel}</span>
                    </span>
                    {task.progress && (
                        <span className="line-clamp-1 text-[11px] leading-4 text-foreground/70">
                            {clipText(task.progress, 400)}
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
                        {canOpenConversation && (
                            <button
                                type="button"
                                onClick={onOpenConversation}
                                className="flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium text-foreground/80 transition-colors hover:bg-muted"
                            >
                                <ArrowUpRight aria-hidden className="h-2.5 w-2.5" />
                                {t('ai.chat.backgroundTasks.openConversation', {
                                    defaultValue: '打开所在会话',
                                })}
                            </button>
                        )}
                        {task.status === 'running' && (
                            <button
                                type="button"
                                onClick={onStopWaiting}
                                className="rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                                title={t('ai.chat.backgroundTasks.stopWaitingHint', {
                                    defaultValue:
                                        '只停止等待，不会终止已在后台执行的构建 / 安装；迟到的结果会被丢弃。',
                                })}
                            >
                                {t('ai.chat.backgroundTasks.stopWaiting', {
                                    defaultValue: '不再等待',
                                })}
                            </button>
                        )}
                    </div>

                    {task.error && (
                        <div className="mt-1.5">
                            <div className="mb-0.5 font-medium text-destructive">
                                {task.status === 'cancelled'
                                    ? t('ai.chat.backgroundTasks.cancelReason', { defaultValue: '取消原因' })
                                    : t('ai.chat.backgroundTasks.error', { defaultValue: '错误' })}
                            </div>
                            <div className="break-words text-muted-foreground">
                                {clipText(task.error)}
                            </div>
                        </div>
                    )}

                    {task.status === 'succeeded' && task.result !== undefined && (
                        <div className="mt-1.5">
                            <div className="mb-0.5 font-medium text-muted-foreground">
                                {t('ai.chat.backgroundTasks.result', { defaultValue: '结果' })}
                            </div>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border bg-muted/40 p-1.5 text-[10px] leading-4 text-foreground/80">
                                {formatTaskValue(task.result)}
                            </pre>
                        </div>
                    )}

                    {/* Live build log (incremental, host-side). Never a chat message:
                        see docs/AGENT_TASK_MONITORING_DESIGN.md. */}
                    {DEV_LOG_TOOLS.has(task.tool) && rootOfTask(task) && (
                        <TaskLogSection
                            root={rootOfTask(task) as string}
                            label={task.title || formatToolName(task.tool)}
                            taskId={task.id}
                            running={task.status === 'running'}
                        />
                    )}
                </div>
            )}
        </div>
    )
}

/**
 * A monitor whose task is not on the board (already settled, or the board was
 * cleared by a page refresh while the dev session kept running). This is the row
 * that makes "I was watching that build" survive a refresh: the subscription is
 * persisted, the log itself lives in the host.
 */
const MonitorRow: React.FC<{
    monitor: TaskMonitorSubscription
    expanded: boolean
    onToggle: () => void
}> = ({ monitor, expanded, onToggle }) => {
    const { t } = useTranslation()
    const lines = useTaskMonitorLines(monitor.id)
    const label = monitor.label

    return (
        <div className="group/row">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            >
                <Loader2
                    aria-hidden
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium leading-5 text-foreground/90" title={label}>
                        {label}
                    </span>
                    <span className="block truncate font-mono text-[10px] leading-4 text-muted-foreground">
                        {monitor.source.kind === 'dev' ? monitor.source.root : monitor.label}
                    </span>
                </span>
                <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
                    <span>
                        {t('ai.chat.backgroundTasks.liveLogLines', {
                            count: lines.length,
                            defaultValue: '{{count}} 行',
                        })}
                    </span>
                    <ChevronDown
                        aria-hidden
                        className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
                    />
                </span>
            </button>

            {expanded && (
                <div className="pb-2 pl-[30px] pr-3 text-[11px]">
                    {/* Only a dev-root monitor has a dev-session log to show; a
                        task monitor's lines live in the plugin-task row. */}
                    {monitor.source.kind === 'dev' && (
                        <TaskLogSection root={monitor.source.root} label={label} />
                    )}
                    <button
                        type="button"
                        onClick={() => taskMonitor.stop(monitor.id)}
                        className="mt-1.5 rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                        {t('ai.chat.backgroundTasks.monitorsStop', { defaultValue: '停止监控' })}
                    </button>
                </div>
            )}
        </div>
    )
}

// ─── Shared body (popover + sheet) ─────────────────────────────────

interface LongTaskBoardState {
    tasks: DesktopTaskSnapshot[]
    loading: boolean
    error: string | null
    refresh: () => void
}

interface BackgroundTasksContentProps {
    running: BackgroundTaskView[]
    finished: BackgroundTaskView[]
    longTasks: LongTaskBoardState
    conversationOf: (task: BackgroundTaskView) => { label: string; openable: boolean; sessionId?: string }
    now: number
    expandedId: string | null
    onToggle: (taskId: string) => void
    onOpenConversation: (sessionId: string) => void
    /** Mobile sheet shows its own close button; the popover has none. */
    onClose?: () => void
}

const BackgroundTasksContent: React.FC<BackgroundTasksContentProps> = ({
    running,
    finished,
    longTasks,
    conversationOf,
    now,
    expandedId,
    onToggle,
    onOpenConversation,
    onClose,
}) => {
    const { t } = useTranslation()
    // Monitors outlive the registry (they are keyed by source: a dev root or a
    // plugin task), so a page refresh can leave a running watch with no task row
    // to attach it to. Wiring is idempotent and lazily started here: closed
    // panel = no polling at all.
    useEffect(() => {
        ensureTaskMonitorConfigured()
    }, [])
    const monitors = useTaskMonitorSubscriptions()
    const taskRoots = useMemo(() => {
        const roots = new Set<string>()
        for (const task of [...running, ...finished]) {
            const root = rootOfTask(task)
            if (root) roots.add(root)
        }
        return roots
    }, [running, finished])
    // A monitor is only "orphan" when nothing else on the board already shows its
    // task: dev monitors attach to a build row, task monitors to the plugin-task
    // list. Showing both would duplicate the same work twice in one panel.
    const longTaskIds = useMemo(
        () => new Set(longTasks.tasks.map(task => task.id)),
        [longTasks.tasks],
    )
    const orphanMonitors = useMemo(
        () => monitors.filter(monitor => monitor.status === 'running'
            && (monitor.source.kind === 'dev'
                ? !taskRoots.has(monitor.source.root)
                : !longTaskIds.has(monitor.source.taskId))),
        [monitors, taskRoots, longTaskIds],
    )
    const count = running.length + finished.length + orphanMonitors.length + longTasks.tasks.length
    const scrollable = count > SCROLLABLE_TASK_COUNT

    const statusLabel = useCallback(
        (status: BackgroundTaskStatus): string =>
            t(`ai.chat.backgroundTasks.status.${status}`, {
                defaultValue:
                    status === 'running'
                        ? '进行中'
                        : status === 'succeeded'
                            ? '已完成'
                            : status === 'failed'
                                ? '失败'
                                : '已取消',
            }),
        [t],
    )

    const renderRows = (tasks: BackgroundTaskView[]) =>
        tasks.map(task => {
            const conversation = conversationOf(task)
            return (
                <TaskRow
                    key={task.id}
                    task={task}
                    conversationLabel={conversation.label}
                    canOpenConversation={conversation.openable && Boolean(conversation.sessionId)}
                    now={now}
                    statusLabel={statusLabel}
                    expanded={expandedId === task.id}
                    onToggle={() => onToggle(task.id)}
                    onOpenConversation={() => {
                        if (conversation.sessionId) onOpenConversation(conversation.sessionId)
                    }}
                    onStopWaiting={() => backgroundTasks.cancel(task.id)}
                />
            )
        })

    const sectionHeader = (label: string, sectionCount: number) => (
        <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
                {label}
            </span>
            <span aria-hidden className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                {sectionCount}
            </span>
        </div>
    )

    return (
        <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2">
                <Activity aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {t('ai.chat.backgroundTasks.title', { defaultValue: '后台任务' })}
                </span>
                {running.length > 0 && (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {t('ai.chat.backgroundTasks.runningBadge', {
                            count: running.length,
                            defaultValue: '{{count}} 个进行中',
                        })}
                    </span>
                )}
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

            {count === 0 ? (
                <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                    <Activity aria-hidden className="h-5 w-5 text-muted-foreground/50" />
                    <p className="text-xs font-medium text-foreground/80">
                        {t('ai.chat.backgroundTasks.empty', { defaultValue: '没有后台任务' })}
                    </p>
                    <p className="max-w-[260px] text-[11px] leading-snug text-muted-foreground">
                        {t('ai.chat.backgroundTasks.emptyHint', {
                            defaultValue:
                                '构建、装依赖、发布这类长工具会在后台执行，进行中和最近完成的任务都会列在这里。',
                        })}
                    </p>
                </div>
            ) : (
                <ScrollArea
                    className={cn(
                        'w-full [&_[data-radix-scroll-area-viewport]>div]:!block',
                        scrollable && 'h-[min(48vh,320px)]',
                    )}
                >
                    <div className="pb-1">
                        <LongTasksSection
                            tasks={longTasks.tasks}
                            loading={longTasks.loading}
                            error={longTasks.error}
                            refresh={longTasks.refresh}
                            now={now}
                            expandedId={expandedId}
                            onToggle={onToggle}
                        />
                        {orphanMonitors.length > 0 && (
                            <>
                                {sectionHeader(
                                    t('ai.chat.backgroundTasks.monitorsSection', { defaultValue: '监控中' }),
                                    orphanMonitors.length,
                                )}
                                {orphanMonitors.map(monitor => (
                                    <MonitorRow
                                        key={monitor.id}
                                        monitor={monitor}
                                        expanded={expandedId === monitor.id}
                                        onToggle={() => onToggle(monitor.id)}
                                    />
                                ))}
                            </>
                        )}
                        {running.length > 0 && (
                            <>
                                {sectionHeader(
                                    t('ai.chat.backgroundTasks.runningSection', { defaultValue: '进行中' }),
                                    running.length,
                                )}
                                {renderRows(running)}
                            </>
                        )}
                        {finished.length > 0 && (
                            <>
                                {sectionHeader(
                                    t('ai.chat.backgroundTasks.finishedSection', { defaultValue: '已结束' }),
                                    finished.length,
                                )}
                                {renderRows(finished)}
                            </>
                        )}
                    </div>
                </ScrollArea>
            )}

            {/* Honest about the registry's scope: in-memory, per page session, so
                a refresh empties the board (the host's own dev status remains). */}
            <div className="border-t px-3 py-1.5 text-[10px] leading-snug text-muted-foreground/80">
                {t('ai.chat.backgroundTasks.footer', {
                    defaultValue:
                        '只显示本页面会话中的后台任务，刷新页面后列表清空；进行中的构建仍可在开发台查看。',
                })}
            </div>
        </div>
    )
}

// ─── Trigger + host ────────────────────────────────────────────────

export interface BackgroundTasksPanelProps {
    /** Conversations known to the host: labels the rows and resolves jumps. */
    sessions: ChatSessionMeta[]
    /** Open the conversation that owns a task (its tab, or a new one). */
    onOpenSession: (sessionId: string) => void
}

/**
 * Header entry point for the background-task board (see the file header).
 *
 * Mirrors {@link SessionTasksPanel}: a desktop popover, a mobile bottom sheet,
 * one shared body. Unlike that panel it needs no fetch — the registry it reads
 * lives in this JS context and notifies through `useSyncExternalStore`.
 */
export const BackgroundTasksPanel: React.FC<BackgroundTasksPanelProps> = ({
    sessions,
    onOpenSession,
}) => {
    const { t } = useTranslation()
    const { isMobile } = useResponsive()
    const [open, setOpen] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    // Undefined = the whole board. A background task not tied to the focused
    // conversation is precisely the one that is otherwise invisible.
    const tasks = useBackgroundTasks()
    const { running, finished } = useMemo(() => groupBackgroundTasks(tasks), [tasks])
    const runningCount = running.length
    // Plugin tasks live in the HOST (they survive a refresh), so they need their
    // own subscription. `enabled: open` is what keeps a closed panel at zero
    // polling: this header component stays mounted for the whole session.
    const longTaskBoard = useLongTasks({ limit: 30, enabled: open })
    const longRunningCount = useMemo(
        () => longTaskBoard.tasks.filter(task => task.state === 'running' || task.state === 'cancelling').length,
        [longTaskBoard.tasks],
    )

    // Only running rows show a live duration, so only they need a ticker — and
    // only while the board is actually open. Closed panel = zero timers.
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!open || (runningCount === 0 && longRunningCount === 0)) return
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), 1_000)
        return () => clearInterval(timer)
    }, [open, runningCount, longRunningCount])

    const sessionTitles = useMemo(() => {
        const map = new Map<string, string>()
        for (const session of sessions) map.set(session.id, session.title || '')
        return map
    }, [sessions])

    const conversationOf = useCallback(
        (task: BackgroundTaskView): { label: string; openable: boolean; sessionId?: string } => {
            const conversationId = task.conversationId ?? null
            if (!conversationId) {
                return {
                    label: t('ai.chat.backgroundTasks.workbench', { defaultValue: '工作台' }),
                    openable: false,
                }
            }
            // `sessions` is the host's full index (closed tabs included), so a
            // known id is always jumpable even when its tab is gone.
            const known = sessionTitles.has(conversationId)
            return {
                label: known
                    ? sessionTitles.get(conversationId)
                        || t('ai.chat.tasks.untitledSession', { defaultValue: '未命名对话' })
                    : t('ai.chat.backgroundTasks.otherConversation', { defaultValue: '其他会话' }),
                openable: known,
                sessionId: conversationId,
            }
        },
        [sessionTitles, t],
    )

    const handleToggle = useCallback((taskId: string) => {
        setExpandedId(current => (current === taskId ? null : taskId))
    }, [])

    // Opening the board is also a clock sync: without it the first painted frame
    // of a running row would show the duration frozen at the last close.
    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next)
        if (next) setNow(Date.now())
    }, [])

    const handleOpenConversation = useCallback(
        (sessionId: string) => {
            setOpen(false)
            onOpenSession(sessionId)
        },
        [onOpenSession],
    )

    const label = t('ai.chat.backgroundTasks.button', { defaultValue: '后台任务' })
    const ariaLabel =
        runningCount > 0
            ? `${label} · ${t('ai.chat.backgroundTasks.runningBadge', {
                  count: runningCount,
                  defaultValue: '{{count}} 个进行中',
              })}`
            : label

    const trigger = (
        <button
            type="button"
            aria-label={ariaLabel}
            className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60 data-[state=open]:text-foreground"
        >
            <Activity aria-hidden className={cn('h-3.5 w-3.5', runningCount > 0 && 'text-primary')} />
            {runningCount > 0 && (
                <span
                    aria-hidden
                    className="absolute -right-1 -top-1 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground"
                >
                    {runningCount > 99 ? '99+' : runningCount}
                </span>
            )}
        </button>
    )

    const renderContent = (onClose?: () => void) => (
        <BackgroundTasksContent
            running={running}
            finished={finished}
            longTasks={longTaskBoard}
            conversationOf={conversationOf}
            now={now}
            expandedId={expandedId}
            onToggle={handleToggle}
            onOpenConversation={handleOpenConversation}
            onClose={onClose}
        />
    )

    if (isMobile) {
        return (
            <TooltipProvider>
                <Sheet open={open} onOpenChange={handleOpenChange}>
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
                            {t('ai.chat.backgroundTasks.title', { defaultValue: '后台任务' })}
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
            <Popover open={open} onOpenChange={handleOpenChange}>
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
                    // Radix renders this as role="dialog"; the visible title below
                    // is a plain span, so name the dialog explicitly.
                    aria-label={label}
                    className="w-[340px] max-w-[calc(100vw-2rem)] p-0"
                >
                    {renderContent()}
                </PopoverContent>
            </Popover>
        </TooltipProvider>
    )
}
