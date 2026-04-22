/**
 * System AI Agent Context
 *
 * Provides a global AI agent that can be used anywhere in the application.
 * This is the default AI functionality available to all components.
 */

import React, { createContext, useContext, useCallback, useRef, useState, useEffect, useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import type { AIAgent, StreamResult, AgentOptions } from '../foundation/types'
import type { OnToolExecution, OnUserChoiceRequest } from '../types'
import { useAIFoundation } from '../foundation'
import { useStreamBuffer } from '../utils/use-stream-buffer'
import { SYSTEM_AGENT_PROMPT } from '../constants'

// ============ Types ============

export interface ExecutionStep {
    id: string
    toolName: string
    args: any
    result?: any
    status: 'running' | 'success' | 'error'
    timestamp: number
    duration?: number
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
    defaultOptions?: AgentOptions
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
    const aiFoundation = useAIFoundation()

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
    const activeSkillsRef = useRef<string[]>([])
    const sessionIdRef = useRef<string | null>(null)

    // Shared streaming buffer
    const streamBuffer = useStreamBuffer()

    // Refs
    const agentRef = useRef<AIAgent | null>(null)
    const editorRef = useRef<Editor | null>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const onToolExecutionRef = useRef<OnToolExecution | undefined>(initialOnToolExecution)
    const onUserChoiceRequestRef = useRef<OnUserChoiceRequest | undefined>(initialOnUserChoiceRequest)
    const stepCounterRef = useRef(0)

    // Initialize agent
    useEffect(() => {
        const initAgent = async () => {
            await aiFoundation.initialize()

            agentRef.current = aiFoundation.createAgent({
                ...defaultOptions,
                systemPrompt: defaultOptions?.systemPrompt || SYSTEM_AGENT_PROMPT
            })
        }

        initAgent()

        return () => {
            if (agentRef.current) {
                aiFoundation.destroyAgent(agentRef.current.getId())
            }
        }
    }, [aiFoundation, defaultOptions])

    // Set editor context
    const setEditor = useCallback((editor: Editor | null) => {
        editorRef.current = editor
        if (editor) {
            aiFoundation.setEditorContext(editor)
        }
    }, [aiFoundation])

    const getEditor = useCallback(() => {
        return editorRef.current
    }, [])

    // Sync streaming buffer content to state
    useEffect(() => {
        if (streamBuffer.content) {
            setState(prev => ({ ...prev, streamingContent: streamBuffer.content }))
        }
    }, [streamBuffer.content])

    // Stream function
    const stream = useCallback(async (prompt: string, options?: StreamPromptOptions): Promise<void> => {
        if (!agentRef.current) {
            throw new Error('Agent not initialized')
        }

        // Abort any previous generation
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        // Create new abort controller
        abortControllerRef.current = new AbortController()

        // Set editor if provided
        if (options?.editor) {
            setEditor(options.editor)
        }

        // Reset state
        streamBuffer.reset()
        setState({
            isGenerating: true,
            streamingContent: '',
            error: null,
            executionSteps: [],
            activeSkills: activeSkillsRef.current,
            annotations: [],
            sessionId: options?.sessionId || sessionIdRef.current
        })

        // Track annotations locally
        const collectedAnnotations: any[] = []
        const handleAnnotation = (annotations: any[]) => {
            collectedAnnotations.push(...annotations)
            setState(prev => ({
                ...prev,
                annotations: [...prev.annotations, ...annotations]
            }))
            options?.onAnnotation?.(annotations)
        }

        try {
            const result = await agentRef.current.stream({
                prompt,
                messages: options?.messages,
                abortSignal: options?.abortSignal || abortControllerRef.current.signal,
                systemPrompt: options?.systemPrompt,
                sessionId: options?.sessionId || sessionIdRef.current || undefined,
                conversationId: options?.conversationId,
                onAnnotation: handleAnnotation
            })

            // Process the stream
            if (result.stream) {
                try {
                    // The stream is an async iterable that yields text chunks
                    for await (const chunk of result.stream) {
                        // Handle different chunk formats
                        const text = chunk?.text || chunk?.content || chunk?.delta || ''
                        if (text) {
                            streamBuffer.append(text)
                        }
                    }
                } catch (streamError: any) {
                    if (streamError.name !== 'AbortError') {
                        throw streamError
                    }
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
    }, [setEditor, streamBuffer])

    // Stop function
    const stop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        if (agentRef.current) {
            agentRef.current.stop()
        }
        setState(prev => ({ ...prev, isGenerating: false }))
    }, [])

    // Skill management - update ref when skills change
    const activateSkill = useCallback((skillName: string) => {
        if (agentRef.current) {
            const result = agentRef.current.activateSkill(skillName)
            if (result.success) {
                const skills = agentRef.current?.getActiveSkills() || []
                activeSkillsRef.current = skills
                setState(prev => ({
                    ...prev,
                    activeSkills: skills
                }))
            }
        }
    }, [])

    const deactivateSkill = useCallback((skillName: string) => {
        if (agentRef.current) {
            const result = agentRef.current.deactivateSkill(skillName)
            if (result.success) {
                const skills = agentRef.current?.getActiveSkills() || []
                activeSkillsRef.current = skills
                setState(prev => ({
                    ...prev,
                    activeSkills: skills
                }))
            }
        }
    }, [])

    // Reset
    const reset = useCallback(() => {
        stop()
        streamBuffer.reset()
        activeSkillsRef.current = []
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
