import React, { useEffect, useRef } from 'react'
import { useTranslation } from '@kn/common'
import { AtSign, Loader2, Plus, X } from '@kn/icon'
import { cn } from '@kn/ui'

/**
 * Per-tab run state, reported by the panel that owns the conversation:
 *  - `running`   — the agent is working (or about to be);
 *  - `attention` — the run is paused on the user (plan approval, a user-choice
 *                  question, budget exhausted, a dropped connection);
 *  - `done`      — a turn finished while the tab was in the background;
 *  - `failed`    — the last turn failed;
 *  - `idle`      — nothing to say.
 *
 * `done`/`failed` are sticky in the container until the user opens the tab: that
 * is exactly what an unread marker is.
 */
export type ChatTabStatus = 'idle' | 'running' | 'attention' | 'done' | 'failed'

export interface ChatTabInfo {
    id: string
    title: string
    /** Page the conversation is bound to, when it has one. */
    pageTitle?: string
    status: ChatTabStatus
}

interface ChatTabsProps {
    tabs: ChatTabInfo[]
    activeTabId: string
    onSelect: (id: string) => void
    onClose: (id: string) => void
    onNewTab: () => void
}

/** Tabs are a status light as much as a switcher, so every state is visible. */
const TabStatusLight: React.FC<{ status: ChatTabStatus }> = ({ status }) => {
    if (status === 'running') {
        return <Loader2 aria-hidden className="h-3 w-3 shrink-0 animate-spin text-primary" />
    }
    if (status === 'idle') {
        // Keep the slot so switching tabs never shifts the title by a pixel.
        return <span aria-hidden className="h-1.5 w-1.5 shrink-0" />
    }
    const tone = status === 'failed'
        ? 'bg-destructive'
        : status === 'attention'
            ? 'bg-amber-500'
            : 'bg-primary'
    return (
        <span
            aria-hidden
            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone, status === 'attention' && 'animate-pulse')}
        />
    )
}

/**
 * The open-conversation strip.
 *
 * Each tab is a mounted conversation that keeps running when it is not focused
 * — the strip is therefore also the place the user watches N parallel agents
 * from: a spinner while one works, a dot when a background turn finished, an
 * amber pulse when one is blocked on a decision.
 */
export const ChatTabs: React.FC<ChatTabsProps> = ({
    tabs,
    activeTabId,
    onSelect,
    onClose,
    onNewTab,
}) => {
    const { t } = useTranslation()
    const activeRef = useRef<HTMLDivElement | null>(null)

    // A new tab (or a switch from the history dropdown) must be visible.
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }, [activeTabId, tabs.length])

    return (
        <div
            role="tablist"
            aria-label={t('ai.chat.tabs.label', { defaultValue: '已打开的会话' })}
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        >
            {tabs.map(tab => {
                const isActive = tab.id === activeTabId
                const label = tab.title || t('ai.chat.newChat')
                return (
                    <div
                        key={tab.id}
                        ref={isActive ? activeRef : undefined}
                        role="tab"
                        aria-selected={isActive}
                        className={cn(
                            'group/tab flex h-7 max-w-[190px] shrink-0 items-center gap-1 rounded-md pl-2 pr-0.5 transition-colors',
                            isActive
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        )}
                    >
                        <button
                            type="button"
                            onClick={() => onSelect(tab.id)}
                            title={
                                tab.pageTitle ? `${label} — @${tab.pageTitle}` : label
                            }
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        >
                            <TabStatusLight status={tab.status} />
                            <span className={cn('truncate text-xs', isActive && 'font-medium')}>
                                {label}
                            </span>
                            {tab.pageTitle && (
                                <span className="flex min-w-0 shrink items-center gap-0.5 text-[10px] text-muted-foreground">
                                    <AtSign className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{tab.pageTitle}</span>
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            aria-label={t('ai.chat.tabs.close', {
                                title: label,
                                defaultValue: '关闭 {{title}}',
                            })}
                            title={t('ai.chat.tabs.closeHint', {
                                defaultValue: '关闭标签页（会话保留在历史列表中）',
                            })}
                            onClick={() => onClose(tab.id)}
                            className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-destructive/15 hover:text-destructive',
                                isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
                            )}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                )
            })}
            <button
                type="button"
                onClick={onNewTab}
                aria-label={t('ai.chat.newChat')}
                title={t('ai.chat.tabs.newTab', { defaultValue: '新建标签页' })}
                className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
                <Plus className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}
