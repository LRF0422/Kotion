import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from '@kn/common'
import { AtSign, Plus, X } from '@kn/icon'
import { Sheet, SheetContent, SheetTitle, cn } from '@kn/ui'
import type { ChatSessionMeta } from '../chat-sessions'
import type { ChatTabStatus } from './ChatTabs'
import { ChatTabStatusLight } from './ChatTabs'
import { groupSessionsByDate, sessionPageTitle } from './session-list'

export interface SessionSidebarProps {
    /** Every known conversation, any order (the list sorts by recency itself). */
    sessions: ChatSessionMeta[]
    activeSessionId: string
    /** Per-conversation run status, reported by the mounted panels. */
    runStatus: Record<string, ChatTabStatus>
    /** Focus a conversation (mounting its panel when it is not mounted yet). */
    onSelect: (id: string) => void
    onNewSession: () => void
    /** Delete one conversation for good. */
    onDelete: (id: string) => void
    /**
     * Called after a navigation command (select / new). The desktop column
     * ignores it; the mobile sheet uses it to close itself.
     */
    onNavigate?: () => void
    /**
     * Render a close affordance in the header. Only the mobile sheet passes it —
     * an inline column is closed from the chat header's toggle.
     */
    onClose?: () => void
    className?: string
}

/** Tooltip-ish labels for the status light; the visual language matches the tabs. */
const STATUS_LABEL_KEY: Record<ChatTabStatus, string> = {
    idle: '',
    running: 'ai.chat.sessions.status.running',
    attention: 'ai.chat.sessions.status.attention',
    done: 'ai.chat.sessions.status.done',
    failed: 'ai.chat.sessions.status.failed',
}

const SessionRow: React.FC<{
    session: ChatSessionMeta
    isActive: boolean
    status: ChatTabStatus
    onSelect: () => void
    onDelete: () => void
    rowRef?: React.Ref<HTMLDivElement>
}> = ({ session, isActive, status, onSelect, onDelete, rowRef }) => {
    const { t } = useTranslation()
    const title = session.title || t('ai.chat.newChat')
    const pageTitle = sessionPageTitle(session)
    const statusKey = STATUS_LABEL_KEY[status]
    const deleteLabel = t('ai.chat.deleteChat', { title })

    return (
        <div
            ref={rowRef}
            className={cn(
                'group/session relative flex items-start gap-1 rounded-md pl-2 pr-1 py-1.5 transition-colors',
                isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
        >
            <button
                type="button"
                onClick={onSelect}
                aria-current={isActive ? 'true' : undefined}
                title={pageTitle ? `${title} — @${pageTitle}` : title}
                className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
            >
                <span
                    className="mt-[3px] flex h-3 w-3 shrink-0 items-center justify-center"
                    title={statusKey ? t(statusKey, { defaultValue: status }) : undefined}
                    aria-hidden={!statusKey}
                >
                    <ChatTabStatusLight status={status} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className={cn('line-clamp-2 break-words text-xs leading-4', isActive && 'font-medium')}>
                        {title}
                    </span>
                    {pageTitle && (
                        <span className="mt-0.5 flex min-w-0 items-center gap-0.5 text-[10px] leading-3 text-muted-foreground/80">
                            <AtSign className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{pageTitle}</span>
                        </span>
                    )}
                </span>
            </button>
            <button
                type="button"
                aria-label={deleteLabel}
                title={deleteLabel}
                onClick={(event) => {
                    event.stopPropagation()
                    event.preventDefault()
                    onDelete()
                }}
                className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-destructive/15 hover:text-destructive',
                    isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 focus-visible:opacity-100',
                )}
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    )
}

/**
 * The conversation column of the full-page `/ai` surface.
 *
 * This is the session-management surface the tab strip used to be: "new chat"
 * up top and EVERY conversation below it — grouped by recency, newest first, with
 * the same status light as the dock's tabs (running / waiting on you / finished
 * in the background / failed). Selecting one focuses it; conversations that were
 * opened before stay mounted, so a background run keeps going.
 *
 * It is intentionally the same component in two containers:
 *  - inline column on desktop/tablet (`w-[232px]`, see `KernelHomePage`);
 *  - the content of a left sheet on mobile, where a column would eat the chat.
 */
export const SessionSidebar: React.FC<SessionSidebarProps> = ({
    sessions,
    activeSessionId,
    runStatus,
    onSelect,
    onNewSession,
    onDelete,
    onNavigate,
    onClose,
    className,
}) => {
    const { t } = useTranslation()
    const groups = useMemo(() => groupSessionsByDate(sessions), [sessions])
    const activeRowRef = useRef<HTMLDivElement | null>(null)

    // The focused conversation must be visible in the list (its bucket can be
    // far down after a jump from a task / background task entry point).
    useEffect(() => {
        activeRowRef.current?.scrollIntoView({ block: 'nearest' })
    }, [activeSessionId])

    const handleSelect = (id: string) => {
        onSelect(id)
        onNavigate?.()
    }
    const handleNew = () => {
        onNewSession()
        onNavigate?.()
    }

    return (
        <div
            className={cn(
                // Surface colour is the container's call: a modern-style pane is
                // plain background, the flat classic column is tinted.
                'flex h-full min-h-0 w-full flex-col',
                className,
            )}
        >
            {/* Same height and divider as the chat header next to it, so the
                horizontal rule runs continuously across the whole surface. */}
            <div className="flex h-9 shrink-0 items-center justify-between gap-1 border-b px-3">
                <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('ai.chat.sessions.title')}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('ai.chat.close')}
                            title={t('ai.chat.close')}
                            className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
            <div className="shrink-0 px-2 pb-1.5 pt-2">
                <button
                    type="button"
                    onClick={handleNew}
                    title={t('ai.chat.newChat')}
                    className="flex h-7 w-full items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t('ai.chat.newChat')}</span>
                </button>
            </div>
            {/* Native scroll container on purpose: Radix ScrollArea puts a
                `display: table` box between the viewport and the content, which
                makes rows size to max-content — `truncate` then never gets a
                constrained width and titles were clipped mid-glyph instead of
                ending in an ellipsis. Global scrollbar styling (thin + auto-hide
                via `.scrollbar-auto-hide`) keeps the look identical. */}
            <div className="scrollbar-auto-hide min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <div className="px-1.5 pb-3">
                    {groups.length === 0 ? (
                        <div className="px-2 py-6 text-center text-[11px] text-muted-foreground/70">
                            {t('ai.chat.sessions.empty')}
                        </div>
                    ) : (
                        groups.map(group => (
                            <div key={group.bucket} className="pt-2 first:pt-0">
                                <div className="px-2 pb-1 text-[10px] font-medium text-muted-foreground/70">
                                    {t(`ai.chat.sessions.${group.bucket}`)}
                                </div>
                                <div className="flex flex-col gap-px">
                                    {group.sessions.map(session => (
                                        <SessionRow
                                            key={session.id}
                                            rowRef={session.id === activeSessionId ? activeRowRef : undefined}
                                            session={session}
                                            isActive={session.id === activeSessionId}
                                            status={runStatus[session.id] ?? 'idle'}
                                            onSelect={() => handleSelect(session.id)}
                                            onDelete={() => onDelete(session.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

/**
 * Mobile container for {@link SessionSidebar}: a sheet from the left, opened from
 * the chat header. A 232px column on a phone-width chat leaves no room for the
 * conversation, so the list arrives on demand instead of living inline.
 */
export const SessionSidebarSheet: React.FC<{
    open: boolean
    onOpenChange: (open: boolean) => void
    content: React.ReactNode
}> = ({ open, onOpenChange, content }) => {
    const { t } = useTranslation()
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="left" hideClose className="w-[280px] max-w-[85vw] p-0">
                <SheetTitle className="sr-only">{t('ai.chat.sessions.title')}</SheetTitle>
                {content}
            </SheetContent>
        </Sheet>
    )
}
