import React, { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Sparkles } from "@kn/icon"
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
    getPageNavigationBridge,
    setSessionPageBinding,
    clearSessionPageBinding,
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
    AgentStepRecord,
    ToolCallRecord,
    SessionPageBinding,
} from "@kn/common"

import { PlanApprovalCard } from "@kn/ui"
import {
    ExecutionStep, PendingUserChoice, ChatError,
    classifyError, sanitizeToolPayload,
} from "./chat-types"
import type { BlockReference, Message } from "./chat-types"
import { getHistoryForAI } from "./chat-persistence"
import type { ChatSessionMeta, ChatTargetPage } from "./chat-sessions"
import { useChatSessions } from "./useChatSessions"
import { MessageBubble } from "./MessageBubble"
import { ErrorDisplay } from "./ErrorDisplay"
import { ChatHeader } from "./chat/ChatHeader"
import { ChatEmptyState } from "./chat/ChatEmptyState"
import { ChatComposer } from "./chat/ChatComposer"
import type { TargetPageStatus } from "./chat/PageMentionPicker"
import { UserChoiceCard } from "./chat/UserChoiceCard"
import { useModelPreference } from "../model-preference"

// ─── Persistence keys ──────────────────────────────────────────────

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
        args: sanitizeToolPayload(tc.args),
        result: sanitizeToolPayload(tc.result),
        error: sanitizeToolPayload(tc.error) as string | undefined,
        status: tc.status,
        timestamp: 0,
        step: tc.step,
        stepId: tc.stepId,
        sequence: tc.startedSeq ?? tc.completedSeq,
        duration: tc.durationMs,
    }))

/** Read the canonical user-facing answer chosen by the shared Agent state. */
const selectFinalAnswer = (
    activitySteps: AgentStepRecord[],
    answerStepId: string | null | undefined,
    fallback: string,
): string => {
    if (activitySteps.length === 0) return fallback
    const answer = answerStepId
        ? activitySteps.find(step => step.id === answerStepId)
        : undefined
    return answer?.text ?? ''
}

/**
 * The page a chat conversation belongs to. The page it was created/used on
 * (boundPage) wins over an off-screen edit target (targetPage) so a chat that
 * edits another page still follows its home page.
 */
const sessionPageId = (session?: ChatSessionMeta): string | undefined =>
    session?.boundPage?.pageId ?? session?.targetPage?.pageId

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
    const [selectedModel, handleModelChange] = useModelPreference()

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
        boundPage,
        setBoundPage,
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
        const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
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
            const info = getPageNavigationBridge()?.getCurrentPage()
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

    // ─── Session page binding bridge ─────────────────────────────
    // Page tools (createPage / openPage) live in core and cannot reach this
    // session's state. They call through this registry so a freshly created
    // page becomes the conversation's edit target instead of navigating away.
    const boundPageRef = useRef<ChatTargetPage | undefined>(targetPage)
    boundPageRef.current = targetPage
    useEffect(() => {
        const binding: SessionPageBinding = {
            bindPage: (page) => {
                const record: ChatTargetPage = {
                    pageId: String(page.pageId),
                    title: page.title || '',
                    spaceId: page.spaceId,
                }
                // Update synchronously so an openPage in the same tool batch
                // already sees the new target.
                boundPageRef.current = record
                setTargetPage(record)
            },
            getBoundPage: () => (boundPageRef.current ? { ...boundPageRef.current } : null),
            openPageWindow: (pageId) => setEditWindowPageId(String(pageId)),
        }
        setSessionPageBinding(binding)
        return () => clearSessionPageBinding(binding)
    }, [setTargetPage])

    // ─── Block reference navigation ─────────────────────────────
    const [pendingReveal, setPendingReveal] = useState<{ pageId: string; blockId: string } | null>(null)

    const handleRevealReference = useCallback((ref: BlockReference) => {
        if (ref.found === false) return
        if (revealBlockById(editor, ref.blockId)) return
        if (targetPage) {
            const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
            if (currentPageId !== undefined && String(currentPageId) === targetPage.pageId) return
            setPendingReveal({ pageId: targetPage.pageId, blockId: ref.blockId })
            getPageNavigationBridge()?.openPage(targetPage.pageId, targetPage.spaceId)
        }
    }, [editor, targetPage])

    useEffect(() => {
        if (!pendingReveal) return
        let tries = 0
        const timer = setInterval(() => {
            const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
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
    const liveCurrentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
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
    const liveMessage = useMemo<Message>(() => ({
        id: 'active-agent-turn',
        content: selectFinalAnswer(agent.state.steps, agent.state.answerStepId, agent.state.text),
        reasoningContent: agent.state.reasoning || undefined,
        activitySteps: agent.state.steps,
        answerStepId: agent.state.answerStepId ?? undefined,
        sender: 'ai',
        timestamp: Date.now(),
        steps: currentSteps,
        subRuns: agent.state.subRuns,
    }), [agent.state.answerStepId, agent.state.reasoning, agent.state.steps, agent.state.subRuns, agent.state.text, currentSteps])

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
            const content = selectFinalAnswer(agent.state.steps, agent.state.answerStepId, agent.state.text)
            const classifiedError = phase === 'failed'
                ? classifyError(new Error(agent.state.error ?? ''))
                : undefined
            const hasContent = Boolean(
                content.trim() || steps.length > 0 || agent.state.steps.length > 0
                || agent.state.subRuns.length > 0 || classifiedError
            )
            if (hasContent) {
                const snapshot: Message = {
                    id: generateMessageId(),
                    content,
                    reasoningContent: agent.state.reasoning || undefined,
                    activitySteps: agent.state.steps.map(step => ({ ...step })),
                    answerStepId: agent.state.answerStepId ?? undefined,
                    sender: 'ai',
                    timestamp: Date.now(),
                    steps,
                    subRuns: agent.state.subRuns.slice(),
                    usage: agent.state.usage ?? undefined,
                    error: phase === 'failed',
                    errorType: classifiedError?.type,
                    errorMessage: classifiedError?.message,
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
            ? t('ai.chat.boundPagePrefix', { title: targetPage.title }) + '\n' + messageText
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
        setMessages, t,
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

    // ─── Page ↔ session binding ────────────────────────────────
    // Each conversation belongs to the page it is used on. Switching pages
    // surfaces that page's most recent conversation; a page with no history
    // adopts the current (still empty, unbound) chat or starts a fresh one, so
    // browsing never spawns empty chats and chatting never lands in another
    // page's thread.
    const { pageId: activePageId, spaceId: activeSpaceId } = useActiveEditor()
    const followedPageRef = useRef<string | null>(null)
    const messagesRef = useRef(messages)
    messagesRef.current = messages
    const currentPageRef = useRef<ChatTargetPage | undefined>(currentPage)
    currentPageRef.current = currentPage

    /** The open page as a binding record, refreshing from the navigation bridge. */
    const resolvePageBinding = useCallback((pageId: string): ChatTargetPage => {
        const info = getPageNavigationBridge()?.getCurrentPage()
        if (info?.pageId !== undefined && String(info.pageId) === pageId) {
            return { pageId, title: info.title || '', spaceId: info.spaceId ?? activeSpaceId }
        }
        const known = currentPageRef.current
        if (known?.pageId === pageId) return known
        return { pageId, title: '', spaceId: known?.spaceId ?? activeSpaceId }
    }, [activeSpaceId])

    useEffect(() => {
        // No page in view — forget the last followed page so reopening it
        // later still counts as a switch.
        if (!activePageId) {
            followedPageRef.current = null
            return
        }
        // Never switch mid-run (it would cancel the stream); when the run
        // settles this effect re-runs and performs the pending switch.
        if (isActive) return
        if (followedPageRef.current === activePageId) return
        followedPageRef.current = activePageId

        // Latest conversation bound to the incoming page.
        const match = sessions
            .filter(s => sessionPageId(s) === activePageId)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
        if (match) {
            if (match.id !== activeSessionId) void handleSwitchSession(match.id)
            return
        }

        // No history for this page yet. A chat already committed to another
        // page gets a sibling conversation; an empty or unbound chat adopts
        // this page instead, so browsing never spawns empty chats.
        const current = sessions.find(s => s.id === activeSessionId)
        const currentPageId = sessionPageId(current)
        const committedElsewhere = messagesRef.current.length > 0
            && !!currentPageId && currentPageId !== activePageId
        if (committedElsewhere) {
            createSession(resolvePageBinding(activePageId))
        } else {
            setBoundPage(resolvePageBinding(activePageId))
        }
    }, [
        activePageId, sessions, activeSessionId, isActive, handleSwitchSession,
        createSession, setBoundPage, resolvePageBinding,
    ])

    // A conversation that has real content adopts the page it is used on —
    // including chats that edit a different page off-screen, whose edit target
    // must not change the page the conversation itself belongs to.
    useEffect(() => {
        if (messages.length === 0 || boundPage || !activePageId) return
        setBoundPage(resolvePageBinding(activePageId))
    }, [messages.length, boundPage, activePageId, setBoundPage, resolvePageBinding])

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

                    {isActive && (
                        <MessageBubble
                            message={liveMessage}
                            isStreaming
                            onRevealReference={handleRevealReference}
                        />
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
                            <span>{t('ai.chat.budgetPaused')}</span>
                            <button
                                type="button"
                                className="ml-auto shrink-0 rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:opacity-90"
                                onClick={() => void agent.continueRun()}
                            >
                                {t('ai.chat.continueRun')}
                            </button>
                        </div>
                    )}

                    {agent.state.error && agent.state.phase !== 'failed' && (
                        <div className="mx-2 my-1.5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                            <span className="min-w-0 flex-1">{t('ai.chat.unavailable', { error: agent.state.error })}</span>
                            {agent.state.phase === 'suspended' && (
                                <button
                                    type="button"
                                    className="shrink-0 rounded-md border border-amber-500/30 px-2 py-1 font-medium hover:bg-amber-500/10"
                                    onClick={agent.retryConnection}
                                >
                                    {t('ai.chat.retry')}
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

            <ExpandableChatFooter className="border-t bg-background p-2">
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
                <div className="h-safe-bottom lg:hidden" aria-hidden />
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
