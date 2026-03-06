import { AppContext } from "@kn/common"
import { Editor } from "@kn/editor"
import { stepCountIs, ToolLoopAgent } from "ai"
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { deepseek } from "./ai-utils"

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
            onReload: handleReload
        })
        // Register built-in skills
        provider.registerSkills(builtinSkills)
        return provider
    }, [toolProvider, handleReload])

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

    // Register plugin tools
    useMemo(() => {
        const pluginTools = pluginManager?.resloveTools(editor) || {}
        if (Object.keys(pluginTools).length > 0) {
            toolProvider.registerPluginTools(pluginTools, 'plugins')
        }

        // Register plugin skills if available
        const pluginSkills = pluginManager?.resolveSkills?.() || []
        if (pluginSkills.length > 0) {
            skillProvider.registerSkills(pluginSkills)
        }
    }, [pluginManager, editor, toolProvider, skillProvider])

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

    // Combine all tools: loaded tools + discovery tools
    const allTools = useMemo(() => {
        const loadedTools = toolProvider.getLoadedTools()
        return { ...loadedTools, ...discoveryTools }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolProvider, discoveryTools, version])

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

    // Create agent (recreated when tools or skills change)
    const agent = useMemo(() => new ToolLoopAgent({
        model: deepseek("deepseek-chat"),
        stopWhen: stepCountIs(DEFAULT_MAX_STEPS),
        instructions,
        tools: wrappedTools,
    }), [wrappedTools, instructions])

    // Stream with abort support and history messages
    const stream = useCallback(async (options: {
        prompt: string
        messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    }) => {
        // Abort any previous stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        // Create new AbortController
        abortControllerRef.current = new AbortController()

        // Build initial messages array for conversation context
        const initialMessages: any[] = []

        // Add history messages if provided
        if (options.messages && options.messages.length > 0) {
            initialMessages.push(...options.messages)
        }

        // Add current prompt as the latest user message
        initialMessages.push({
            role: 'user',
            content: options.prompt
        })

        return agent.stream({
            prompt: options.prompt,
            abortSignal: abortControllerRef.current.signal
        })
    }, [agent])

    // Stop current generation
    const stop = useCallback(() => {
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
        agent,
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
