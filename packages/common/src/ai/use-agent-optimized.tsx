import { AppContext } from "../core/AppContext"
import type { Editor } from "@tiptap/core"
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

// Types
import type { OnToolExecution, OnUserChoiceRequest, ToolsRecord, Annotation } from "./types"
export type {
    ToolExecutionEvent,
    OnToolExecution,
    UserChoiceOption,
    UserChoiceRequest,
    OnUserChoiceRequest
} from "./types"

// Chat Client
import { KnowledgeChatClient, createChatRequest } from "./chat-client"
import type { ChatStreamEvent, ChatMessage, Annotation as ChatAnnotation } from "./chat-client/types"

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
 * Optimized editor agent hook with backend-driven architecture.
 * All chat goes through /api/v1/chat/completions via KnowledgeChatClient.
 */
export const useEditorAgentOptimized = (
    editor: Editor,
    onToolExecution?: OnToolExecution,
    onUserChoiceRequest?: OnUserChoiceRequest
) => {
    const { pluginManager } = useContext(AppContext)

    // AbortController ref for stopping generation
    const abortControllerRef = useRef<AbortController | null>(null)

    // Chat client instance
    const chatClientRef = useRef<KnowledgeChatClient>(new KnowledgeChatClient())

    // Track whether we're currently streaming
    const isStreamingRef = useRef(false)

    // Ref for latest tools and instructions (always up to date)
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

    // Create backend tools (generateContent) - kept for local fallback
    // Note: In backend-driven mode, the backend handles its own tools.
    // We only keep discovery tools for frontend-side tool exploration.

    // Combine all tools: loaded tools + discovery tools
    // These are used for frontend-side tool discovery/management only
    // The actual tool execution is handled by the backend
    const allTools = useMemo(() => {
        const loadedTools = toolProvider.getLoadedTools()
        return { ...loadedTools, ...discoveryTools }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolProvider, discoveryTools, version])

    // Wrap tools with callback (for frontend-side execution tracking)
    const wrappedTools = useMemo(() => {
        return wrapToolsWithCallback(allTools, onToolExecution)
    }, [allTools, onToolExecution])

    // Build dynamic instructions with skill prompts
    const instructions = useMemo(() => {
        const skillAddition = skillProvider.getSystemPromptAddition()
        return EDITOR_AGENT_PROMPT + skillAddition
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skillProvider, version])

    // Keep instructions ref updated
    useEffect(() => {
        latestInstructionsRef.current = instructions
    }, [instructions])

    // Stream with abort support and history messages
    // Uses the backend-driven KnowledgeChatClient
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

        // Build messages array for the backend
        const chatMessages: ChatMessage[] = []

        // Add system message with instructions
        chatMessages.push({
            role: 'system',
            content: latestInstructionsRef.current,
        })

        // Add history messages
        if (options.messages && options.messages.length > 0) {
            for (const m of options.messages) {
                chatMessages.push({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })
            }
        }

        // Add current user prompt
        chatMessages.push({
            role: 'user',
            content: options.prompt,
        })

        isStreamingRef.current = true
        try {
            // Use the chat client's raw generator for real-time event handling
            const request = createChatRequest(options.prompt, {
                messages: chatMessages.slice(0, -1), // exclude the last user message since it's in the prompt
                sessionId: options.sessionId,
                conversationId: options.conversationId,
                signal: abortControllerRef.current.signal,
            })

            const chatGen = chatClientRef.current.chat(request)

            // Create a text stream that forwards annotations in real-time
            const textStream = (async function* (): AsyncGenerator<string> {
                for await (const event of chatGen) {
                    switch (event.type) {
                        case 'text-delta':
                            yield event.content
                            break

                        case 'annotation':
                            // Forward annotations in real-time
                            if (options.onAnnotation) {
                                options.onAnnotation(event.annotations)
                            }
                            break

                        case 'session-info':
                            // Forward session info as an annotation
                            if (options.onAnnotation) {
                                options.onAnnotation([{
                                    type: 'session-info',
                                    sessionId: event.sessionId,
                                    conversationId: event.conversationId,
                                }])
                            }
                            break

                        case 'tool-call':
                            // Tool calls from the backend - informational for UI
                            break

                        case 'tool-result':
                            // Tool results from the backend - informational for UI
                            break

                        case 'finish':
                            // Stream complete
                            break

                        case 'error':
                            throw new Error(event.error)
                    }
                }
            })()

            return { textStream }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { textStream: async function* () { /* empty */ }() }
            }
            throw error
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
        stream,
        stop,
        isGenerating,
        // Exports for progressive discovery
        toolProvider,
        skillProvider,
        skillRegistry,
        version
    }
}
