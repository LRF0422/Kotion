/**
 * System AI Agent Context
 *
 * Provides a global AI agent that can be used anywhere in the application.
 * This is the default AI functionality available to all components.
 */

import React, { createContext, useContext, useCallback, useRef, useState, useEffect, useMemo } from 'react'
import type { Editor } from '@kn/editor'
import type { AIAgent, StreamResult, AgentOptions } from '../foundation/types'
import type { OnToolExecution, OnUserChoiceRequest } from '../types'
import { useAIFoundation } from '../foundation'

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

// ============ Default System Prompt ============

const SYSTEM_AGENT_PROMPT = `You are an intelligent assistant integrated into a knowledge management application. You help users with document editing, content organization, and various tasks.

# CAPABILITIES

You can:
- Read and analyze documents
- Edit and modify content
- Search and find information
- Organize and structure content
- Answer questions about the content
- Help with writing and editing

# BEHAVIOR GUIDELINES

1. **Be helpful and concise** - Provide clear, actionable responses
2. **Preserve content** - Never delete content without explicit user confirmation
3. **Respect context** - Consider the current document and selection
4. **Use tools wisely** - Only use tools when necessary
5. **Communicate clearly** - Explain what you're doing when using tools

# LANGUAGE

Respond in the same language the user uses.

# TOOLS

You have access to various tools for document manipulation. Use them when appropriate:
- Reading tools to understand the document
- Writing tools to make changes
- Structure tools to organize content
- Interaction tools to confirm with users`

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
        activeSkills: []
    })

    // Refs
    const agentRef = useRef<AIAgent | null>(null)
    const editorRef = useRef<Editor | null>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const onToolExecutionRef = useRef<OnToolExecution | undefined>(initialOnToolExecution)
    const onUserChoiceRequestRef = useRef<OnUserChoiceRequest | undefined>(initialOnUserChoiceRequest)
    const contentBufferRef = useRef('')
    const rafRef = useRef<number | null>(null)
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

    // Streaming buffer management
    const flushBuffer = useCallback(() => {
        setState(prev => ({ ...prev, streamingContent: contentBufferRef.current }))
        rafRef.current = null
    }, [])

    const appendToBuffer = useCallback((chunk: string) => {
        contentBufferRef.current += chunk
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flushBuffer)
        }
    }, [flushBuffer])

    const resetBuffer = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        contentBufferRef.current = ''
        setState(prev => ({ ...prev, streamingContent: '' }))
    }, [])

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current)
            }
        }
    }, [])

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
        resetBuffer()
        setState({
            isGenerating: true,
            streamingContent: '',
            error: null,
            executionSteps: [],
            activeSkills: state.activeSkills
        })

        try {
            const result = await agentRef.current.stream({
                prompt,
                messages: options?.messages,
                abortSignal: options?.abortSignal || abortControllerRef.current.signal,
                systemPrompt: options?.systemPrompt
            })

            // Process the stream
            if (result.stream) {
                try {
                    // The stream is an async iterable that yields text chunks
                    for await (const chunk of result.stream) {
                        // Handle different chunk formats
                        const text = chunk?.text || chunk?.content || chunk?.delta || ''
                        if (text) {
                            appendToBuffer(text)
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
                streamingContent: contentBufferRef.current
            }))
        } catch (error: any) {
            if (error.name === 'AbortError') {
                setState(prev => ({
                    ...prev,
                    isGenerating: false,
                    streamingContent: contentBufferRef.current
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
    }, [setEditor, resetBuffer, appendToBuffer, state.activeSkills])

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

    // Skill management
    const activateSkill = useCallback((skillName: string) => {
        if (agentRef.current) {
            const result = agentRef.current.activateSkill(skillName)
            if (result.success) {
                setState(prev => ({
                    ...prev,
                    activeSkills: agentRef.current?.getActiveSkills() || []
                }))
            }
        }
    }, [])

    const deactivateSkill = useCallback((skillName: string) => {
        if (agentRef.current) {
            const result = agentRef.current.deactivateSkill(skillName)
            if (result.success) {
                setState(prev => ({
                    ...prev,
                    activeSkills: agentRef.current?.getActiveSkills() || []
                }))
            }
        }
    }, [])

    // Reset
    const reset = useCallback(() => {
        stop()
        resetBuffer()
        setState({
            isGenerating: false,
            streamingContent: '',
            error: null,
            executionSteps: [],
            activeSkills: []
        })
    }, [stop, resetBuffer])

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
        setOnUserChoiceRequest
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
        setOnUserChoiceRequest
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
