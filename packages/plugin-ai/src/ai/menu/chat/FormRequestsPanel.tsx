/**
 * 「填写请求」— the unified inbox for agent dynamic forms.
 *
 * A form created by a tool (`requestUserForm`) does not have to be filled in the
 * conversation that asked. When the tool's wait budget expires the request STAYS
 * pending, and the user may be in another tab by the time they get to it. That is
 * the same shape as the background-task board (`BackgroundTasksPanel`), so the
 * entry lives next to it in the chat header and lists the WHOLE registry, not
 * just the focused conversation:
 *
 *  - pending requests first, in arrival order — the oldest is the one to fill;
 *  - finished ones most recently handled first, as a read-only record;
 *  - a pending row expands into the real {@link FormRequestCard}, so the user can
 *    fill it in place; submitting moves it to 已结束 without leaving the board.
 *
 * It also registers this surface as a form host (`registerFormRequestHost`). The
 * kernel tool set is global, so a bare agent surface with no form UI would
 * otherwise create a request and park for minutes with nothing on screen; with
 * this registration the tool fails fast there instead. Registration is
 * ref-counted, which makes StrictMode's double mount (and the dock + `/ai` page
 * rendering the panel at the same time) harmless.
 *
 * Like the task board, the registry is in-memory and per JS context: a refresh
 * empties the list. The footer says so and explains the "filled after the agent
 * stopped waiting" delivery path, which is exactly what users ask about.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    groupFormRequests,
    registerFormRequestHost,
    useFormRequests,
    useTranslation,
    type FormRequestView,
    type FormRequestStatus,
} from '@kn/common'
import {
    ArrowUpRight,
    CheckCircle2,
    ChevronDown,
    CircleSlash,
    ClipboardList,
    X,
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
    formatFormRelativeTime,
    useResponsive,
} from '@kn/ui'
import { FormRequestCard } from './FormRequestCard'
import type { ChatSessionMeta } from '../chat-sessions'

/** Open board rows before the body switches to a fixed, scrollable height. */
const SCROLLABLE_REQUEST_COUNT = 2

/** Relative labels only need a coarse clock; this is the shared tick. */
const RELATIVE_TIME_TICK_MS = 30_000

/** Same visual language as the background-task board: spinner/dot/slash. */
const FormStatusIcon: React.FC<{ status: FormRequestStatus }> = ({ status }) => {
    if (status === 'pending') {
        return (
            <ClipboardList
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
            />
        )
    }
    if (status === 'answered') {
        return (
            <CheckCircle2
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
        )
    }
    return <CircleSlash aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
}

// ─── One request row (collapsed line + the form / summary when expanded) ──

interface FormRequestRowProps {
    request: FormRequestView
    /** Human label for the conversation that asked. */
    conversationLabel: string
    /** True only when the host can actually open that conversation. */
    canOpenConversation: boolean
    expanded: boolean
    /** Shared "now" so every relative label ticks together. */
    now: number
    statusLabel: string
    onToggle: () => void
    onOpenConversation: () => void
}

const FormRequestRow: React.FC<FormRequestRowProps> = ({
    request,
    conversationLabel,
    canOpenConversation,
    expanded,
    now,
    statusLabel,
    onToggle,
    onOpenConversation,
}) => {
    const { t } = useTranslation()
    const timestamp = request.status === 'pending'
        ? request.createdAt
        : request.answeredAt ?? request.cancelledAt ?? request.createdAt
    const relativeTime = formatFormRelativeTime(timestamp, now)
    // Batch forms are worth flagging in the list: one row hides several records.
    const batchCount = request.batch
        ? (request.status === 'answered'
            ? (request.rows?.length ?? 0)
            : request.batch.defaultRows)
        : null

    return (
        <div className="group/row">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-label={`${request.title} · ${statusLabel} · ${relativeTime}`}
                className="flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            >
                <FormStatusIcon status={request.status} />
                <span className="min-w-0 flex-1">
                    <span
                        className="block truncate text-xs font-medium leading-5 text-foreground/90"
                        title={request.title}
                    >
                        {request.title}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
                        <span className="truncate" title={conversationLabel}>{conversationLabel}</span>
                        {batchCount !== null && (
                            <>
                                <span aria-hidden className="shrink-0 opacity-60">·</span>
                                <span
                                    className="shrink-0 rounded bg-muted px-1 text-[10px] leading-4 text-muted-foreground"
                                    title={request.batch?.rowLabel}
                                >
                                    {t('ai.chat.forms.batchBadge', {
                                        count: batchCount,
                                        defaultValue: '批量 · {{count}} 条',
                                    })}
                                </span>
                            </>
                        )}
                        <span aria-hidden className="shrink-0 opacity-60">·</span>
                        <span className="shrink-0 tabular-nums">{relativeTime}</span>
                    </span>
                </span>
                <span className="mt-0.5 flex shrink-0 items-center text-[10px] tabular-nums text-muted-foreground">
                    <ChevronDown
                        aria-hidden
                        className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
                    />
                </span>
            </button>

            {expanded && (
                <div className="px-3 pb-2">
                    {canOpenConversation && (
                        <div className="mb-1.5 flex justify-end">
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
                        </div>
                    )}
                    {/* The real card: editable while pending (submitting moves the
                        row to 已结束), read-only summary once terminal. */}
                    <FormRequestCard request={request} />
                </div>
            )}
        </div>
    )
}

// ─── Shared body (popover + sheet) ─────────────────────────────────

interface FormRequestsContentProps {
    pending: FormRequestView[]
    finished: FormRequestView[]
    conversationOf: (request: FormRequestView) => {
        label: string
        openable: boolean
        sessionId?: string
    }
    now: number
    expandedId: string | null
    onToggle: (requestId: string) => void
    onOpenConversation: (sessionId: string) => void
    /** Mobile sheet shows its own close button; the popover has none. */
    onClose?: () => void
}

const FormRequestsContent: React.FC<FormRequestsContentProps> = ({
    pending,
    finished,
    conversationOf,
    now,
    expandedId,
    onToggle,
    onOpenConversation,
    onClose,
}) => {
    const { t } = useTranslation()
    const count = pending.length + finished.length
    const scrollable = count > SCROLLABLE_REQUEST_COUNT || expandedId !== null

    const statusLabel = useCallback(
        (status: FormRequestStatus): string =>
            status === 'answered'
                ? t('ai.chat.forms.statusAnswered', { defaultValue: '已填写' })
                : status === 'cancelled'
                    ? t('ai.chat.forms.statusCancelled', { defaultValue: '已取消' })
                    : t('ai.chat.forms.statusPending', { defaultValue: '待填写' }),
        [t],
    )

    const renderRows = (requests: FormRequestView[]) =>
        requests.map(request => {
            const conversation = conversationOf(request)
            return (
                <FormRequestRow
                    key={request.id}
                    request={request}
                    conversationLabel={conversation.label}
                    canOpenConversation={conversation.openable && Boolean(conversation.sessionId)}
                    now={now}
                    statusLabel={statusLabel(request.status)}
                    expanded={expandedId === request.id}
                    onToggle={() => onToggle(request.id)}
                    onOpenConversation={() => {
                        if (conversation.sessionId) onOpenConversation(conversation.sessionId)
                    }}
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
                <ClipboardList aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {t('ai.chat.forms.title', { defaultValue: '填写请求' })}
                </span>
                {pending.length > 0 && (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {t('ai.chat.forms.pendingBadge', {
                            count: pending.length,
                            defaultValue: '{{count}} 个待填写',
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
                    <ClipboardList aria-hidden className="h-5 w-5 text-muted-foreground/50" />
                    <p className="text-xs font-medium text-foreground/80">
                        {t('ai.chat.forms.empty', { defaultValue: '没有待填写' })}
                    </p>
                    <p className="max-w-[260px] text-[11px] leading-snug text-muted-foreground">
                        {t('ai.chat.forms.emptyHint', {
                            defaultValue:
                                '最近也没有填写请求。agent 需要结构化数据时会创建表单（版本号、说明、选项等），创建后就会出现在这里，也可以直接在会话里填写。',
                        })}
                    </p>
                </div>
            ) : (
                <ScrollArea
                    className={cn(
                        'w-full [&_[data-radix-scroll-area-viewport]>div]:!block',
                        scrollable && 'h-[min(60vh,440px)]',
                    )}
                >
                    <div className="pb-1">
                        {pending.length > 0 && (
                            <>
                                {sectionHeader(
                                    t('ai.chat.forms.pendingSection', { defaultValue: '待填写' }),
                                    pending.length,
                                )}
                                {renderRows(pending)}
                            </>
                        )}
                        {finished.length > 0 && (
                            <>
                                {sectionHeader(
                                    t('ai.chat.forms.finishedSection', { defaultValue: '已结束' }),
                                    finished.length,
                                )}
                                {renderRows(finished)}
                            </>
                        )}
                    </div>
                </ScrollArea>
            )}

            {/* Honest about the registry's scope AND about the late-answer path:
                the in-memory board empties on refresh, but an answer filled after
                the agent stopped waiting is still delivered as a note. */}
            <div className="border-t px-3 py-1.5 text-[10px] leading-snug text-muted-foreground/80">
                {t('ai.chat.forms.footer', {
                    defaultValue:
                        '只显示本页面会话中的填写请求，刷新页面后列表清空；agent 等待超时后仍可在这里填写，提交后结果会作为通知送回会话。',
                })}
            </div>
        </div>
    )
}

// ─── Trigger + host ────────────────────────────────────────────────

export interface FormRequestsPanelProps {
    /** Conversations known to the host: labels the rows and resolves jumps. */
    sessions: ChatSessionMeta[]
    /** Open the conversation that asked for a form (its tab, or a new one). */
    onOpenSession: (sessionId: string) => void
}

/**
 * Header entry point for the form inbox (see the file header).
 *
 * Mirrors {@link BackgroundTasksPanel}: a desktop popover, a mobile bottom
 * sheet, one shared body, no fetch — the registry lives in this JS context and
 * notifies through `useSyncExternalStore`.
 */
export const FormRequestsPanel: React.FC<FormRequestsPanelProps> = ({
    sessions,
    onOpenSession,
}) => {
    const { t } = useTranslation()
    const { isMobile } = useResponsive()
    const [open, setOpen] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    // Tell the kernel this surface can actually render a form. Ref-counted, so
    // the dock + the `/ai` page (and StrictMode's double mount) are safe.
    useEffect(() => registerFormRequestHost(), [])

    // Undefined = the whole inbox: a form asked for in another conversation is
    // precisely the one that would otherwise be invisible.
    const requests = useFormRequests()
    const { pending, finished } = useMemo(() => groupFormRequests(requests), [requests])
    const pendingCount = pending.length

    // Relative labels are the only time-dependent text, and only while open.
    // Closed panel = zero timers.
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!open) return
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), RELATIVE_TIME_TICK_MS)
        return () => clearInterval(timer)
    }, [open])

    const sessionTitles = useMemo(() => {
        const map = new Map<string, string>()
        for (const session of sessions) map.set(session.id, session.title || '')
        return map
    }, [sessions])

    const conversationOf = useCallback(
        (request: FormRequestView): { label: string; openable: boolean; sessionId?: string } => {
            const conversationId = request.conversationId ?? null
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

    const handleToggle = useCallback((requestId: string) => {
        setExpandedId(current => (current === requestId ? null : requestId))
    }, [])

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

    const label = t('ai.chat.forms.button', { defaultValue: '填写请求' })
    const ariaLabel = pendingCount > 0
        ? `${label} · ${t('ai.chat.forms.pendingBadge', {
            count: pendingCount,
            defaultValue: '{{count}} 个待填写',
        })}`
        : label

    const trigger = (
        <button
            type="button"
            aria-label={ariaLabel}
            className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60 data-[state=open]:text-foreground"
        >
            <ClipboardList aria-hidden className={cn('h-3.5 w-3.5', pendingCount > 0 && 'text-primary')} />
            {pendingCount > 0 && (
                <span
                    aria-hidden
                    className="absolute -right-1 -top-1 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground"
                >
                    {pendingCount > 99 ? '99+' : pendingCount}
                </span>
            )}
        </button>
    )

    const renderContent = (onClose?: () => void) => (
        <FormRequestsContent
            pending={pending}
            finished={finished}
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
                        className="max-h-[85vh] rounded-t-2xl p-0 pb-safe-bottom"
                    >
                        <SheetTitle className="sr-only">
                            {t('ai.chat.forms.title', { defaultValue: '填写请求' })}
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
                    className="w-[380px] max-w-[calc(100vw-2rem)] p-0"
                >
                    {renderContent()}
                </PopoverContent>
            </Popover>
        </TooltipProvider>
    )
}