/**
 * Live log for one project root, shown under a background task.
 *
 * This is the "user can see what the task is actually doing" half of the
 * monitoring design (see docs/AGENT_TASK_MONITORING_DESIGN.md). It deliberately
 * renders INSIDE the existing background-task board instead of posting messages
 * into the conversation: no transcript write, no model turn, no interference
 * with the run that started the task.
 *
 * The lines come from `TaskMonitorEngine` (a 1s incremental pull of the host's
 * dev-session log, capped and deduped there). Rendering keeps only the tail
 * (`MAX_RENDERED_LINES`) so a chatty build cannot grow the DOM without bound; a
 * `seq` gap is rendered as an explicit "dropped N lines" marker instead of
 * silently pretending the log is contiguous.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
    monitorSourceKey,
    taskMonitor,
    useTaskMonitorLines,
    useTaskMonitorSubscriptions,
    useTranslation,
} from '@kn/common'
import { useAutoScroll, cn } from '@kn/ui'
import {
    ensureTaskMonitorConfigured,
    type TaskMonitorAvailability,
} from './task-monitor-host'

/** Tail rendered at once; the engine keeps more (`cadence.maxLines`). */
const MAX_RENDERED_LINES = 200

export interface TaskLogSectionProps {
    /** Project root whose dev-session log is being watched. */
    root: string
    /** Human label for the monitor subscription (the task title). */
    label: string
    /** Task that opened the section; recorded on the monitor for reconciliation. */
    taskId?: string
    /**
     * Whether the task is still running. A settled task must not START a watch
     * (that would leave a 1s poll behind for 30 minutes); it still shows whatever
     * the monitor already retained, which is what a post-mortem reader wants.
     */
    running?: boolean
}

export const TaskLogSection: React.FC<TaskLogSectionProps> = ({ root, label, taskId, running = true }) => {
    const { t } = useTranslation()
    const [availability, setAvailability] = useState<TaskMonitorAvailability | null>(null)
    const [errorsOnly, setErrorsOnly] = useState(false)
    const monitorId = monitorSourceKey({ kind: 'dev', root })
    const lines = useTaskMonitorLines(monitorId)
    const subscriptions = useTaskMonitorSubscriptions()
    const subscription = subscriptions.find(monitor => monitor.id === monitorId)

    // Wire the host lazily (first log view opened) and make sure this root has a
    // subscription. `start` is idempotent and reactivates an ended monitor, so a
    // second expand of the same task cannot create a second polling loop.
    useEffect(() => {
        const state = ensureTaskMonitorConfigured()
        setAvailability(state)
        if (state !== 'available') return
        const existing = taskMonitor.list().some(monitor => monitor.id === monitorId)
        if (running || existing) {
            taskMonitor.start({
                source: { kind: 'dev', root },
                label,
                ...(taskId ? { taskIds: [taskId] } : {}),
            })
        }
    }, [root, label, taskId, running, monitorId])

    const visible = useMemo(() => {
        const filtered = errorsOnly ? lines.filter(line => line.level === 'error') : lines
        return filtered.length > MAX_RENDERED_LINES
            ? filtered.slice(filtered.length - MAX_RENDERED_LINES)
            : filtered
    }, [lines, errorsOnly])

    const { scrollRef } = useAutoScroll({ content: visible.length })

    const header = (
        <div className="flex items-center gap-1.5">
            <span className="font-medium text-muted-foreground">
                {t('ai.chat.backgroundTasks.liveLog', { defaultValue: '实时日志' })}
            </span>
            {visible.length > 0 && (
                <span className="tabular-nums text-[10px] text-muted-foreground/60">
                    {t('ai.chat.backgroundTasks.liveLogLines', {
                        count: visible.length,
                        defaultValue: '{{count}} 行',
                    })}
                </span>
            )}
            <button
                type="button"
                onClick={() => setErrorsOnly(value => !value)}
                aria-pressed={errorsOnly}
                className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                    errorsOnly
                        ? 'border-destructive/40 bg-destructive/10 text-destructive'
                        : 'text-muted-foreground hover:bg-muted',
                )}
            >
                {t('ai.chat.backgroundTasks.liveLogErrorsOnly', { defaultValue: '仅错误' })}
            </button>
        </div>
    )

    if (availability !== 'available') {
        return (
            <div className="mt-1.5">
                {header}
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/80">
                    {availability === 'disabled-by-flag'
                        ? t('ai.chat.backgroundTasks.liveLogDisabled', {
                            defaultValue: '实时日志已关闭（localStorage 的 kn:task-monitor=off）。',
                        })
                        : t('ai.chat.backgroundTasks.liveLogUnsupported', {
                            defaultValue: '当前宿主不支持实时日志（需要更新桌面端）。',
                        })}
                </p>
            </div>
        )
    }

    return (
        <div className="mt-1.5">
            {header}
            {visible.length === 0 ? (
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/80">
                    {subscription && subscription.status !== 'running'
                        ? t('ai.chat.backgroundTasks.liveLogStopped', {
                            defaultValue: '监控已结束，没有保留的日志。',
                        })
                        : !running && !subscription
                            ? t('ai.chat.backgroundTasks.liveLogNoCapture', {
                                defaultValue: '任务已结束：实时日志只在任务运行期间记录。',
                            })
                            : t('ai.chat.backgroundTasks.liveLogWaiting', { defaultValue: '等待输出…' })}
                </p>
            ) : (
                <div
                    ref={scrollRef}
                    className="mt-1 max-h-36 overflow-auto rounded border bg-muted/40 px-1.5 py-1 font-mono text-[10px] leading-4"
                >
                    {visible.map((line, index) => {
                        const previous = index > 0 ? visible[index - 1] : null
                        const gap = previous ? line.seq - previous.seq - 1 : 0
                        return (
                            <React.Fragment key={line.seq}>
                                {gap > 0 && (
                                    <div className="my-0.5 select-none text-[9px] text-muted-foreground/50">
                                        {t('ai.chat.backgroundTasks.liveLogDropped', {
                                            count: gap,
                                            defaultValue: '… 已丢弃 {{count}} 行 …',
                                        })}
                                    </div>
                                )}
                                <div
                                    className={cn(
                                        'whitespace-pre-wrap break-words',
                                        line.level === 'error' && 'text-destructive',
                                        line.level === 'warn' && 'text-amber-600 dark:text-amber-400',
                                        line.level === 'info' && 'text-foreground/80',
                                    )}
                                >
                                    {line.message}
                                </div>
                            </React.Fragment>
                        )
                    })}
                </div>
            )}
        </div>
    )
}