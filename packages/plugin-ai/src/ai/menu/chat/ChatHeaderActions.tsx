import React from 'react'
import { useTranslation } from '@kn/common'
import { Trash2, X, Loader2 } from '@kn/icon'
import {
    Button,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@kn/ui'
import { SessionSwitcher } from './SessionSwitcher'
import { SessionTasksPanel } from './SessionTasksPanel'
import { BackgroundTasksPanel } from './BackgroundTasksPanel'
import type { ChatSessionMeta } from '../chat-sessions'

export interface ChatHeaderActionsProps {
    sessions: ChatSessionMeta[]
    activeSessionId: string
    hasMessages: boolean
    /** Focus a conversation (opening or switching to it). */
    onSwitch: (id: string) => void
    onNewSession: () => void
    onDelete: (id: string) => void
    onClear: () => void
    /**
     * Collapse/close the chat. Omitted on a full-page surface, where there is
     * nothing to close — the button is then not rendered at all.
     */
    onClose?: () => void
    /**
     * Show the "all conversations" dropdown. The dock's header has no room for
     * a session list, so the dropdown is its history; the `/ai` page has the
     * left conversation column instead and hides it.
     */
    showHistory?: boolean
    /**
     * Refetch trigger for the cross-conversation task index. Derived from the
     * visible conversations' run states (e.g. "a turn just finished, its task
     * snapshot may have changed").
     */
    tasksRefreshKey: string
    /**
     * How many conversations are waiting for a stream slot. The engine caps
     * concurrent live streams (browser connections), and a queued run attaches
     * later from its durable event log — so this is a "will start shortly"
     * notice, not an error.
     */
    queuedCount?: number
}

/**
 * The chat header's trailing action cluster, shared by both chat surfaces:
 * queued-run notice, background tasks, unfinished tasks, history, clear, close.
 *
 * Extracted from {@link ChatHeader} so the `/ai` page (which dropped the tab
 * strip for a left conversation column) and the side dock use the SAME controls
 * and tooltips — the dock's header is just this cluster plus the tab strip.
 */
export const ChatHeaderActions: React.FC<ChatHeaderActionsProps> = ({
    sessions,
    activeSessionId,
    hasMessages,
    onSwitch,
    onNewSession,
    onDelete,
    onClear,
    onClose,
    showHistory = true,
    tasksRefreshKey,
    queuedCount = 0,
}) => {
    const { t } = useTranslation()
    return (
        <>
            {queuedCount > 0 && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                <span>{queuedCount}</span>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                            {t('ai.chat.tabs.queuedHint', {
                                count: queuedCount,
                                defaultValue:
                                    '{{count}} 个会话正在排队等待并发流（同时运行的会话数有上限）。前一个会话结束或暂停后会自动接上，进度不会丢失。',
                            })}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
            <div className="flex items-center gap-px shrink-0">
                <TooltipProvider>
                    {/* Live board of `background: true` long tasks. It lists the
                        WHOLE registry (not just this tab): a build started in a
                        chat the user has since left is exactly what needs an
                        entry point. */}
                    <BackgroundTasksPanel sessions={sessions} onOpenSession={onSwitch} />
                    <SessionTasksPanel onOpenSession={onSwitch} refreshKey={tasksRefreshKey} />
                    {showHistory && (
                        <SessionSwitcher
                            variant="icon"
                            sessions={sessions}
                            activeSessionId={activeSessionId}
                            onSwitch={onSwitch}
                            onNewSession={onNewSession}
                            onDelete={onDelete}
                        />
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClear}
                                disabled={!hasMessages}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">{t('ai.chat.clearChat')}</TooltipContent>
                    </Tooltip>
                    {onClose && (
                        /* Floating mode toggles the bubble; in the dock,
                           toggleChat is wired to the host's `close` (collapse). */
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onClose}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">{t('ai.chat.close')}</TooltipContent>
                        </Tooltip>
                    )}
                </TooltipProvider>
            </div>
        </>
    )
}
