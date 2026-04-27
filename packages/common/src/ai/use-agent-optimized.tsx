import { AppContext } from "../core/AppContext"
import type { Editor } from "@tiptap/core"
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { event, PLUGIN_INIT_SUCCESS, REFRESH_PLUSINS } from "../event"

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
import type { ChatStreamEvent, ChatMessage, ChatRequest, ToolCall, Annotation as ChatAnnotation } from "./chat-client/types"

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
import { wrapToolsWithCallback, toolsRecordToOpenAIFormat } from "./utils/tool-wrapper"

// Shared constants
import { EDITOR_AGENT_PROMPT, DEFAULT_MAX_STEPS } from "./constants"

/** Timeout in ms – if no SSE event arrives within this window, treat the stream as hung */
const SSE_INACTIVITY_TIMEOUT_MS = 60_000

/**
 * Wraps an async generator with a per-yield inactivity timeout.
 * If no value is yielded within `timeoutMs` the iteration ends gracefully
 * and the optional `onTimeout` callback is invoked so callers can fall back
 * to executing any accumulated tool calls.
 */
async function* withInactivityTimeout<T>(
    gen: AsyncGenerator<T>,
    timeoutMs: number,
    onTimeout?: () => void
): AsyncGenerator<T> {
    while (true) {
        let timer: ReturnType<typeof setTimeout> | undefined
        let timedOut = false

        const nextPromise = gen.next()
        const timeoutPromise = new Promise<IteratorResult<T>>((resolve) => {
            timer = setTimeout(() => {
                timedOut = true
                resolve({ done: true, value: undefined as any })
            }, timeoutMs)
        })

        const result = await Promise.race([nextPromise, timeoutPromise])
        clearTimeout(timer)

        if (timedOut) {
            // Suppress unhandled rejection from the still-pending gen.next()
            nextPromise.catch(() => { })
            onTimeout?.()
            break
        }

        if (result.done) break
        yield result.value
    }
}

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

    // Register plugin skills when plugins are loaded/changed
    // This must be a useEffect (not useMemo) because pluginManager.init() is async
    // and the pluginManager reference doesn't change after init completes.
    // We listen for PLUGIN_INIT_SUCCESS and REFRESH_PLUSINS events to know
    // when plugins are ready or have changed.
    useEffect(() => {
        const registerPluginSkills = () => {
            if (!pluginManager) return
            const pluginSkills = pluginManager.resolveSkills?.() || []
            if (pluginSkills.length > 0) {
                console.log('[Agent] Registering plugin skills:', pluginSkills.map(s => s.name))
                skillProvider.registerSkills(pluginSkills)
                handleReload()
            }
        }

        // Try registering immediately (in case plugins are already loaded)
        registerPluginSkills()

        // Listen for plugin init success and refresh events
        event.on(PLUGIN_INIT_SUCCESS, registerPluginSkills)
        event.on(REFRESH_PLUSINS, registerPluginSkills)

        return () => {
            event.off(PLUGIN_INIT_SUCCESS, registerPluginSkills)
            event.off(REFRESH_PLUSINS, registerPluginSkills)
        }
    }, [pluginManager, skillProvider, handleReload])

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
            // Convert frontend tools to OpenAI format for bidirectional tool calling
            const openAITools = toolsRecordToOpenAIFormat(allTools)

            // Build the full messages array (will grow as tool results are added)
            const messages = [...chatMessages]

            // Track session ID from the first response
            let currentSessionId = options.sessionId

            // Max iterations to prevent infinite loops in bidirectional tool mode
            const MAX_TOOL_ITERATIONS = 100

            // Create a text stream that handles bidirectional tool calling
            const textStream = (async function* (): AsyncGenerator<string> {
                for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
                    // Build the chat request with current messages and session
                    const request: ChatRequest = {
                        messages,
                        sessionId: currentSessionId,
                        conversationId: options.conversationId,
                        signal: abortControllerRef.current!.signal,
                        stream: true,
                        tools: openAITools.length > 0 ? openAITools : undefined,
                    }

                    const chatGen = chatClientRef.current.chat(request)

                    // Accumulate tool calls from this round
                    const roundToolCalls: ToolCall[] = []
                    let roundFinishReason: string | undefined
                    let roundAssistantContent = ''
                    let streamTimedOut = false
                    const timedChatGen = withInactivityTimeout(
                        chatGen, SSE_INACTIVITY_TIMEOUT_MS,
                        () => {
                            streamTimedOut = true
                            console.warn(`[Agent] SSE stream timed out after ${SSE_INACTIVITY_TIMEOUT_MS / 1000}s of inactivity`)
                        }
                    )

                    for await (const event of timedChatGen) {
                        switch (event.type) {
                            case 'text-delta':
                                yield event.content
                                roundAssistantContent += event.content
                                break

                            case 'annotation':
                                if (options.onAnnotation) {
                                    options.onAnnotation(event.annotations)
                                }
                                break

                            case 'session-info':
                                currentSessionId = event.sessionId
                                if (options.onAnnotation) {
                                    options.onAnnotation([{
                                        type: 'session-info',
                                        sessionId: event.sessionId,
                                        conversationId: event.conversationId,
                                    }])
                                }
                                break

                            case 'tool-call':
                                // Accumulate tool call deltas into complete tool calls
                                // Use index-based matching per OpenAI streaming spec:
                                // first delta has id+name, subsequent deltas only have index+arguments
                                for (const tc of event.toolCalls) {
                                    const existing = roundToolCalls[tc.index]
                                    if (existing) {
                                        if (tc.function?.name) existing.function.name = tc.function.name
                                        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
                                    } else if (tc.id) {
                                        roundToolCalls[tc.index] = {
                                            id: tc.id,
                                            type: 'function',
                                            function: {
                                                name: tc.function?.name || '',
                                                arguments: tc.function?.arguments || '',
                                            },
                                        }
                                    } else {
                                        // Delta without id and no existing entry at this index.
                                        // This can happen if the first delta (with id) was missed
                                        // due to a network issue or parsing error. Create a
                                        // placeholder so subsequent argument deltas aren't lost.
                                        console.warn(`[Agent] Tool call delta at index ${tc.index} has no id and no existing entry. Creating placeholder.`)
                                        roundToolCalls[tc.index] = {
                                            id: `placeholder-${tc.index}-${Date.now()}`,
                                            type: 'function',
                                            function: {
                                                name: tc.function?.name || `unknown-tool-${tc.index}`,
                                                arguments: tc.function?.arguments || '',
                                            },
                                        }
                                    }
                                }
                                break

                            case 'tool-result':
                                // Backend tool results - informational for UI
                                break

                            case 'finish':
                                roundFinishReason = event.finishReason
                                break

                            case 'error':
                                console.error('[Agent] Stream error event:', event.error)
                                throw new Error(event.error)
                        }
                    }

                    // Filter out any undefined gaps in the sparse array
                    const validToolCalls = roundToolCalls.filter(Boolean)

                    // Check if backend requested frontend tool execution.
                    // Execute tools whenever we have valid tool calls, unless
                    // finish reason explicitly indicates an error. This handles:
                    //  - Normal:  finishReason === 'tool-calls'
                    //  - Missing: finishReason is undefined (SSE ended early / timed out)
                    //  - Robust:  finishReason is 'stop' or 'length' (some backends
                    //             incorrectly send these alongside tool calls)
                    const shouldExecuteTools = validToolCalls.length > 0 &&
                        roundFinishReason !== 'error'

                    if (shouldExecuteTools) {
                        if (roundFinishReason !== 'tool-calls') {
                            console.warn(`[Agent] Executing tool calls with non-standard finishReason: ${roundFinishReason ?? 'undefined'}${streamTimedOut ? ' (stream timed out)' : ''}`)
                        }

                        // Add assistant message with tool_calls to conversation
                        const assistantMsg: ChatMessage = {
                            role: 'assistant',
                            tool_calls: validToolCalls,
                        }
                        if (roundAssistantContent) {
                            assistantMsg.content = roundAssistantContent
                        }
                        messages.push(assistantMsg)

                        // Execute each tool locally and add results as tool messages
                        // Use wrappedTools for execution tracking, fallback to allTools
                        for (const tc of validToolCalls) {
                            const toolName = tc.function.name
                            const toolDef = wrappedTools[toolName] || allTools[toolName]

                            let toolResult: string
                            if (toolDef?.execute) {
                                try {
                                    const args = JSON.parse(tc.function.arguments || '{}')
                                    const result = await toolDef.execute(args)
                                    toolResult = typeof result === 'string' ? result : JSON.stringify(result)
                                } catch (err: any) {
                                    toolResult = `Error executing tool ${toolName}: ${err.message || err}`
                                    console.error(`[Agent] Tool execution failed: ${toolName}`, err)
                                }
                            } else {
                                toolResult = `Tool ${toolName} not available on frontend`
                                console.warn(`[Agent] Tool not available on frontend: ${toolName}`)
                            }

                            messages.push({
                                role: 'tool',
                                tool_call_id: tc.id,
                                name: toolName,
                                content: toolResult,
                            })
                        }

                        // Continue the loop to send tool results back to backend
                        continue
                    }

                    // Warn if tool calls were present but skipped (only when finishReason is 'error')
                    if (validToolCalls.length > 0 && !shouldExecuteTools) {
                        console.warn('[Agent] Tool calls skipped due to error finishReason:', roundFinishReason)
                    }

                    // If the backend reported an error finish, throw so the
                    // consumer (Chat.tsx) can display it instead of producing a
                    // blank message.
                    if (roundFinishReason === 'error') {
                        const errMsg = roundAssistantContent
                            || 'Agent processing error'
                        throw new Error(errMsg)
                    }

                    // Normal finish (stop, length, max_iterations) - exit the loop
                    break
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
    }, [allTools, wrappedTools])

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
