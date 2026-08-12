import React, {
    FormEvent,
    forwardRef,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { Send, Square, Sparkles, ChevronDown, Check, MessageCircle, Bot, FileDiff } from '@kn/icon'
import {
    Button,
    ChatInput,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@kn/ui'
import type { AgentDefinition, ChatMode, ChatModelParams, ModelInfo } from '@kn/common'
import { fetchModels, listAgentDefinitions, useTranslation } from '@kn/common'

import type { ChatTargetPage } from '../chat-sessions'
import { ModelParamsPopover } from './ModelParamsPopover'
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
        <div className="inline-flex shrink-0 items-center p-0.5 rounded-md bg-muted/70 text-[10px] font-medium">
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
                            'flex items-center gap-1 px-1.5 h-5 rounded-sm transition-colors disabled:opacity-50 ' +
                            (active
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground')
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

// ─── Model selector ────────────────────────────────────────────────

interface ModelSelectorProps {
    model: string
    onModelChange: (model: string) => void
    disabled?: boolean
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ model, onModelChange, disabled }) => {
    const { t } = useTranslation()
    const [models, setModels] = useState<ModelInfo[]>([])
    const [open, setOpen] = useState(false)
    const loadedRef = useRef(false)

    useEffect(() => {
        if (open && !loadedRef.current) {
            loadedRef.current = true
            fetchModels().then(setModels)
        }
    }, [open])

    const grouped = useMemo(() => {
        const map = new Map<string, ModelInfo[]>()
        for (const m of models) {
            const provider = m.provider || 'other'
            if (!map.has(provider)) map.set(provider, [])
            map.get(provider)!.push(m)
        }
        return map
    }, [models])

    const displayLabel = model || 'deepseek-chat'

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <button
                    type="button"
                    disabled={disabled}
                    className="flex shrink-0 items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
                >
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="max-w-[90px] truncate">{displayLabel}</span>
                    <ChevronDown className="h-2.5 w-2.5 shrink-0" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px]">
                {models.length === 0 && (
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                        {t('ai.chat.loadingModels', { defaultValue: '加载模型中…' })}
                    </div>
                )}
                {Array.from(grouped.entries()).map(([provider, providerModels]) => (
                    <React.Fragment key={provider}>
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {provider}
                        </div>
                        {providerModels.map((m) => (
                            <DropdownMenuItem
                                key={m.id}
                                onClick={() => onModelChange(m.id)}
                                className="flex items-center justify-between text-xs"
                            >
                                <span className="truncate">{m.name || m.id}</span>
                                {model === m.id && <Check className="h-3 w-3 text-primary shrink-0 ml-1" />}
                            </DropdownMenuItem>
                        ))}
                    </React.Fragment>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// ─── Agent selector ────────────────────────────────────────────────

interface AgentSelectorProps {
    agentId?: number
    onAgentChange: (agentId: number | undefined) => void
    disabled?: boolean
}

/**
 * Custom-agent picker: default agent + tenant-scoped custom definitions.
 * The list reloads on every open so edits from the manager dialog show up
 * without a page refresh.
 */
const AgentSelector: React.FC<AgentSelectorProps> = ({ agentId, onAgentChange, disabled }) => {
    const { t } = useTranslation()
    const [agents, setAgents] = useState<AgentDefinition[]>([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) return
        setLoading(true)
        listAgentDefinitions()
            .then(setAgents)
            .catch(() => setAgents([]))
            .finally(() => setLoading(false))
    }, [open])

    const defaultLabel = t('ai.chat.agentDefault', { defaultValue: '默认 Agent' })
    const selected = agents.find((a) => a.id === agentId)
    const displayLabel = agentId == null ? defaultLabel : (selected?.name || `#${agentId}`)

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <button
                    type="button"
                    disabled={disabled}
                    title={t('ai.chat.agentSelectorHint', { defaultValue: '选择自定义 Agent' })}
                    className="flex shrink-0 items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
                >
                    <Bot className="h-3 w-3 shrink-0" />
                    <span className="max-w-[80px] truncate">{displayLabel}</span>
                    <ChevronDown className="h-2.5 w-2.5 shrink-0" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[240px]">
                <DropdownMenuItem
                    onClick={() => onAgentChange(undefined)}
                    className="flex items-center justify-between text-xs"
                >
                    <span className="truncate">{defaultLabel}</span>
                    {agentId == null && <Check className="h-3 w-3 text-primary shrink-0 ml-1" />}
                </DropdownMenuItem>
                {loading && agents.length === 0 && (
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                        {t('ai.chat.loadingAgents', { defaultValue: '加载 Agent 中…' })}
                    </div>
                )}
                {agents.filter((a) => a.enabled !== false).map((a) => (
                    <DropdownMenuItem
                        key={a.id}
                        onClick={() => onAgentChange(a.id)}
                        className="flex items-start justify-between text-xs"
                    >
                        <div className="min-w-0">
                            <div className="truncate">{a.name}</div>
                            {a.description && (
                                <div className="truncate text-[10px] text-muted-foreground">{a.description}</div>
                            )}
                        </div>
                        {agentId === a.id && <Check className="h-3 w-3 text-primary shrink-0 ml-1 mt-0.5" />}
                    </DropdownMenuItem>
                ))}
                {!loading && agents.length === 0 && (
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                        {t('ai.chat.noCustomAgents', { defaultValue: '暂无自定义 Agent' })}
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
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
    /** Selected custom agent definition id; undefined = default agent. */
    agentId?: number
    onAgentChange: (agentId: number | undefined) => void
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
        agentId, onAgentChange,
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
    const isValid = value.trim().length > 0 && !isLoading && !connecting

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
            className="relative rounded-xl border border-border/60 bg-background focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/20 transition-all"
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
                className="min-h-[44px] max-h-[120px] overflow-y-auto resize-none rounded-xl bg-transparent border-0 px-3 pt-2.5 pb-1 text-[13px] leading-relaxed shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            />
            {/* Toolbar. Wraps rather than overflows: the controls' intrinsic width
                (~390px) exceeds a side-dock panel, and a nowrap row there clipped
                the model label and crushed the send button on top of it. `ml-auto`
                keeps send right-aligned on whichever line it lands on, so a wide
                floating chat still reads as a single justified row. */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-2 pb-1.5 pt-0.5">
                <ModeToggle mode={mode} onModeChange={onModeChange} disabled={isLoading} />
                <AgentSelector agentId={agentId} onAgentChange={onAgentChange} disabled={isLoading} />
                <ModelSelector model={model} onModelChange={onModelChange} disabled={isLoading} />
                <ModelParamsPopover
                    params={modelParams}
                    onChange={onModelParamsChange}
                    disabled={isLoading}
                />
                {onToggleTracking && (
                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={onToggleTracking}
                        title={t('ai.chat.trackingHint', { defaultValue: '跟踪文档变动，可在编辑器中审阅并合并' })}
                        className={
                            'flex shrink-0 items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-medium transition-colors disabled:opacity-50 ' +
                            (tracking
                                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/70')
                        }
                    >
                        <FileDiff className="h-3 w-3 shrink-0" />
                        <span>
                            {tracking
                                ? t('ai.chat.trackingOn', { defaultValue: '跟踪中' })
                                : t('ai.chat.trackingOff', { defaultValue: '跟踪变动' })}
                        </span>
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
                                        className="h-7 px-2.5 gap-1 rounded-lg"
                                        onClick={onStop}
                                    >
                                        <Square className="h-3 w-3" />
                                        <span className="text-[10px] font-medium">
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
                            className="h-7 w-7 p-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            <Send className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>
        </form>
    )
})
