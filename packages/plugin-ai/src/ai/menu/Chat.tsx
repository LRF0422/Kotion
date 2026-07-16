import React, { useState, useCallback, useMemo, useRef } from "react"
import { Sparkles } from "@kn/icon"
import { Streamdown, ChatBubble, ChatBubbleMessage } from "@kn/ui"
import {
    ExpandableChat,
    ExpandableChatHeader,
    ExpandableChatBody,
    ExpandableChatFooter,
    ChatMessageList,
} from "@kn/ui"
import { Editor } from "@kn/editor"
import {
    useEditorAgentOptimized,
    ToolExecutionEvent,
    UserChoiceRequest,
    applySubAgentAnnotations,
} from "@kn/common"
import type { ChatMode } from "@kn/common"

import { SubAgentTree } from "./SubAgentTree"
import { PlanApprovalCard } from "./PlanApprovalCard"
import {
    ExecutionStep, PendingUserChoice, ChatError,
    classifyError,
} from "./chat-types"
import type { AnnotationData, Message } from "./chat-types"
import { getHistoryForAI } from "./chat-persistence"
import { useChatSessions } from "./useChatSessions"
import { useStreamingBuffer } from "./use-streaming-buffer"
import { MessageBubble } from "./MessageBubble"
import { LiveSteps } from "./ExecutionStepsDisplay"
import { ErrorDisplay } from "./ErrorDisplay"
import { ChatHeader } from "./chat/ChatHeader"
import { ChatEmptyState } from "./chat/ChatEmptyState"
import { ChatComposer } from "./chat/ChatComposer"
import { UserChoiceCard } from "./chat/UserChoiceCard"

// ─── Persistence keys ──────────────────────────────────────────────

const MODEL_STORAGE_KEY = 'kn_chat_model'
const MODE_STORAGE_KEY = 'kn_chat_mode'

// ─── Chat ──────────────────────────────────────────────────────────

/**
 * Main Chat surface for the AI plugin.  This component owns state and
 * orchestrates the streaming lifecycle; the visual pieces (header, empty
 * state, composer, user-choice card, message bubbles) live in dedicated
 * files under ./chat and ./ so this file stays readable.
 */
export const ExpandableChatDemo: React.FC<{ editor: Editor }> = ({ editor }) => {
    // ─── Model / mode preferences (persisted) ─────────────────────
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        try { return localStorage.getItem(MODEL_STORAGE_KEY) || '' } catch { return '' }
    })
    const handleModelChange = useCallback((model: string) => {
        setSelectedModel(model)
        try { localStorage.setItem(MODEL_STORAGE_KEY, model) } catch { /* ignore */ }
    }, [])

    const [chatMode, setChatMode] = useState<ChatMode>(() => {
        try {
            const stored = localStorage.getItem(MODE_STORAGE_KEY)
            return stored === 'ask' || stored === 'agent' ? stored : 'agent'
        } catch { return 'agent' }
    })
    const handleModeChange = useCallback((mode: ChatMode) => {
        setChatMode(mode)
        try { localStorage.setItem(MODE_STORAGE_KEY, mode) } catch { /* ignore */ }
    }, [])

    // ─── Execution steps (live tool-call tape) ────────────────────
    const [currentSteps, setCurrentSteps] = useState<ExecutionStep[]>([])
    const stepsRef = useRef<ExecutionStep[]>([])

    const handleToolExecution = useCallback((event: ToolExecutionEvent) => {
        if (event.status === 'start') {
            const newStep: ExecutionStep = {
                id: `step-${event.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                toolName: event.toolName,
                args: event.args,
                status: 'running',
                timestamp: event.timestamp,
            }
            stepsRef.current = [...stepsRef.current, newStep]
            setCurrentSteps([...stepsRef.current])
        } else {
            const updated = stepsRef.current.map(step => {
                if (step.toolName === event.toolName && step.status === 'running') {
                    return {
                        ...step,
                        result: event.result,
                        error: event.error,
                        status: event.status === 'success' ? 'success' as const : 'error' as const,
                        duration: event.duration,
                    }
                }
                return step
            })
            stepsRef.current = updated
            setCurrentSteps([...updated])
        }
    }, [])

    // ─── User-choice bridge ───────────────────────────────────────
    const [pendingChoice, setPendingChoice] = useState<PendingUserChoice | null>(null)
    const [customInput, setCustomInput] = useState("")
    const pendingChoiceRef = useRef<PendingUserChoice | null>(null)

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

    // ─── Streaming agent ──────────────────────────────────────────
    const { stream, stop } = useEditorAgentOptimized(
        editor,
        handleToolExecution,
        handleUserChoiceRequest,
        {
            model: selectedModel || undefined,
            mode: chatMode,
            apiVersion: 'v2',
        },
    )

    // ─── Multi-session store ──────────────────────────────────────
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

    // ─── Annotations / sub-agents / plan ──────────────────────────
    const [annotations, setAnnotations] = useState<AnnotationData[]>([])
    const subAgents = useMemo(
        () => applySubAgentAnnotations({}, annotations as any[]),
        [annotations],
    )
    const pendingPlan = useMemo<{ plan: any } | null>(() => {
        for (let i = annotations.length - 1; i >= 0; i--) {
            const a = annotations[i] as any
            if (a && a.type === 'plan_proposed' && a.plan) return { plan: a.plan }
        }
        return null
    }, [annotations])

    // ─── Composer state ───────────────────────────────────────────
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<ChatError | null>(null)

    const buffer = useStreamingBuffer()

    // Reasoning content buffer (for thinking/reasoner models)
    const [streamingReasoning, setStreamingReasoning] = useState<string>('')
    const reasoningRef = useRef<string>('')

    const lastUserMessageRef = useRef<string>("")
    const composerRef = useRef<HTMLTextAreaElement>(null)

    const generateMessageId = useCallback(
        () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        [],
    )

    // ─── Reset transient state when switching contexts ────────────
    const resetTransient = useCallback(() => {
        stepsRef.current = []
        setCurrentSteps([])
        setAnnotations([])
        setError(null)
        buffer.reset()
        reasoningRef.current = ''
        setStreamingReasoning('')
    }, [buffer])

    // ─── Submit ───────────────────────────────────────────────────
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
        setAnnotations([])

        try {
            const currentMessages = [...messages, userMessage]
            const historyMessages = getHistoryForAI(currentMessages)
            // Remove the last user message from history — it's passed as prompt.
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

            for await (const part of textStream) {
                buffer.append(part)
            }

            // Force-flush + yield a frame so React commits the streaming
            // bubble at least once before we replace it with the final one.
            buffer.forceFlush()
            await new Promise<void>(r => requestAnimationFrame(() => r()))

            const aiMessage: Message = {
                id: generateMessageId(),
                content: buffer.getContent(),
                reasoningContent: reasoningRef.current || undefined,
                sender: "ai",
                timestamp: Date.now(),
                steps: [...stepsRef.current],
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
    }, [
        stream, generateMessageId, messages, buffer,
        backendSessionId, backendConversationId, parseAnnotations, setMessages,
    ])

    const handleSend = useCallback(() => {
        const text = input.trim()
        if (!text || isLoading) return
        setInput("")
        submitMessage(text)
        // Return focus to the composer for a chat-like flow.
        requestAnimationFrame(() => {
            if (composerRef.current) composerRef.current.style.height = 'auto'
            composerRef.current?.focus()
        })
    }, [input, isLoading, submitMessage])

    const handleInputChange = useCallback((value: string) => {
        setInput(value)
        if (error) setError(null)
    }, [error])

    // Quick prompt in empty state
    const handleQuickSubmit = useCallback((prompt: string) => {
        if (isLoading) return
        submitMessage(prompt)
    }, [isLoading, submitMessage])

    // Plan approval / rejection
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

    const handleRetry = useCallback(() => {
        if (!lastUserMessageRef.current || isLoading) return
        setError(null)
        submitMessage(lastUserMessageRef.current)
    }, [isLoading, submitMessage])

    // ─── Session lifecycle ────────────────────────────────────────
    const handleClearChat = useCallback(() => {
        if (isLoading) stop()
        resetTransient()
        clearActiveMessages()
    }, [isLoading, stop, resetTransient, clearActiveMessages])

    const handleNewSession = useCallback(() => {
        if (isLoading) stop()
        resetTransient()
        createSession()
    }, [isLoading, stop, resetTransient, createSession])

    const handleSwitchSession = useCallback((id: string) => {
        if (id === activeSessionId) return
        if (isLoading) stop()
        resetTransient()
        switchSession(id)
    }, [activeSessionId, isLoading, stop, resetTransient, switchSession])

    const handleDeleteSession = useCallback((id: string) => {
        if (id === activeSessionId) {
            if (isLoading) stop()
            resetTransient()
        }
        deleteSession(id)
    }, [activeSessionId, isLoading, stop, resetTransient, deleteSession])

    // ─── Derived UI flags ─────────────────────────────────────────
    const isEmpty = messages.length === 0 && !isLoading

    // ─── Render ───────────────────────────────────────────────────
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
                        className={`h-6 w-6 relative z-10 transition-transform duration-500 ${isLoading ? 'scale-95 drop-shadow-[0_0_6px_currentColor]' : ''}`}
                    />
                </div>
            }
        >
            <ExpandableChatHeader className="p-0 border-0">
                <ChatHeader
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    hasMessages={messages.length > 0}
                    onSwitch={handleSwitchSession}
                    onNewSession={handleNewSession}
                    onDelete={handleDeleteSession}
                    onClear={handleClearChat}
                />
            </ExpandableChatHeader>

            <ExpandableChatBody className="bg-muted/20 dark:bg-background overflow-x-hidden">
                <ChatMessageList>
                    {isEmpty && (
                        <ChatEmptyState mode={chatMode} onSubmit={handleQuickSubmit} />
                    )}

                    {messages.map((message) => (
                        <MessageBubble key={message.id} message={message} />
                    ))}

                    {/* Live execution steps */}
                    {isLoading && currentSteps.length > 0 && (
                        <LiveSteps steps={currentSteps} />
                    )}

                    {/* Streaming reasoning (thinking) content */}
                    {isLoading && streamingReasoning && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage className="bg-muted/40 dark:bg-muted/20 p-2.5 rounded-lg rounded-tl-sm">
                                <details open className="group">
                                    <summary className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground cursor-pointer select-none">
                                        <Sparkles className="h-3 w-3 animate-pulse" />
                                        <span>思考过程…</span>
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
                            <ChatBubbleMessage className="bg-card border border-border/60 dark:bg-muted/40 dark:border-transparent p-2.5 text-[13px] leading-relaxed rounded-lg rounded-tl-sm">
                                <Streamdown isAnimating>{buffer.displayText}</Streamdown>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    {/* Loading indicator (before any content arrives) */}
                    {isLoading && !buffer.displayText && currentSteps.length === 0 && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage
                                isLoading
                                className="bg-card border border-border/60 dark:bg-muted/40 dark:border-transparent p-2.5 rounded-lg rounded-tl-sm"
                            />
                        </ChatBubble>
                    )}

                    {/* Sub-agent tree (P6) — live while delegating */}
                    {Object.keys(subAgents).length > 0 && (
                        <div className="mx-2 my-1.5">
                            <SubAgentTree subAgents={subAgents} />
                        </div>
                    )}

                    {/* Plan approval (P7) */}
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

                    {/* User choice dialog */}
                    {pendingChoice && (
                        <UserChoiceCard
                            choice={pendingChoice}
                            customInput={customInput}
                            onCustomInputChange={setCustomInput}
                            onSelect={handleOptionSelect}
                            onCustomSubmit={handleCustomSubmit}
                            onCancel={handleCancelChoice}
                        />
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

            <ExpandableChatFooter className="bg-background/80 backdrop-blur-sm p-2.5 border-t">
                <ChatComposer
                    ref={composerRef}
                    value={input}
                    onChange={handleInputChange}
                    onSubmit={handleSend}
                    onStop={stop}
                    isLoading={isLoading}
                    mode={chatMode}
                    onModeChange={handleModeChange}
                    model={selectedModel}
                    onModelChange={handleModelChange}
                />
            </ExpandableChatFooter>
        </ExpandableChat>
    )
}

