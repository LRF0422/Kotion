/**
 * System Agent Hooks
 *
 * Convenient hooks for using the system AI agent in components.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import { useSystemAgent, type StreamPromptOptions, type ExecutionStep } from './context'

// ============ useSystemAgentStream ============

export interface UseSystemAgentStreamOptions {
    /** Editor to bind */
    editor?: Editor
    /** Auto-bind editor on mount */
    autoBindEditor?: boolean
    /** Callback when stream completes */
    onComplete?: (content: string) => void
    /** Callback on error */
    onError?: (error: Error) => void
    /** Callback on tool execution */
    onToolExecution?: (step: ExecutionStep) => void
}

export interface UseSystemAgentStreamResult {
    /** Stream a prompt */
    stream: (prompt: string, options?: Omit<StreamPromptOptions, 'editor'>) => Promise<void>
    /** Current streaming content */
    content: string
    /** Whether currently generating */
    isGenerating: boolean
    /** Error if any */
    error: Error | null
    /** Stop generation */
    stop: () => void
    /** Reset state */
    reset: () => void
    /** Execution steps */
    steps: ExecutionStep[]
}

/**
 * Hook for easy streaming with the system agent
 *
 * @example
 * ```tsx
 * const { stream, content, isGenerating, stop } = useSystemAgentStream({ editor })
 *
 * const handleSubmit = async () => {
 *     await stream('Summarize this document')
 * }
 * ```
 */
export function useSystemAgentStream(options: UseSystemAgentStreamOptions = {}): UseSystemAgentStreamResult {
    const {
        editor,
        autoBindEditor = true,
        onComplete,
        onError,
        onToolExecution
    } = options

    const agent = useSystemAgent()
    const [content, setContent] = useState('')
    const [steps, setSteps] = useState<ExecutionStep[]>([])
    const contentRef = useRef('')

    // Bind editor on mount
    useEffect(() => {
        if (autoBindEditor && editor) {
            agent.setEditor(editor)
        }
    }, [agent, editor, autoBindEditor])

    // Sync content from agent state
    useEffect(() => {
        // Update local content when agent content changes
        if (agent.state.streamingContent !== contentRef.current) {
            contentRef.current = agent.state.streamingContent
            setContent(agent.state.streamingContent)
        }
    }, [agent.state.streamingContent])

    // Track execution steps. onToolExecution is NOT re-invoked here: tool
    // executions are already reported by the wrapped tool executors in the
    // provider — re-emitting the latest step here double-fired the callback
    // for every step.
    useEffect(() => {
        setSteps(agent.state.executionSteps)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent.state.executionSteps])

    const stream = useCallback(async (prompt: string, streamOptions?: Omit<StreamPromptOptions, 'editor'>) => {
        contentRef.current = ''
        setContent('')
        setSteps([])

        try {
            await agent.stream(prompt, {
                ...streamOptions,
                editor
            })

            // Call onComplete with final content
            if (onComplete && contentRef.current) {
                onComplete(contentRef.current)
            }
        } catch (error) {
            if (onError) {
                onError(error instanceof Error ? error : new Error(String(error)))
            }
        }
    }, [agent, editor, onComplete, onError])

    const stop = useCallback(() => {
        agent.stop()
    }, [agent])

    const reset = useCallback(() => {
        agent.reset()
        contentRef.current = ''
        setContent('')
        setSteps([])
    }, [agent])

    return {
        stream,
        content,
        isGenerating: agent.state.isGenerating,
        error: agent.state.error,
        stop,
        reset,
        steps
    }
}

// ============ useSystemAgentEditor ============

/**
 * Hook for using system agent with an editor
 * Automatically binds the editor and provides convenient methods
 */
export function useSystemAgentEditor(editor: Editor) {
    const agent = useSystemAgent()

    // Bind editor
    useEffect(() => {
        agent.setEditor(editor)
        return () => agent.setEditor(null)
    }, [agent, editor])

    return {
        ...agent,
        /** Stream with the bound editor */
        streamWithEditor: (prompt: string, options?: Omit<StreamPromptOptions, 'editor'>) =>
            agent.stream(prompt, { ...options, editor })
    }
}

// ============ useSystemAgentSkills ============

/**
 * Hook for managing skills with the system agent
 */
export function useSystemAgentSkills() {
    const agent = useSystemAgent()
    const [activeSkills, setActiveSkills] = useState<string[]>(agent.state.activeSkills)

    // Sync active skills
    useEffect(() => {
        setActiveSkills(agent.state.activeSkills)
    }, [agent.state.activeSkills])

    const activate = useCallback((skillName: string) => {
        agent.activateSkill(skillName)
    }, [agent])

    const deactivate = useCallback((skillName: string) => {
        agent.deactivateSkill(skillName)
    }, [agent])

    const toggle = useCallback((skillName: string) => {
        if (activeSkills.includes(skillName)) {
            agent.deactivateSkill(skillName)
        } else {
            agent.activateSkill(skillName)
        }
    }, [agent, activeSkills])

    return {
        activeSkills,
        activate,
        deactivate,
        toggle
    }
}

// ============ useQuickAction ============

export interface QuickActionOptions {
    /** Prompt template, {selection} will be replaced with selected text */
    prompt: string
    /** Whether to include selection context */
    includeSelection?: boolean
}

/**
 * Hook for quick AI actions (rewrite, expand, summarize, etc.)
 *
 * @example
 * ```tsx
 * const { execute, content, isGenerating } = useQuickAction({
 *     prompt: 'Rewrite this text to be more concise: {selection}',
 *     includeSelection: true
 * })
 * ```
 */
export function useQuickAction(options: QuickActionOptions) {
    const agent = useSystemAgent()
    const [content, setContent] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const execute = useCallback(async (context?: { selection?: string }) => {
        setIsGenerating(true)
        setError(null)
        setContent('')

        let prompt = options.prompt
        if (options.includeSelection && context?.selection) {
            prompt = prompt.replace('{selection}', context.selection)
        }

        try {
            await agent.stream(prompt)
            // Read the buffer synchronously — the state mirror is synced via a
            // RAF effect and could still hold stale content here.
            setContent(agent.getStreamingContent())
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)))
        } finally {
            setIsGenerating(false)
        }
    }, [agent, options.prompt, options.includeSelection])

    return {
        execute,
        content,
        isGenerating,
        error,
        reset: () => {
            setContent('')
            setError(null)
        }
    }
}
