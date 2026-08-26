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
import { Editor } from "@kn/editor"
import type { ChangeTrackerStorage } from "@kn/editor"
import {
    useEditorAgent,
    useCapabilityProviders,
    buildAgentRunInputs,
    getOffscreenEditorBridge,
    getPageBridge,
    revealBlockById,
    PageEditWindow,
    event,
    useActiveEditor,
    useTranslation,
    DOCK_PANEL_RUNNING,
} from "@kn/common"
import type {
    ChatMode,
    ChatModelParams,
    OffscreenEditorHandle,
    UserChoiceRequest,
    AgentChatMessage,
    ToolCallRecord,
} from "@kn/common"

import { SubAgentTree } from "@kn/ui"
import { PlanApprovalCard } from "@kn/ui"
import {
    ExecutionStep, PendingUserChoice, ChatError,
    classifyError,
} from "./chat-types"
import type { BlockReference, Message } from "./chat-types"
import { getHistoryForAI } from "./chat-persistence"
import type { ChatTargetPage } from "./chat-sessions"
import { useChatSessions } from "./useChatSessions"
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

/** The editor's change-tracker storage, when the extension is mounted. */
const getChangeTracker = (editor: Editor | null | undefined): ChangeTrackerStorage | undefined =>
    (editor?.storage as any)?.changeTracker as ChangeTrackerStorage | undefined

/** Map AgentCore tool-call records onto the chat UI's execution-step tape. */
const toolCallsToSteps = (calls: ToolCallRecord[]): ExecutionStep[] =>
    calls.map(tc => ({
        id: tc.callId,
        callId: tc.callId,
        toolName: tc.tool,
        args: tc.args,
        result: tc.result,
        error: tc.error,
        status: tc.status,
        timestamp: 0,
        duration: tc.durationMs,
    }))

// ─── Chat ──────────────────────────────────────────────────────────

/**
 * Main Chat surface for the AI plugin.  This component owns state and
 * orchestrates the run lifecycle via the AgentCore SDK (useEditorAgent); the
 * visual pieces (header, empty state, composer, user-choice card, message
 * bubbles) live in dedicated files under ./chat and ./ so this file stays
 * readable.
 *
 * `embedded` drops the floating shell so a host container (the side dock) can
 * own the frame; `onClose` is what that host's close affordance should do.
 */
export const ExpandableChatDemo: React.FC<{
    editor: Editor
    embedded?: boolean
    onClose?: () => void
}> = ({ editor, embedded, onClose }) => {
    const { t } = useTranslation()

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
        createSession,
        switchSession,
        deleteSession,
        clearActiveMessages,
        targetPage,
        setTargetPage,
    } = useChatSessions()

    // ─── Off-screen target editor (@-page binding) ──────────────
    const [offscreenHandle, setOffscreenHandle] = useState<OffscreenEditorHandle | null>(null)
    const [targetStatus, setTargetStatus] = useState<TargetPageStatus>('idle')
    const offscreenHandleRef = useRef<OffscreenEditorHandle | null>(null)
    offscreenHandleRef.current = offscreenHandle
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
    }, [activeSessionId, targetPageId, acquireAttempt, editor])

    const handleRetryPage = useCallback(() => setAcquireAttempt(n => n + 1), [])

    const [currentPage, setCurrentPage] = useState<ChatTargetPage | undefined>()
    useEffect(() => {
        let tries = 0
        const read = () => {
            const info = getPageBridge()?.getCurrentPage()
            if (!info?.pageId) return false
            setCurrentPage({
                pageId: String(info.pageId),
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

    const [editWindowPageId, setEditWindowPageId] = useState<string | null>(null)
    const handleOpenPageWindow = useCallback(() => {
        if (targetPage) setEditWindowPageId(targetPage.pageId)
    }, [targetPage])

    // ─── Block reference navigation ─────────────────────────────
    const [pendingReveal, setPendingReveal] = useState<{ pageId: string; blockId: string } | null>(null)

    const handleRevealReference = useCallback((ref: BlockReference) => {
        if (ref.found === false) return
        if (revealBlockById(editor, ref.blockId)) return
        if (targetPage) {
            const currentPageId = getPageBridge()?.getCurrentPage()?.pageId
            if (currentPageId !== undefined && String(currentPageId) === targetPage.pageId) return
            setPendingReveal({ pageId: targetPage.pageId, blockId: ref.blockId })
            getPageBridge()?.openPage(targetPage.pageId, targetPage.spaceId)
        }
    }, [editor, targetPage])

    useEffect(() => {
        if (!pendingReveal) return
        let tries = 0
        const timer = setInterval(() => {
            const currentPageId = getPageBridge()?.getCurrentPage()?.pageId
            const arrived = currentPageId !== undefined && String(currentPageId) === pendingReveal.pageId
            if (arrived && revealBlockById(editor, pendingReveal.blockId)) {
                clearInterval(timer)
                setPendingReveal(null)
                return
            }
            if (++tries >= 20) {
                clearInterval(timer)
                setPendingReveal(null)
            }
        }, 300)
        return () => clearInterval(timer)
    }, [pendingReveal, editor])

    const agentEditor = (offscreenHandle?.editor as Editor) ?? editor
    const agentEditorRef = useRef<Editor>(editor)
    agentEditorRef.current = agentEditor

    // ─── Change tracking ──────────────────────────────────────────
    const [tracking, setTracking] = useState(false)
    useEffect(() => {
        const storage = getChangeTracker(agentEditor)
        if (!storage) {
            setTracking(false)
            return
        }
        setTracking(storage.enabled)
        return storage.subscribe(() => setTracking(storage.enabled))
    }, [agentEditor])

    const handleToggleTracking = useCallback(() => {
        const storage = getChangeTracker(agentEditorRef.current)
        if (!storage) return
        if (storage.enabled) storage.stop()
        else storage.start()
    }, [])

    // ─── AgentCore driver ─────────────────────────────────────────
    const isAskMode = chatMode === 'ask'
    const { allTools, getCatalog } = useCapabilityProviders(agentEditor, {
        onUserChoiceRequest: handleUserChoiceRequest,
    })
    const catalog = useMemo(() => getCatalog(), [getCatalog])
    // tools[] carries the always-on schemas; skill-owned tools ride inside
    // skills[] and stay deferred until the model calls one.
    const { tools: toolSpecs, skills } = useMemo(() => buildAgentRunInputs(catalog), [catalog])
    const resolveTools = useCallback(() => allTools, [allTools])
    const liveCurrentPageId = getPageBridge()?.getCurrentPage()?.pageId
    const targetToolsReady = !targetPageId
        ? !!currentPage?.pageId
        : ((targetStatus === 'current' && String(liveCurrentPageId) === targetPageId)
            || (targetStatus === 'ready' && offscreenHandle?.pageId === targetPageId))

    const agent = useEditorAgent({
        conversationId: activeSessionId,
        tools: isAskMode ? [] : toolSpecs,
        skills: isAskMode ? [] : skills,
        resolveTools,
        autoExecuteTools: targetToolsReady,
        spaceId: targetPage?.spaceId ?? currentPage?.spaceId,
        pageId: targetPage?.pageId ?? currentPage?.pageId,
    })

    // Re-attach at most once per session activation. Without this guard, resetting
    // a completed run immediately triggers another attach while the backend is
    // still clearing thread.activeRunId, replaying the same assistant output.
    const attachAttemptedSessionRef = useRef<string | null>(null)
    useEffect(() => {
        if (!targetToolsReady || agent.state.phase !== 'idle' || agent.state.runId) return
        if (attachAttemptedSessionRef.current === activeSessionId) return
        attachAttemptedSessionRef.current = activeSessionId
        void agent.attach()
    }, [activeSessionId, targetToolsReady, agent.state.phase, agent.state.runId, agent.attach])

    // ─── Composer state ───────────────────────────────────────────
    const [input, setInput] = useState("")
    const [error, setError] = useState<ChatError | null>(null)

    const isActive =
        agent.state.phase === 'creating' ||
        agent.state.phase === 'streaming' ||
        agent.state.phase === 'waiting-tools' ||
        agent.state.phase === 'waiting-approval' ||
        agent.state.phase === 'suspended'

    const currentSteps = useMemo(() => toolCallsToSteps(agent.state.toolCalls), [agent.state.toolCalls])

    useEffect(() => {
        event.emit(DOCK_PANEL_RUNNING, { id: 'agent', running: isActive })
    }, [isActive])

    useEffect(() => {
        return () => { event.emit(DOCK_PANEL_RUNNING, { id: 'agent', running: false }) }
    }, [])

    const lastUserMessageRef = useRef<string>("")
    const composerRef = useRef<HTMLTextAreaElement>(null)

    const generateMessageId = useCallback(
        () => 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        [],
    )

    // ─── Run lifecycle: snapshot terminal turns into history ─────
    const abandoningRef = useRef(false)
    const lastPhaseRef = useRef(agent.state.phase)
    useEffect(() => {
        const phase = agent.state.phase
        if (lastPhaseRef.current === phase) return
        lastPhaseRef.current = phase
        if (phase === 'completed' || phase === 'failed' || phase === 'cancelled') {
            if (abandoningRef.current) {
                agent.reset()
                return
            }
            const steps = toolCallsToSteps(agent.state.toolCalls)
            const text = agent.state.text
            const hasContent = text.trim().length > 0 || steps.length > 0 || agent.state.subRuns.length > 0
            if (hasContent) {
                const content = phase === 'failed'
                    ? (text.trim() ? text : '生成失败') + (agent.state.error ? '\n\n⚠️ ' + agent.state.error : '')
                    : text
                const snapshot: Message = {
                    id: generateMessageId(),
                    content,
                    reasoningContent: agent.state.reasoning || undefined,
                    sender: 'ai',
                    timestamp: Date.now(),
                    steps,
                    subRuns: agent.state.subRuns.slice(),
                    usage: agent.state.usage ?? undefined,
                    error: phase === 'failed',
                }
                setMessages(prev => [...prev, snapshot])
            }
            agent.reset()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent.state.phase])

    const abandonAgent = useCallback(async () => {
        abandoningRef.current = true
        const cancelled = await agent.cancel().catch(() => false)
        if (cancelled) agent.reset()
        abandoningRef.current = false
    }, [agent])

    // ─── Submit ───────────────────────────────────────────────────
    const submitMessage = useCallback(async (messageText: string) => {
        const userMessage: Message = {
            id: generateMessageId(),
            content: messageText,
            sender: "user",
            timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, userMessage])
        lastUserMessageRef.current = messageText
        setError(null)

        const currentMessages = [...messages, userMessage]
        const history = getHistoryForAI(currentMessages).slice(0, -1)

        const prompt = targetPage
            ? '（本会话绑定编辑页面「' + targetPage.title + '」，所有文档工具作用于该页面）\n' + messageText
            : messageText

        const agentMessages: AgentChatMessage[] = [
            ...history,
            { role: 'user', content: prompt },
        ]

        try {
            await agent.start(agentMessages, {
                model: selectedModel || undefined,
                mode: 'execute',
                temperature: modelParams.temperature,
                maxTokens: modelParams.maxTokens,
            })
        } catch (err: any) {
            setError(classifyError(err))
        }
    }, [
        agent, messages, generateMessageId, targetPage, selectedModel, modelParams,
        setMessages,
    ])

    const handleSend = useCallback(() => {
        const text = input.trim()
        if (!text || isActive || !targetToolsReady) return
        setInput("")
        submitMessage(text)
        requestAnimationFrame(() => {
            if (composerRef.current) composerRef.current.style.height = 'auto'
            composerRef.current?.focus()
        })
    }, [input, isActive, targetToolsReady, submitMessage])

    const handleInputChange = useCallback((value: string) => {
        setInput(value)
        if (error) setError(null)
    }, [error])

    const handleQuickSubmit = useCallback((prompt: string) => {
        if (isActive) return
        submitMessage(prompt)
    }, [isActive, submitMessage])

    const handleRetry = useCallback(() => {
        if (!lastUserMessageRef.current || isActive) return
        setError(null)
        submitMessage(lastUserMessageRef.current)
    }, [isActive, submitMessage])

    // ─── Session lifecycle ────────────────────────────────────────
    const handleClearChat = useCallback(async () => {
        await abandonAgent()
        setError(null)
        clearActiveMessages()
    }, [abandonAgent, clearActiveMessages])

    const handleNewSession = useCallback(async () => {
        await abandonAgent()
        setError(null)
        createSession()
    }, [abandonAgent, createSession])

    const handleSwitchSession = useCallback(async (id: string) => {
        if (id === activeSessionId) return
        await abandonAgent()
        setError(null)
        switchSession(id)
    }, [activeSessionId, abandonAgent, switchSession])

    const handleDeleteSession = useCallback(async (id: string) => {
        if (id === activeSessionId) {
            await abandonAgent()
            setError(null)
        }
        deleteSession(id)
    }, [activeSessionId, abandonAgent, deleteSession])

    // ─── Page → session follow ─────────────────────────────────
    // A page-bound session is the conversation about that page, so switching
    // to a page that already has one should surface it here instead of making
    // the user re-find it in the dropdown. Only an actual page change may
    // trigger the switch — never mid-run (it would cancel the stream) and
    // never when the incoming page has no bound session (keep the current
    // chat, e.g. a general-purpose one).
    const { pageId: activePageId } = useActiveEditor()
    const followedPageRef = useRef<string | null>(null)
    useEffect(() => {
        // No page in view — forget the last followed page so reopening it
        // later still counts as a switch.
        if (!activePageId) {
            followedPageRef.current = null
            return
        }
        if (followedPageRef.current === activePageId) return
        followedPageRef.current = activePageId
        if (isActive) return
        // sessions are sorted by updatedAt desc, so this is the most recent
        // conversation bound to the incoming page.
        const match = sessions.find(s => s.targetPage?.pageId === activePageId)
        if (match && match.id !== activeSessionId) void handleSwitchSession(match.id)
    }, [activePageId, sessions, activeSessionId, isActive, handleSwitchSession])

    // ─── Derived UI flags ─────────────────────────────────────────
    const isEmpty = messages.length === 0 && !isActive

    // ─── Render ───────────────────────────────────────────────────
    return (
        <ExpandableChat
            size="lg"
            embedded={embedded}
            onClose={onClose}
            icon={
                <div className="relative flex items-center justify-center">
                    {isActive && (
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
                        className={`h-6 w-6 relative z-10 transition-transform duration-500 ${isActive ? 'scale-95 drop-shadow-[0_0_6px_currentColor]' : ''}`}
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
                        <MessageBubble
                            key={message.id}
                            message={message}
                            onRevealReference={handleRevealReference}
                        />
                    ))}

                    {isActive && currentSteps.length > 0 && (
                        <LiveSteps steps={currentSteps} />
                    )}

                    {isActive && agent.state.reasoning && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage className="border border-primary/10 bg-primary/[0.03] p-2.5 rounded-lg rounded-tl-sm">
                                <details open className="group/reasoning">
                                    <summary className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground cursor-pointer select-none">
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                            <Sparkles className="h-3 w-3" />
                                        </span>
                                        <span>{t('ai.chat.thinking', 'Thinking')}</span>
                                        <span className="inline-flex items-end gap-0.5" aria-hidden="true">
                                            {[0, 1, 2].map(index => (
                                                <span
                                                    key={index}
                                                    className="h-1 w-1 rounded-full bg-primary animate-bounce motion-reduce:animate-none"
                                                    style={{
                                                        animationDelay: `${index * 140}ms`,
                                                        animationDuration: '900ms',
                                                    }}
                                                />
                                            ))}
                                        </span>
                                    </summary>
                                    <div className="mt-2 max-h-32 overflow-y-auto border-l-2 border-primary/15 pl-2 text-[11px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap break-words">
                                        {agent.state.reasoning}
                                    </div>
                                </details>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    {isActive && agent.state.text && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage className="bg-card border border-border/60 dark:bg-muted/40 dark:border-transparent p-2.5 text-[13px] leading-relaxed rounded-lg rounded-tl-sm">
                                <Streamdown isAnimating>{agent.state.text}</Streamdown>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    {isActive && !agent.state.text && currentSteps.length === 0 && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage
                                isLoading
                                className="bg-card border border-border/60 dark:bg-muted/40 dark:border-transparent p-2.5 rounded-lg rounded-tl-sm"
                            />
                        </ChatBubble>
                    )}

                    {agent.state.subRuns.length > 0 && (
                        <div className="mx-2 my-1.5">
                            <SubAgentTree subRuns={agent.state.subRuns} />
                        </div>
                    )}

                    {agent.state.phase === 'waiting-approval' && agent.state.plan && (
                        <div className="mx-2 my-1.5">
                            <PlanApprovalCard
                                planText={agent.state.plan.text}
                                onDecision={(approved, feedback) => agent.approvePlan(approved, feedback)}
                            />
                        </div>
                    )}

                    {agent.state.phase === 'suspended' && agent.state.suspendReason === 'budget' && (
                        <div className="mx-2 my-1.5 flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-[12px] text-muted-foreground">
                            <span>任务已暂停（迭代预算耗尽）</span>
                            <button
                                type="button"
                                className="ml-auto shrink-0 rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:opacity-90"
                                onClick={() => void agent.continueRun()}
                            >
                                继续执行
                            </button>
                        </div>
                    )}

                    {agent.state.error && agent.state.phase !== 'failed' && (
                        <div className="mx-2 my-1.5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                            <span className="min-w-0 flex-1">Agent 暂时不可用：{agent.state.error}</span>
                            {agent.state.phase === 'suspended' && (
                                <button
                                    type="button"
                                    className="shrink-0 rounded-md border border-amber-500/30 px-2 py-1 font-medium hover:bg-amber-500/10"
                                    onClick={agent.retryConnection}
                                >
                                    重试
                                </button>
                            )}
                        </div>
                    )}

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
                    onStop={() => void agent.cancel()}
                    isLoading={isActive}
                    mode={chatMode}
                    onModeChange={handleModeChange}
                    model={selectedModel}
                    onModelChange={handleModelChange}
                    modelParams={modelParams}
                    onModelParamsChange={handleModelParamsChange}
                    targetPage={targetPage}
                    currentPage={currentPage}
                    targetStatus={!targetPage && !currentPage?.pageId ? 'connecting' : targetStatus}
                    onPickPage={setTargetPage}
                    onClearPage={() => setTargetPage(null)}
                    onRetryPage={handleRetryPage}
                    onOpenPageWindow={handleOpenPageWindow}
                    tracking={tracking}
                    onToggleTracking={handleToggleTracking}
                />
            </ExpandableChatFooter>

            {editWindowPageId && (
                <PageEditWindow
                    pageId={editWindowPageId}
                    onClose={() => setEditWindowPageId(null)}
                />
            )}
        </ExpandableChat>
    )
}
