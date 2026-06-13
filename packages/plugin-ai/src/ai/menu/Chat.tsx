import { useState, FormEvent, useCallback, useMemo, useRef, useEffect } from "react"
import { Sparkles, Send, Trash2, HelpCircle, Square, XCircle, Settings, Plus, ChevronDown, Globe, X, Check } from "@kn/icon"
import {
    Button, Streamdown,
    Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Input,
} from "@kn/ui"
import {
    ChatBubble,
    ChatBubbleMessage,
} from "@kn/ui"
import { ChatInput } from "@kn/ui"
import {
    ExpandableChat,
    ExpandableChatHeader,
    ExpandableChatBody,
    ExpandableChatFooter,
    useChatContext,
} from "@kn/ui"
import { ChatMessageList } from "@kn/ui"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@kn/ui"
import React from "react"
import { Editor } from "@kn/editor"
import { useEditorAgentOptimized, ToolExecutionEvent, UserChoiceRequest, fetchModels, applySubAgentAnnotations } from "@kn/common"
import type { ModelInfo } from "@kn/common"
import { SubAgentTree } from "./SubAgentTree"
import { PlanApprovalCard } from "./PlanApprovalCard"

import {
    ExecutionStep, PendingUserChoice, ChatError,
    classifyError,
} from "./chat-types"
import type { AnnotationData, Message } from "./chat-types"
import { useTeamStatus, createInitialTeamState } from "./useTeamStatus"
import { TeamStatusPanel } from "./TeamStatusPanel"
import { getHistoryForAI } from "./chat-persistence"
import { useChatSessions } from "./useChatSessions"
import type { ChatSessionMeta } from "./chat-sessions"
import { useStreamingBuffer } from "./use-streaming-buffer"
import { MessageBubble } from "./MessageBubble"
import { LiveSteps } from "./ExecutionStepsDisplay"
import { QuickPrompts } from "./QuickPrompts"
import { ErrorDisplay } from "./ErrorDisplay"

/** Close button that accesses ChatContext from *inside* ExpandableChat */
const ChatCloseButton: React.FC = () => {
    const chatContext = useChatContext()
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => chatContext?.toggleChat()}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground transition-colors"
        >
            <X className="h-3.5 w-3.5" />
        </Button>
    )
}

// ─── Model Selector ────────────────────────────────────────────────

const MODEL_STORAGE_KEY = 'kn_chat_model'

/** Compact model selector dropdown that fetches available models from the backend API. */
const ModelSelector: React.FC<{
    model: string
    onModelChange: (model: string) => void
}> = ({ model, onModelChange }) => {
    const [models, setModels] = useState<ModelInfo[]>([])
    const [open, setOpen] = useState(false)
    const loadedRef = useRef(false)

    // Fetch models when dropdown opens for the first time
    useEffect(() => {
        if (open && !loadedRef.current) {
            loadedRef.current = true
            fetchModels().then(setModels)
        }
    }, [open])

    // Group models by provider
    const grouped = useMemo(() => {
        const map = new Map<string, ModelInfo[]>()
        for (const m of models) {
            const provider = m.provider || 'other'
            if (!map.has(provider)) map.set(provider, [])
            map.get(provider)!.push(m)
        }
        return map
    }, [models])

    // Display name for current model
    const displayLabel = model || 'deepseek-chat'

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    type="button"
                >
                    <Sparkles className="h-3 w-3" />
                    <span className="max-w-[80px] truncate">{displayLabel}</span>
                    <ChevronDown className="h-2.5 w-2.5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px]">
                {models.length === 0 && (
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground">Loading models...</div>
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
                                <span>{m.name || m.id}</span>
                                {model === m.id && (
                                    <Check className="h-3 w-3 text-primary" />
                                )}
                            </DropdownMenuItem>
                        ))}
                    </React.Fragment>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// ─── Session Tabs ──────────────────────────────────────────────────

interface SessionTabsProps {
    sessions: ChatSessionMeta[]
    activeSessionId: string
    onSwitch: (id: string) => void
    onNewSession: () => void
    onDelete: (id: string) => void
}

/**
 * Horizontal, scrollable tab strip for switching between chat sessions.
 * Each tab exposes an inline × button that deletes that session.
 * A trailing + button creates a new chat.
 */
const SessionTabs: React.FC<SessionTabsProps> = ({
    sessions, activeSessionId, onSwitch, onNewSession, onDelete,
}) => {
    const activeTabRef = useRef<HTMLDivElement | null>(null)

    // Keep the active tab visible when sessions or active id change.
    useEffect(() => {
        activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }, [activeSessionId])

    const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        e.preventDefault()
        onDelete(id)
    }, [onDelete])

    return (
        <div
            role="tablist"
            aria-label="Chat sessions"
            className="flex items-center gap-0.5 min-w-0 flex-1 overflow-x-auto scrollbar-thin"
            style={{ scrollbarWidth: 'thin' }}
        >
            {sessions.map((s) => {
                const isActive = s.id === activeSessionId
                const title = s.title || 'New chat'
                return (
                    <div
                        key={s.id}
                        ref={isActive ? activeTabRef : undefined}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => !isActive && onSwitch(s.id)}
                        title={title}
                        className={
                            'group relative flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md cursor-pointer select-none shrink-0 max-w-[140px] transition-colors ' +
                            (isActive
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')
                        }
                    >
                        <span
                            className={
                                'truncate text-[11px] ' +
                                (isActive ? 'font-semibold' : 'font-medium')
                            }
                        >
                            {title}
                        </span>
                        <button
                            type="button"
                            onClick={(e) => handleDelete(e, s.id)}
                            aria-label={`Delete ${title}`}
                            className={
                                'flex items-center justify-center h-3.5 w-3.5 rounded-sm text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors ' +
                                (isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-100')
                            }
                        >
                            <X className="h-2.5 w-2.5" />
                        </button>
                    </div>
                )
            })}
            <button
                type="button"
                onClick={onNewSession}
                aria-label="New chat"
                title="New chat"
                className="flex items-center justify-center h-5 w-5 shrink-0 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
                <Plus className="h-3 w-3" />
            </button>
        </div>
    )
}

// ─── Chat Component ────────────────────────────────────────────────

export const ExpandableChatDemo: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [currentSteps, setCurrentSteps] = useState<ExecutionStep[]>([])
    const stepsRef = useRef<ExecutionStep[]>([])

    // Model selection state (persisted in localStorage)
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        try {
            return localStorage.getItem(MODEL_STORAGE_KEY) || ''
        } catch { return '' }
    })

    const handleModelChange = useCallback((model: string) => {
        setSelectedModel(model)
        try { localStorage.setItem(MODEL_STORAGE_KEY, model) } catch { /* ignore */ }
    }, [])

    // User choice state
    const [pendingChoice, setPendingChoice] = useState<PendingUserChoice | null>(null)
    const [customInput, setCustomInput] = useState("")
    const pendingChoiceRef = useRef<PendingUserChoice | null>(null)

    // Tool execution callback
    const handleToolExecution = useCallback((event: ToolExecutionEvent) => {
        if (event.status === 'start') {
            const newStep: ExecutionStep = {
                id: `step-${event.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                toolName: event.toolName,
                args: event.args,
                status: 'running',
                timestamp: event.timestamp
            }
            stepsRef.current = [...stepsRef.current, newStep]
            setCurrentSteps([...stepsRef.current])
        } else {
            const updatedSteps = stepsRef.current.map(step => {
                if (step.toolName === event.toolName && step.status === 'running') {
                    return {
                        ...step,
                        result: event.result,
                        error: event.error,
                        status: event.status === 'success' ? 'success' as const : 'error' as const,
                        duration: event.duration
                    }
                }
                return step
            })
            stepsRef.current = updatedSteps
            setCurrentSteps([...updatedSteps])
        }
    }, [])

    // User choice request handler
    const handleUserChoiceRequest = useCallback((request: UserChoiceRequest): Promise<string> => {
        return new Promise((resolve, reject) => {
            const choice: PendingUserChoice = { request, resolve, reject }
            pendingChoiceRef.current = choice
            setPendingChoice(choice)
        })
    }, [])

    const handleOptionSelect = useCallback((optionId: string) => {
        if (pendingChoiceRef.current) {
            pendingChoiceRef.current.resolve(optionId)
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [])

    const handleCustomSubmit = useCallback(() => {
        if (pendingChoiceRef.current && customInput.trim()) {
            pendingChoiceRef.current.resolve(customInput.trim())
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [customInput])

    const handleCancelChoice = useCallback(() => {
        if (pendingChoiceRef.current) {
            pendingChoiceRef.current.reject(new Error('User cancelled the choice'))
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [])

    const { stream, stop } = useEditorAgentOptimized(editor, handleToolExecution, handleUserChoiceRequest, {
        model: selectedModel || undefined,
    })

    // Multi-session management (messages + backend session ids per chat).
    const {
        sessions,
        activeSessionId,
        messages,
        setMessages,
        backendSessionId,
        backendConversationId,
        createSession,
        switchSession,
        deleteSession,
        clearActiveMessages,
        parseAnnotations,
    } = useChatSessions()

    // Team status tracking
    const [annotations, setAnnotations] = useState<AnnotationData[]>([])
    const teamState = useTeamStatus(annotations)

    // Sub-agent tree (P6) + pending plan (P7), derived from the annotation
    // stream. applySubAgentAnnotations folds the full annotation list from
    // scratch, replaying all deltas — so deriving per render is correct.
    const subAgents = useMemo(() => applySubAgentAnnotations({}, annotations as any[]), [annotations])
    const pendingPlan = useMemo<{ plan: any } | null>(() => {
        for (let i = annotations.length - 1; i >= 0; i--) {
            const a = annotations[i] as any
            if (a && a.type === 'plan_proposed' && a.plan) return { plan: a.plan }
        }
        return null
    }, [annotations])

    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<ChatError | null>(null)

    // Streaming buffer (rAF batched)
    const buffer = useStreamingBuffer()

    // Reasoning content buffer (for thinking/reasoner models)
    const [streamingReasoning, setStreamingReasoning] = useState<string>('')
    const reasoningRef = useRef<string>('')

    // Last user message ref for retry
    const lastUserMessageRef = useRef<string>("")

    // Textarea ref — used for auto-resize and refocus-after-send.
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Auto-grow the input with its content, capped at ~5 lines. The @kn/ui
    // ChatInput is otherwise a fixed-height box, which makes multi-line input
    // cramped. Inline height wins over the kit's height class.
    useEffect(() => {
        const el = inputRef.current
        if (!el) return
        // Inline styles win over the kit's height/max-height utility classes.
        el.style.maxHeight = '120px'
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }, [input])

    // Generate unique message ID
    const generateMessageId = useCallback(() => {
        return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }, [])

    // Check if input is valid
    const isInputValid = useMemo(() => {
        return input.trim().length > 0 && !isLoading
    }, [input, isLoading])

    // Core submit logic (used by both form submit and retry)
    const submitMessage = useCallback(async (messageText: string) => {
        const userMessage: Message = {
            id: generateMessageId(),
            content: messageText,
            sender: "user",
            timestamp: Date.now(),
        }

        setMessages((prev) => [...prev, userMessage])
        setIsLoading(true)
        setError(null)
        lastUserMessageRef.current = messageText
        stepsRef.current = []
        setCurrentSteps([])
        buffer.reset()
        reasoningRef.current = ''
        setStreamingReasoning('')
        setAnnotations([]) // Reset team state for new message

        try {
            // Build history with token-limited context
            const currentMessages = [...messages, userMessage]
            const historyMessages = getHistoryForAI(currentMessages)
            // Remove the last user message from history since it's passed as prompt
            const history = historyMessages.slice(0, -1)

            const { textStream } = await stream({
                prompt: messageText,
                messages: history,
                sessionId: backendSessionId,
                conversationId: backendConversationId,
                onAnnotation: (newAnnotations: AnnotationData[]) => {
                    setAnnotations(prev => [...prev, ...newAnnotations])
                    parseAnnotations(newAnnotations)
                },
                onReasoning: (content: string) => {
                    reasoningRef.current += content
                    setStreamingReasoning(reasoningRef.current)
                },
            })

            // textStream is an async iterable of strings from the backend
            for await (const part of textStream) {
                buffer.append(part)
            }

            // Force-flush the buffer to guarantee the streaming bubble
            // is rendered at least once before we replace it with the
            // final message.  Without this, if all chunks arrive within
            // a single animation frame the rAF callback never fires and
            // `buffer.reset()` cancels it – the user never sees the
            // streaming text, only the final message appearing at once.
            buffer.forceFlush()

            // Yield one frame so React can render the streaming text.
            // Without this gap, React 18 batches forceFlush (setDisplayText)
            // and reset (setDisplayText(null)) into a single render where
            // only the final null state is committed.
            await new Promise<void>(r => requestAnimationFrame(() => r()))

            const aiMessage: Message = {
                id: generateMessageId(),
                content: buffer.getContent(),
                reasoningContent: reasoningRef.current || undefined,
                sender: "ai",
                timestamp: Date.now(),
                steps: [...stepsRef.current]
            }

            setMessages((prev) => [...prev, aiMessage])
            buffer.reset()
            reasoningRef.current = ''
            setStreamingReasoning('')
            setCurrentSteps([])
        } catch (err: any) {
            if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
                const currentContent = buffer.getContent()
                if (currentContent) {
                    const aiMessage: Message = {
                        id: generateMessageId(),
                        content: currentContent,
                        sender: "ai",
                        timestamp: Date.now(),
                        steps: [...stepsRef.current],
                        stopped: true,
                    }
                    setMessages((prev) => [...prev, aiMessage])
                }
                buffer.reset()
                setCurrentSteps([])
            } else {
                console.error("Error generating AI response:", err)
                const classifiedError = classifyError(err)
                setError(classifiedError)

                // Show the error as an AI message in the dialog so the
                // user can see what went wrong instead of a blank bubble.
                const currentContent = buffer.getContent()
                const errorMessage = currentContent
                    ? `${currentContent}\n\n⚠️ ${classifiedError.message}`
                    : `⚠️ ${classifiedError.message}`
                const aiMessage: Message = {
                    id: generateMessageId(),
                    content: errorMessage,
                    sender: "ai",
                    timestamp: Date.now(),
                    steps: [...stepsRef.current],
                    error: true,
                }
                setMessages((prev) => [...prev, aiMessage])

                buffer.reset()
                setCurrentSteps([])
            }
        } finally {
            setIsLoading(false)
        }
    }, [stream, generateMessageId, messages, buffer, backendSessionId, backendConversationId, parseAnnotations, setMessages])

    const handleSubmit = useCallback(async (e: FormEvent) => {
        e.preventDefault()
        if (!isInputValid) return
        const messageText = input
        setInput("")
        submitMessage(messageText)
        // Reset the auto-grown height and keep focus for the next message.
        requestAnimationFrame(() => {
            if (inputRef.current) inputRef.current.style.height = 'auto'
            inputRef.current?.focus()
        })
    }, [input, isInputValid, submitMessage])

    // Quick prompt submit
    const handleQuickSubmit = useCallback((prompt: string) => {
        if (isLoading) return
        submitMessage(prompt)
    }, [isLoading, submitMessage])

    // Plan mode (P7): approve → execute the plan; reject → re-plan. Both resume
    // the same conversation via submitMessage (history + session carry context).
    const handlePlanDecision = useCallback((decision: 'approved' | 'rejected') => {
        if (isLoading) return
        const plan = pendingPlan?.plan
        if (!plan) return
        if (decision === 'rejected') {
            submitMessage('我不同意这个计划，请重新规划。')
            return
        }
        const steps = (plan.steps || [])
            .map((s: any, i: number) => `${i + 1}. ${s.action}`)
            .join('\n')
        const prompt =
            `我已批准以下计划，请直接按计划执行，不要再次询问确认：\n` +
            (plan.title ? `标题：${plan.title}\n` : '') +
            (plan.summary ? `概述：${plan.summary}\n` : '') +
            (steps ? `步骤：\n${steps}` : '')
        submitMessage(prompt)
    }, [isLoading, pendingPlan, submitMessage])

    // Retry last failed message
    const handleRetry = useCallback(() => {
        if (!lastUserMessageRef.current || isLoading) return
        setError(null)
        submitMessage(lastUserMessageRef.current)
    }, [isLoading, submitMessage])

    const handleStop = useCallback(() => {
        stop()
    }, [stop])

    const handleAttachFile = useCallback(() => {
        console.log("Attach file clicked")
    }, [])

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value)
        setError(null)
    }, [])

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            if (isInputValid) {
                handleSubmit(e as any)
            }
        }
    }, [isInputValid, handleSubmit])

    // Clear the current chat (keeps the session, wipes its messages + backend ids).
    const handleClearChat = useCallback(() => {
        if (isLoading) stop()
        setCurrentSteps([])
        stepsRef.current = []
        setAnnotations([])
        setError(null)
        clearActiveMessages()
    }, [isLoading, stop, clearActiveMessages])

    // Create a brand-new chat session and switch to it.
    const handleNewSession = useCallback(() => {
        if (isLoading) stop()
        setCurrentSteps([])
        stepsRef.current = []
        setAnnotations([])
        setError(null)
        buffer.reset()
        reasoningRef.current = ''
        setStreamingReasoning('')
        createSession()
    }, [isLoading, stop, createSession, buffer])

    // Switch to an existing session.
    const handleSwitchSession = useCallback((id: string) => {
        if (id === activeSessionId) return
        if (isLoading) stop()
        setCurrentSteps([])
        stepsRef.current = []
        setAnnotations([])
        setError(null)
        buffer.reset()
        reasoningRef.current = ''
        setStreamingReasoning('')
        switchSession(id)
    }, [activeSessionId, isLoading, stop, switchSession, buffer])

    // Delete a session.
    const handleDeleteSession = useCallback((id: string) => {
        if (id === activeSessionId) {
            if (isLoading) stop()
            setCurrentSteps([])
            stepsRef.current = []
            setAnnotations([])
            setError(null)
            buffer.reset()
            reasoningRef.current = ''
            setStreamingReasoning('')
        }
        deleteSession(id)
    }, [activeSessionId, isLoading, stop, deleteSession, buffer])

    // Message count
    const messageCount = messages.length

    // Show quick prompts when empty state
    const showQuickPrompts = messages.length === 0 && !isLoading

    return (
        <ExpandableChat
            size="lg"
            icon={
                <div className="relative flex items-center justify-center">
                    {isLoading && (
                        <span
                            aria-hidden
                            className="absolute -inset-1.5 rounded-full animate-spin"
                            style={{
                                background:
                                    'conic-gradient(from 0deg, transparent 0deg, transparent 220deg, currentColor 340deg, transparent 360deg)',
                                WebkitMask:
                                    'radial-gradient(circle, transparent 58%, #000 60%)',
                                mask: 'radial-gradient(circle, transparent 58%, #000 60%)',
                                animationDuration: '1.1s',
                            }}
                        />
                    )}
                    <Sparkles
                        className={`h-6 w-6 relative z-10 transition-transform duration-500 ${isLoading ? 'scale-95 drop-shadow-[0_0_6px_currentColor]' : ''
                            }`}
                    />
                </div>
            }
        >
            {/* Header */}
            <ExpandableChatHeader className="flex items-center justify-between px-3 py-1.5 border-b bg-background/95 backdrop-blur-sm">
                <SessionTabs
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onSwitch={handleSwitchSession}
                    onNewSession={handleNewSession}
                    onDelete={handleDeleteSession}
                />
                <div className="flex items-center gap-px shrink-0 pl-1">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearChat}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">Clear current chat</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <ChatCloseButton />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">Close</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </ExpandableChatHeader>

            <ExpandableChatBody className="bg-[#F8F9FA] dark:bg-background overflow-x-hidden">
                <TeamStatusPanel teamState={teamState} />
                <ChatMessageList>
                    {/* Empty state greeting */}
                    {showQuickPrompts && (
                        <div className="flex flex-col items-center justify-center py-4 px-3">
                            <h2 className="text-sm font-semibold text-foreground mb-0.5">How can I help you today?</h2>
                            <p className="text-xs text-muted-foreground mb-4 text-center max-w-[240px]">
                                Ask about your documents or try an action below.
                            </p>
                        </div>
                    )}

                    {/* Quick prompts in empty state */}
                    {showQuickPrompts && (
                        <QuickPrompts onSubmit={handleQuickSubmit} />
                    )}

                    {messages.map((message) => (
                        <MessageBubble
                            key={message.id}
                            message={message}
                        />
                    ))}

                    {/* Live execution steps */}
                    {isLoading && currentSteps.length > 0 && (
                        <LiveSteps steps={currentSteps} />
                    )}

                    {/* Streaming reasoning (thinking) content */}
                    {isLoading && streamingReasoning && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage className="bg-muted/30 dark:bg-muted/20 p-2.5 rounded-xl rounded-tl-sm">
                                <details open className="group">
                                    <summary className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground cursor-pointer select-none">
                                        <Sparkles className="h-3 w-3 animate-pulse" />
                                        <span>思考过程...</span>
                                    </summary>
                                    <div className="mt-1.5 pl-1 border-l-2 border-muted-foreground/20 text-[11px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap break-words">
                                        {streamingReasoning}
                                    </div>
                                </details>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    {/* Streaming message (rAF buffered) */}
                    {buffer.displayText && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage className="bg-white dark:bg-muted/40 p-2.5 text-[13px] leading-relaxed rounded-xl rounded-tl-sm">
                                <Streamdown isAnimating>{buffer.displayText}</Streamdown>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    {/* Loading indicator */}
                    {isLoading && !buffer.displayText && currentSteps.length === 0 && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage isLoading className="bg-white dark:bg-muted/40 p-2.5 rounded-xl rounded-tl-sm" />
                        </ChatBubble>
                    )}

                    {/* Sub-agent tree (P6) — live while delegating */}
                    {Object.keys(subAgents).length > 0 && (
                        <div className="mx-2 my-1.5">
                            <SubAgentTree subAgents={subAgents} />
                        </div>
                    )}

                    {/* Plan approval (P7) — shown once the agent proposes a plan */}
                    {pendingPlan && !isLoading && (
                        <div className="mx-2 my-1.5">
                            <PlanApprovalCard
                                plan={pendingPlan.plan}
                                disabled={isLoading}
                                onApprove={() => handlePlanDecision('approved')}
                                onReject={() => handlePlanDecision('rejected')}
                            />
                        </div>
                    )}

                    {/* User Choice Dialog */}
                    {pendingChoice && (
                        <div className="mx-2 my-1.5 p-2.5 rounded-lg bg-muted/50 border border-border/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                            <div className="flex items-start gap-2 mb-2">
                                <div className="p-1.5 rounded bg-muted">
                                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0 pt-0.5">
                                    <p className="font-medium text-xs text-foreground">{pendingChoice.request.question}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Select an option to continue</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                {pendingChoice.request.options.map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => handleOptionSelect(option.id)}
                                        className="w-full p-2 rounded-md border border-border/60 bg-background/80 hover:bg-muted/60 transition-all text-left group"
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 group-hover:bg-foreground transition-colors" />
                                            <span className="font-medium text-xs">{option.label}</span>
                                        </div>
                                        {option.description && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5 ml-3 line-clamp-2">{option.description}</p>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {pendingChoice.request.allowCustomInput && (
                                <div className="mt-2 pt-2 border-t border-border/50">
                                    <p className="text-[10px] text-muted-foreground mb-1">Or provide a custom response:</p>
                                    <div className="flex gap-1.5">
                                        <Input
                                            value={customInput}
                                            onChange={(e) => setCustomInput(e.target.value)}
                                            placeholder="Type your response..."
                                            className="flex-1 h-7 text-xs"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && customInput.trim()) {
                                                    e.preventDefault()
                                                    handleCustomSubmit()
                                                }
                                            }}
                                        />
                                        <Button
                                            size="sm"
                                            onClick={handleCustomSubmit}
                                            disabled={!customInput.trim()}
                                            className="h-7 px-2 bg-foreground text-background hover:bg-foreground/90"
                                        >
                                            <Send className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-2 flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCancelChoice}
                                    className="h-6 px-2 border-red-200/60 text-red-500 hover:bg-red-50/80 dark:hover:bg-red-950/30 text-[10px]"
                                >
                                    <XCircle className="h-3 w-3 mr-0.5" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Error display with retry */}
                    {error && (
                        <ErrorDisplay
                            error={error}
                            onRetry={handleRetry}
                            onDismiss={() => setError(null)}
                        />
                    )}
                </ChatMessageList>
            </ExpandableChatBody>

            {/* Footer */}
            <ExpandableChatFooter className="bg-background/80 backdrop-blur-sm p-2 border-t">
                <form
                    onSubmit={handleSubmit}
                    className="relative rounded-xl border border-border/60 bg-background focus-within:ring-1 focus-within:ring-border transition-all"
                >
                    {/* Context tag */}
                    {showQuickPrompts && (
                        <div className="flex items-center gap-1.5 px-3 pt-2">
                            <div className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full bg-muted/60 text-[10px] text-muted-foreground">
                                <Globe className="h-2.5 w-2.5" />
                                <span>Knowledge Doc</span>
                            </div>
                        </div>
                    )}
                    <ChatInput
                        ref={inputRef}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Do anything with AI..."
                        disabled={isLoading}
                        rows={1}
                        className="min-h-[40px] max-h-[120px] overflow-y-auto resize-none rounded-xl bg-transparent border-0 px-3 py-2 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
                    />
                    <div className="flex items-center px-2 pb-2 pt-0 justify-between">
                        <div className="flex items-center gap-px">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            onClick={handleAttachFile}
                                            disabled={isLoading}
                                            className="h-7 w-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Add content</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            disabled={isLoading}
                                            className="h-7 w-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                                        >
                                            <Settings className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Settings</TooltipContent>
                                </Tooltip>
                                <ModelSelector model={selectedModel} onModelChange={handleModelChange} />
                            </TooltipProvider>
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
                                            onClick={handleStop}
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
                                className="h-7 w-7 p-0 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-foreground"
                                disabled={!isInputValid}
                            >
                                <Send className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </form>
            </ExpandableChatFooter>
        </ExpandableChat>
    )
}
