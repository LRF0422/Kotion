import React from 'react'
import { useChatContext } from '@kn/ui'
import { ChatTabs, type ChatTabInfo } from './ChatTabs'
import { ChatHeaderActions } from './ChatHeaderActions'
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
}

/**
 * Chat header of the SIDE DOCK: the open-conversation TAB STRIP plus the shared
 * {@link ChatHeaderActions} cluster.
 *
 * The strip is the whole point of the dock's tab model — every tab is a mounted
 * conversation, so the header shows at a glance which ones are working, which
 * finished in the background and which one is blocked on the user. The history
 * dropdown next to it still lists EVERY conversation, including the ones whose
 * tab was closed.
 *
 * The full-page `/ai` surface no longer uses this header: its conversations live
 * in the left session column instead of a strip (see `SessionSidebar`), so it
 * composes a title row + the same {@link ChatHeaderActions} directly. Both
 * surfaces share one set of actions, i18n and behaviour.
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
}) => {
    const chatContext = useChatContext()
    // The cross-session task list is refreshed when an open tab's run state
    // changes: a turn that just finished may have rewritten its snapshot.
    const tasksRefreshKey = React.useMemo(
        () => tabs.map((tab) => `${tab.id}:${tab.status}`).join('|'),
        [tabs],
    )
    return (
        <div className="flex w-full items-center gap-1 border-b px-2 h-9 bg-background/95 backdrop-blur-sm">
            <ChatTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onSelect={onSelectTab}
                onClose={onCloseTab}
                onNewTab={onNewTab}
            />
            <ChatHeaderActions
                sessions={sessions}
                activeSessionId={activeTabId}
                hasMessages={hasMessages}
                onSwitch={onSwitch}
                onNewSession={onNewTab}
                onDelete={onDelete}
                onClear={onClear}
                onClose={() => chatContext?.toggleChat()}
                tasksRefreshKey={tasksRefreshKey}
                queuedCount={queuedCount}
            />
        </div>
    )
}
