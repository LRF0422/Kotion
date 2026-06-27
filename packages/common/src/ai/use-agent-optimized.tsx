import type { Editor } from "@tiptap/core"
import { useCallback, useEffect, useRef } from "react"

// Types
import type { OnToolExecution, OnUserChoiceRequest } from "./types"
export type {
    ToolExecutionEvent,
    OnToolExecution,
    UserChoiceOption,
    UserChoiceRequest,
    OnUserChoiceRequest
} from "./types"

// Chat Client
import type { ChatMessage } from "./chat-client/types"

// Shared capability catalog wiring (providers, plugins, skills)
import { useCapabilityProviders } from "./use-capability-providers"

// Unified agent runtime core
import { AgentHarnessImpl } from "./harness"

// Shared constants
import { EDITOR_AGENT_PROMPT, ASK_MODE_PROMPT } from "./constants"

/** Chat mode: "ask" = Q&A only (read-only), "agent" = can operate the page. */
export type ChatMode = 'ask' | 'agent'

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
        /** Chat mode: "ask" = Q&A only, "agent" = can operate the page (default). */
        mode?: ChatMode
    }
) => {
    // AbortController ref for stopping generation
    const abortControllerRef = useRef<AbortController | null>(null)

    // Unified agent runtime core (single instance per hook)
    const harnessRef = useRef<AgentHarnessImpl>(new AgentHarnessImpl())

    // Track whether we're currently streaming
    const isStreamingRef = useRef(false)

    // Ref for latest model (avoids stale closure in stream callback)
    const modelRef = useRef<string | undefined>(agentOptions?.model)
    // Ref for latest chat mode (avoids stale closure in stream callback)
    const modeRef = useRef<ChatMode>(agentOptions?.mode || 'agent')

    // Keep model ref in sync with agentOptions
    useEffect(() => {
        modelRef.current = agentOptions?.model
    }, [agentOptions?.model])

    // Keep mode ref in sync with agentOptions
    useEffect(() => {
        modeRef.current = agentOptions?.mode || 'agent'
    }, [agentOptions?.mode])

    // Shared capability catalog wiring (providers, plugins, skills).
    const {
        toolProvider,
        skillProvider,
        skillRegistry,
        version,
        getCatalog,
        resolveTool,
    } = useCapabilityProviders(editor, { onToolExecution, onUserChoiceRequest })

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

        // In "ask" mode the agent receives no tools and a read-only system
        // prompt so it can only answer questions. In "agent" mode the full
        // capability catalog + editing prompt are used (default behaviour).
        const isAskMode = modeRef.current === 'ask'
        const systemPrompt = isAskMode ? ASK_MODE_PROMPT : EDITOR_AGENT_PROMPT

        // Build messages array for the backend. The system prompt is static now —
        // skill-specific instructions are assembled server-side from the catalog.
        const chatMessages: ChatMessage[] = [{
            role: 'system',
            content: systemPrompt,
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
            // In ask mode we ship an empty catalog so the agent has no tools.
            const catalog = isAskMode
                ? { skills: [], tools: [], version: 'ask-mode' }
                : getCatalog()
            const signal = abortControllerRef.current.signal

            // Drive the unified harness; map its typed events back onto this
            // hook's text-stream + callback contract. Tool execution tracking is
            // handled by `wrappedTools` (wrapped with onToolExecution).
            const events = harnessRef.current.run({
                messages: chatMessages,
                model: modelRef.current || undefined,
                catalog,
                resolveTool,
                sessionId: options.sessionId,
                conversationId: options.conversationId,
                signal,
                onToolExecution,
            })

            const textStream = (async function* (): AsyncGenerator<string> {
                for await (const ev of events) {
                    switch (ev.type) {
                        case 'text-delta':
                            yield ev.content
                            break
                        case 'reasoning-delta':
                            options.onReasoning?.(ev.content)
                            break
                        case 'annotation':
                            options.onAnnotation?.(ev.annotations)
                            break
                        case 'session':
                            options.onAnnotation?.([{
                                type: 'session-info',
                                sessionId: ev.sessionId,
                                conversationId: ev.conversationId,
                            }])
                            break
                        case 'error':
                            throw new Error(ev.error)
                        // tool-call-start / tool-call-end already drive
                        // onToolExecution via wrappedTools; finish ends the loop.
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
    }, [resolveTool, getCatalog, onToolExecution, modeRef])

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
