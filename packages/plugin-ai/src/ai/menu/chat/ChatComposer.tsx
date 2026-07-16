import React, {
    FormEvent,
    forwardRef,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { Send, Square, Sparkles, ChevronDown, Check, MessageCircle, Bot } from '@kn/icon'
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
import type { ChatMode, ModelInfo } from '@kn/common'
import { fetchModels } from '@kn/common'

// ─── Mode toggle ───────────────────────────────────────────────────

interface ModeToggleProps {
    mode: ChatMode
    onModeChange: (mode: ChatMode) => void
    disabled?: boolean
}

const MODES: { id: ChatMode; label: string; icon: React.ReactNode; hint: string }[] = [
    { id: 'ask', label: 'Ask', icon: <MessageCircle className="h-3 w-3" />, hint: 'Ask mode — answer only, read-only' },
    { id: 'agent', label: 'Agent', icon: <Bot className="h-3 w-3" />, hint: 'Agent mode — can edit the document' },
]

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onModeChange, disabled }) => (
    <div className="inline-flex items-center p-0.5 rounded-md bg-muted/70 text-[10px] font-medium">
        {MODES.map((m) => {
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

// ─── Model selector ────────────────────────────────────────────────

interface ModelSelectorProps {
    model: string
    onModelChange: (model: string) => void
    disabled?: boolean
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ model, onModelChange, disabled }) => {
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
                    className="flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
                >
                    <Sparkles className="h-3 w-3" />
                    <span className="max-w-[90px] truncate">{displayLabel}</span>
                    <ChevronDown className="h-2.5 w-2.5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px]">
                {models.length === 0 && (
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground">Loading models…</div>
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
}

/**
 * Composer surface — a single rounded card with an auto-grow textarea and a
 * subtle toolbar row (mode toggle, model selector, send button).  Removed
 * legacy "attach"/"settings" placeholder buttons so the affordance stays
 * focused on what actually works.
 */
export const ChatComposer = forwardRef<HTMLTextAreaElement, ChatComposerProps>(function ChatComposer(
    { value, onChange, onSubmit, onStop, isLoading, mode, onModeChange, model, onModelChange },
    ref,
) {
    const inputRef = useRef<HTMLTextAreaElement | null>(null)
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

    const isValid = value.trim().length > 0 && !isLoading

    const handleFormSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (!isValid) return
        onSubmit()
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (isValid) onSubmit()
        }
    }

    return (
        <form
            onSubmit={handleFormSubmit}
            className="relative rounded-xl border border-border/60 bg-background focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/20 transition-all"
        >
            <ChatInput
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                    mode === 'ask'
                        ? 'Ask a question about your document…'
                        : 'Ask, edit, or automate anything…'
                }
                disabled={isLoading}
                rows={1}
                className="min-h-[44px] max-h-[120px] overflow-y-auto resize-none rounded-xl bg-transparent border-0 px-3 pt-2.5 pb-1 text-[13px] leading-relaxed shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            />
            <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                    <ModeToggle mode={mode} onModeChange={onModeChange} disabled={isLoading} />
                    <ModelSelector model={model} onModelChange={onModelChange} disabled={isLoading} />
                </div>
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
                                    <span className="text-[10px] font-medium">Stop</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Stop generation</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <Button
                        type="submit"
                        size="sm"
                        aria-label="Send message"
                        disabled={!isValid}
                        className="h-7 w-7 p-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        <Send className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </form>
    )
})
