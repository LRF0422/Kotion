import React from 'react'
import { Bot, Trash2, X, Plus } from '@kn/icon'
import {
    Button,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
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
    /** Open the custom agent definitions manager dialog. */
    onOpenAgentManager: () => void
}

/**
 * Minimal chat header.  Session switching is folded into a dropdown so the
 * bar only shows: current chat title + a small cluster of icon actions.
 */
export const ChatHeader: React.FC<ChatHeaderProps> = ({
    sessions,
    activeSessionId,
    hasMessages,
    onSwitch,
    onNewSession,
    onDelete,
    onClear,
    onOpenAgentManager,
}) => {
    const chatContext = useChatContext()
    return (
        <div className="flex w-full items-center justify-between gap-2 px-3 h-10 border-b bg-background/95 backdrop-blur-sm">
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
                                onClick={onOpenAgentManager}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Bot className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Manage agents</TooltipContent>
                    </Tooltip>
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
                        <TooltipContent side="bottom" className="text-xs">New chat</TooltipContent>
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
                        <TooltipContent side="bottom" className="text-xs">Clear current chat</TooltipContent>
                    </Tooltip>
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
                        <TooltipContent side="bottom" className="text-xs">Close</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    )
}
