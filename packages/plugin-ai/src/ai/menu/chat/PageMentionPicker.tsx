import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AtSign, FileText, LoaderCircle, Pencil, Search, X } from '@kn/icon'
import {
    Button,
    Input,
    Popover,
    PopoverContent,
    PopoverTrigger,
    cn,
} from '@kn/ui'
import { getOffscreenEditorBridge, useTranslation } from '@kn/common'
import type { OffscreenPageSummary } from '@kn/common'

import type { ChatTargetPage } from '../chat-sessions'

// ─── Types ─────────────────────────────────────────────────────────

/** Connection state of the active session's off-screen target editor. */
export type TargetPageStatus = 'idle' | 'connecting' | 'ready' | 'current' | 'error'

interface PageMentionPickerProps {
    targetPage?: ChatTargetPage
    /** Page hosting this chat instance — the implicit default binding. */
    currentPage?: ChatTargetPage
    status: TargetPageStatus
    disabled?: boolean
    /** Popover visibility is owned by the composer (typing `@` also opens it). */
    open: boolean
    onOpenChange: (open: boolean) => void
    onPick: (page: ChatTargetPage) => void
    onClear: () => void
    /** Re-acquire the off-screen editor after a failure. */
    onRetry: () => void
    /** Open the bound page in a draggable floating editor window (PageEditWindow). */
    onOpenWindow: () => void
}

// ─── Status dot ────────────────────────────────────────────────────

const STATUS_DOT: Record<Exclude<TargetPageStatus, 'idle'>, string> = {
    connecting: 'bg-amber-500 animate-pulse',
    ready: 'bg-green-500',
    current: 'bg-green-500',
    error: 'bg-destructive',
}

// ─── Picker ────────────────────────────────────────────────────────

/**
 * "@-page" affordance rendered above the composer input. Unbound: a chip
 * showing the current page (the implicit default target) that doubles as the
 * trigger of a page-search popover backed by the core off-screen editing
 * bridge. Bound: a chip showing the target page, its editor connection state,
 * an open-in-floating-window button and a remove button. Chat sessions each
 * bind one page.
 */
export const PageMentionPicker: React.FC<PageMentionPickerProps> = ({
    targetPage, currentPage, status, disabled, open, onOpenChange, onPick, onClear, onRetry, onOpenWindow,
}) => {
    const { t } = useTranslation()
    const bridge = getOffscreenEditorBridge()

    const [query, setQuery] = useState('')
    const [results, setResults] = useState<OffscreenPageSummary[]>([])
    const [searching, setSearching] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const searchSeqRef = useRef(0)

    const runSearch = useCallback((q: string) => {
        if (!bridge) return
        const seq = ++searchSeqRef.current
        setSearching(true)
        bridge.searchPages(q.trim() || undefined)
            .then(pages => {
                if (seq !== searchSeqRef.current) return
                setResults(pages)
            })
            .catch(() => {
                if (seq !== searchSeqRef.current) return
                setResults([])
            })
            .finally(() => {
                if (seq === searchSeqRef.current) setSearching(false)
            })
    }, [bridge])

    // Fresh recent-pages list every time the popover opens.
    useEffect(() => {
        if (!open) return
        setQuery('')
        runSearch('')
    }, [open, runSearch])

    // Debounced keyword search.
    const handleQueryChange = useCallback((value: string) => {
        setQuery(value)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => runSearch(value), 300)
    }, [runSearch])

    useEffect(() => () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
    }, [])

    const handleSelect = useCallback((page: OffscreenPageSummary) => {
        onOpenChange(false)
        onPick({ pageId: String(page.id), title: page.title || 'Untitled', spaceId: page.spaceId })
    }, [onOpenChange, onPick])

    // The whole affordance is hidden when the engine isn't registered.
    if (!bridge) return null

    // ── Bound: chip with status dot + remove ──
    if (targetPage) {
        const statusText = status === 'connecting'
            ? t('ai.chat.targetPageConnecting', { defaultValue: '连接中…' })
            : status === 'error'
                ? t('ai.chat.targetPageError', { defaultValue: '连接失败，点击重试' })
                : status === 'current'
                    ? t('ai.chat.targetPageCurrent', { defaultValue: '当前页面' })
                    : t('ai.chat.targetPageReady', { defaultValue: '离屏编辑就绪' })
        return (
            <div className="flex items-center px-2 pt-1.5">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={status === 'error' ? onRetry : undefined}
                    title={statusText}
                    className={cn(
                        'inline-flex items-center gap-1 h-5 pl-1.5 pr-0.5 rounded-md max-w-full',
                        'bg-muted/70 text-[10px] font-medium text-foreground/80',
                        status === 'error' ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
                    )}
                >
                    <AtSign className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate max-w-[160px]">{targetPage.title}</span>
                    {status !== 'idle' && (
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[status])} />
                    )}
                    {status !== 'current' && (
                        <span
                            role="button"
                            aria-label={t('ai.chat.targetPageOpenWindow', { defaultValue: '在浮窗中打开' })}
                            title={t('ai.chat.targetPageOpenWindow', { defaultValue: '在浮窗中打开' })}
                            className="flex items-center justify-center h-4 w-4 rounded-sm hover:bg-background/80 text-muted-foreground hover:text-foreground shrink-0"
                            onClick={(e) => { e.stopPropagation(); if (!disabled) onOpenWindow() }}
                        >
                            <Pencil className="h-2.5 w-2.5" />
                        </span>
                    )}
                    <span
                        role="button"
                        aria-label={t('ai.chat.targetPageRemove', { defaultValue: '移除页面绑定' })}
                        className="flex items-center justify-center h-4 w-4 rounded-sm hover:bg-background/80 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={(e) => { e.stopPropagation(); if (!disabled) onClear() }}
                    >
                        <X className="h-2.5 w-2.5" />
                    </span>
                </button>
            </div>
        )
    }

    // ── Unbound: defaults to the current page; the chip doubles as the
    // trigger of the search popover so any other page can be picked. ──
    return (
        <div className="flex items-center px-2 pt-1.5">
            <Popover open={open} onOpenChange={onOpenChange}>
                <PopoverTrigger asChild disabled={disabled}>
                    {currentPage ? (
                        <button
                            type="button"
                            disabled={disabled}
                            title={t('ai.chat.targetPageDefaultHint', { defaultValue: '默认作用于当前页面，点击可指定其他页面' })}
                            className={cn(
                                'inline-flex items-center gap-1 h-5 px-1.5 rounded-md max-w-full',
                                'bg-muted/70 text-[10px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50 transition-colors',
                            )}
                        >
                            <AtSign className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate max-w-[160px]">{currentPage.title}</span>
                            <span className="shrink-0 text-[9px] text-muted-foreground/70">
                                {t('ai.chat.targetPageCurrent', { defaultValue: '当前页面' })}
                            </span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={disabled}
                            className="flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
                        >
                            <AtSign className="h-3 w-3" />
                            <span>{t('ai.chat.targetPagePick', { defaultValue: '指定页面' })}</span>
                        </button>
                    )}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[260px] p-1.5" onOpenAutoFocus={(e) => e.preventDefault()}>
                    <div className="relative mb-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                            autoFocus
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            placeholder={t('ai.chat.targetPageSearch', { defaultValue: '搜索页面…' })}
                            className="h-6 pl-6 text-[11px] rounded-md"
                        />
                    </div>
                    <div className="max-h-[220px] overflow-y-auto">
                        {searching && results.length === 0 && (
                            <div className="flex items-center gap-1.5 px-2 py-2 text-[10px] text-muted-foreground">
                                <LoaderCircle className="h-3 w-3 animate-spin" />
                                {t('ai.chat.targetPageSearching', { defaultValue: '搜索中…' })}
                            </div>
                        )}
                        {!searching && results.length === 0 && (
                            <div className="px-2 py-2 text-[10px] text-muted-foreground">
                                {t('ai.chat.targetPageNoResults', { defaultValue: '未找到页面' })}
                            </div>
                        )}
                        {results.map((page) => (
                            <Button
                                key={page.id}
                                variant="ghost"
                                onClick={() => handleSelect(page)}
                                className="w-full h-auto justify-start gap-1.5 px-2 py-1 rounded-md"
                            >
                                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate text-left text-[11px]">
                                    {page.title || 'Untitled'}
                                </span>
                                {page.spaceName && (
                                    <span className="shrink-0 text-[9px] text-muted-foreground/70 truncate max-w-[70px]">
                                        {page.spaceName}
                                    </span>
                                )}
                            </Button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}
