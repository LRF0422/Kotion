import React, {
    FormEvent,
    forwardRef,
    useEffect,
    useRef,
    useState,
} from 'react'
import { Send, Square, MessageCircle, Bot, FileDiff } from '@kn/icon'
import {
    Button,
    ChatInput,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@kn/ui'
import type { ChatMode, ChatModelParams } from '@kn/common'
import { useTranslation } from '@kn/common'

import { ModelSelector } from '../../components/ModelSelector'
import type { ChatTargetPage } from '../chat-sessions'
import { PageMentionPicker, TargetPageStatus } from './PageMentionPicker'

// ─── Mode toggle ───────────────────────────────────────────────────

interface ModeToggleProps {
    mode: ChatMode
    onModeChange: (mode: ChatMode) => void
    disabled?: boolean
}

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onModeChange, disabled }) => {
    const { t } = useTranslation()
    const modes: { id: ChatMode; label: string; icon: React.ReactNode; hint: string }[] = [
        { id: 'ask', label: t('ai.chat.modeAsk', { defaultValue: 'Ask' }), icon: <MessageCircle className="h-3 w-3" />, hint: t('ai.chat.modeAskHint', { defaultValue: 'Ask 模式 — 仅回答，只读' }) },
        { id: 'agent', label: t('ai.chat.modeAgent', { defaultValue: 'Agent' }), icon: <Bot className="h-3 w-3" />, hint: t('ai.chat.modeAgentHint', { defaultValue: 'Agent 模式 — 可编辑文档' }) },
    ]
    return (
        <div className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium lg:text-[11px]">
            {modes.map((m) => {
                const active = mode === m.id
                return (
                    <button
                        key={m.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onModeChange(m.id)}
                        title={m.hint}
                        className={
                            'flex h-11 items-center gap-1.5 rounded-lg px-2.5 transition-colors disabled:opacity-50 lg:h-7 lg:gap-1 lg:rounded-md lg:px-2 ' +
                            (active
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')
                        }
                    >
                        {m.icon}
                        <span>{m.label}</span>
                    </button>
                )
            })}
        </div>
    )
}

// ─── Composer ──────────────────────────────────────────────────────

interface ChatComposerProps {
    value: string
    onChange: (value: string) => void
    onSubmit: () => void
    onStop: () => void
    isLoading: boolean
    mode: ChatMode
    onModeChange: (mode: ChatMode) => void
    model: string
    onModelChange: (model: string) => void
    modelParams: ChatModelParams
    onModelParamsChange: (params: ChatModelParams) => void
    /** @-page binding of the active session (rendered as a chip row). */
    targetPage?: ChatTargetPage
    /** Page hosting this chat — shown as the implicit default target. */
    currentPage?: ChatTargetPage
    targetStatus: TargetPageStatus
    onPickPage: (page: ChatTargetPage) => void
    onClearPage: () => void
    onRetryPage: () => void
    /** Open the bound page in the floating PageEditWindow. */
    onOpenPageWindow: () => void
    /** Whether change tracking is active on the target editor. */
    tracking?: boolean
    /** Toggle the editor's change tracker; merging happens in the editor. */
    onToggleTracking?: () => void
}

/**
 * Composer surface — a single rounded card with an auto-grow textarea and a
 * subtle toolbar row (mode toggle, model selector, send button).  Removed
 * legacy "attach"/"settings" placeholder buttons so the affordance stays
 * focused on what actually works.
 */
export const ChatComposer = forwardRef<HTMLTextAreaElement, ChatComposerProps>(function ChatComposer(
    {
        value, onChange, onSubmit, onStop, isLoading,
        mode, onModeChange, model, onModelChange,
        modelParams, onModelParamsChange,
        targetPage, currentPage, targetStatus, onPickPage, onClearPage, onRetryPage, onOpenPageWindow,
        tracking, onToggleTracking,
    },
    ref,
) {
    const { t } = useTranslation()
    const inputRef = useRef<HTMLTextAreaElement | null>(null)
    // Popover of the @-page picker; typing `@` at a word boundary opens it.
    const [mentionOpen, setMentionOpen] = useState(false)
    // Expose the internal ref to the parent.
    React.useImperativeHandle(ref, () => inputRef.current as HTMLTextAreaElement)

    // Auto-grow the textarea with its content (capped at ~5 lines).
    useEffect(() => {
        const el = inputRef.current
        if (!el) return
        el.style.maxHeight = '120px'
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }, [value])

    const connecting = targetStatus === 'connecting'
    const targetUnavailable = connecting || targetStatus === 'error'
    const isValid = value.trim().length > 0 && !isLoading && !targetUnavailable

    const handleFormSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (!isValid) return
        onSubmit()
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (isValid) onSubmit()
            return
        }
        // `@` at the start or after whitespace opens the page picker.
        if (e.key === '@' && !targetPage) {
            const el = e.currentTarget
            const before = el.value.slice(0, el.selectionStart ?? 0)
            if (before === '' || /\s$/.test(before)) {
                e.preventDefault()
                setMentionOpen(true)
            }
        }
    }

    return (
        <form
            onSubmit={handleFormSubmit}
            className="relative rounded-xl border border-border/60 bg-background transition-colors focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/15"
        >
            <PageMentionPicker
                targetPage={targetPage}
                currentPage={currentPage}
                status={targetStatus}
                disabled={isLoading}
                open={mentionOpen}
                onOpenChange={setMentionOpen}
                onPick={onPickPage}
                onClear={onClearPage}
                onRetry={onRetryPage}
                onOpenWindow={onOpenPageWindow}
            />
            <ChatInput
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                    connecting
                        ? t('ai.chat.targetPageConnectingPlaceholder', { defaultValue: '正在连接目标页面…' })
                        : mode === 'ask'
                            ? t('ai.chat.askPlaceholder', { defaultValue: '向 AI 提问关于文档的问题…' })
                            : t('ai.chat.agentPlaceholder', { defaultValue: '提问、编辑或自动化任何事情…' })
                }
                disabled={isLoading}
                rows={1}
                className="min-h-[48px] max-h-[120px] resize-none overflow-y-auto rounded-xl border-0 bg-transparent px-3 pb-1 pt-2.5 text-sm leading-relaxed shadow-none placeholder:text-muted-foreground/45 focus-visible:ring-0 lg:min-h-[38px] lg:pt-2 lg:text-[13px]"
            />
            {/* Toolbar. Secondary controls stay icon-only (agent picker when on
                the default agent, change-tracking toggle) and sampling params are
                folded into the model menu, so the row fits one line even in the
                narrow side dock. `flex-wrap` remains as a safety net; `ml-auto`
                keeps send right-aligned on whichever line it lands on. */}
            <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5 pt-0.5">
                <ModeToggle mode={mode} onModeChange={onModeChange} disabled={isLoading} />
                <ModelSelector
                    model={model}
                    onModelChange={onModelChange}
                    modelParams={modelParams}
                    onModelParamsChange={onModelParamsChange}
                    disabled={isLoading}
                    triggerClassName="hover:bg-muted/60"
                />
                {onToggleTracking && (
                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={onToggleTracking}
                        aria-pressed={tracking}
                        title={
                            (tracking
                                ? t('ai.chat.trackingOn', { defaultValue: '跟踪中' })
                                : t('ai.chat.trackingOff', { defaultValue: '跟踪变动' })) +
                            ' — ' +
                            t('ai.chat.trackingHint', { defaultValue: '跟踪文档变动，可在编辑器中审阅并合并' })
                        }
                        className={
                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50 lg:h-7 lg:w-7 lg:rounded-md ' +
                            (tracking
                                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/70')
                        }
                    >
                        <FileDiff className="h-3 w-3 shrink-0" />
                    </button>
                )}
                <div className="ml-auto shrink-0">
                    {isLoading ? (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        className="h-11 gap-1.5 rounded-xl px-3 lg:h-8 lg:rounded-lg lg:px-2.5"
                                        onClick={onStop}
                                    >
                                        <Square className="h-3.5 w-3.5" />
                                        <span className="text-xs font-medium lg:text-[10px]">
                                            {t('ai.stop', { defaultValue: '停止' })}
                                        </span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                    {t('ai.chat.stopGeneration', { defaultValue: '停止生成' })}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : (
                        <Button
                            type="submit"
                            size="sm"
                            aria-label={t('ai.chat.send', { defaultValue: '发送消息' })}
                            disabled={!isValid}
                            className="h-11 w-11 rounded-xl bg-primary p-0 text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 lg:h-8 lg:w-8 lg:rounded-lg"
                        >
                            <Send className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>
        </form>
    )
})
