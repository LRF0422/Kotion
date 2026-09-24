import React, {
    FormEvent,
    forwardRef,
    useEffect,
    useRef,
    useState,
} from 'react'
import { Send, Square, MessageCircle, Bot, FileDiff, ImagePlus, ImageOff, X } from '@kn/icon'
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
import { AgentSelector } from '../../components/AgentSelector'
import type { ChatTargetPage } from '../chat-sessions'
import { PageMentionPicker, TargetPageStatus } from './PageMentionPicker'

// TEMP(chat): the change-tracking toggle is hidden in the chat composer for now.
// Flip this back to `true` to restore the button.
const SHOW_TRACKING_TOGGLE: boolean = false

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
    /**
     * Hide the "@-page" affordance. Workspace-scoped surfaces have no document
     * to bind, so the chip would only advertise something that does not apply.
     */
    hideTargetPage?: boolean
    onPickPage: (page: ChatTargetPage) => void
    onClearPage: () => void
    onRetryPage: () => void
    /** Open the bound page in the floating PageEditWindow. */
    onOpenPageWindow: () => void
    /** Whether change tracking is active on the target editor. */
    tracking?: boolean
    /** Toggle the editor's change tracker; merging happens in the editor. */
    onToggleTracking?: () => void
    /** Pending image attachments, as `data:` URLs for preview. */
    images?: string[]
    /** Add image files picked or pasted by the user. */
    onAddImages?: (files: File[]) => void
    /** Remove the attachment at the given index. */
    onRemoveImage?: (index: number) => void
    /**
     * Whether the selected model accepts image input. `undefined` = unknown
     * (catalog not loaded, custom model id, or backend default) and never
     * blocks anything — only a *known* non-vision model does.
     */
    visionSupported?: boolean
    /** Model id to name in the non-vision warnings. */
    visionModelLabel?: string
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
        targetPage, currentPage, targetStatus, hideTargetPage, onPickPage, onClearPage, onRetryPage, onOpenPageWindow,
        tracking, onToggleTracking, images, onAddImages, onRemoveImage,
        visionSupported, visionModelLabel,
    },
    ref,
) {
    const { t } = useTranslation()
    const inputRef = useRef<HTMLTextAreaElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
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
    const hasImages = (images?.length ?? 0) > 0
    // The backend silently drops image parts for a model it knows cannot see
    // them, so attaching one there only produces a confusing "看不到图片"
    // answer. Block the upload up front — but only on a *known* non-vision
    // model (see the prop docs), and never silently: the button tooltip and the
    // warning below both say what to do.
    const visionBlocked = visionSupported === false
    const visionModel = visionModelLabel || t('ai.chat.thisModel', { defaultValue: '当前模型' })
    const attachImageLabel = visionBlocked
        ? t('ai.chat.attachImageBlocked', {
            model: visionModel,
            defaultValue: '当前模型「{{model}}」不支持图片识图，请先切换到支持识图的模型',
        })
        : t('ai.chat.attachImage', { defaultValue: '上传图片（模型可直接查看）' })
    const blockedByAttachedImages = visionBlocked && hasImages
    const isValid = (value.trim().length > 0 || hasImages)
        && !isLoading && !targetUnavailable && !blockedByAttachedImages

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

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const files = Array.from(e.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'))
        if (files.length === 0) return
        e.preventDefault()
        // A pasted image would be dropped by the backend on a non-vision model;
        // swallow it and let the parent surface the reason (Chat.tsx).
        if (visionBlocked) return
        onAddImages?.(files)
    }

    const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        if (files.length > 0) onAddImages?.(files)
        // Allow re-picking the same file.
        e.target.value = ''
    }

    return (
        <form
            onSubmit={handleFormSubmit}
            className="relative rounded-xl border border-border/60 bg-background transition-colors focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/15"
        >
            {blockedByAttachedImages && (
                <div
                    role="status"
                    className="mx-2 mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300"
                >
                    <ImageOff aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                        {t('ai.chat.visionUnsupportedWarning', {
                            model: visionModel,
                            defaultValue: '当前模型「{{model}}」不支持图片输入，这些图片不会发送给模型。请切换到支持识图的模型，或移除图片后再发送。',
                        })}
                    </span>
                </div>
            )}
            {!hideTargetPage && (
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
            )}
            {images && images.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                    {images.map((src, index) => (
                        <div key={index} className="group/image relative">
                            <img
                                src={src}
                                alt=""
                                className="h-14 w-14 rounded-lg border border-border/50 object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => onRemoveImage?.(index)}
                                aria-label={t('ai.chat.removeImage', { defaultValue: '移除图片' })}
                                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/80 text-background transition-opacity hover:bg-foreground"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handlePickFiles}
            />
            <ChatInput
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
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
            {/* Toolbar. Secondary controls stay icon-only (the change-tracking
                toggle is temporarily hidden — see SHOW_TRACKING_TOGGLE) and
                sampling params are folded into the model menu, so the row fits one
                line even in the narrow side dock. `flex-wrap` remains as a safety
                net; `ml-auto` keeps send right-aligned on whichever line it lands
                on. */}
            <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5 pt-0.5">
                <ModeToggle mode={mode} onModeChange={onModeChange} disabled={isLoading} />
                <AgentSelector disabled={isLoading} triggerClassName="hover:bg-muted/60" />
                {onAddImages && (
                    <button
                        type="button"
                        disabled={isLoading || visionBlocked}
                        onClick={() => fileInputRef.current?.click()}
                        title={attachImageLabel}
                        aria-label={attachImageLabel}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50 lg:h-7 lg:w-7 lg:rounded-md"
                    >
                        <ImagePlus className="h-3.5 w-3.5 shrink-0" />
                    </button>
                )}
                <ModelSelector
                    model={model}
                    onModelChange={onModelChange}
                    modelParams={modelParams}
                    onModelParamsChange={onModelParamsChange}
                    disabled={isLoading}
                    triggerClassName="hover:bg-muted/60"
                />
                {SHOW_TRACKING_TOGGLE && onToggleTracking && (
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
