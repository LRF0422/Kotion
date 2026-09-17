import React, { useState, useMemo, useCallback, memo } from "react";
import {
    Popover, PopoverContent, PopoverTrigger,
    Tabs, TabsContent, TabsList, TabsTrigger,
    Button, Badge, ScrollArea, Skeleton, Separator,
    Avatar, AvatarFallback, AvatarImage, cn,
} from "@kn/ui";
import {
    Inbox, Bell, Users, CheckCheck, Trash2, Clock, X,
    Loader2, WifiOff, ExternalLink, RefreshCw, AtSign, ChevronRight,
} from "@kn/icon";
import { useTranslation, useNavigate } from "@kn/common";
import { useInstantMessage, ApiMessage } from "@kn/common";

// Re-export types for external use
export type { ApiMessage } from "@kn/common";

// ===== Style Constants =====
const TRIGGER_CLASS =
    "relative flex items-center justify-center p-2 rounded-md " +
    "hover:bg-accent hover:text-accent-foreground transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const TAB_TRIGGER_CLASS = cn(
    "relative flex h-full flex-1 items-center justify-center gap-1.5 rounded-none border-b-2 border-transparent px-2 text-xs font-medium",
    "text-muted-foreground transition-colors hover:text-foreground",
    "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
);

// Per-type metadata: icon, tint, and accent color
const MESSAGE_TYPE_META: Record<string, {
    icon: React.ReactNode;
    labelKey: string;
    tileClass: string;
    chipClass: string;
    accentClass: string;
}> = {
    system: {
        icon: <Bell className="h-4 w-4" />,
        labelKey: "messageBox.type.system",
        tileClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
        chipClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
        accentClass: "bg-sky-500",
    },
    collaboration: {
        icon: <Users className="h-4 w-4" />,
        labelKey: "messageBox.type.collaboration",
        tileClass: "bg-primary/10 text-primary",
        chipClass: "bg-primary/10 text-primary",
        accentClass: "bg-primary",
    },
    mention: {
        icon: <AtSign className="h-4 w-4" />,
        labelKey: "messageBox.type.mention",
        tileClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        chipClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        accentClass: "bg-amber-500",
    },
};

const SYSTEM_META = MESSAGE_TYPE_META.system;

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

type MessageTab = 'all' | 'system' | 'collaboration';

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

// ===== Helpers =====
const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
};

const startOfDay = (date: Date): number => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
};

// Time formatting utility (pure, no external deps)
const formatTimeAgo = (timestamp: Date, t: (key: string, options?: Record<string, unknown>) => string): string => {
    const diff = Math.max(0, Date.now() - timestamp.getTime());
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('messageBox.time.justNow');
    if (minutes < 60) return t('messageBox.time.minutesAgo', { n: minutes });
    if (hours < 24) return t('messageBox.time.hoursAgo', { n: hours });
    return t('messageBox.time.daysAgo', { n: days });
};

interface MessageGroup {
    key: number;
    label: string;
    items: Message[];
}

const groupMessagesByDay = (
    messages: Message[],
    t: (key: string, options?: Record<string, unknown>) => string,
): MessageGroup[] => {
    const today = startOfDay(new Date());
    const yesterday = today - 86400000;
    const groups = new Map<number, MessageGroup>();

    for (const message of messages) {
        const day = startOfDay(message.timestamp);
        let group = groups.get(day);
        if (!group) {
            let label: string;
            if (day === today) label = t('messageBox.today');
            else if (day === yesterday) label = t('messageBox.yesterday');
            else label = message.timestamp.toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
            });
            group = { key: day, label, items: [] };
            groups.set(day, group);
        }
        group.items.push(message);
    }

    return Array.from(groups.values()).sort((a, b) => b.key - a.key);
};

// Tab empty-state icon mapping
const TAB_EMPTY_ICONS: Record<MessageTab, React.ReactNode> = {
    all: <Inbox className="h-7 w-7" />,
    system: <Bell className="h-7 w-7" />,
    collaboration: <Users className="h-7 w-7" />,
};

// Empty state component
const EmptyState = memo<{
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
}>(({ icon, title, description, action }) => (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-inset ring-border/70">
            {icon}
        </div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
            <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
        {action && (
            <Button
                variant="outline"
                size="sm"
                onClick={action.onClick}
                className="mt-4 h-8 gap-1.5 text-xs shadow-none"
            >
                <RefreshCw className="h-3.5 w-3.5" />
                {action.label}
            </Button>
        )}
    </div>
));
EmptyState.displayName = 'EmptyState';

// Message item component
const MessageItem = memo<{
    message: Message;
    onMarkAsRead?: (id: string) => void;
    onDelete?: (id: string) => void;
    onClick?: (message: Message) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}>(({ message, onMarkAsRead, onDelete, onClick, t }) => {
    const timeAgo = useMemo(() => formatTimeAgo(message.timestamp, t), [message.timestamp, t]);
    const meta = MESSAGE_TYPE_META[message.type] ?? SYSTEM_META;
    const hasAction = !!message.actionUrl;
    const unread = !message.read;
    const senderName = message.sender?.name;
    const showAvatar = message.type === 'collaboration' && !!senderName;

    return (
        <div
            role={hasAction ? 'button' : undefined}
            tabIndex={hasAction ? 0 : undefined}
            aria-label={hasAction ? message.title + ': ' + message.content : undefined}
            onKeyDown={hasAction ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick?.(message);
                }
            } : undefined}
            className={cn(
                "group relative flex gap-3 rounded-xl border border-transparent p-2.5 transition-colors",
                unread ? "bg-primary/[0.04] hover:bg-primary/[0.07]" : "hover:bg-accent/50",
                hasAction && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            )}
            onClick={() => onClick?.(message)}
        >
            {/* Unread accent */}
            {unread && (
                <span className={cn(
                    "absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full",
                    meta.accentClass,
                )} />
            )}

            {/* Media */}
            {showAvatar ? (
                <Avatar className="h-9 w-9 shrink-0">
                    {message.sender?.avatar && (
                        <AvatarImage src={message.sender.avatar} alt={senderName} />
                    )}
                    <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                        {getInitials(senderName!)}
                    </AvatarFallback>
                </Avatar>
            ) : (
                <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    meta.tileClass,
                )}>
                    {meta.icon}
                </div>
            )}

            {/* Content */}
            <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                    <span className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        unread ? "font-semibold text-foreground" : "font-medium text-foreground/85",
                    )}>
                        {message.title}
                    </span>
                    {unread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <time
                        className="shrink-0 whitespace-nowrap pt-0.5 text-[11px] text-muted-foreground/70 transition-opacity group-hover:opacity-0"
                        title={message.timestamp.toLocaleString()}
                        dateTime={message.timestamp.toISOString()}
                    >
                        {timeAgo}
                    </time>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        meta.chipClass,
                    )}>
                        <span className="[&>svg]:h-3 [&>svg]:w-3">{meta.icon}</span>
                        {t(meta.labelKey)}
                    </span>
                    {hasAction && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/80">
                            <ExternalLink className="h-3 w-3" />
                            {t('messageBox.actions.clickToOpen')}
                        </span>
                    )}
                </div>

                <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground line-clamp-3">
                    {message.content}
                </p>
            </div>

            {/* Hover actions */}
            {(onMarkAsRead || onDelete) && (
                <div className="absolute right-2 top-2 hidden items-center gap-0.5 rounded-lg border bg-background/95 p-0.5 shadow-sm backdrop-blur group-hover:flex group-focus-within:flex">
                    {unread && onMarkAsRead && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(event) => {
                                event.stopPropagation();
                                onMarkAsRead(message.id);
                            }}
                            title={t('messageBox.actions.markAsRead')}
                            aria-label={t('messageBox.actions.markAsRead')}
                        >
                            <CheckCheck className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    {onDelete && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:text-destructive"
                            onClick={(event) => {
                                event.stopPropagation();
                                onDelete(message.id);
                            }}
                            title={t('messageBox.actions.delete')}
                            aria-label={t('messageBox.actions.delete')}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
});
MessageItem.displayName = 'MessageItem';

// Loading placeholder
const MessageListSkeleton = memo(() => (
    <div className="space-y-1 p-2">
        {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex gap-3 rounded-xl p-2.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2 pt-0.5">
                    <div className="flex items-center justify-between gap-4">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-10" />
                    </div>
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                </div>
            </div>
        ))}
    </div>
));
MessageListSkeleton.displayName = 'MessageListSkeleton';

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
    const [activeTab, setActiveTab] = useState<MessageTab>('all');

    // WebSocket connection
    const {
        messages: wsMessages,
        unreadCount: wsUnreadCount,
        isConnected,
        isConnecting,
        markAsRead: wsMarkAsRead,
        markAllAsRead: wsMarkAllAsRead,
        refreshUnreadCount,
        connect,
    } = useInstantMessage({ autoConnect: useWebSocket });

    // Convert WebSocket messages to UI format
    const convertedWsMessages = useMemo(
        () => wsMessages.map(apiMessageToUiMessage),
        [wsMessages],
    );

    // Use WebSocket messages or external messages
    const messages = useWebSocket ? convertedWsMessages : (externalMessages || []);

    // Newest first
    const sortedMessages = useMemo(
        () => [...messages].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
        [messages],
    );

    // Per-type unread counts (based on what is currently loaded)
    const counts = useMemo(() => {
        let all = 0;
        let system = 0;
        let collaboration = 0;
        for (const message of messages) {
            if (message.read) continue;
            all++;
            if (message.type === 'system') system++;
            else if (message.type === 'collaboration') collaboration++;
        }
        return { all, system, collaboration };
    }, [messages]);

    const unreadCount = useWebSocket ? Math.max(wsUnreadCount, counts.all) : counts.all;

    // Filter messages by tab
    const filteredMessages = useMemo(() => {
        if (activeTab === 'all') return sortedMessages;
        return sortedMessages.filter((message) => message.type === activeTab);
    }, [sortedMessages, activeTab]);

    const groups = useMemo(() => groupMessagesByDay(filteredMessages, t), [filteredMessages, t]);

    const showSkeleton = useWebSocket && isConnecting && messages.length === 0;

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

    // Handle manual refresh / reconnect
    const handleRefresh = useCallback(() => {
        if (!isConnected) connect();
        else refreshUnreadCount();
    }, [isConnected, connect, refreshUnreadCount]);

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

    const tabs: { key: MessageTab; icon: React.ReactNode; count: number }[] = [
        { key: 'all', icon: <Inbox className="h-3.5 w-3.5" />, count: counts.all },
        { key: 'system', icon: <Bell className="h-3.5 w-3.5" />, count: counts.system },
        { key: 'collaboration', icon: <Users className="h-3.5 w-3.5" />, count: counts.collaboration },
    ];

    const subtitle = isConnecting
        ? t('messageBox.connecting')
        : useWebSocket && !isConnected
            ? t('messageBox.disconnected')
            : unreadCount > 0
                ? t('messageBox.unreadCount', { count: unreadCount })
                : t('messageBox.catchUp');

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
                collisionPadding={8}
                className="w-[min(92vw,400px)] overflow-hidden rounded-xl border p-0 shadow-lg"
            >
                {/* Header */}
                <div className="relative border-b bg-muted/40 px-4 pb-3 pt-3.5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                                <Inbox className="h-[18px] w-[18px]" />
                                {unreadCount > 0 && (
                                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <h3 className="flex items-center gap-2 text-sm font-semibold leading-tight">
                                    {t('messageBox.title')}
                                </h3>
                                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                                    {isConnecting ? (
                                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                                    ) : useWebSocket && !isConnected ? (
                                        <WifiOff className="h-3 w-3 shrink-0 text-destructive" />
                                    ) : useWebSocket ? (
                                        <span className="relative flex h-2 w-2 shrink-0">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                        </span>
                                    ) : null}
                                    <span className={cn("truncate", useWebSocket && !isConnected && "text-destructive")}>
                                        {subtitle}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-0.5">
                            {useWebSocket && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={handleRefresh}
                                    title={t('messageBox.refresh')}
                                    aria-label={t('messageBox.refresh')}
                                >
                                    <RefreshCw className={cn("h-3.5 w-3.5", isConnecting && "animate-spin")} />
                                </Button>
                            )}
                            {unreadCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={handleMarkAllAsRead}
                                    title={t('messageBox.actions.markAllRead')}
                                    aria-label={t('messageBox.actions.markAllRead')}
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                </Button>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setOpen(false)}
                                title={t('messageBox.actions.close')}
                                aria-label={t('messageBox.actions.close')}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MessageTab)} className="w-full">
                    <TabsList className="h-10 w-full justify-start gap-0 rounded-none border-b bg-transparent p-0 px-2">
                        {tabs.map(({ key, icon, count }) => (
                            <TabsTrigger key={key} value={key} className={TAB_TRIGGER_CLASS}>
                                {icon}
                                <span>{t(`messageBox.tabs.${key}`)}</span>
                                {count > 0 && (
                                    <Badge
                                        variant="secondary"
                                        className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none"
                                    >
                                        {count > 99 ? '99+' : count}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {/* Force the Radix viewport's inner wrapper from display:table
                        to block so long unbreakable URLs wrap within the panel
                        width instead of overflowing horizontally. */}
                    <ScrollArea className="h-[min(58vh,360px)] [&_[data-radix-scroll-area-viewport]>div]:!block">
                        <TabsContent value={activeTab} className="m-0" forceMount>
                            {showSkeleton ? (
                                <MessageListSkeleton />
                            ) : filteredMessages.length > 0 ? (
                                <div className="p-2">
                                    {groups.map((group) => (
                                        <div key={group.key} className="mb-1 last:mb-0">
                                            <div className="flex items-center gap-3 px-1 pb-1 pt-2.5">
                                                <Separator className="flex-1 opacity-50" />
                                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                                    {group.label}
                                                </span>
                                                <Separator className="flex-1 opacity-50" />
                                            </div>
                                            <div className="space-y-1">
                                                {group.items.map((message) => (
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
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    icon={TAB_EMPTY_ICONS[activeTab]}
                                    title={t(`messageBox.empty.${activeTab}`)}
                                    description={t(`messageBox.empty.${activeTab}Desc`)}
                                    action={useWebSocket ? {
                                        label: t('messageBox.refresh'),
                                        onClick: handleRefresh,
                                    } : undefined}
                                />
                            )}
                        </TabsContent>
                    </ScrollArea>
                </Tabs>

                {/* Footer */}
                {messages.length > 0 && (
                    <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {t('messageBox.messageCount', { count: messages.length })}
                        </span>
                        <button
                            type="button"
                            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary transition-colors hover:underline"
                            onClick={() => setActiveTab('all')}
                        >
                            {t('messageBox.viewAll')}
                            <ChevronRight className="h-3 w-3" />
                        </button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
};

export default MessageBox;
