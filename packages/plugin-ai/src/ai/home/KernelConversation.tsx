import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import { ChatMessageList, PlanApprovalCard } from "@kn/ui"
import { LoaderCircle } from "@kn/icon"
import {
    fileToAgentImage,
    toImageDataUrl,
    useAgentArtifacts,
    describeAgentTarget,
    useCustomAgents,
    useTranslation,
    useWorkspaceAgent,
    type AgentArtifact,
    type AgentImageData,
    type AgentToolInvocation,
    type ChatMode,
    type ChatModelParams,
} from "@kn/common"

import { ChatComposer } from "../menu/chat/ChatComposer"
import { ChatEmptyState } from "../menu/chat/ChatEmptyState"
import { useModelVisionSupport } from "../components/model-catalog"
import type { ExecutionStep, Message } from "../menu/chat-types"
import { MessageBubble } from "../menu/MessageBubble"
import { useSessionTranscript } from "../menu/use-session-transcript"
import type { ChatPanelControls } from "../menu/use-session-actions"
import type { ChatTabStatus } from "../menu/chat/ChatTabs"
import type { ChatSessionMeta } from "../menu/chat-sessions"
import { selectFinalAnswer, toolCallsToSteps } from "../menu/chat-helpers"

const ACTIVE_PHASES = new Set([
    'creating', 'streaming', 'waiting-tools', 'waiting-approval', 'suspended',
])

export interface KernelConversationProps {
    sessionId: string
    session: ChatSessionMeta | undefined
    selectedModel: string
    onModelChange: (model: string) => void
    chatMode: ChatMode
    onModeChange: (mode: ChatMode) => void
    modelParams: ChatModelParams
    onModelParamsChange: (params: ChatModelParams) => void
    onPatchSession: (sessionId: string, patch: Partial<ChatSessionMeta>) => void
    onMessagesChange: (sessionId: string, messages: Message[]) => void
    onRunStatus: (sessionId: string, status: ChatTabStatus) => void
    /** Publish this conversation's artifact list to the surface's shelf. */
    onArtifacts: (sessionId: string, artifacts: AgentArtifact[]) => void
    controlsRef: MutableRefObject<Map<string, ChatPanelControls>>
}

/**
 * One mounted conversation of the kernel home (/ai).
 *
 * Same contract as the dock's panel — its own agent, transcript and run — but
 * workspace-scoped: no editor is bound, the capability set GROWS with the
 * conversation (the first `createPage`/`editPage` acquires the page's hidden
 * editor inside `useWorkspaceAgent`), and the working target is the
 * conversation's own artifact rather than a document.
 */
export const KernelConversation: React.FC<KernelConversationProps> = ({
    sessionId,
    session,
    selectedModel,
    onModelChange,
    chatMode,
    onModeChange,
    modelParams,
    onModelParamsChange,
    onPatchSession,
    onMessagesChange,
    onRunStatus,
    onArtifacts,
    controlsRef,
}) => {
    const { t } = useTranslation()
    const [sessionError, setSessionError] = useState<string | null>(null)
    const [input, setInput] = useState('')
    // Image attachments: handed to the model as multimodal content parts.
    const [pendingImages, setPendingImages] = useState<AgentImageData[]>([])
    const [imageError, setImageError] = useState<string | null>(null)
    const { selectedAgent } = useCustomAgents()

    const {
        messages,
        setMessages,
        loadingTranscript,
        resetTranscript,
    } = useSessionTranscript({
        sessionId,
        boundPageTitle: session?.targetPage?.title,
        meta: session,
    })

    // Every transcript change (a load included) reaches the container: it needs
    // the size for the clear affordance and derives the auto title from it.
    useEffect(() => {
        onMessagesChange(sessionId, messages)
    }, [messages, onMessagesChange, sessionId])

    // The conversation's own working target is what the model is told about:
    // a background tab must not describe the artifact the USER is looking at.
    const contextNote = describeAgentTarget(session?.targetArtifact ?? null)

    // A selected custom agent's guidance rides as per-turn context; the agent
    // prompt itself is backend-owned and selected from the `workspace` scope.
    const { agent, send } = useWorkspaceAgent({
        conversationId: sessionId,
        mode: chatMode,
        customAgent: selectedAgent,
        // 长任务（background: true 的构建/装依赖/发布）跑完、而 agent 没有在等它时，
        // 把结果作为一条通知推进对话：工作台正是这些长任务发生的地方，不推的话
        // "帮我 build 一下"就没有下文了。回调先于 `send` 定义，触发时它早已就位。
        onBackgroundTaskSettled: (_tasks, note) => {
            setMessages(prev => [...prev, {
                id: `background-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                sender: 'user' as const,
                content: note,
                timestamp: Date.now(),
            }])
            void send(note).catch(() => undefined)
        },
    })
    const { state } = agent
    const modelVision = useModelVisionSupport(selectedModel)
    const visionBlocked = modelVision.known && !modelVision.supportsVision

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
    // transcript, so it survives a refresh for free and can never drift.
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
    // The conversation id scopes the BACKGROUND tasks whose artifacts this
    // shelf includes: a long build (e.g. a plugin build) contributes its artifact
    // from the moment it starts, not only when its tool result comes back.
    const artifactsShelf = useAgentArtifacts(invocations, sessionId)
    const shelfArtifacts = artifactsShelf.artifacts
    useEffect(() => {
        onArtifacts(sessionId, shelfArtifacts)
    }, [onArtifacts, sessionId, shelfArtifacts])

    // ─── Tab status reporting ─────────────────────────────────────
    const liveChoice = state.phase === 'waiting-approval' || state.phase === 'suspended'
    const reportedStatusRef = useRef<ChatTabStatus>('idle')
    useEffect(() => {
        const phase = state.phase
        const status: ChatTabStatus =
            liveChoice
                ? 'attention'
                : phase === 'failed'
                    ? 'failed'
                    : ACTIVE_PHASES.has(phase)
                        ? 'running'
                        : phase === 'completed' || phase === 'cancelled'
                            ? 'done'
                            : 'idle'
        if (status === reportedStatusRef.current) return
        reportedStatusRef.current = status
        if (status === 'idle') return
        onRunStatus(sessionId, status)
    }, [state.phase, liveChoice, onRunStatus, sessionId])

    // Snapshot a terminal turn into history, then reset the live run so the
    // next turn starts clean. Mirrors the dock chat's lifecycle.
    const abandoningRef = useRef(false)
    const lastPhaseRef = useRef(state.phase)
    useEffect(() => {
        const phase = state.phase
        if (lastPhaseRef.current === phase) return
        lastPhaseRef.current = phase
        if (phase !== 'completed' && phase !== 'failed' && phase !== 'cancelled') return
        // Abandoning (clear / tab close): never snapshot the abandoned turn back
        // into the conversation.
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

    // Stop/clear for THIS conversation, published to the container.
    const clear = useCallback(async () => {
        abandoningRef.current = true
        await agent.cancel().catch(() => false)
        agent.reset()
        abandoningRef.current = false
        resetTranscript()
        setSessionError(null)
        setInput('')
        setPendingImages([])
        setImageError(null)
    }, [agent, resetTranscript])

    useEffect(() => {
        const controls = controlsRef.current
        controls.set(sessionId, {
            cancel: async () => {
                const cancelled = await agent.cancel().catch(() => false)
                if (cancelled) agent.reset()
                return cancelled
            },
            clear,
        })
        return () => { controls.delete(sessionId) }
    }, [sessionId, agent, clear, controlsRef])

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
    }, [generateId, send, selectedModel, contextNote, setMessages])

    const handleAddImages = useCallback(async (files: File[]) => {
        // A model the backend knows cannot see images would have the parts
        // dropped server-side; refuse here and say why.
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
        // Sending mid-run is allowed: useWorkspaceAgent hands the turn to the
        // running run, so the workbench composer never waits for it to finish.
        if (!text && images.length === 0) return
        if (visionBlocked && images.length > 0) return
        setInput('')
        setPendingImages([])
        pushUserTurn(text, images)
    }, [input, pendingImages, visionBlocked, pushUserTurn])

    const handleQuickSubmit = useCallback((prompt: string) => {
        if (isActive) return
        pushUserTurn(prompt)
    }, [isActive, pushUserTurn])

    // Kernel scoping: the workspace agent's own capability growth is what makes
    // document work possible, so the panel reports nothing about the editor.
    const noop = useCallback(() => { /* workspace scope has no page target */ }, [])

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col">
            {/* ChatMessageList owns the scroll container: it ships auto-follow
                (useAutoScroll + a "back to bottom" affordance) and re-enables
                following once the user returns to the bottom.

                The scrollport spans the whole panel (its scrollbar therefore
                rides the panel's right edge instead of floating mid-window),
                while the transcript column keeps its readable max-w-3xl width
                by centering itself inside the scrollport. */}
            <ChatMessageList>
                <div className="mx-auto flex w-full max-w-3xl grow flex-col gap-1 px-5 md:px-6">
                    {loadingTranscript && messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                            <LoaderCircle className="h-5 w-5 animate-spin" />
                            <span className="text-xs">
                                {t('ai.chat.loadingSession')}
                            </span>
                        </div>
                    )}

                    {/* Center the hero in the message viewport instead of
                        pinning it to the top of the scroll area. */}
                    {isEmpty && (
                        <div className="flex flex-1 flex-col justify-center">
                            <ChatEmptyState mode={chatMode} onSubmit={handleQuickSubmit} />
                        </div>
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
                                {sessionError ?? t('ai.chat.unavailable', { error: state.error })}
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
                </div>
            </ChatMessageList>

            {/* No top divider: the composer draws its own outline, so a
                full-bleed hairline over a max-w-3xl composer is just a stray
                line. The header row keeps the page's divider. */}
            <div className="bg-background p-2">
                <div className="mx-auto w-full max-w-3xl">
                    <ChatComposer
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSend}
                        onStop={() => void agent.cancel()}
                        isLoading={isActive}
                        mode={chatMode}
                        onModeChange={onModeChange}
                        model={selectedModel}
                        onModelChange={onModelChange}
                        modelParams={modelParams}
                        onModelParamsChange={onModelParamsChange}
                        hideTargetPage
                        targetStatus="idle"
                        onPickPage={noop}
                        onClearPage={noop}
                        onRetryPage={noop}
                        onOpenPageWindow={noop}
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
    )
}
