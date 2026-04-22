/**
 * useAgent Hook
 *
 * Provides easy access to create and use AI agents.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import type { AgentOptions, StreamOptions, AIAgent } from '../types'
import type { OnToolExecution, OnUserChoiceRequest } from '../../types'
import { useAIFoundation } from './use-ai-foundation'

export interface UseAgentOptions extends AgentOptions {
    /** Editor instance for editor context */
    editor?: Editor
    /** Tool execution callback */
    onToolExecution?: OnToolExecution
    /** User choice request callback */
    onUserChoiceRequest?: OnUserChoiceRequest
}

export interface UseAgentResult {
    /** The agent instance */
    agent: AIAgent
    /** Stream a response */
    stream: (prompt: string, messages?: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<any>
    /** Stop current generation */
    stop: () => void
    /** Whether currently generating */
    isGenerating: boolean
    /** Loading state */
    isLoading: boolean
    /** Error state */
    error: Error | null
    /** Active skills */
    activeSkills: string[]
    /** Activate a skill */
    activateSkill: (skillName: string) => void
    /** Deactivate a skill */
    deactivateSkill: (skillName: string) => void
}

/**
 * Hook to create and use an AI agent
 *
 * @param options Agent options
 * @returns Agent instance and methods
 *
 * @example
 * ```typescript
 * const { agent, stream, isGenerating, stop } = useAgent()
 *
 * const handleSend = async () => {
 *     const result = await stream('Hello, can you help me?')
 *     console.log(result)
 * }
 * ```
 */
export function useAgent(options?: UseAgentOptions): UseAgentResult {
    const foundation = useAIFoundation()
    const [isGenerating, setIsGenerating] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)
    const [activeSkills, setActiveSkills] = useState<string[]>([])
    const agentRef = useRef<AIAgent | null>(null)

    // Set editor context if provided
    useEffect(() => {
        if (options?.editor) {
            foundation.setEditorContext(options.editor)
        }
    }, [foundation, options?.editor])

    // Create or get agent
    useEffect(() => {
        // Create agent with options
        agentRef.current = foundation.createAgent({
            model: options?.model,
            tools: options?.tools,
            skills: options?.skills,
            systemPrompt: options?.systemPrompt,
            maxSteps: options?.maxSteps
        })

        // Cleanup on unmount
        return () => {
            if (agentRef.current) {
                foundation.destroyAgent(agentRef.current.getId())
            }
        }
    }, [foundation, options?.model, options?.tools, options?.skills, options?.systemPrompt, options?.maxSteps])

    // Stream function
    const stream = useCallback(async (
        prompt: string,
        messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    ) => {
        if (!agentRef.current) {
            throw new Error('Agent not initialized')
        }

        setIsGenerating(true)
        setIsLoading(true)
        setError(null)

        try {
            const result = await agentRef.current.stream({
                prompt,
                messages
            })
            return result
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            setError(error)
            throw error
        } finally {
            setIsGenerating(false)
            setIsLoading(false)
        }
    }, [])

    // Stop function
    const stop = useCallback(() => {
        if (agentRef.current) {
            agentRef.current.stop()
            setIsGenerating(false)
        }
    }, [])

    // Activate skill
    const activateSkill = useCallback((skillName: string) => {
        if (agentRef.current) {
            const result = agentRef.current.activateSkill(skillName)
            if (result.success) {
                setActiveSkills(agentRef.current.getActiveSkills())
            }
        }
    }, [])

    // Deactivate skill
    const deactivateSkill = useCallback((skillName: string) => {
        if (agentRef.current) {
            const result = agentRef.current.deactivateSkill(skillName)
            if (result.success) {
                setActiveSkills(agentRef.current.getActiveSkills())
            }
        }
    }, [])

    // Check if generating
    useEffect(() => {
        const checkGenerating = () => {
            if (agentRef.current) {
                setIsGenerating(agentRef.current.isGenerating())
            }
        }

        const interval = setInterval(checkGenerating, 100)
        return () => clearInterval(interval)
    }, [])

    return {
        agent: agentRef.current!,
        stream,
        stop,
        isGenerating,
        isLoading,
        error,
        activeSkills,
        activateSkill,
        deactivateSkill
    }
}

/**
 * Hook to get the default agent
 *
 * @returns Default agent instance and methods
 */
export function useDefaultAgent(): UseAgentResult {
    const foundation = useAIFoundation()
    const [isGenerating, setIsGenerating] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)
    const [activeSkills, setActiveSkills] = useState<string[]>([])

    const agent = useMemo(() => foundation.getDefaultAgent(), [foundation])

    const stream = useCallback(async (
        prompt: string,
        messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    ) => {
        setIsGenerating(true)
        setIsLoading(true)
        setError(null)

        try {
            const result = await agent.stream({ prompt, messages })
            return result
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            setError(error)
            throw error
        } finally {
            setIsGenerating(false)
            setIsLoading(false)
        }
    }, [agent])

    const stop = useCallback(() => {
        agent.stop()
        setIsGenerating(false)
    }, [agent])

    const activateSkill = useCallback((skillName: string) => {
        const result = agent.activateSkill(skillName)
        if (result.success) {
            setActiveSkills(agent.getActiveSkills())
        }
    }, [agent])

    const deactivateSkill = useCallback((skillName: string) => {
        const result = agent.deactivateSkill(skillName)
        if (result.success) {
            setActiveSkills(agent.getActiveSkills())
        }
    }, [agent])

    return {
        agent,
        stream,
        stop,
        isGenerating,
        isLoading,
        error,
        activeSkills,
        activateSkill,
        deactivateSkill
    }
}
