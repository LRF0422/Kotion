import { AppContext } from "@kn/common"
import { Editor } from "@kn/editor"
import { stepCountIs, ToolLoopAgent } from "ai"
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

// Types
import type { OnToolExecution, OnUserChoiceRequest, ToolsRecord } from "./types"
export type {
    ToolExecutionEvent,
    OnToolExecution,
    UserChoiceOption,
    UserChoiceRequest,
    OnUserChoiceRequest
} from "./types"

// Providers
import { ToolProvider } from "./providers/ToolProvider"
import { SkillProvider } from "./providers/SkillProvider"

// Discovery Tools
import { createToolDiscoveryTools } from "./discovery/tool-discovery-tools"
import { createSkillDiscoveryTools } from "./discovery/skill-discovery-tools"
import { createSkillManagementTools } from "./discovery/skill-management-tools"

// Skills
import { builtinSkills, getSkillRegistry } from "./skills"

// Utils
import { wrapToolsWithCallback } from "./utils/tool-wrapper"

// Shared constants
import { EDITOR_AGENT_PROMPT, DEFAULT_MAX_STEPS } from "./constants"
import { createDeepSeekDirectModel } from "./model-provider/deepseek-direct-provider"
import { createBackendTools } from "./tools/backend-tools"

/**
 * Optimized editor agent hook with progressive tool discovery and skills
 */
export const useEditorAgentOptimized = (
    editor: Editor,
    onToolExecution?: OnToolExecution,
    onUserChoiceRequest?: OnUserChoiceRequest
) => {
    const { pluginManager } = useContext(AppContext)

    // AbortController ref for stopping generation
    const abortControllerRef = useRef<AbortController | null>(null)

    // Ref to hold the current agent
    const agentRef = useRef<ToolLoopAgent | null>(null)

    // Track whether we're currently streaming
    const isStreamingRef = useRef(false)

    // Ref for latest tools and instructions (always up to date)
    const latestToolsRef = useRef<ToolsRecord>({})
    const latestInstructionsRef = useRef<string>('')

    // Version state for reactive updates when tools/skills change
    const [version, setVersion] = useState(0)

    // Reload callback to trigger re-creation of agent
    const handleReload = useCallback(() => {
        setVersion(v => v + 1)
    }, [])

    // Create ToolProvider instance
    const toolProvider = useMemo(() => {
        return new ToolProvider({
            editor,
            onUserChoiceRequest,
            onReload: handleReload
        })
    }, [editor, onUserChoiceRequest, handleReload])

    // Get skill registry (singleton)
    const skillRegistry = useMemo(() => getSkillRegistry(), [])

    // Create SkillProvider instance
    const skillProvider = useMemo(() => {
        const provider = new SkillProvider({
            toolProvider,
            onReload: handleReload,
            pluginManager,
            editor
        })
        // Register built-in skills
        provider.registerSkills(builtinSkills)
        return provider
    }, [toolProvider, handleReload, pluginManager, editor])

    // Initialize skill registry and load installed skills
    useEffect(() => {
        let mounted = true

        const loadInstalledSkills = async () => {
            try {
                await skillRegistry.initialize()
                if (mounted) {
                    // Register user-installed skills
                    const installedSkills = skillRegistry.toSkillFormat()
                    if (installedSkills.length > 0) {
                        skillProvider.registerSkills(installedSkills)
                        handleReload()
                    }
                }
            } catch (error) {
                console.error('Failed to load installed skills:', error)
            }
        }

        loadInstalledSkills()

        // Subscribe to skill registry changes
        const unsubscribe = skillRegistry.subscribe(() => {
            if (mounted) {
                // Re-register skills when registry changes
                const installedSkills = skillRegistry.toSkillFormat()
                skillProvider.registerSkills(installedSkills)
                handleReload()
            }
        })

        return () => {
            mounted = false
            unsubscribe()
        }
    }, [skillRegistry, skillProvider, handleReload])

    // Register plugin skills (tools are loaded on-demand when skill is activated)
    useMemo(() => {
        // Register plugin skills if available
        const pluginSkills = pluginManager?.resolveSkills?.() || []
        if (pluginSkills.length > 0) {
            skillProvider.registerSkills(pluginSkills)
        }
    }, [pluginManager, skillProvider])

    // Create discovery tools
    const discoveryTools = useMemo(() => {
        const toolDiscovery = createToolDiscoveryTools({
            toolProvider,
            onReload: handleReload
        })
        const skillDiscovery = createSkillDiscoveryTools({
            skillProvider,
            onReload: handleReload
        })
        const skillManagement = createSkillManagementTools({
            skillRegistry,
            onReload: handleReload
        })
        return { ...toolDiscovery, ...skillDiscovery, ...skillManagement }
    }, [toolProvider, skillProvider, skillRegistry, handleReload])

    // Create backend tools (generateContent)
    const backendTools = useMemo(() => createBackendTools(), [])

    // Combine all tools: loaded tools + discovery tools + backend tools
    const allTools = useMemo(() => {
        const loadedTools = toolProvider.getLoadedTools()
        return { ...loadedTools, ...discoveryTools, ...backendTools }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolProvider, discoveryTools, backendTools, version])

    // Wrap tools with callback
    const wrappedTools = useMemo(() => {
        return wrapToolsWithCallback(allTools, onToolExecution)
    }, [allTools, onToolExecution])

    // Build dynamic instructions with skill prompts
    const instructions = useMemo(() => {
        const skillAddition = skillProvider.getSystemPromptAddition()
        return EDITOR_AGENT_PROMPT + skillAddition
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skillProvider, version])

    // Keep refs updated with latest values and conditionally recreate agent
    useEffect(() => {
        latestToolsRef.current = wrappedTools
        latestInstructionsRef.current = instructions

        // Only recreate agent if NOT currently streaming
        if (!isStreamingRef.current) {
            agentRef.current = new ToolLoopAgent({
                model: createDeepSeekDirectModel(),
                stopWhen: stepCountIs(DEFAULT_MAX_STEPS),
                instructions,
                tools: wrappedTools,
            })
        }
    }, [wrappedTools, instructions])

    // Stream with abort support and history messages
    const stream = useCallback(async (options: {
        prompt: string
        messages?: Array<{ role: 'user' | 'assistant'; content: string }>
        sessionId?: string
        conversationId?: string
        onAnnotation?: (annotations: any[]) => void
    }) => {
        // Abort any previous stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        abortControllerRef.current = new AbortController()

        // Build prompt with conversation context
        let fullPrompt = options.prompt
        if (options.messages && options.messages.length > 0) {
            const contextParts = options.messages.map(m =>
                `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
            )
            fullPrompt = `## Conversation History\n${contextParts.join('\n\n')}\n\n## Current Request\n${options.prompt}`
        }

        // Create a new ToolLoopAgent for this stream
        // Note: Direct provider doesn't need session/annotation params since main loop doesn't go through backend
        const model = createDeepSeekDirectModel()

        const agent = new ToolLoopAgent({
            model,
            stopWhen: stepCountIs(DEFAULT_MAX_STEPS),
            instructions: latestInstructionsRef.current,
            tools: latestToolsRef.current,
        })

        isStreamingRef.current = true
        try {
            const result = agent.stream({
                prompt: fullPrompt,
                abortSignal: abortControllerRef.current.signal,
            })
            return result
        } finally {
            isStreamingRef.current = false
        }
    }, [])

    // Stop current generation
    const stop = useCallback(() => {
        isStreamingRef.current = false
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
    }, [])

    // Check if currently generating
    const isGenerating = useCallback(() => {
        return abortControllerRef.current !== null && !abortControllerRef.current.signal.aborted
    }, [])

    return {
        agent: agentRef.current,
        stream,
        stop,
        isGenerating,
        // New exports for progressive discovery
        toolProvider,
        skillProvider,
        skillRegistry,
        version
    }
}
