/**
 * System AI Agent Context
 *
 * Provides a global AI agent that can be used anywhere in the application.
 * This is the default AI functionality available to all components.
 */

import React, { createContext, useContext, useCallback, useRef, useState, useEffect, useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import type { ChatMessage } from '../chat-client/types'
import type { OnToolExecution, OnUserChoiceRequest } from '../types'
import { useCapabilityProviders } from '../use-capability-providers'
import { AgentHarnessImpl } from '../harness'
import type { ExecutionStep } from '../harness'
import { useStreamBuffer } from '../utils/use-stream-buffer'
import { SYSTEM_AGENT_PROMPT } from '../constants'

// Re-export ExecutionStep so existing `@kn/common` consumers keep working.
export type { ExecutionStep }

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
        sessionId: null
    })

    // Use ref for activeSkills to avoid stale closure in stream callback
    const activeSkillsRef = useRef<Set<string>>(new Set())
    const sessionIdRef = useRef<string | null>(null)

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
        setState({
            isGenerating: true,
            streamingContent: '',
            error: null,
            executionSteps: [],
            activeSkills: Array.from(activeSkillsRef.current),
            annotations: [],
            sessionId: options?.sessionId || sessionIdRef.current
        })

        const handleAnnotation = (annotations: any[]) => {
            // Extract session ID from annotations (first SSE event)
            for (const ann of annotations) {
                if (ann && typeof ann === 'object' && 'sessionId' in ann && typeof ann.sessionId === 'string') {
                    sessionIdRef.current = ann.sessionId
                }
            }

            setState(prev => ({
                ...prev,
                annotations: [...prev.annotations, ...annotations],
                sessionId: sessionIdRef.current
            }))
            options?.onAnnotation?.(annotations)
        }

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
    }, [setEditor, streamBuffer, getCatalog, resolveTool, onToolExecution, defaultOptions])

    // Stop function
    const stop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        setState(prev => ({ ...prev, isGenerating: false }))
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
            sessionId: sessionIdRef.current
        })
    }, [stop, streamBuffer])

    // Session management
    const setSessionId = useCallback((sessionId: string | null) => {
        sessionIdRef.current = sessionId
        setState(prev => ({ ...prev, sessionId }))
    }, [])

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
        setSessionId
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
        setSessionId
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
