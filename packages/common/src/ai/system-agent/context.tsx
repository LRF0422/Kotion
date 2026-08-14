/**
 * System AI Agent Context
 *
 * Provides a global AI agent that can be used anywhere in the application.
 * This is the default AI functionality available to all components.
 */

import React, { createContext, useContext, useCallback, useRef, useState, useEffect, useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import type { ChatMessage, PlanArtifact } from '../chat-client/types'
import type { OnToolExecution, OnUserChoiceRequest } from '../types'
import { useCapabilityProviders } from '../use-capability-providers'
import { AgentHarnessImpl } from '../harness'
import type { ExecutionStep } from '../harness'
import { useStreamBuffer } from '../utils/use-stream-buffer'
import { SYSTEM_AGENT_PROMPT } from '../constants'

// Re-export ExecutionStep so existing `@kn/common` consumers keep working.
export type { ExecutionStep }

// ============ Task persistence (refresh resume) ============

const TASK_STORAGE_KEY = 'kn-system-agent-task-id'
const TASK_TS_STORAGE_KEY = 'kn-system-agent-task-ts'
const TASK_TTL_MS = 30 * 60 * 1000

/** The last backend taskId, when still within TTL (used to re-attach on mount). */
export function getStoredSystemAgentTaskId(): string | null {
    try {
        const id = localStorage.getItem(TASK_STORAGE_KEY)
        const tsRaw = localStorage.getItem(TASK_TS_STORAGE_KEY)
        const ts = tsRaw ? parseInt(tsRaw, 10) : 0
        if (!id || !ts || Date.now() - ts > TASK_TTL_MS) {
            localStorage.removeItem(TASK_STORAGE_KEY)
            localStorage.removeItem(TASK_TS_STORAGE_KEY)
            return null
        }
        return id
    } catch {
        return null
    }
}

function storeSystemAgentTaskId(id: string): void {
    try {
        localStorage.setItem(TASK_STORAGE_KEY, id)
        localStorage.setItem(TASK_TS_STORAGE_KEY, String(Date.now()))
    } catch { /* ignore */ }
}

function clearStoredSystemAgentTaskId(): void {
    try {
        localStorage.removeItem(TASK_STORAGE_KEY)
        localStorage.removeItem(TASK_TS_STORAGE_KEY)
    } catch { /* ignore */ }
}

// ============ Sub-agent tree (P6) ============

/**
 * One node in the sub-agent tree. Built from the `subagent_*` / `delegate_start`
 * annotations the backend streams on the `8:` channel. Events are routed by
 * `agentId` (tolerant of parallel interleaving), so a node accumulates its own
 * text / reasoning / tool steps independently of siblings.
 */
export interface SubAgentNode {
    agentId: string
    parentAgentId: string | null
    depth: number
    task: string
    status: 'spawned' | 'running' | 'completed' | 'error'
    reasoningContent: string
    streamingContent: string
    steps: ExecutionStep[]
    usage?: { promptTokens: number; completionTokens: number }
    startedAt: number
    endedAt?: number
    error?: string
    /** Custom agent name from AgentSpec.name (orchestrator-spawned agents). */
    agentName?: string
    /** The agent's task description from AgentSpec.description. */
    description?: string
}

function ensureNode(
    map: Record<string, SubAgentNode>,
    agentId: string,
    parentAgentId?: string | null,
    depth?: number,
): SubAgentNode {
    const existing = map[agentId]
    if (existing) {
        // Backfill identity if a later event carries it first.
        if (parentAgentId !== undefined && existing.parentAgentId == null) {
            existing.parentAgentId = parentAgentId ?? null
        }
        if (depth !== undefined && !existing.depth) existing.depth = depth
        return existing
    }
    const node: SubAgentNode = {
        agentId,
        parentAgentId: parentAgentId ?? null,
        depth: depth ?? 1,
        task: '',
        status: 'spawned',
        reasoningContent: '',
        streamingContent: '',
        steps: [],
        startedAt: Date.now(),
        agentName: undefined,
        description: undefined,
    }
    map[agentId] = node
    return node
}

/**
 * Fold a batch of annotations into the sub-agent tree, returning a NEW map
 * (immutable update) when anything sub-agent-related changed, else the original.
 */
export function applySubAgentAnnotations(
    current: Record<string, SubAgentNode>,
    annotations: any[],
): Record<string, SubAgentNode> {
    let changed = false
    // Work on a shallow clone; nodes are cloned on first touch below.
    const next: Record<string, SubAgentNode> = { ...current }
    const touch = (agentId: string, parentAgentId?: string | null, depth?: number): SubAgentNode => {
        // Clone the node before mutating so React sees a new reference.
        const base = ensureNode(next, agentId, parentAgentId, depth)
        const clone: SubAgentNode = { ...base, steps: [...base.steps] }
        next[agentId] = clone
        changed = true
        return clone
    }

    for (const ann of annotations) {
        if (!ann || typeof ann !== 'object') continue
        switch (ann.type) {
            case 'delegate_start':
                if (Array.isArray(ann.subTasks)) {
                    for (const st of ann.subTasks) {
                        if (st?.agentId) {
                            const n = touch(st.agentId, ann.parentAgentId, ann.depth)
                            if (st.description && !n.task) n.task = st.description
                            if (st.agentName && !n.agentName) n.agentName = st.agentName
                        }
                    }
                }
                break
            case 'subagent_spawned': {
                const n = touch(ann.agentId, ann.parentAgentId, ann.depth)
                if (ann.task) n.task = ann.task
                if (ann.agentName) n.agentName = ann.agentName
                if (ann.description) n.description = ann.description
                n.status = 'spawned'
                break
            }
            case 'subagent_status': {
                const n = touch(ann.agentId, ann.parentAgentId, ann.depth)
                if (ann.status === 'running' || ann.status === 'working') n.status = 'running'
                else if (ann.status === 'completed') n.status = 'completed'
                else if (ann.status === 'error') {
                    n.status = 'error'
                    if (ann.detail) n.error = ann.detail
                }
                break
            }
            case 'subagent_output': {
                const n = touch(ann.agentId, ann.parentAgentId, ann.depth)
                n.streamingContent += ann.content ?? ''
                if (n.status === 'spawned') n.status = 'running'
                break
            }
            case 'subagent_reasoning': {
                const n = touch(ann.agentId, ann.parentAgentId, ann.depth)
                n.reasoningContent += ann.content ?? ''
                if (n.status === 'spawned') n.status = 'running'
                break
            }
            case 'subagent_tool_call': {
                const n = touch(ann.agentId, ann.parentAgentId, ann.depth)
                n.steps.push({
                    id: ann.toolCallId || `${ann.agentId}-step-${n.steps.length}`,
                    toolName: ann.toolName,
                    args: ann.args,
                    status: 'running',
                    timestamp: Date.now(),
                })
                if (n.status === 'spawned') n.status = 'running'
                break
            }
            case 'subagent_tool_result': {
                const n = touch(ann.agentId, ann.parentAgentId, ann.depth)
                n.steps = n.steps.map(s =>
                    s.id === ann.toolCallId
                        ? { ...s, status: ann.error ? 'error' : 'success', result: ann.result, error: ann.error }
                        : s,
                )
                break
            }
            case 'subagent_error': {
                const n = touch(ann.agentId, ann.parentAgentId, ann.depth)
                n.status = 'error'
                n.error = ann.error
                break
            }
            case 'subagent_finish': {
                const n = touch(ann.agentId, ann.parentAgentId, ann.depth)
                n.status = ann.status === 'error' ? 'error' : 'completed'
                n.endedAt = Date.now()
                if (ann.usage) n.usage = ann.usage
                break
            }
            default:
                break
        }
    }

    return changed ? next : current
}

// ============ Types ============

/** Minimal default options for the system agent provider. */
export interface SystemAgentOptions {
    systemPrompt?: string
    model?: string
    maxSteps?: number
}

export interface SystemAgentState {
    /** Whether the agent is currently generating */
    isGenerating: boolean
    /** Current streaming content */
    streamingContent: string
    /** Error if any */
    error: Error | null
    /** Tool execution steps */
    executionSteps: ExecutionStep[]
    /** Active skills */
    activeSkills: string[]
    /** Annotations received from Data Stream v2 */
    annotations: any[]
    /** Current session ID */
    sessionId: string | null
    /** Current async task ID (backend job handle). */
    taskId: string | null
    /** Sub-agent tree, keyed by agentId (P6). Built from subagent_* annotations. */
    subAgents: Record<string, SubAgentNode>
    /**
     * Pending plan awaiting the user's approval (P7), or null. Set when a
     * `plan_proposed` annotation arrives; the UI renders an approve/edit/reject
     * card and resumes by streaming again with the decision.
     */
    pendingPlan: { plan: PlanArtifact; planId?: string } | null
}

export interface StreamPromptOptions {
    /** Conversation history */
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    /** System prompt override */
    systemPrompt?: string
    /** Abort signal */
    abortSignal?: AbortSignal
    /** Editor to use (overrides current editor) */
    editor?: Editor
    /** Session ID for conversation continuity */
    sessionId?: string
    /** Conversation ID for multi-turn conversations */
    conversationId?: string
    /** Run mode: 'plan' (read-only research → plan → approval) or 'execute' (default). */
    mode?: 'plan' | 'execute'
    /** Callback for annotation events */
    onAnnotation?: (annotations: any[]) => void
}

export interface SystemAgentContextValue {
    /** Current state */
    state: SystemAgentState
    /** Stream a prompt with text updates */
    stream: (prompt: string, options?: StreamPromptOptions) => Promise<void>
    /** Stop current generation */
    stop: () => void
    /** Set editor context */
    setEditor: (editor: Editor | null) => void
    /** Get current editor */
    getEditor: () => Editor | null
    /** Activate a skill */
    activateSkill: (skillName: string) => void
    /** Deactivate a skill */
    deactivateSkill: (skillName: string) => void
    /** Reset state */
    reset: () => void
    /** Set tool execution callback */
    setOnToolExecution: (callback: OnToolExecution | undefined) => void
    /** Set user choice request callback */
    setOnUserChoiceRequest: (callback: OnUserChoiceRequest | undefined) => void
    /** Set session ID */
    setSessionId: (sessionId: string | null) => void
    /**
     * Respond to a pending plan (P7). `approved` resumes execution of the
     * (optionally edited) plan; `rejected` re-plans with feedback. Clears
     * `state.pendingPlan` and continues the same conversation.
     */
    resolvePlan: (
        decision: 'approved' | 'rejected',
        opts?: { feedback?: string; editedPlan?: PlanArtifact }
    ) => Promise<void>
    /**
     * Re-attach to an in-flight backend task after a refresh: reconstructs the
     * in-progress text from the server checkpoint and continues streaming.
     */
    attach: (taskId: string) => Promise<void>
}

export interface SystemAgentProviderProps {
    children: React.ReactNode
    /** Default agent options */
    defaultOptions?: SystemAgentOptions
    /** Initial tool execution callback */
    onToolExecution?: OnToolExecution
    /** Initial user choice callback */
    onUserChoiceRequest?: OnUserChoiceRequest
}

const SystemAgentContext = createContext<SystemAgentContextValue | null>(null)

// ============ Provider ============

export const SystemAgentProvider: React.FC<SystemAgentProviderProps> = ({
    children,
    defaultOptions,
    onToolExecution: initialOnToolExecution,
    onUserChoiceRequest: initialOnUserChoiceRequest
}) => {
    // State
    const [state, setState] = useState<SystemAgentState>({
        isGenerating: false,
        streamingContent: '',
        error: null,
        executionSteps: [],
        activeSkills: [],
        annotations: [],
        sessionId: null,
        taskId: null,
        subAgents: {},
        pendingPlan: null
    })

    // Use ref for activeSkills to avoid stale closure in stream callback
    const activeSkillsRef = useRef<Set<string>>(new Set())
    const sessionIdRef = useRef<string | null>(null)
    const taskIdRef = useRef<string | null>(null)
    // Mirror of state.pendingPlan for stable access inside callbacks (P7).
    const pendingPlanRef = useRef<{ plan: PlanArtifact; planId?: string } | null>(null)

    // Shared streaming buffer
    const streamBuffer = useStreamBuffer()

    // Refs
    const editorRef = useRef<Editor | null>(null)
    const [editor, setEditorState] = useState<Editor | null>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const onToolExecutionRef = useRef<OnToolExecution | undefined>(initialOnToolExecution)
    const onUserChoiceRequestRef = useRef<OnUserChoiceRequest | undefined>(initialOnUserChoiceRequest)
    const stepCounterRef = useRef(0)
    const harnessRef = useRef<AgentHarnessImpl>(new AgentHarnessImpl())

    // Stable callback wrappers that read the latest refs, so the shared
    // capability providers don't rebuild when consumers swap callbacks.
    const onToolExecution = useCallback<OnToolExecution>((e) => {
        onToolExecutionRef.current?.(e)
    }, [])
    const onUserChoiceRequest = useCallback<OnUserChoiceRequest>((req) => {
        const fn = onUserChoiceRequestRef.current
        return fn ? fn(req) : Promise.reject(new Error('No user choice handler registered'))
    }, [])

    // Shared capability catalog wiring (providers, plugins, skills). The editor
    // may be null until one is bound via setEditor; built-in tools are still
    // advertised but only execute once a real editor is present.
    const { getCatalog, resolveTool } = useCapabilityProviders(editor, {
        onToolExecution,
        onUserChoiceRequest,
    })

    // Set editor context
    const setEditor = useCallback((editor: Editor | null) => {
        editorRef.current = editor
        setEditorState(editor)
    }, [])

    const getEditor = useCallback(() => {
        return editorRef.current
    }, [])

    // Sync streaming buffer content to state
    useEffect(() => {
        if (streamBuffer.content) {
            setState(prev => ({ ...prev, streamingContent: streamBuffer.content }))
        }
    }, [streamBuffer.content])

    // Shared annotation folding — extracts session/task ids (persisting the
    // taskId for refresh resume), captures plan proposals and sub-agent events.
    const handleAnnotation = useCallback((annotations: any[], notify?: (annotations: any[]) => void) => {
        for (const ann of annotations) {
            if (ann && typeof ann === 'object' && 'sessionId' in ann && typeof ann.sessionId === 'string') {
                sessionIdRef.current = ann.sessionId
            }
            if (ann && typeof ann === 'object' && 'taskId' in ann && typeof ann.taskId === 'string') {
                taskIdRef.current = ann.taskId
                storeSystemAgentTaskId(ann.taskId)
            }
        }

        // Plan mode (P7): capture a proposed plan awaiting approval.
        let pendingPlanUpdate: SystemAgentState['pendingPlan'] | undefined
        for (const ann of annotations) {
            if (ann && ann.type === 'plan_proposed' && ann.plan) {
                pendingPlanUpdate = { plan: ann.plan, planId: ann.planId }
            }
        }
        if (pendingPlanUpdate !== undefined) {
            pendingPlanRef.current = pendingPlanUpdate
        }

        setState(prev => ({
            ...prev,
            annotations: [...prev.annotations, ...annotations],
            sessionId: sessionIdRef.current,
            taskId: taskIdRef.current,
            subAgents: applySubAgentAnnotations(prev.subAgents, annotations),
            pendingPlan: pendingPlanUpdate !== undefined ? pendingPlanUpdate : prev.pendingPlan
        }))
        notify?.(annotations)
    }, [])

    // Stream function — drives the unified harness and maps its typed events
    // onto reactive state (text, annotations, session, execution steps).
    const stream = useCallback(async (prompt: string, options?: StreamPromptOptions): Promise<void> => {
        // Abort any previous generation
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        abortControllerRef.current = new AbortController()

        // Set editor if provided
        if (options?.editor) {
            setEditor(options.editor)
        }

        // Reset state
        streamBuffer.reset()
        stepCounterRef.current = 0
        pendingPlanRef.current = null
        setState({
            isGenerating: true,
            streamingContent: '',
            error: null,
            executionSteps: [],
            activeSkills: Array.from(activeSkillsRef.current),
            annotations: [],
            sessionId: options?.sessionId || sessionIdRef.current,
            taskId: taskIdRef.current,
            subAgents: {},
            pendingPlan: null
        })

        try {
            const messages: ChatMessage[] = [{
                role: 'system',
                content: options?.systemPrompt || defaultOptions?.systemPrompt || SYSTEM_AGENT_PROMPT,
            }]
            if (options?.messages && options.messages.length > 0) {
                for (const m of options.messages) {
                    messages.push({ role: m.role, content: m.content })
                }
            }
            messages.push({ role: 'user', content: prompt })

            const events = harnessRef.current.run({
                messages,
                model: defaultOptions?.model,
                catalog: getCatalog(),
                resolveTool,
                sessionId: options?.sessionId || sessionIdRef.current || undefined,
                conversationId: options?.conversationId,
                signal: options?.abortSignal || abortControllerRef.current.signal,
                maxSteps: defaultOptions?.maxSteps,
                mode: options?.mode,
                onToolExecution,
            })

            for await (const ev of events) {
                switch (ev.type) {
                    case 'text-delta':
                        streamBuffer.append(ev.content)
                        break
                    case 'annotation':
                        handleAnnotation(ev.annotations)
                        break
                    case 'session':
                        handleAnnotation([{
                            type: 'session-info',
                            taskId: ev.taskId,
                            sessionId: ev.sessionId,
                            conversationId: ev.conversationId,
                        }])
                        break
                    case 'tool-call-start': {
                        const step: ExecutionStep = {
                            id: ev.id || `step-${++stepCounterRef.current}`,
                            toolName: ev.toolName,
                            args: ev.args,
                            status: 'running',
                            timestamp: Date.now(),
                        }
                        setState(prev => ({ ...prev, executionSteps: [...prev.executionSteps, step] }))
                        break
                    }
                    case 'tool-call-end':
                        setState(prev => ({
                            ...prev,
                            executionSteps: prev.executionSteps.map(s =>
                                s.id === ev.id
                                    ? {
                                        ...s,
                                        status: ev.error ? 'error' : 'success',
                                        result: ev.result,
                                        error: ev.error,
                                        duration: ev.durationMs,
                                    }
                                    : s
                            ),
                        }))
                        break
                    case 'error':
                        throw new Error(ev.error)
                    case 'finish':
                        // Task reached a real terminal state — drop the stored
                        // handle so a later mount doesn't re-attach a stale task.
                        if (ev.finishReason !== 'suspended') {
                            clearStoredSystemAgentTaskId()
                        }
                        break
                }
            }

            setState(prev => ({
                ...prev,
                isGenerating: false,
                streamingContent: streamBuffer.getRawContent()
            }))
        } catch (error: any) {
            if (error.name === 'AbortError') {
                setState(prev => ({
                    ...prev,
                    isGenerating: false,
                    streamingContent: streamBuffer.getRawContent()
                }))
                return
            }
            setState(prev => ({
                ...prev,
                isGenerating: false,
                error: error instanceof Error ? error : new Error(String(error))
            }))
            throw error
        }
    }, [setEditor, streamBuffer, getCatalog, resolveTool, onToolExecution, defaultOptions, handleAnnotation])

    // Re-attach to an in-flight backend task after a refresh: reconstructs the
    // in-progress text from the server checkpoint and continues streaming into
    // the same state channels as `stream`.
    const attach = useCallback(async (taskId: string): Promise<void> => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        abortControllerRef.current = new AbortController()

        streamBuffer.reset()
        stepCounterRef.current = 0
        pendingPlanRef.current = null
        taskIdRef.current = taskId
        setState({
            isGenerating: true,
            streamingContent: '',
            error: null,
            executionSteps: [],
            activeSkills: Array.from(activeSkillsRef.current),
            annotations: [],
            sessionId: sessionIdRef.current,
            taskId,
            subAgents: {},
            pendingPlan: null
        })

        try {
            const events = harnessRef.current.attach(
                taskId,
                resolveTool,
                onToolExecution,
                abortControllerRef.current.signal,
            )

            for await (const ev of events) {
                switch (ev.type) {
                    case 'text-delta':
                        streamBuffer.append(ev.content)
                        break
                    case 'annotation':
                        handleAnnotation(ev.annotations)
                        break
                    case 'session':
                        handleAnnotation([{
                            type: 'session-info',
                            taskId: ev.taskId,
                            sessionId: ev.sessionId,
                            conversationId: ev.conversationId,
                        }])
                        break
                    case 'tool-call-start': {
                        const step: ExecutionStep = {
                            id: ev.id || `step-${++stepCounterRef.current}`,
                            toolName: ev.toolName,
                            args: ev.args,
                            status: 'running',
                            timestamp: Date.now(),
                        }
                        setState(prev => ({ ...prev, executionSteps: [...prev.executionSteps, step] }))
                        break
                    }
                    case 'tool-call-end':
                        setState(prev => ({
                            ...prev,
                            executionSteps: prev.executionSteps.map(s =>
                                s.id === ev.id
                                    ? {
                                        ...s,
                                        status: ev.error ? 'error' : 'success',
                                        result: ev.result,
                                        error: ev.error,
                                        duration: ev.durationMs,
                                    }
                                    : s
                            ),
                        }))
                        break
                    case 'finish':
                        if (ev.finishReason !== 'suspended') {
                            clearStoredSystemAgentTaskId()
                        }
                        break
                    case 'error':
                        throw new Error(ev.error)
                }
            }

            setState(prev => ({
                ...prev,
                isGenerating: false,
                streamingContent: streamBuffer.getRawContent()
            }))
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                setState(prev => ({
                    ...prev,
                    isGenerating: false,
                    error: error instanceof Error ? error : new Error(String(error))
                }))
            } else {
                setState(prev => ({ ...prev, isGenerating: false }))
            }
        }
    }, [streamBuffer, resolveTool, onToolExecution, handleAnnotation])

    // Stop function — aborts the local stream AND cancels the backend task so
    // an abandoned run doesn't keep burning tokens server-side.
    const stop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        setState(prev => ({ ...prev, isGenerating: false }))
        harnessRef.current.cancelCurrent().catch(() => { /* best-effort */ })
    }, [])

    // Skill management — tracked locally; the backend performs progressive
    // activation from the full catalog, so this is informational state.
    const activateSkill = useCallback((skillName: string) => {
        activeSkillsRef.current.add(skillName)
        setState(prev => ({ ...prev, activeSkills: Array.from(activeSkillsRef.current) }))
    }, [])

    const deactivateSkill = useCallback((skillName: string) => {
        activeSkillsRef.current.delete(skillName)
        setState(prev => ({ ...prev, activeSkills: Array.from(activeSkillsRef.current) }))
    }, [])

    // Reset
    const reset = useCallback(() => {
        stop()
        streamBuffer.reset()
        activeSkillsRef.current.clear()
        setState({
            isGenerating: false,
            streamingContent: '',
            error: null,
            executionSteps: [],
            activeSkills: [],
            annotations: [],
            sessionId: sessionIdRef.current,
            taskId: taskIdRef.current,
            subAgents: {},
            pendingPlan: null
        })
    }, [stop, streamBuffer])

    // Session management
    const setSessionId = useCallback((sessionId: string | null) => {
        sessionIdRef.current = sessionId
        setState(prev => ({ ...prev, sessionId }))
    }, [])

    // Plan mode (P7): respond to a pending plan and resume the conversation.
    const resolvePlan = useCallback(async (
        decision: 'approved' | 'rejected',
        opts?: { feedback?: string; editedPlan?: PlanArtifact }
    ): Promise<void> => {
        const pending = pendingPlanRef.current
        // Clear the pending plan immediately so the card dismisses.
        pendingPlanRef.current = null
        setState(prev => ({ ...prev, pendingPlan: null }))
        if (!pending) return

        const sessionId = sessionIdRef.current || undefined

        if (decision === 'rejected') {
            const fb = opts?.feedback?.trim() || '请重新规划。'
            // Stay in plan mode and re-plan with the feedback.
            await stream(`我不同意这个计划。${fb}`, { mode: 'plan', sessionId })
            return
        }

        // Approved / edited: inject the plan and execute it.
        const plan = opts?.editedPlan || pending.plan
        const steps = (plan.steps || [])
            .map((s, i) => `${i + 1}. ${s.action}`)
            .join('\n')
        const prompt =
            `我已批准以下计划，请直接按计划执行，不要再次询问确认：\n` +
            (plan.title ? `标题：${plan.title}\n` : '') +
            (plan.summary ? `概述：${plan.summary}\n` : '') +
            (steps ? `步骤：\n${steps}` : '')
        await stream(prompt, { mode: 'execute', sessionId })
    }, [stream])

    // Callback setters
    const setOnToolExecution = useCallback((callback: OnToolExecution | undefined) => {
        onToolExecutionRef.current = callback
    }, [])

    const setOnUserChoiceRequest = useCallback((callback: OnUserChoiceRequest | undefined) => {
        onUserChoiceRequestRef.current = callback
    }, [])

    // Memoized context value
    const value = useMemo<SystemAgentContextValue>(() => ({
        state,
        stream,
        stop,
        setEditor,
        getEditor,
        activateSkill,
        deactivateSkill,
        reset,
        setOnToolExecution,
        setOnUserChoiceRequest,
        setSessionId,
        resolvePlan,
        attach
    }), [
        state,
        stream,
        stop,
        setEditor,
        getEditor,
        activateSkill,
        deactivateSkill,
        reset,
        setOnToolExecution,
        setOnUserChoiceRequest,
        setSessionId,
        resolvePlan,
        attach
    ])

    return (
        <SystemAgentContext.Provider value={value}>
            {children}
        </SystemAgentContext.Provider>
    )
}

// ============ Hooks ============

/**
 * Hook to access the system AI agent
 */
export function useSystemAgent(): SystemAgentContextValue {
    const context = useContext(SystemAgentContext)
    if (!context) {
        throw new Error('useSystemAgent must be used within a SystemAgentProvider')
    }
    return context
}

/**
 * Hook to check if system agent is available
 */
export function useSystemAgentAvailable(): boolean {
    return useContext(SystemAgentContext) !== null
}
