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
import { useInstantMessage, ApiMessage } from "../../hooks/use-instant-message";

// Re-export types for external use
export type { ApiMessage } from "../../hooks/use-instant-message";

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
    // Determine message type based on content or metadata
    // Check if it's a collaboration invitation based on content pattern
    const isCollaboration = apiMsg.content?.includes('/collaborate/') ||
        apiMsg.contentType === 'LINK' ||
        apiMsg.content?.includes('invited you');

    const type: Message['type'] = isCollaboration ? 'collaboration' : 'collaboration';

    // Extract actionUrl from content if it contains a collaboration link
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
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                {icon}
            </div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {description && (
                <p className="text-xs text-muted-foreground/70 mt-1">{description}</p>
            )}
        </div>
    )
);
EmptyState.displayName = 'EmptyState';

// Message item component
const MessageItem = memo<{
    message: Message;
    onMarkAsRead?: (id: string) => void;
    onDelete?: (id: string) => void;
    onClick?: (message: Message) => void;
    t: (key: string) => string;
}>(({ message, onMarkAsRead, onDelete, onClick, t }) => {
    const timeAgo = useMemo(() => {
        const now = new Date();
        const diff = now.getTime() - message.timestamp.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return t('messageBox.time.justNow');
        if (minutes < 60) return t('messageBox.time.minutesAgo').replace('{{n}}', String(minutes));
        if (hours < 24) return t('messageBox.time.hoursAgo').replace('{{n}}', String(hours));
        return t('messageBox.time.daysAgo').replace('{{n}}', String(days));
    }, [message.timestamp, t]);

    const hasAction = !!message.actionUrl;

    return (
        <div
            className={cn(
                "group relative p-3 rounded-lg cursor-pointer transition-colors",
                "hover:bg-muted/50",
                !message.read && "bg-primary/5",
                hasAction && "hover:bg-primary/5"
            )}
            onClick={() => onClick?.(message)}
        >
            <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    message.type === 'system' && "bg-muted",
                    message.type === 'collaboration' && "bg-primary/10",
                    message.type === 'mention' && "bg-muted"
                )}>
                    {message.type === 'system' && <Bell className="h-4 w-4 text-muted-foreground" />}
                    {message.type === 'collaboration' && <Users className="h-4 w-4 text-primary" />}
                    {message.type === 'mention' && <MessageCircle className="h-4 w-4 text-muted-foreground" />}
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
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {message.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo}
                        </span>
                        {hasAction && (
                            <span className="text-[11px] text-primary flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" />
                                Click to open
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

    // Count unread messages
    const unreadCount = useWebSocket ? wsUnreadCount : messages.filter(m => !m.read).length;
    const systemUnread = useMemo(() => messages.filter(m => m.type === 'system' && !m.read).length, [messages]);
    const collabUnread = useMemo(() => messages.filter(m => m.type === 'collaboration' && !m.read).length, [messages]);

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
                    className={cn(
                        "relative flex items-center justify-center p-2 rounded-md",
                        "hover:bg-muted transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        className
                    )}
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
                className="w-[400px] p-0 overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <div>
                        <h3 className="font-medium text-sm flex items-center gap-2">
                            {t('messageBox.title')}
                            {useWebSocket && (
                                isConnecting ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                ) : !isConnected ? (
                                    <WifiOff className="h-3 w-3 text-destructive" />
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
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                    <TabsList className="w-full h-9 rounded-none border-b bg-transparent p-0">
                        <TabsTrigger
                            value="all"
                            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
                        >
                            {t('messageBox.tabs.all')}
                            {unreadCount > 0 && (
                                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                                    {unreadCount}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger
                            value="system"
                            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
                        >
                            {t('messageBox.tabs.system')}
                            {systemUnread > 0 && (
                                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                                    {systemUnread}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger
                            value="collaboration"
                            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
                        >
                            {t('messageBox.tabs.collaboration')}
                            {collabUnread > 0 && (
                                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                                    {collabUnread}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <ScrollArea className="h-[300px]">
                        <TabsContent value="all" className="m-0 p-2">
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
                                    icon={<Inbox className="h-5 w-5 text-muted-foreground" />}
                                    title={t('messageBox.empty.all')}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="system" className="m-0 p-2">
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
                                    icon={<Bell className="h-5 w-5 text-muted-foreground" />}
                                    title={t('messageBox.empty.system')}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="collaboration" className="m-0 p-2">
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
                                    icon={<Users className="h-5 w-5 text-muted-foreground" />}
                                    title={t('messageBox.empty.collaboration')}
                                />
                            )}
                        </TabsContent>
                    </ScrollArea>
                </Tabs>

                {/* Footer */}
                {messages.length > 0 && (
                    <div className="px-3 py-2 border-t">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-8 text-xs text-muted-foreground"
                        >
                            {t('messageBox.viewAll')}
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
};

export default MessageBox;
