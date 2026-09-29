import React from 'react'
import { useTranslation } from '@kn/common'
import { Trash2, X, Plus } from '@kn/icon'
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
import type { ChatSessionMeta } from '../chat-sessions'

interface ChatHeaderProps {
    sessions: ChatSessionMeta[]
    activeSessionId: string
    hasMessages: boolean
    onSwitch: (id: string) => void
    onNewSession: () => void
    onDelete: (id: string) => void
    onClear: () => void
    /**
     * Paint the bottom divider. Hosts that already draw the divider on their own
     * header row (e.g. the kernel home page, where the row also carries the
     * artifacts shelf) pass `false` so the line is not painted twice.
     */
    divided?: boolean
}

/**
 * Minimal chat header.  Session switching is folded into a dropdown so the
 * bar only shows: current chat title + a small cluster of icon actions.
 * Doubles as the dock panel's whole header (the host title bar is hidden via
 * `hideHeader`), so it carries the close button in embedded mode too.
 */
export const ChatHeader: React.FC<ChatHeaderProps> = ({
    sessions,
    activeSessionId,
    hasMessages,
    onSwitch,
    onNewSession,
    onDelete,
    onClear,
    divided = true,
}) => {
    const chatContext = useChatContext()
    const { t } = useTranslation()
    return (
        <div className={cn(
            'flex w-full items-center justify-between gap-2 px-3 h-9 bg-background/95 backdrop-blur-sm',
            divided && 'border-b',
        )}>
            <SessionSwitcher
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSwitch={onSwitch}
                onNewSession={onNewSession}
                onDelete={onDelete}
            />
            <div className="flex items-center gap-px shrink-0">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onNewSession}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">{t('ai.chat.newChat')}</TooltipContent>
                    </Tooltip>
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
