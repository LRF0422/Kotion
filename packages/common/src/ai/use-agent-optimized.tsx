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
import type { HarnessEvent } from "./harness"

// Shared constants
import { EDITOR_AGENT_PROMPT, ASK_MODE_PROMPT, MAX_ASK_MODE_CONTENT_CHARS } from "./constants"

/** Chat mode: "ask" = Q&A only (read-only), "agent" = can operate the page. */
export type ChatMode = 'ask' | 'agent'

/**
 * Extract the document content as markdown-ish text for ask-mode context.
 *
 * Uses the tiptap-markdown serializer when available (rich formatting:
 * headings, lists, bold, code blocks) and falls back to plain text.
 * The custom `title` node is rendered as a top-level H1 heading.
 */
const extractAskModeContent = (editor: Editor): string => {
    const doc = editor.state.doc
    const first = doc.firstChild
    const titleText =
        first?.type.name === 'title' && first.textContent
            ? first.textContent
            : ''

    let body: string
    const markdownStorage = (editor.storage as any)?.markdown
    if (markdownStorage?.serializer) {
        // Serialize the body (everything after the title node, if present)
        // so the title doesn't appear twice — we prepend it as H1 below.
        if (first?.type.name === 'title') {
            const bodyDoc = doc.type.create(
                doc.attrs,
                doc.content.cut(first.nodeSize, doc.content.size),
            )
            body = markdownStorage.serializer.serialize(bodyDoc)
        } else {
            body = markdownStorage.serializer.serialize(doc)
        }
    } else {
        // Fallback: plain text — title text is included automatically.
        body = editor.getText()
    }

    return titleText ? `# ${titleText}\n\n${body}` : body
}

/**
 * User-tunable model parameters that ride along with every chat request.
 * Fields are all optional — an unset value falls back to the backend default.
 */
export type ChatModelParams = {
    /** Sampling temperature (typical range 0.0 – 2.0). */
    temperature?: number
    /** Cap on the response length in tokens. */
    maxTokens?: number
}

/**
 * Optimized editor agent hook with backend-driven architecture.
 *
 * The frontend produces a full capability catalog (skills + tools) and ships
 * it inline with every V2 agent chat request. The backend performs
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
        /** Custom agent definition id — backend applies its prompt/model/tool set. */
        agentId?: number
        /** User-tunable sampling params (temperature, maxTokens). */
        modelParams?: ChatModelParams
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
    // Ref for the selected custom agent definition
    const agentIdRef = useRef<number | undefined>(agentOptions?.agentId)
    // Ref for latest model params (avoids stale closure in stream callback)
    const modelParamsRef = useRef<ChatModelParams | undefined>(agentOptions?.modelParams)

    // Keep model ref in sync with agentOptions
    useEffect(() => {
        modelRef.current = agentOptions?.model
    }, [agentOptions?.model])

    // Keep mode ref in sync with agentOptions
    useEffect(() => {
        modeRef.current = agentOptions?.mode || 'agent'
    }, [agentOptions?.mode])

    // Keep agent id ref in sync
    useEffect(() => {
        agentIdRef.current = agentOptions?.agentId
    }, [agentOptions?.agentId])

    // Keep model params ref in sync
    useEffect(() => {
        modelParamsRef.current = agentOptions?.modelParams
    }, [agentOptions?.modelParams])

    // Shared capability catalog wiring (providers, plugins, skills).
    const {
        toolProvider,
        skillProvider,
        skillRegistry,
        version,
        getCatalog,
        resolveTool,
    } = useCapabilityProviders(editor, { onToolExecution, onUserChoiceRequest })

    // Map harness events onto the hook's text-stream + callback contract.
    // Shared by stream() and continueStream().
    const toTextStream = useCallback((
        events: AsyncGenerator<HarnessEvent>,
        callbacks: {
            onAnnotation?: (annotations: any[]) => void
            onReasoning?: (content: string) => void
        }
    ): AsyncGenerator<string> => {
        return (async function* (): AsyncGenerator<string> {
            for await (const ev of events) {
                switch (ev.type) {
                    case 'text-delta':
                        yield ev.content
                        break
                    case 'reasoning-delta':
                        callbacks.onReasoning?.(ev.content)
                        break
                    case 'annotation':
                        callbacks.onAnnotation?.(ev.annotations)
                        break
                    case 'session':
                        callbacks.onAnnotation?.([{
                            type: 'session-info',
                            taskId: ev.taskId,
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
    }, [])

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
        let systemPrompt = isAskMode ? ASK_MODE_PROMPT : EDITOR_AGENT_PROMPT

        // Ask mode ships no tools, so the agent cannot call getDocumentStructure
        // or searchInDocument to read the article. Inject the full document text
        // directly into the system prompt so the model has the content inline.
        if (isAskMode) {
            const docContent = extractAskModeContent(editor)
            if (docContent) {
                const truncated = docContent.length > MAX_ASK_MODE_CONTENT_CHARS
                const body = truncated
                    ? docContent.slice(0, MAX_ASK_MODE_CONTENT_CHARS) +
                      `\n\n[... document truncated, total ${docContent.length} characters ...]`
                    : docContent
                systemPrompt += `\n\n# DOCUMENT CONTENT\n\n${body}`
            }
        }

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
            const params = modelParamsRef.current
            const events = harnessRef.current.run({
                messages: chatMessages,
                model: modelRef.current || undefined,
                catalog,
                resolveTool,
                sessionId: options.sessionId,
                conversationId: options.conversationId,
                signal,
                onToolExecution,
                agentId: agentIdRef.current,
                temperature: params?.temperature,
                maxTokens: params?.maxTokens,
            })

            const textStream = toTextStream(events, {
                onAnnotation: options.onAnnotation,
                onReasoning: options.onReasoning,
            })

            return { textStream }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { textStream: async function* () { /* empty */ }() }
            }
            throw error
        } finally {
            isStreamingRef.current = false
        }
    }, [resolveTool, getCatalog, onToolExecution, toTextStream, modeRef, editor])

    // Continue a session suspended on budget exhaustion: the backend grants a
    // fresh iteration budget and resumes the same session.
    const continueStream = useCallback(async (options: {
        taskId: string
        sessionId?: string
        onAnnotation?: (annotations: any[]) => void
        onReasoning?: (content: string) => void
    }) => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        abortControllerRef.current = new AbortController()

        isStreamingRef.current = true
        try {
            const events = harnessRef.current.continueSession({
                taskId: options.taskId,
                sessionId: options.sessionId,
                resolveTool,
                signal: abortControllerRef.current.signal,
                onToolExecution,
            })

            const textStream = toTextStream(events, {
                onAnnotation: options.onAnnotation,
                onReasoning: options.onReasoning,
            })

            return { textStream }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { textStream: async function* () { /* empty */ }() }
            }
            throw error
        } finally {
            isStreamingRef.current = false
        }
    }, [resolveTool, onToolExecution, toTextStream])

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
        continueStream,
        stop,
        isGenerating,
        toolProvider,
        skillProvider,
        skillRegistry,
        version
    }
}
