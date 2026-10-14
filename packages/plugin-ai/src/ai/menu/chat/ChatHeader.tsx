import React from 'react'
import { useTranslation } from '@kn/common'
import { Trash2, X, Loader2 } from '@kn/icon'
import {
    Button,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    cn,
    useChatContext,
} from '@kn/ui'
import { SessionSwitcher } from './SessionSwitcher'
import { ChatTabs, type ChatTabInfo } from './ChatTabs'
import type { ChatSessionMeta } from '../chat-sessions'

interface ChatHeaderProps {
    /** Open conversations, in strip order. */
    tabs: ChatTabInfo[]
    activeTabId: string
    /** Focus a tab (its conversation may still be running in the background). */
    onSelectTab: (id: string) => void
    /** Close a tab. The conversation moves back to the history dropdown. */
    onCloseTab: (id: string) => void
    /** Open a new conversation in a new tab. */
    onNewTab: () => void
    sessions: ChatSessionMeta[]
    hasMessages: boolean
    /** Activate a conversation from the history dropdown (opens its tab). */
    onSwitch: (id: string) => void
    onDelete: (id: string) => void
    onClear: () => void
    /**
     * How many conversations are waiting for a stream slot. The engine caps
     * concurrent live streams (browser connections), and a queued run attaches
     * later from its durable event log — so this is a "will start shortly"
     * notice, not an error.
     */
    queuedCount?: number
    /**
     * Paint the bottom divider. Hosts that already draw the divider on their own
     * header row (e.g. the kernel home page, where the row also carries the
     * artifacts shelf) pass `false` so the line is not painted twice.
     */
    divided?: boolean
}

/**
 * Chat header: the open-conversation TAB STRIP plus a small cluster of actions.
 *
 * The strip is the whole point of the surface's tab model — every tab is a
 * mounted conversation, so the header shows at a glance which ones are working,
 * which finished in the background and which one is blocked on the user. The
 * history dropdown next to it still lists EVERY conversation, including the ones
 * whose tab was closed.
 *
 * Doubles as the dock panel's whole header (the host title bar is hidden via
 * `hideHeader`), so it carries the close button in embedded mode too.
 */
export const ChatHeader: React.FC<ChatHeaderProps> = ({
    tabs,
    activeTabId,
    onSelectTab,
    onCloseTab,
    onNewTab,
    sessions,
    hasMessages,
    onSwitch,
    onDelete,
    onClear,
    queuedCount = 0,
    divided = true,
}) => {
    const chatContext = useChatContext()
    const { t } = useTranslation()
    return (
        <div className={cn(
            'flex w-full items-center gap-1 px-2 h-9 bg-background/95 backdrop-blur-sm',
            divided && 'border-b',
        )}>
            <ChatTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onSelect={onSelectTab}
                onClose={onCloseTab}
                onNewTab={onNewTab}
            />
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
                    <SessionSwitcher
                        variant="icon"
                        sessions={sessions}
                        activeSessionId={activeTabId}
                        onSwitch={onSwitch}
                        onNewSession={onNewTab}
                        onDelete={onDelete}
                    />
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
                    {/* Floating mode toggles the bubble; in the dock,
                        toggleChat is wired to the host's `close` (collapse). */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => chatContext?.toggleChat()}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">{t('ai.chat.close')}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    )
}
