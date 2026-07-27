import React, { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Sparkles } from "@kn/icon"
import { Streamdown, ChatBubble, ChatBubbleMessage } from "@kn/ui"
import {
    ExpandableChat,
    ExpandableChatHeader,
    ExpandableChatBody,
    ExpandableChatFooter,
    ChatMessageList,
} from "@kn/ui"
import { Editor, PageEditWindow } from "@kn/editor"
import {
    useEditorAgentOptimized,
    ToolExecutionEvent,
    UserChoiceRequest,
    applySubAgentAnnotations,
    getOffscreenEditorBridge,
    getPageBridge,
} from "@kn/common"
import type { ChatMode, ChatModelParams, OffscreenEditorHandle } from "@kn/common"

import { SubAgentTree } from "./SubAgentTree"
import { PlanApprovalCard } from "./PlanApprovalCard"
import {
    ExecutionStep, PendingUserChoice, ChatError,
    classifyError,
} from "./chat-types"
import type { AnnotationData, Message } from "./chat-types"
import { getHistoryForAI } from "./chat-persistence"
import type { ChatTargetPage } from "./chat-sessions"
import { useChatSessions } from "./useChatSessions"
import { useStreamingBuffer } from "./use-streaming-buffer"
import { MessageBubble } from "./MessageBubble"
import { LiveSteps } from "./ExecutionStepsDisplay"
import { ErrorDisplay } from "./ErrorDisplay"
import { ChatHeader } from "./chat/ChatHeader"
import { ChatEmptyState } from "./chat/ChatEmptyState"
import { ChatComposer } from "./chat/ChatComposer"
import type { TargetPageStatus } from "./chat/PageMentionPicker"
import { UserChoiceCard } from "./chat/UserChoiceCard"

// ─── Persistence keys ──────────────────────────────────────────────

const MODEL_STORAGE_KEY = 'kn_chat_model'
const MODE_STORAGE_KEY = 'kn_chat_mode'
const MODEL_PARAMS_STORAGE_KEY = 'kn_chat_model_params'

/** Parse persisted model-param JSON, ignoring malformed or out-of-range values. */
const readModelParams = (): ChatModelParams => {
    try {
        const raw = localStorage.getItem(MODEL_PARAMS_STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return {}
        const out: ChatModelParams = {}
        if (typeof parsed.temperature === 'number' && Number.isFinite(parsed.temperature)) {
            out.temperature = parsed.temperature
        }
        if (typeof parsed.maxTokens === 'number' && Number.isFinite(parsed.maxTokens) && parsed.maxTokens > 0) {
            out.maxTokens = Math.floor(parsed.maxTokens)
        }
        return out
    } catch {
        return {}
    }
}

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

    // Sampling params (temperature, maxTokens). Empty object = fall back to
    // whatever the backend model defaults to; persisted so tweaks survive reloads.
    const [modelParams, setModelParams] = useState<ChatModelParams>(readModelParams)
    const handleModelParamsChange = useCallback((next: ChatModelParams) => {
        setModelParams(next)
        try {
            if (next.temperature === undefined && next.maxTokens === undefined) {
                localStorage.removeItem(MODEL_PARAMS_STORAGE_KEY)
            } else {
                localStorage.setItem(MODEL_PARAMS_STORAGE_KEY, JSON.stringify(next))
            }
        } catch { /* ignore */ }
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
        targetPage,
        setTargetPage,
        parseAnnotations,
    } = useChatSessions()

    // ─── Off-screen target editor (@-page binding) ──────────────
    // When the active session binds a page, its off-screen collaborative
    // editor is swapped into the agent hook below so every editing tool
    // operates on that page. If the bound page is the one currently open,
    // we skip the off-screen session and use the main editor directly.
    const [offscreenHandle, setOffscreenHandle] = useState<OffscreenEditorHandle | null>(null)
    const [targetStatus, setTargetStatus] = useState<TargetPageStatus>('idle')
    const offscreenHandleRef = useRef<OffscreenEditorHandle | null>(null)
    offscreenHandleRef.current = offscreenHandle
    // Bumped by the chip's retry affordance to re-run the acquire effect.
    const [acquireAttempt, setAcquireAttempt] = useState(0)

    const targetPageId = targetPage?.pageId
    useEffect(() => {
        setOffscreenHandle(null)
        if (!targetPageId) {
            setTargetStatus('idle')
            return
        }
        const currentPageId = getPageBridge()?.getCurrentPage()?.pageId
        if (currentPageId && String(currentPageId) === targetPageId) {
            setTargetStatus('current')
            return
        }
        const bridge = getOffscreenEditorBridge()
        if (!bridge) {
            setTargetStatus('error')
            return
        }
        let cancelled = false
        let acquired: OffscreenEditorHandle | null = null
        setTargetStatus('connecting')
        bridge.acquire(targetPageId)
            .then(handle => {
                if (cancelled) {
                    handle.release()
                    return
                }
                acquired = handle
                setOffscreenHandle(handle)
                setTargetStatus('ready')
            })
            .catch(err => {
                console.error('Failed to acquire off-screen editor:', err)
                if (!cancelled) setTargetStatus('error')
            })
        return () => {
            cancelled = true
            acquired?.release()
        }
    }, [activeSessionId, targetPageId, acquireAttempt])

    const handleRetryPage = useCallback(() => setAcquireAttempt(n => n + 1), [])

    // Page hosting this chat instance — the implicit default target shown in
    // the composer chip when no page is @-bound. Chat is mounted per editor
    // tab, so this never changes for a given instance; we poll briefly only
    // because the page title loads asynchronously after the editor mounts.
    const [currentPage, setCurrentPage] = useState<ChatTargetPage | undefined>()
    useEffect(() => {
        let tries = 0
        const read = () => {
            const info = getPageBridge()?.getCurrentPage()
            if (!info?.pageId) return false
            setCurrentPage({
                pageId: String(info.pageId),
                // Title may still be loading; the chip's "当前页面" suffix keeps
                // the affordance legible until it arrives.
                title: info.title || '',
                spaceId: info.spaceId,
            })
            return !!info.title
        }
        if (read()) return
        const timer = setInterval(() => {
            if (read() || ++tries >= 20) clearInterval(timer)
        }, 500)
        return () => clearInterval(timer)
    }, [editor])

    // Open the bound page in the draggable floating editor window (same
    // PageEditWindow as PageLink's in-place editing — no navigation, so the
    // chat and any in-flight agent run stay untouched; the window's editor
    // joins the same Y.Doc room and shows the agent's edits live).
    const [editWindowPageId, setEditWindowPageId] = useState<string | null>(null)
    const handleOpenPageWindow = useCallback(() => {
        if (targetPage) setEditWindowPageId(targetPage.pageId)
    }, [targetPage])

    // All agent tools bind to whichever editor we hand the hook — the
    // off-screen one when a target page is attached, else the main editor.
    const agentEditor = (offscreenHandle?.editor as Editor) ?? editor

    // ─── Streaming agent ──────────────────────────────────────────
    const { stream, stop } = useEditorAgentOptimized(
        agentEditor,
        handleToolExecution,
        handleUserChoiceRequest,
        {
            model: selectedModel || undefined,
            mode: chatMode,
            apiVersion: 'v2',
            modelParams,
        },
    )

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

            // Implicit context line so the model knows which page the tools
            // are wired to (the UI keeps showing the raw user message).
            const prompt = targetPage
                ? `（本会话绑定编辑页面「${targetPage.title}」，所有文档工具作用于该页面）\n${messageText}`
                : messageText

            const { textStream } = await stream({
                prompt,
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
            // Persist whatever this round edited on the off-screen page.
            offscreenHandleRef.current?.flush().catch(err => {
                console.error('Failed to flush off-screen edits:', err)
            })
        }
    }, [
        stream, generateMessageId, messages, buffer,
        backendSessionId, backendConversationId, parseAnnotations, setMessages,
        targetPage,
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
                    modelParams={modelParams}
                    onModelParamsChange={handleModelParamsChange}
                    targetPage={targetPage}
                    currentPage={currentPage}
                    targetStatus={targetStatus}
                    onPickPage={setTargetPage}
                    onClearPage={() => setTargetPage(null)}
                    onRetryPage={handleRetryPage}
                    onOpenPageWindow={handleOpenPageWindow}
                />
            </ExpandableChatFooter>

            {/* Floating page editor opened from the @-page chip */}
            {editWindowPageId && (
                <PageEditWindow
                    pageId={editWindowPageId}
                    onClose={() => setEditWindowPageId(null)}
                />
            )}
        </ExpandableChat>
    )
}

