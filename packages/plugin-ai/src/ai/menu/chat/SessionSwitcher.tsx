import React, { useCallback, useEffect, useRef } from 'react'
import { AtSign, ChevronDown, Plus, X, Check } from '@kn/icon'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@kn/ui'
import type { ChatSessionMeta } from '../chat-sessions'

interface SessionSwitcherProps {
    sessions: ChatSessionMeta[]
    activeSessionId: string
    onSwitch: (id: string) => void
    onNewSession: () => void
    onDelete: (id: string) => void
}

/**
 * Compact session switcher.  Replaces the horizontal tab strip with a
 * dropdown that surfaces the current chat title and lets the user jump
 * between existing sessions.  Reduces header visual noise, especially
 * once several chats accumulate.
 */
export const SessionSwitcher: React.FC<SessionSwitcherProps> = ({
    sessions,
    activeSessionId,
    onSwitch,
    onNewSession,
    onDelete,
}) => {
    const activeItemRef = useRef<HTMLDivElement | null>(null)
    const activeSession = sessions.find((s) => s.id === activeSessionId)
    const activeTitle = activeSession?.title || 'New chat'
    const activePageTitle = activeSession?.targetPage?.title

    // Keep the active item visible when the menu is opened after several
    // sessions have accumulated.
    useEffect(() => {
        activeItemRef.current?.scrollIntoView({ block: 'nearest' })
    }, [activeSessionId])

    const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        e.preventDefault()
        onDelete(id)
    }, [onDelete])

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="group flex items-center gap-1 min-w-0 max-w-[220px] h-6 px-1.5 -ml-1 rounded-md text-foreground hover:bg-muted/60 transition-colors"
                    title={activePageTitle ? `${activeTitle} — @${activePageTitle}` : activeTitle}
                >
                    <span className="truncate text-xs font-medium">{activeTitle}</span>
                    {activePageTitle && (
                        <span className="flex items-center gap-0.5 min-w-0 shrink text-[10px] text-muted-foreground">
                            <AtSign className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{activePageTitle}</span>
                        </span>
                    )}
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[260px] p-1">
                <DropdownMenuItem
                    onClick={onNewSession}
                    className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New chat</span>
                </DropdownMenuItem>
                {sessions.length > 0 && <DropdownMenuSeparator />}
                <div className="max-h-[280px] overflow-y-auto -mx-1 px-1 py-0.5">
                    {sessions.map((s) => {
                        const isActive = s.id === activeSessionId
                        const title = s.title || 'New chat'
                        const pageTitle = s.targetPage?.title
                        return (
                            <div
                                key={s.id}
                                ref={isActive ? activeItemRef : undefined}
                                onClick={() => !isActive && onSwitch(s.id)}
                                className={
                                    'group flex items-center gap-1.5 px-2 py-1.5 rounded-sm cursor-pointer select-none ' +
                                    (isActive
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')
                                }
                            >
                                <Check
                                    className={
                                        'h-3 w-3 shrink-0 ' +
                                        (isActive ? 'opacity-100' : 'opacity-0')
                                    }
                                />
                                <span
                                    className={
                                        'flex-1 truncate text-xs ' +
                                        (isActive ? 'font-medium' : '')
                                    }
                                    title={pageTitle ? `${title} — @${pageTitle}` : title}
                                >
                                    {title}
                                </span>
                                {pageTitle && (
                                    <span className="flex items-center gap-0.5 min-w-0 max-w-[45%] shrink-0 text-[10px] text-muted-foreground">
                                        <AtSign className="h-2.5 w-2.5 shrink-0" />
                                        <span className="truncate">{pageTitle}</span>
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => handleDelete(e, s.id)}
                                    aria-label={`Delete ${title}`}
                                    className={
                                        'flex items-center justify-center h-4 w-4 rounded-sm text-muted-foreground/70 hover:bg-destructive/15 hover:text-destructive transition-colors ' +
                                        (isActive
                                            ? 'opacity-70 hover:opacity-100'
                                            : 'opacity-0 group-hover:opacity-100')
                                    }
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
