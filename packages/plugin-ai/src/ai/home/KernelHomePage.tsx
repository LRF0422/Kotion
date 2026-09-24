import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatMessageList, PlanApprovalCard, cn } from '@kn/ui'
import { LoaderCircle } from '@kn/icon'
import {
    AgentPaneHost,
    WORKSPACE_AGENT_PROMPT,
    composeAgentSystemPrompt,
    fileToAgentImage,
    toImageDataUrl,
    useAgentArtifacts,
    describeAgentTarget,
    describePluginAgents,
    useAgentCapabilities,
    useAgentPane,
    useCustomAgents,
    useTranslation,
    useWorkspaceAgent,
    type AgentArtifact,
    type AgentImageData,
    type AgentToolInvocation,
    type ChatMode,
    type ChatModelParams,
} from '@kn/common'
import { ArtifactsShelf } from './ArtifactsShelf'
import { ChatEmptyState } from '../menu/chat/ChatEmptyState'
import { ChatComposer } from '../menu/chat/ChatComposer'
import { useModelVisionSupport } from '../components/model-catalog'
import { ChatHeader } from '../menu/chat/ChatHeader'
import type { ExecutionStep } from '../menu/chat-types'
import { MessageBubble } from '../menu/MessageBubble'
import { useChatSessions } from '../menu/useChatSessions'
import { useSessionActions } from '../menu/use-session-actions'
import type { ChatError } from '../menu/chat-types'
import {
    MODEL_PARAMS_STORAGE_KEY,
    readModelParams,
    selectFinalAnswer,
    toolCallsToSteps,
} from '../menu/chat-helpers'
import { useModelPreference } from '../model-preference'
import type { Message } from '../menu/chat-types'

/**
 * Kernel Home — the workspace-level AI surface, owned by the AI plugin.
 *
 * A page the AI plugin contributes (route + sider menu); plugin-main has no AI
 * code and does not know this surface exists. Removing the AI plugin removes
 * the surface.
 *
 * It is the same chat as the side dock, full width: the same empty state, the
 * same markdown message bubbles (Streamdown), the same composer (Ask/Agent,
 * model selector, custom agent selector). Only two things differ:
 *  - the run is workspace-scoped (no editor), so the "@-page" target chip is
 *    hidden and document tools are absent from the catalog.
 *
 * Session management is SHARED with the side dock: the same conversation list
 * (/api/agent/v1/sessions + a localStorage index) and the same engine-owned
 * transcripts, so opening this page shows the same chats and a refresh
 * re-hydrates instead of resetting.
 */

const PANE_WIDTH_KEY = 'kn_agent_pane_width'
const DEFAULT_PANE_WIDTH = 520
const PANE_MIN_WIDTH = 320
const PANE_MAX_RATIO = 0.68
const PANE_TRANSITION_MS = 200

const clampPaneWidth = (value: number): number => {
    const max = typeof window === 'undefined'
        ? 900
        : Math.max(PANE_MIN_WIDTH, Math.floor(window.innerWidth * PANE_MAX_RATIO))
    return Math.min(Math.max(value, PANE_MIN_WIDTH), max)
}

const ACTIVE_PHASES = new Set([
    'creating', 'streaming', 'waiting-tools', 'waiting-approval', 'suspended',
])

export const KernelHomePage: React.FC = () => {
    const { t } = useTranslation()
    const {
        sessions, activeSessionId, messages, setMessages, loadingTranscript,
        createSession, switchSession, deleteSession, clearActiveMessages,
    } = useChatSessions()
    const [sessionError, setSessionError] = useState<ChatError | null>(null)
    const [input, setInput] = useState('')
    const [chatMode, setChatMode] = useState<ChatMode>('agent')
    const [selectedModel, setSelectedModel] = useModelPreference()
    const [modelParams, setModelParams] = useState<ChatModelParams>(() => readModelParams())
    // Image attachments: handed to the model as multimodal content parts.
    const [pendingImages, setPendingImages] = useState<AgentImageData[]>([])
    const [imageError, setImageError] = useState<string | null>(null)
    const { selectedAgent } = useCustomAgents()

    // A selected custom agent rides behind the invariant workspace rules.
    const systemPrompt = useMemo(
        () => composeAgentSystemPrompt(WORKSPACE_AGENT_PROMPT, selectedAgent) ?? WORKSPACE_AGENT_PROMPT,
        [selectedAgent],
    )

    const { agent, send } = useWorkspaceAgent({
        conversationId: activeSessionId,
        mode: chatMode,
        systemPrompt,
    })
    const { state } = agent
    const modelVision = useModelVisionSupport(selectedModel)
    const visionBlocked = modelVision.known && !modelVision.supportsVision
    // ─── Side peek: enter/exit animation + drag-to-resize ────────────
    // The surface owns the request snapshot so the column can animate out while
    // still rendering its content (see AgentPaneHostProps).
    const pane = useAgentPane()
    // The working target is the conversation's focused artifact; the pane is
    // just its view. Closing the pane hides it but keeps the target.
    const targetNote = describeAgentTarget(pane.target)
    // Workspace-scoped plugin agents the kernel can delegate to (hybrid model).
    const workspaceAgents = useAgentCapabilities('workspace')
    const agentNote = useMemo(() => describePluginAgents(workspaceAgents.agents), [workspaceAgents])
    const contextNote = [targetNote, agentNote].filter(Boolean).join('\n\n') || undefined
    const [paneWidth, setPaneWidth] = useState(() => {
        try {
            const stored = Number(window.localStorage.getItem(PANE_WIDTH_KEY))
            return Number.isFinite(stored) && stored > 0 ? clampPaneWidth(stored) : DEFAULT_PANE_WIDTH
        } catch {
            return DEFAULT_PANE_WIDTH
        }
    })
    const [paneOpen, setPaneOpen] = useState(false)
    const [paneDisplay, setPaneDisplay] = useState<AgentArtifact | null>(null)
    const [resizing, setResizing] = useState(false)

    useEffect(() => {
        if (pane.open && pane.target) {
            setPaneDisplay(pane.target)
            // Mount at width 0 first, then transition to the target width.
            const raf = requestAnimationFrame(() => setPaneOpen(true))
            return () => cancelAnimationFrame(raf)
        }
        setPaneOpen(false)
        const timer = setTimeout(() => setPaneDisplay(null), PANE_TRANSITION_MS)
        return () => clearTimeout(timer)
    }, [pane.open, pane.target])

    const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        setResizing(true)
        const startX = event.clientX
        const startWidth = paneWidth
        const previousUserSelect = document.body.style.userSelect
        document.body.style.userSelect = 'none'

        const handleMove = (moveEvent: PointerEvent) => {
            setPaneWidth(clampPaneWidth(startWidth - (moveEvent.clientX - startX)))
        }
        const handleUp = () => {
            setResizing(false)
            document.body.style.userSelect = previousUserSelect
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', handleUp)
            // Persist the settled width (updater form reads the latest value).
            setPaneWidth(width => {
                try { window.localStorage.setItem(PANE_WIDTH_KEY, String(width)) } catch { /* best-effort */ }
                return width
            })
        }
        window.addEventListener('pointermove', handleMove)
        window.addEventListener('pointerup', handleUp)
    }, [paneWidth])

    // ─── Session lifecycle ───────────────────────────────────────────
    // Switching / clearing first abandons the in-flight run so it can never
    // drive tools against the conversation we are leaving.
    const abandoningRef = useRef(false)
    const abandonAgent = useCallback(async () => {
        abandoningRef.current = true
        // The working target belongs to the conversation being left.
        pane.clearTarget()
        const cancelled = await agent.cancel().catch(() => false)
        if (cancelled) agent.reset()
        abandoningRef.current = false
    }, [agent, pane.clearTarget])
    const { handleClearChat, handleNewSession, handleSwitchSession, handleDeleteSession } = useSessionActions({
        activeSessionId,
        abandonAgent,
        clearActiveMessages,
        createSession: () => createSession(),
        switchSession,
        deleteSession,
        setError: setSessionError,
    })

    const isActive = ACTIVE_PHASES.has(state.phase)
    const isEmpty = messages.length === 0 && !isActive && !loadingTranscript

    const generateId = useCallback(
        () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        [],
    )

    const currentSteps = useMemo(() => toolCallsToSteps(state.toolCalls), [state.toolCalls])
    const liveMessage = useMemo<Message>(() => ({
        id: 'active-agent-turn',
        content: selectFinalAnswer(state.steps, state.answerStepId, state.text),
        reasoningContent: state.reasoning || undefined,
        activitySteps: state.steps,
        answerStepId: state.answerStepId ?? undefined,
        sender: 'ai',
        timestamp: Date.now(),
        steps: currentSteps,
        subRuns: state.subRuns,
    }), [
        state.answerStepId, state.reasoning, state.steps, state.subRuns, state.text, currentSteps,
    ])

    // ─── Artifacts shelf (kernel abstraction) ────────────────────────
    // A session can touch many targets; the kernel derives the shelf from the
    // transcript (engine-persisted), so it survives a refresh for free and can
    // never drift from the conversation.
    const liveSteps = liveMessage.steps
    const invocations = useMemo<AgentToolInvocation[]>(() => {
        const list: AgentToolInvocation[] = []
        for (const message of messages) {
            for (const step of (message.steps ?? []) as ExecutionStep[]) {
                list.push({ tool: step.toolName, args: step.args, result: step.result })
            }
        }
        if (isActive) {
            for (const step of (liveSteps ?? []) as ExecutionStep[]) {
                list.push({ tool: step.toolName, args: step.args, result: step.result })
            }
        }
        return list
    }, [messages, liveSteps, isActive])
    const artifactsShelf = useAgentArtifacts(invocations)

    // Snapshot a terminal turn into history, then reset the live run so the
    // next turn starts clean. Mirrors the dock chat's lifecycle.
    const lastPhaseRef = useRef(state.phase)
    useEffect(() => {
        const phase = state.phase
        if (lastPhaseRef.current === phase) return
        lastPhaseRef.current = phase
        if (phase !== 'completed' && phase !== 'failed' && phase !== 'cancelled') return
        // Abandoning (session switch / clear): never snapshot the abandoned
        // turn into whichever conversation is now active.
        if (abandoningRef.current) {
            agent.reset()
            return
        }

        const steps = toolCallsToSteps(state.toolCalls)
        const content = selectFinalAnswer(state.steps, state.answerStepId, state.text)
        const hasContent = Boolean(
            content.trim() || steps.length || state.steps.length || state.subRuns.length || state.error,
        )
        if (hasContent) {
            setMessages(prev => [...prev, {
                id: generateId(),
                content,
                reasoningContent: state.reasoning || undefined,
                activitySteps: state.steps.map(step => ({ ...step })),
                answerStepId: state.answerStepId ?? undefined,
                sender: 'ai',
                timestamp: Date.now(),
                steps,
                subRuns: state.subRuns.slice(),
                usage: state.usage ?? undefined,
                error: phase === 'failed',
                errorMessage: state.error ?? undefined,
            }])
        }
        agent.reset()
        // Only the phase transition matters here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.phase])

    const pushUserTurn = useCallback((text: string, images: AgentImageData[] = []) => {
        setMessages(prev => [...prev, {
            id: generateId(),
            content: text,
            images: images.length > 0 ? images.map(toImageDataUrl) : undefined,
            sender: 'user',
            timestamp: Date.now(),
        }])
        // Tell the model what it is operating on every turn. contextNote travels
        // behind the cacheable history, so a target switch never rewrites the
        // system prefix.
        void send(text, { model: selectedModel || undefined, images, contextNote })
            .catch(() => { /* surfaced via state.error */ })
    }, [generateId, send, selectedModel, contextNote])

    const handleAddImages = useCallback(async (files: File[]) => {
        // A model the backend knows cannot see images would have the parts
        // dropped server-side; refuse here and say why instead of sending an
        // upload the model answers with "看不到图片".
        if (visionBlocked) {
            setImageError(t('ai.chat.visionUnsupportedError', {
                model: selectedModel,
                defaultValue: '当前模型「{{model}}」不支持图片输入，图片未添加。请切换到支持识图的模型。',
            }))
            return
        }
        const images: AgentImageData[] = []
        for (const file of files) {
            try {
                images.push(await fileToAgentImage(file))
            } catch (err: any) {
                setImageError(err?.message ?? String(err))
            }
        }
        if (images.length > 0) {
            setPendingImages(prev => [...prev, ...images])
            setImageError(null)
        }
    }, [visionBlocked, selectedModel, t])

    const handleRemoveImage = useCallback((index: number) => {
        setPendingImages(prev => prev.filter((_, i) => i !== index))
    }, [])

    const handleSend = useCallback(() => {
        const text = input.trim()
        const images = pendingImages
        if ((!text && images.length === 0) || isActive) return
        if (visionBlocked && images.length > 0) return
        setInput('')
        setPendingImages([])
        pushUserTurn(text, images)
    }, [input, pendingImages, isActive, visionBlocked, pushUserTurn])

    const handleQuickSubmit = useCallback((prompt: string) => {
        if (isActive) return
        pushUserTurn(prompt)
    }, [isActive, pushUserTurn])

    const handleModelParamsChange = useCallback((params: ChatModelParams) => {
        setModelParams(params)
        try {
            window.localStorage.setItem(MODEL_PARAMS_STORAGE_KEY, JSON.stringify(params))
        } catch {
            /* preference is best-effort */
        }
    }, [])

    return (
        <div className="flex h-full min-h-0 bg-background">
            <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-1 border-b pr-2">
                <div className="min-w-0 flex-1">
                    <ChatHeader
                        sessions={sessions}
                        activeSessionId={activeSessionId}
                        hasMessages={messages.length > 0}
                        onSwitch={handleSwitchSession}
                        onNewSession={handleNewSession}
                        onDelete={handleDeleteSession}
                        onClear={handleClearChat}
                    />
                </div>
                <ArtifactsShelf
                    artifacts={artifactsShelf.artifacts}
                    activeKey={artifactsShelf.activeKey}
                    onOpen={artifactsShelf.open}
                />
            </div>
            {/* ChatMessageList owns the scroll container: it ships auto-follow
                (useAutoScroll + a "back to bottom" affordance) and re-enables
                following once the user returns to the bottom. An outer
                scroller would swallow the overflow and break that. */}
            <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-3 md:px-4">
                    <ChatMessageList>
                        {loadingTranscript && messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                                <LoaderCircle className="h-5 w-5 animate-spin" />
                                <span className="text-xs">
                                    {t('ai.chat.loadingSession')}
                                </span>
                            </div>
                        )}

                        {isEmpty && (
                            <ChatEmptyState mode={chatMode} onSubmit={handleQuickSubmit} />
                        )}

                        {messages.map(message => (
                            <MessageBubble key={message.id} message={message} />
                        ))}

                        {isActive && <MessageBubble message={liveMessage} isStreaming />}

                        {state.phase === 'waiting-approval' && state.plan && (
                            <div className="mx-2 my-1.5">
                                <PlanApprovalCard
                                    planText={state.plan.text}
                                    onDecision={(approved, feedback) => agent.approvePlan(approved, feedback)}
                                />
                            </div>
                        )}

                        {state.phase === 'suspended' && state.suspendReason === 'budget' && (
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

                        {(sessionError || (state.error && state.phase !== 'failed')) && (
                            <div className="mx-2 my-1.5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                                <span className="min-w-0 flex-1">
                                    {sessionError?.message
                                        ?? t('ai.chat.unavailable', { error: state.error })}
                                </span>
                                {state.error && (
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
                    </ChatMessageList>
            </div>

            <div className="border-t bg-background p-2">
                <div className="mx-auto w-full max-w-3xl">
                    <ChatComposer
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSend}
                        onStop={() => void agent.cancel()}
                        isLoading={isActive}
                        mode={chatMode}
                        onModeChange={setChatMode}
                        model={selectedModel}
                        onModelChange={setSelectedModel}
                        modelParams={modelParams}
                        onModelParamsChange={handleModelParamsChange}
                        hideTargetPage
                        targetStatus="idle"
                        onPickPage={() => { /* workspace scope has no page target */ }}
                        onClearPage={() => {}}
                        onRetryPage={() => {}}
                        onOpenPageWindow={() => {}}
                        images={pendingImages.map(toImageDataUrl)}
                        onAddImages={handleAddImages}
                        onRemoveImage={handleRemoveImage}
                        visionSupported={modelVision.known ? modelVision.supportsVision : undefined}
                        visionModelLabel={selectedModel}
                    />
                    {imageError && (
                        <div className="px-2 pt-1 text-[11px] text-destructive">{imageError}</div>
                    )}
                </div>
            </div>
            </div>
            {/* The column is ALWAYS mounted so its closed width is a painted
                state; opening then animates from it. A freshly-mounted aside
                would be painted straight at its target width (no transition).
                Transitions are inline on purpose: arbitrary Tailwind utilities
                like \`transition-[width]\` are not guaranteed to be scanned
                from a plugin bundle, and a missing class silently disables the
                animation. */}
            <aside
                aria-hidden={!paneOpen}
                className={cn(
                    'relative hidden shrink-0 overflow-hidden bg-background md:block',
                    paneOpen && 'border-l border-border',
                )}
                style={{
                    width: paneOpen ? paneWidth : 0,
                    transition: resizing ? 'none' : 'width 200ms ease-out',
                }}
            >
                {paneDisplay && (
                    <>
                        {/* Drag handle on the leading edge. */}
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={t('ai.artifacts.resizePane')}
                            onPointerDown={handleResizeStart}
                            className={cn(
                                'absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize',
                                resizing ? 'bg-primary/50' : 'hover:bg-border',
                            )}
                        />
                        {/* Fixed-width inner layer: content never reflows while
                            the column width animates; it fades in/out with it. */}
                        <div
                            className="h-full"
                            style={{
                                width: paneWidth,
                                opacity: paneOpen ? 1 : 0,
                                transition: 'opacity 200ms ease-out',
                            }}
                        >
                            <AgentPaneHost
                                artifact={paneDisplay}
                                onClose={pane.close}
                                onOpenInPage={pane.openInPage}
                            />
                        </div>
                    </>
                )}
            </aside>
        </div>
    )
}
