import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@kn/common'
import {
    AtSign,
    Check,
    ChevronRight,
    FolderClosed,
    FolderInput,
    FolderPlus,
    MoreHorizontal,
    Pencil,
    Plus,
    Trash2,
    X,
} from '@kn/icon'
import {
    Button,
    ConfirmDialog,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Input,
    Sheet,
    SheetContent,
    SheetTitle,
    cn,
} from '@kn/ui'
import type { ChatSessionGroup, ChatSessionMeta } from '../chat-sessions'
import { loadCollapsedGroups, saveCollapsedGroups } from '../chat-sessions'
import type { ChatTabStatus } from './ChatTabs'
import { ChatTabStatusLight } from './ChatTabs'
import { partitionSessionsByGroup, sessionPageTitle } from './session-list'

export interface SessionSidebarProps {
    /** Every known conversation, any order (the list sorts by recency itself). */
    sessions: ChatSessionMeta[]
    activeSessionId: string
    /** Per-conversation run status, reported by the mounted panels. */
    runStatus: Record<string, ChatTabStatus>
    /** Focus a conversation (mounting its panel when it is not mounted yet). */
    onSelect: (id: string) => void
    onNewSession: () => void
    /** Delete one conversation for good. */
    onDelete: (id: string) => void
    /** User-created conversation folders, already in display order. */
    groups: ChatSessionGroup[]
    /** Create a folder; returns its id (null when the name is blank / capped). */
    onCreateGroup: (name: string) => string | null
    onRenameGroup: (id: string, name: string) => void
    /** Delete a folder; its conversations return to the recency buckets. */
    onDeleteGroup: (id: string) => void
    /**
     * Move one conversation into a folder, or out of every folder with `null`.
     * Conversation ids only — the group id `null` is the "ungroup" verb.
     */
    onMoveSession: (sessionId: string, groupId: string | null) => void
    /**
     * Called after a navigation command (select / new). The desktop column
     * ignores it; the mobile sheet uses it to close itself.
     */
    onNavigate?: () => void
    /**
     * Render a close affordance in the header. Only the mobile sheet passes it —
     * an inline column is closed from the chat header's toggle.
     */
    onClose?: () => void
    className?: string
}

/** Tooltip-ish labels for the status light; the visual language matches the tabs. */
const STATUS_LABEL_KEY: Record<ChatTabStatus, string> = {
    idle: '',
    running: 'ai.chat.sessions.status.running',
    attention: 'ai.chat.sessions.status.attention',
    done: 'ai.chat.sessions.status.done',
    failed: 'ai.chat.sessions.status.failed',
}

const SessionRow: React.FC<{
    session: ChatSessionMeta
    isActive: boolean
    status: ChatTabStatus
    groups: ChatSessionGroup[]
    onSelect: () => void
    onDelete: () => void
    onMove: (groupId: string | null) => void
    rowRef?: React.Ref<HTMLDivElement>
}> = ({ session, isActive, status, groups, onSelect, onDelete, onMove, rowRef }) => {
    const { t } = useTranslation()
    const title = session.title || t('ai.chat.newChat')
    const pageTitle = sessionPageTitle(session)
    const statusKey = STATUS_LABEL_KEY[status]
    const deleteLabel = t('ai.chat.deleteChat', { title })
    const moveLabel = t('ai.chat.sessions.groups.moveTo')
    const actionClass = cn(
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground',
        isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 focus-visible:opacity-100',
    )

    return (
        <div
            ref={rowRef}
            className={cn(
                'group/session relative flex items-start gap-1 rounded-lg py-2 pl-2.5 pr-1.5 transition-colors',
                isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
        >
            <button
                type="button"
                onClick={onSelect}
                aria-current={isActive ? 'true' : undefined}
                title={pageTitle ? `${title} — @${pageTitle}` : title}
                className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
            >
                <span
                    className="mt-[3px] flex h-3 w-3 shrink-0 items-center justify-center"
                    title={statusKey ? t(statusKey, { defaultValue: status }) : undefined}
                    aria-hidden={!statusKey}
                >
                    <ChatTabStatusLight status={status} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className={cn('line-clamp-2 break-words text-xs leading-4', isActive && 'font-medium')}>
                        {title}
                    </span>
                    {pageTitle && (
                        <span className="mt-0.5 flex min-w-0 items-center gap-0.5 text-[10px] leading-3 text-muted-foreground/80">
                            <AtSign className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{pageTitle}</span>
                        </span>
                    )}
                </span>
            </button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={moveLabel}
                        title={moveLabel}
                        className={actionClass}
                    >
                        <FolderInput className="h-3 w-3" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        {moveLabel}
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                        disabled={!session.groupId}
                        onSelect={() => onMove(null)}
                        className="text-xs"
                    >
                        <X className="mr-1.5 h-3 w-3 opacity-60" />
                        {t('ai.chat.sessions.groups.ungroup')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {groups.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] leading-4 text-muted-foreground/70">
                            {t('ai.chat.sessions.groups.noGroups')}
                        </div>
                    ) : (
                        groups.map(group => (
                            <DropdownMenuItem
                                key={group.id}
                                onSelect={() => onMove(group.id)}
                                className="text-xs"
                            >
                                {session.groupId === group.id ? (
                                    <Check className="mr-1.5 h-3 w-3 shrink-0" />
                                ) : (
                                    <FolderClosed className="mr-1.5 h-3 w-3 shrink-0 opacity-60" />
                                )}
                                <span className="min-w-0 flex-1 truncate">{group.name}</span>
                            </DropdownMenuItem>
                        ))
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            <button
                type="button"
                aria-label={deleteLabel}
                title={deleteLabel}
                onClick={(event) => {
                    event.stopPropagation()
                    event.preventDefault()
                    onDelete()
                }}
                className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-destructive/15 hover:text-destructive',
                    isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 focus-visible:opacity-100',
                )}
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    )
}

/** The create / rename dialog both verbs share: one input, one confirm. */
type GroupDialogState = { mode: 'create' } | { mode: 'rename'; groupId: string; initial: string }

const GroupNameDialog: React.FC<{
    state: GroupDialogState | null
    onClose: () => void
    onSubmit: (name: string) => void
}> = ({ state, onClose, onSubmit }) => {
    const { t } = useTranslation()
    const [value, setValue] = useState('')

    useEffect(() => {
        if (!state) return
        setValue(state.mode === 'rename' ? state.initial : '')
    }, [state])

    const submit = () => {
        const trimmed = value.trim()
        if (!trimmed) return
        onSubmit(trimmed)
        onClose()
    }

    const title = state?.mode === 'rename'
        ? t('ai.chat.sessions.groups.renameTitle')
        : t('ai.chat.sessions.groups.newTitle')

    return (
        <Dialog open={!!state} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-sm">{title}</DialogTitle>
                    <DialogDescription className="sr-only">{title}</DialogDescription>
                </DialogHeader>
                <Input
                    autoFocus
                    value={value}
                    maxLength={64}
                    placeholder={t('ai.chat.sessions.groups.namePlaceholder')}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault()
                            submit()
                        }
                    }}
                    className="h-9 text-sm"
                />
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-9 sm:h-8"
                    >
                        {t('ai.chat.sessions.groups.cancel')}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={submit}
                        disabled={!value.trim()}
                        className="h-9 sm:h-8"
                    >
                        {state?.mode === 'rename'
                            ? t('ai.chat.sessions.groups.save')
                            : t('ai.chat.sessions.groups.create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * The conversation column of the full-page `/ai` surface.
 *
 * This is the session-management surface the tab strip used to be: "new chat"
 * up top and EVERY conversation below it. Conversations the user put into a
 * folder are listed under that folder (ordered by the folder's own position, and
 * shown even while empty so a new folder is visible); everything else keeps the
 * recency buckets — today / yesterday / previous 7 days / earlier — with the
 * same status light as the dock's tabs (running / waiting on you / finished in
 * the background / failed). Selecting a conversation focuses it; conversations
 * that were opened before stay mounted, so a background run keeps going.
 *
 * It is intentionally the same component in two containers:
 *  - inline column on desktop/tablet (`w-[232px]`, see `KernelHomePage`);
 *  - the content of a left sheet on mobile, where a column would eat the chat.
 */
export const SessionSidebar: React.FC<SessionSidebarProps> = ({
    sessions,
    activeSessionId,
    runStatus,
    onSelect,
    onNewSession,
    onDelete,
    groups,
    onCreateGroup,
    onRenameGroup,
    onDeleteGroup,
    onMoveSession,
    onNavigate,
    onClose,
    className,
}) => {
    const { t } = useTranslation()
    const { groups: folderSections, ungrouped } = useMemo(
        () => partitionSessionsByGroup(sessions, groups),
        [sessions, groups],
    )
    const activeRowRef = useRef<HTMLDivElement | null>(null)
    const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => loadCollapsedGroups())
    const [dialog, setDialog] = useState<GroupDialogState | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<ChatSessionGroup | null>(null)

    // The focused conversation must be visible in the list (its bucket can be
    // far down after a jump from a task / background task entry point).
    useEffect(() => {
        activeRowRef.current?.scrollIntoView({ block: 'nearest' })
    }, [activeSessionId])

    // Focusing a conversation inside a folded folder opens that folder — a
    // navigation from elsewhere must never land on an invisible row.
    const activeGroupId = useMemo(
        () => sessions.find(session => session.id === activeSessionId)?.groupId,
        [sessions, activeSessionId],
    )
    useEffect(() => {
        if (!activeGroupId) return
        setCollapsedGroups(prev => {
            if (!prev.includes(activeGroupId)) return prev
            const next = prev.filter(id => id !== activeGroupId)
            saveCollapsedGroups(next)
            return next
        })
    }, [activeGroupId])

    const toggleGroup = (id: string) => {
        setCollapsedGroups(prev => {
            const next = prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
            saveCollapsedGroups(next)
            return next
        })
    }

    const handleSelect = (id: string) => {
        onSelect(id)
        onNavigate?.()
    }
    const handleNew = () => {
        onNewSession()
        onNavigate?.()
    }

    return (
        <div
            className={cn(
                // Surface colour is the container's call: a modern-style pane is
                // plain background, the flat classic column is tinted.
                'flex h-full min-h-0 w-full flex-col',
                className,
            )}
        >
            {/* Same height and divider as the chat header next to it, so the
                horizontal rule runs continuously across the whole surface. */}
            <div className="flex h-10 shrink-0 items-center justify-between gap-1 border-b border-border/60 px-3">
                <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('ai.chat.sessions.title')}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setDialog({ mode: 'create' })}
                        aria-label={t('ai.chat.sessions.groups.new')}
                        title={t('ai.chat.sessions.groups.new')}
                        className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <FolderPlus className="h-3 w-3" />
                    </button>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('ai.chat.close')}
                            title={t('ai.chat.close')}
                            className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
            <div className="shrink-0 px-2 pb-1.5 pt-2">
                <button
                    type="button"
                    onClick={handleNew}
                    title={t('ai.chat.newChat')}
                    className="flex h-8 w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t('ai.chat.newChat')}</span>
                </button>
            </div>
            {/* Native scroll container on purpose: Radix ScrollArea puts a
                `display: table` box between the viewport and the content, which
                makes rows size to max-content — `truncate` then never gets a
                constrained width and titles were clipped mid-glyph instead of
                ending in an ellipsis. Global scrollbar styling (thin + auto-hide
                via `.scrollbar-auto-hide`) keeps the look identical. */}
            <div className="scrollbar-auto-hide min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <div className="px-1.5 pb-3">
                    {groups.length === 0 && (
                        <button
                            type="button"
                            onClick={() => setDialog({ mode: 'create' })}
                            className="mb-1 mt-1 flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground/70 transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
                        >
                            <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t('ai.chat.sessions.groups.new')}</span>
                        </button>
                    )}

                    {folderSections.map(({ group, sessions: rows }) => {
                        const collapsed = collapsedGroups.includes(group.id)
                        return (
                            <div key={group.id} className="pt-2 first:pt-0">
                                <div className="group/folder flex items-center gap-0.5 rounded-md pl-1 pr-0.5 transition-colors hover:bg-muted/40">
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.id)}
                                        aria-expanded={!collapsed}
                                        title={group.name}
                                        className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-[10px] font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
                                    >
                                        <ChevronRight
                                            className={cn(
                                                'h-3 w-3 shrink-0 transition-transform',
                                                !collapsed && 'rotate-90',
                                            )}
                                        />
                                        <FolderClosed className="h-3 w-3 shrink-0" />
                                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                                        {rows.length > 0 && (
                                            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                                                {rows.length}
                                            </span>
                                        )}
                                    </button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label={t('ai.chat.sessions.groups.manage')}
                                                title={t('ai.chat.sessions.groups.manage')}
                                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/folder:opacity-100 group-focus-within/folder:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                                            >
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-40">
                                            <DropdownMenuItem
                                                className="text-xs"
                                                onSelect={() => setDialog({
                                                    mode: 'rename',
                                                    groupId: group.id,
                                                    initial: group.name,
                                                })}
                                            >
                                                <Pencil className="mr-1.5 h-3 w-3 opacity-60" />
                                                {t('ai.chat.sessions.groups.rename')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="text-xs text-destructive focus:text-destructive"
                                                onSelect={() => setDeleteTarget(group)}
                                            >
                                                <Trash2 className="mr-1.5 h-3 w-3" />
                                                {t('ai.chat.sessions.groups.delete')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                {!collapsed && (
                                    <div className="flex flex-col gap-px">
                                        {rows.length === 0 ? (
                                            <div className="px-2 py-1.5 text-[10px] leading-3 text-muted-foreground/50">
                                                {t('ai.chat.sessions.groups.emptyFolder')}
                                            </div>
                                        ) : (
                                            rows.map(session => (
                                                <SessionRow
                                                    key={session.id}
                                                    rowRef={session.id === activeSessionId ? activeRowRef : undefined}
                                                    session={session}
                                                    isActive={session.id === activeSessionId}
                                                    status={runStatus[session.id] ?? 'idle'}
                                                    groups={groups}
                                                    onSelect={() => handleSelect(session.id)}
                                                    onDelete={() => onDelete(session.id)}
                                                    onMove={(groupId) => onMoveSession(session.id, groupId)}
                                                />
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {groups.length > 0 && ungrouped.length > 0 && (
                        <div className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                            {t('ai.chat.sessions.groups.ungrouped')}
                        </div>
                    )}
                    {ungrouped.map(bucket => (
                        <div key={bucket.bucket} className="pt-2 first:pt-0">
                            <div className="px-2 pb-1 text-[10px] font-medium text-muted-foreground/70">
                                {t(`ai.chat.sessions.${bucket.bucket}`)}
                            </div>
                            <div className="flex flex-col gap-px">
                                {bucket.sessions.map(session => (
                                    <SessionRow
                                        key={session.id}
                                        rowRef={session.id === activeSessionId ? activeRowRef : undefined}
                                        session={session}
                                        isActive={session.id === activeSessionId}
                                        status={runStatus[session.id] ?? 'idle'}
                                        groups={groups}
                                        onSelect={() => handleSelect(session.id)}
                                        onDelete={() => onDelete(session.id)}
                                        onMove={(groupId) => onMoveSession(session.id, groupId)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}

                    {ungrouped.length === 0 && groups.length === 0 && (
                        <div className="px-2 py-6 text-center text-[11px] text-muted-foreground/70">
                            {t('ai.chat.sessions.empty')}
                        </div>
                    )}
                </div>
            </div>

            <GroupNameDialog
                state={dialog}
                onClose={() => setDialog(null)}
                onSubmit={(name) => {
                    if (dialog?.mode === 'rename') onRenameGroup(dialog.groupId, name)
                    else onCreateGroup(name)
                }}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                title={t('ai.chat.sessions.groups.deleteTitle')}
                description={t('ai.chat.sessions.groups.deleteConfirm', {
                    name: deleteTarget?.name ?? '',
                })}
                confirmLabel={t('ai.chat.sessions.groups.delete')}
                cancelLabel={t('ai.chat.sessions.groups.cancel')}
                variant="destructive"
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={() => {
                    if (deleteTarget) onDeleteGroup(deleteTarget.id)
                    setDeleteTarget(null)
                }}
            />
        </div>
    )
}

/**
 * Mobile container for {@link SessionSidebar}: a sheet from the left, opened from
 * the chat header. A 232px column on a phone-width chat leaves no room for the
 * conversation, so the list arrives on demand instead of living inline.
 */
export const SessionSidebarSheet: React.FC<{
    open: boolean
    onOpenChange: (open: boolean) => void
    content: React.ReactNode
}> = ({ open, onOpenChange, content }) => {
    const { t } = useTranslation()
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="left" hideClose className="w-[280px] max-w-[85vw] p-0">
                <SheetTitle className="sr-only">{t('ai.chat.sessions.title')}</SheetTitle>
                {content}
            </SheetContent>
        </Sheet>
    )
}