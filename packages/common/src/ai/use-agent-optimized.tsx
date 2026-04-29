import { AppContext } from "../core/AppContext"
import type { Editor } from "@tiptap/core"
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { event, PLUGIN_INIT_SUCCESS, REFRESH_PLUSINS } from "../event"

// Types
import type { OnToolExecution, OnUserChoiceRequest, ToolsRecord } from "./types"
export type {
    ToolExecutionEvent,
    OnToolExecution,
    UserChoiceOption,
    UserChoiceRequest,
    OnUserChoiceRequest
} from "./types"

// Chat Client
import { KnowledgeChatClient } from "./chat-client"
import type { ChatMessage, ChatRequest, ToolCall } from "./chat-client/types"

// Providers
import { ToolProvider } from "./providers/ToolProvider"
import { SkillProvider } from "./providers/SkillProvider"

// Capability catalog (replaces SkillRouter + discovery tools)
import { collectCapabilityCatalog, type CapabilityCatalog } from "./capabilities"

// Skills
import { builtinSkills, getSkillRegistry } from "./skills"

// Utils
import { wrapToolsWithCallback } from "./utils/tool-wrapper"

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
 *
 * The frontend produces a full capability catalog (skills + tools) and ships
 * it inline with every `/chat/completions` request. The backend performs
 * progressive discovery/activation internally and asks the frontend to
 * execute specific tool calls as needed.
 */
export const useEditorAgentOptimized = (
    editor: Editor,
    onToolExecution?: OnToolExecution,
    onUserChoiceRequest?: OnUserChoiceRequest,
    agentOptions?: {
        /** Model ID to use for chat requests (e.g. 'deepseek-chat', 'gpt-4o') */
        model?: string
    }
) => {
    const { pluginManager } = useContext(AppContext)

    // AbortController ref for stopping generation
    const abortControllerRef = useRef<AbortController | null>(null)

    // Chat client instance
    const chatClientRef = useRef<KnowledgeChatClient>(new KnowledgeChatClient())

    // Track whether we're currently streaming
    const isStreamingRef = useRef(false)

    // Ref for latest model (avoids stale closure in stream callback)
    const modelRef = useRef<string | undefined>(agentOptions?.model)

    // Keep model ref in sync with agentOptions
    useEffect(() => {
        modelRef.current = agentOptions?.model
    }, [agentOptions?.model])

    // Version state for reactive updates when the catalog changes
    const [version, setVersion] = useState(0)

    // Cached capability catalog; invalidated whenever providers change.
    const catalogRef = useRef<CapabilityCatalog | null>(null)

    // Reload callback — invalidates the catalog and triggers re-render.
    const handleReload = useCallback(() => {
        catalogRef.current = null
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

    // Create SkillProvider instance (pure catalog — no pluginManager needed)
    const skillProvider = useMemo(() => {
        const provider = new SkillProvider({ onReload: handleReload })
        provider.registerSkills(builtinSkills)
        return provider
    }, [handleReload])

    // Initialize skill registry and load installed skills
    useEffect(() => {
        let mounted = true

        const loadInstalledSkills = async () => {
            try {
                await skillRegistry.initialize()
                if (mounted) {
                    const installedSkills = skillRegistry.toSkillFormat()
                    if (installedSkills.length > 0) {
                        skillProvider.registerSkills(installedSkills)
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
                const installedSkills = skillRegistry.toSkillFormat()
                skillProvider.registerSkills(installedSkills)
            }
        })

        return () => {
            mounted = false
            unsubscribe()
        }
    }, [skillRegistry, skillProvider])

    // Register plugin skills + plugin tools when plugins are loaded/changed.
    // Plugin tools must be registered eagerly (no longer loaded on skill activation)
    // so the backend can see them in the catalog and request their execution.
    useEffect(() => {
        const registerPluginCapabilities = () => {
            if (!pluginManager) return

            // Register plugin skills
            const pluginSkills = pluginManager.resolveSkills?.() || []
            if (pluginSkills.length > 0) {
                console.log('[Agent] Registering plugin skills:', pluginSkills.map(s => s.name))
                skillProvider.registerSkills(pluginSkills)
            }

            // Register plugin tools, grouped by plugin
            const allPluginTools = pluginManager.resloveTools?.(editor) || {}
            const extensions = pluginManager.resloveEditorExtension?.() || []
            for (const ext of extensions) {
                const toolNames = ext.tools
                    ? (Array.isArray(ext.tools) ? ext.tools : [ext.tools]).map((t: any) => t.name)
                    : []
                if (toolNames.length === 0) continue

                const filtered: ToolsRecord = {}
                for (const name of toolNames) {
                    if (allPluginTools[name]) filtered[name] = allPluginTools[name]
                }
                if (Object.keys(filtered).length > 0) {
                    console.log(`[Agent] Registering ${Object.keys(filtered).length} tools from plugin "${ext.name}"`)
                    toolProvider.registerPluginTools(filtered, ext.name)
                }
            }
        }

        // Try registering immediately (in case plugins are already loaded)
        registerPluginCapabilities()

        event.on(PLUGIN_INIT_SUCCESS, registerPluginCapabilities)
        event.on(REFRESH_PLUSINS, registerPluginCapabilities)

        return () => {
            event.off(PLUGIN_INIT_SUCCESS, registerPluginCapabilities)
            event.off(REFRESH_PLUSINS, registerPluginCapabilities)
        }
    }, [pluginManager, skillProvider, toolProvider, editor])

    // Eagerly-instantiated tool catalog for local execution of backend tool calls.
    const allTools = useMemo(() => {
        return toolProvider.getAllTools()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolProvider, version])

    // Wrap tools with callback (for frontend-side execution tracking)
    const wrappedTools = useMemo(() => {
        return wrapToolsWithCallback(allTools, onToolExecution)
    }, [allTools, onToolExecution])

    // Rebuild the capability catalog whenever providers change (cached via ref).
    const getCatalog = useCallback((): CapabilityCatalog => {
        if (!catalogRef.current) {
            catalogRef.current = collectCapabilityCatalog(skillProvider, toolProvider)
        }
        return catalogRef.current
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skillProvider, toolProvider, version])

    // Stream with abort support and history messages
    const stream = useCallback(async (options: {
        prompt: string
        messages?: Array<{ role: 'user' | 'assistant'; content: string; reasoning_content?: string }>
        sessionId?: string
        conversationId?: string
        onAnnotation?: (annotations: any[]) => void
        /** Callback for reasoning/thinking content from reasoning models (e.g. deepseek-reasoner) */
        onReasoning?: (content: string) => void
    }) => {
        // Abort any previous stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        abortControllerRef.current = new AbortController()

        // Build messages array for the backend. The system prompt is static now —
        // skill-specific instructions are assembled server-side from the catalog.
        const chatMessages: ChatMessage[] = [{
            role: 'system',
            content: EDITOR_AGENT_PROMPT,
        }]

        if (options.messages && options.messages.length > 0) {
            for (const m of options.messages) {
                const historyMsg: ChatMessage = {
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }
                // Preserve reasoning_content on prior assistant turns.
                // DeepSeek thinking mode requires it to be passed back,
                // otherwise the provider returns 400 invalid_request_error.
                if (m.role === 'assistant' && m.reasoning_content) {
                    historyMsg.reasoning_content = m.reasoning_content
                }
                chatMessages.push(historyMsg)
            }
        }

        chatMessages.push({
            role: 'user',
            content: options.prompt,
        })

        isStreamingRef.current = true
        try {
            // Capability catalog is sent inline with every request; the backend
            // may cache by `capabilitiesVersion` and skip reprocessing unchanged catalogs.
            const catalog = getCatalog()

            const messages = [...chatMessages]
            let currentSessionId = options.sessionId

            // Max iterations to prevent infinite loops in bidirectional tool mode
            const MAX_TOOL_ITERATIONS = DEFAULT_MAX_STEPS

            const textStream = (async function* (): AsyncGenerator<string> {
                for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
                    const request: ChatRequest = {
                        model: modelRef.current || undefined,
                        messages,
                        sessionId: currentSessionId,
                        conversationId: options.conversationId,
                        signal: abortControllerRef.current!.signal,
                        stream: true,
                        skills: catalog.skills.length > 0 ? catalog.skills : undefined,
                        tools: catalog.tools.length > 0 ? catalog.tools : undefined,
                        capabilitiesVersion: catalog.version,
                    }

                    const chatGen = chatClientRef.current.chat(request)

                    const roundToolCalls: ToolCall[] = []
                    let roundFinishReason: string | undefined
                    let roundAssistantContent = ''
                    let roundReasoningContent = ''
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

                            case 'reasoning-delta':
                                roundReasoningContent += event.content
                                if (options.onReasoning) {
                                    options.onReasoning(event.content)
                                }
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
                                // Use index-based matching per OpenAI streaming spec.
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

                    const validToolCalls = roundToolCalls.filter(Boolean)

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

                        // DeepSeek API requires reasoning_content to be
                        // included when tool_calls is present.
                        const assistantMsg: ChatMessage = {
                            role: 'assistant',
                            tool_calls: validToolCalls,
                        }
                        if (roundAssistantContent) {
                            assistantMsg.content = roundAssistantContent
                        }
                        if (roundReasoningContent) {
                            assistantMsg.reasoning_content = roundReasoningContent
                        }
                        messages.push(assistantMsg)

                        // Execute each tool locally and add results as tool messages
                        for (const tc of validToolCalls) {
                            const toolName = tc.function.name
                            const toolDef = wrappedTools[toolName] || allTools[toolName]

                            let argsStr = tc.function.arguments || '{}'
                            let args: Record<string, unknown>
                            try {
                                args = JSON.parse(argsStr)
                            } catch {
                                // LLM sometimes returns malformed JSON; try to recover
                                // by extracting the first valid JSON object.
                                const match = argsStr.match(/\{[\s\S]*\}/)
                                if (match) {
                                    try {
                                        args = JSON.parse(match[0])
                                    } catch {
                                        args = {}
                                    }
                                } else {
                                    args = {}
                                }
                                console.warn(`[Agent] Recovered malformed tool arguments for ${toolName}`, argsStr)
                            }

                            let toolResult: string
                            if (toolDef?.execute) {
                                try {
                                    const result = await toolDef.execute(args)
                                    toolResult = typeof result === 'string' ? result : JSON.stringify(result)
                                } catch (err: any) {
                                    toolResult = `Error executing tool ${toolName}: ${err.message || err}`
                                    console.error(`[Agent] Tool execution failed: ${toolName}`, err)
                                }
                            } else {
                                // Tool not available on frontend — notify UI via callback
                                const startTime = Date.now()
                                onToolExecution?.({
                                    toolName,
                                    args,
                                    status: 'start',
                                    timestamp: startTime
                                })
                                onToolExecution?.({
                                    toolName,
                                    args,
                                    status: 'error',
                                    error: `Tool "${toolName}" is not available on frontend`,
                                    timestamp: startTime,
                                    duration: 0
                                })
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

                    if (validToolCalls.length > 0 && !shouldExecuteTools) {
                        console.warn('[Agent] Tool calls skipped due to error finishReason:', roundFinishReason)
                    }

                    if (roundFinishReason === 'error') {
                        const errMsg = roundAssistantContent || 'Agent processing error'
                        throw new Error(errMsg)
                    }

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
    }, [allTools, wrappedTools, getCatalog, onToolExecution])

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
        toolProvider,
        skillProvider,
        skillRegistry,
        version
    }
}
