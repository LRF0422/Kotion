import React, { useState, useMemo, useCallback, memo } from "react";
import {
    Popover, PopoverContent, PopoverTrigger,
    Tabs, TabsContent, TabsList, TabsTrigger,
    Button, Badge, ScrollArea, cn
} from "@kn/ui";
import {
    Inbox, Bell, Users, CheckCheck, Trash2,
    Clock, MessageCircle, X, Loader2, WifiOff,
    ExternalLink
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import { useNavigate } from "@kn/common";
import { useInstantMessage, ApiMessage } from "@kn/common";

// Re-export types for external use
export type { ApiMessage } from "@kn/common";

// ===== Style Constants =====
const TRIGGER_CLASS =
    "relative flex items-center justify-center p-2 rounded-md " +
    "hover:bg-accent hover:text-accent-foreground transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const TAB_TRIGGER_CLASS =
    "flex-1 h-full rounded-none border-b-2 border-transparent " +
    "data-[state=active]:border-primary data-[state=active]:bg-transparent " +
    "text-xs transition-all duration-200";

// Per-type metadata: icon, background, and icon color
const messageTypeMeta: Record<string, { icon: React.ReactNode; bg: string; iconColor: string }> = {
    system: {
        icon: <Bell className="h-4 w-4 text-muted-foreground" />,
        bg: "bg-muted",
        iconColor: "text-muted-foreground",
    },
    collaboration: {
        icon: <Users className="h-4 w-4 text-primary" />,
        bg: "bg-primary/10",
        iconColor: "text-primary",
    },
    mention: {
        icon: <MessageCircle className="h-4 w-4 text-muted-foreground" />,
        bg: "bg-muted",
        iconColor: "text-muted-foreground",
    },
};

// Message type definitions (for UI display)
export interface Message {
    id: string;
    type: 'system' | 'collaboration' | 'mention';
    title: string;
    content: string;
    timestamp: Date;
    read: boolean;
    avatar?: string;
    actionUrl?: string;
    sender?: {
        name: string;
        avatar?: string;
    };
}

export interface MessageBoxProps {
    /** Custom messages (if not using WebSocket) */
    messages?: Message[];
    /** Called when marking a message as read */
    onMarkAsRead?: (id: string) => void;
    /** Called when marking all messages as read */
    onMarkAllAsRead?: () => void;
    /** Called when deleting a message */
    onDelete?: (id: string) => void;
    /** Called when clicking a message */
    onMessageClick?: (message: Message) => void;
    /** Additional class names */
    className?: string;
    /** Use WebSocket connection for real-time messages */
    useWebSocket?: boolean;
}

/**
 * Convert API message to UI Message format
 */
const apiMessageToUiMessage = (apiMsg: ApiMessage): Message => {
    const isCollaboration = apiMsg.content?.includes('/collaborate/') ||
        apiMsg.contentType === 'LINK' ||
        apiMsg.content?.includes('invited you');

    // Properly distinguish between collaboration and system messages
    const type: Message['type'] = isCollaboration ? 'collaboration' : 'system';

    let actionUrl: string | undefined;
    const collaborateMatch = apiMsg.content?.match(/\/collaborate\/([a-zA-Z0-9-]+)/);
    if (collaborateMatch) {
        actionUrl = `/collaborate/${collaborateMatch[1]}`;
    }

    return {
        id: String(apiMsg.id),
        type,
        title: apiMsg.senderName || 'Unknown',
        content: apiMsg.content,
        timestamp: new Date(apiMsg.sentTime),
        read: apiMsg.status === 'READ',
        actionUrl,
        sender: {
            name: apiMsg.senderName || 'Unknown',
        }
    };
};

// Empty state component
const EmptyState = memo<{ icon: React.ReactNode; title: string; description?: string }>(
    ({ icon, title, description }) => (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                {icon}
            </div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {description && (
                <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[200px]">{description}</p>
            )}
        </div>
    )
);
EmptyState.displayName = 'EmptyState';

// Time formatting utility (pure, no external deps)
const formatTimeAgo = (timestamp: Date, t: (key: string) => string): string => {
    const diff = Date.now() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('messageBox.time.justNow');
    if (minutes < 60) return t('messageBox.time.minutesAgo').replace('{{n}}', String(minutes));
    if (hours < 24) return t('messageBox.time.hoursAgo').replace('{{n}}', String(hours));
    return t('messageBox.time.daysAgo').replace('{{n}}', String(days));
};

// Tab empty-state icon mapping
const tabEmptyIcons: Record<string, React.ReactNode> = {
    all: <Inbox className="h-6 w-6" />,
    system: <Bell className="h-6 w-6" />,
    collaboration: <Users className="h-6 w-6" />,
};

// Message item component
const MessageItem = memo<{
    message: Message;
    onMarkAsRead?: (id: string) => void;
    onDelete?: (id: string) => void;
    onClick?: (message: Message) => void;
    t: (key: string) => string;
}>(({ message, onMarkAsRead, onDelete, onClick, t }) => {
    const timeAgo = useMemo(() => formatTimeAgo(message.timestamp, t), [message.timestamp, t]);

    const hasAction = !!message.actionUrl;

    return (
        <div
            className={cn(
                "group relative p-3 rounded-lg cursor-pointer",
                "transition-all duration-200 ease-out",
                "hover:bg-accent/50 hover:shadow-sm",
                !message.read && "bg-primary/5 border-l-2 border-l-primary/50 pl-[10px]",
                hasAction && "hover:bg-primary/5"
            )}
            onClick={() => onClick?.(message)}
        >
            <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                    messageTypeMeta[message.type]?.bg ?? "bg-muted"
                )}>
                    {messageTypeMeta[message.type]?.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className={cn(
                            "text-sm truncate",
                            !message.read ? "font-medium" : "text-foreground/80"
                        )}>
                            {message.title}
                        </h4>
                        {!message.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 break-words">
                        {message.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo}
                        </span>
                        {hasAction && (
                            <span className="text-[11px] text-primary/70 flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" />
                                {t('messageBox.actions.clickToOpen')}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Hover Actions */}
            <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                {!message.read && onMarkAsRead && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                            e.stopPropagation();
                            onMarkAsRead(message.id);
                        }}
                        title={t('messageBox.actions.markAsRead')}
                    >
                        <CheckCheck className="h-3.5 w-3.5" />
                    </Button>
                )}
                {onDelete && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:text-destructive"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(message.id);
                        }}
                        title={t('messageBox.actions.delete')}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
});
MessageItem.displayName = 'MessageItem';

// Main MessageBox component
export const MessageBox: React.FC<MessageBoxProps> = ({
    messages: externalMessages,
    onMarkAsRead: externalMarkAsRead,
    onMarkAllAsRead: externalMarkAllAsRead,
    onDelete,
    onMessageClick,
    className,
    useWebSocket = true
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'all' | 'system' | 'collaboration'>('all');

    // WebSocket connection
    const {
        messages: wsMessages,
        unreadCount: wsUnreadCount,
        isConnected,
        isConnecting,
        markAsRead: wsMarkAsRead,
        markAllAsRead: wsMarkAllAsRead
    } = useInstantMessage({ autoConnect: useWebSocket });

    // Convert WebSocket messages to UI format
    const convertedWsMessages = useMemo(() =>
        wsMessages.map(apiMessageToUiMessage),
        [wsMessages]
    );

    // Use WebSocket messages or external messages
    const messages = useWebSocket ? convertedWsMessages : (externalMessages || []);

    // Filter messages by tab
    const filteredMessages = useMemo(() => {
        if (activeTab === 'all') return messages;
        return messages.filter(m => m.type === activeTab);
    }, [messages, activeTab]);

    // Count unread messages – single pass for all categories
    const { unreadCount, systemUnread, collabUnread } = useMemo(() => {
        if (useWebSocket) {
            return {
                unreadCount: wsUnreadCount,
                systemUnread: 0,
                collabUnread: 0,
            };
        }
        let total = 0;
        let sys = 0;
        let collab = 0;
        for (const m of messages) {
            if (m.read) continue;
            total++;
            if (m.type === 'system') sys++;
            else if (m.type === 'collaboration') collab++;
        }
        return { unreadCount: total, systemUnread: sys, collabUnread: collab };
    }, [useWebSocket, wsUnreadCount, messages]);

    // Handle mark as read
    const handleMarkAsRead = useCallback((id: string) => {
        if (useWebSocket) {
            wsMarkAsRead(Number(id));
        }
        externalMarkAsRead?.(id);
    }, [useWebSocket, wsMarkAsRead, externalMarkAsRead]);

    // Handle mark all as read
    const handleMarkAllAsRead = useCallback(() => {
        if (useWebSocket) {
            wsMarkAllAsRead();
        }
        externalMarkAllAsRead?.();
    }, [useWebSocket, wsMarkAllAsRead, externalMarkAllAsRead]);

    const handleMessageClick = useCallback((message: Message) => {
        if (!message.read) {
            handleMarkAsRead(message.id);
        }

        // Navigate if there's an actionUrl
        if (message.actionUrl) {
            setOpen(false); // Close the popover
            navigate(message.actionUrl);
            return;
        }

        onMessageClick?.(message);
    }, [handleMarkAsRead, onMessageClick, navigate]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className={cn(TRIGGER_CLASS, className)}
                    aria-label={t('messageBox.title')}
                >
                    <Inbox className="h-5 w-5" id="message-box" />
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] font-medium"
                        >
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </Badge>
                    )}
                </button>
            </PopoverTrigger>

            <PopoverContent
                side="right"
                align="start"
                sideOffset={12}
                className="w-[380px] p-0 overflow-hidden rounded-xl shadow-lg border"

            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b bg-card/50">
                    <div>
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                            {t('messageBox.title')}
                            {useWebSocket && (
                                isConnecting ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        {t('messageBox.connecting')}
                                    </span>
                                ) : !isConnected ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                                        <WifiOff className="h-3 w-3" />
                                        {t('messageBox.disconnected')}
                                    </span>
                                ) : null
                            )}
                        </h3>
                        {unreadCount > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {t('messageBox.unreadCount').replace('{{n}}', String(unreadCount))}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={handleMarkAllAsRead}
                            >
                                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                                {t('messageBox.actions.markAllRead')}
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setOpen(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
                    <TabsList className="w-full h-9 rounded-none border-b bg-transparent p-0">
                        {([
                            ['all', unreadCount],
                            ['system', systemUnread],
                            ['collaboration', collabUnread],
                        ] as const).map(([tab, count]) => (
                            <TabsTrigger
                                key={tab}
                                value={tab}
                                className={TAB_TRIGGER_CLASS}
                            >
                                {t(`messageBox.tabs.${tab}`)}
                                {count > 0 && (
                                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                                        {count}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {/* Force the Radix viewport's inner wrapper from display:table
                        to block so long unbreakable URLs wrap within the panel
                        width instead of overflowing horizontally. */}
                    <ScrollArea className="h-[320px] [&_[data-radix-scroll-area-viewport]>div]:!block">
                        <TabsContent value={activeTab} className="m-0 p-2" forceMount>
                            {filteredMessages.length > 0 ? (
                                <div className="space-y-1">
                                    {filteredMessages.map((message) => (
                                        <MessageItem
                                            key={message.id}
                                            message={message}
                                            onMarkAsRead={handleMarkAsRead}
                                            onDelete={onDelete}
                                            onClick={handleMessageClick}
                                            t={t}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    icon={tabEmptyIcons[activeTab]}
                                    title={t(`messageBox.empty.${activeTab}`)}
                                />
                            )}
                        </TabsContent>
                    </ScrollArea>
                </Tabs>

                {/* Footer */}
                {messages.length > 0 && (
                    <div className="px-4 py-2.5 border-t bg-muted/30">
                        <button
                            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
                            onClick={() => setActiveTab('all')}
                        >
                            {t('messageBox.viewAll')} ({messages.length})
                        </button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
};

export default MessageBox;
