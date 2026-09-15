/**
 * AgentClient — the single frontend entry point to the AgentCore backend
 * (/api/knowledge-agent/api/agent/v1). UI code never parses SSE or manages
 * reconnects itself; the client owns create/attach/resume/cancel and streams
 * typed events with automatic reconnection from the last durable seq.
 */

import {
    AgentTransportNotConfiguredError,
    getAgentTransport,
    type AgentTransport,
} from './transport'
import {
    acceptAgentEvent,
    AgentControlError,
    AgentSequenceGapError,
    normalizeAgentEvent,
    readSseDataLines,
    wireNumber,
} from './events'
import type {
    AgentChatMessage,
    AgentChatSession,
    AgentEvent,
    CreateRunInput,
    ImportAgentChatSessionInput,
    MemoryItem,
    ResumePayload,
    RunView,
    SaveAgentChatSessionInput,
    ThreadView,
} from './types'
import { TERMINAL_EVENT_TYPES } from './types'

const MAX_RECONNECTS = 5
const RECONNECT_BASE_DELAY_MS = 500
const RECONNECT_MAX_DELAY_MS = 8_000
const RESUME_RESPONSE_TIMEOUT_MS = 30_000
const REQUEST_TIMEOUT_MS = 15_000

function isPermanentStreamError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return /\((400|401|403|404)\)/.test(message)
}

/** Roles accepted by the AgentCore wire contract. */
const AGENT_ROLES: readonly string[] = ['system', 'user', 'assistant', 'tool']

/** Short single-line content excerpt for diagnostics. */
function contentPreview(content?: string): string {
    if (!content) return ''
    const flat = content.replace(/\s+/g, ' ').trim()
    return flat.length > 60 ? flat.slice(0, 60) + '…' : flat
}

/**
 * The LLM provider rejects `role: null` with 400 BAD_REQUEST (the backend
 * forwards client messages as-is), and a null entry breaks serialization too.
 * `role` is required by the wire type, but dynamically assembled history can
 * still carry a blank one — so normalize here, at the single transport choke
 * point every producer goes through, and name the culprit in the console.
 */
function sanitizeOutgoingMessages(messages?: AgentChatMessage[]): AgentChatMessage[] {
    if (!Array.isArray(messages)) return []
    return messages.reduce<AgentChatMessage[]>((out, message, index) => {
        if (!message) {
            console.warn(`[AgentClient] dropping null message at messages[${index}]`)
            return out
        }
        const normalized = typeof message.role === 'string' ? message.role.trim() : ''
        if (!normalized) {
            console.warn(
                `[AgentClient] messages[${index}] has a blank role — sending as "user" (content: ${contentPreview(message.content)})`
            )
            out.push({ ...message, role: 'user' })
            return out
        }
        if (!AGENT_ROLES.includes(normalized)) {
            console.warn(`[AgentClient] messages[${index}] has an unknown role "${normalized}"`)
            out.push(message)
            return out
        }
        // Membership in AGENT_ROLES (which mirrors the wire union) is checked
        // above; TS cannot narrow an arbitrary string through `includes`.
        const role = normalized as AgentChatMessage['role']
        out.push(role === message.role ? message : { ...message, role })
        return out
    }, [])
}

export interface AgentClientOptions {
    /**
     * Override the agent API base. Ordinary callers omit this: the base comes
     * from the host-registered {@link AgentTransport}.
     */
    apiBase?: string
    /** Explicit transport (tests / non-app hosts); defaults to the registered one. */
    transport?: AgentTransport
}

interface ApiResponse<T> {
    code?: number
    success?: boolean
    data?: T
    msg?: string
}

/**
 * Coerce the RunView counters the backend serializes as strings (long fields)
 * back to numbers, so callers can compare/arithmetic them safely.
 */
function normalizeRunView(view: RunView): RunView {
    if (!view) return view
    return {
        ...view,
        lastSeq: wireNumber(view.lastSeq),
        replayThroughSeq: wireNumber(view.replayThroughSeq),
        promptTokens: wireNumber(view.promptTokens),
        completionTokens: wireNumber(view.completionTokens),
        cachedPromptTokens: wireNumber(view.cachedPromptTokens),
        createTime: wireNumber(view.createTime),
        updateTime: wireNumber(view.updateTime),
    }
}

export class AgentClient {
    private readonly options: AgentClientOptions
    private resolvedTransport: AgentTransport | null = null

    constructor(options: AgentClientOptions = {}) {
        this.options = options
    }

    /**
     * Resolve the host transport lazily so constructing a client never throws
     * at module load. Resolution happens on first request, by which point the
     * host has registered the transport.
     */
    private transport(): AgentTransport {
        if (this.resolvedTransport) return this.resolvedTransport
        const base = this.options.transport ?? getAgentTransport()
        if (!base) throw new AgentTransportNotConfiguredError()
        const apiBase = (this.options.apiBase ?? base.apiBase).replace(/\/+$/, '')
        this.resolvedTransport = { fetch: base.fetch, apiBase }
        return this.resolvedTransport
    }

    // ==================== runs ====================

    async createRun(input: CreateRunInput): Promise<RunView> {
        const payload: CreateRunInput = {
            ...input,
            messages: sanitizeOutgoingMessages(input.messages),
        }
        return normalizeRunView(
            await this.request<RunView>('/runs', {
                method: 'POST',
                body: JSON.stringify(payload),
            })
        )
    }

    async getRun(runId: string): Promise<RunView> {
        return normalizeRunView(await this.request<RunView>('/runs/' + encodeURIComponent(runId)))
    }

    async cancelRun(runId: string): Promise<void> {
        await this.request('/runs/' + encodeURIComponent(runId) + '/cancel', { method: 'POST' })
    }

    async deleteActiveRun(conversationId: string): Promise<void> {
        await this.request('/threads/' + encodeURIComponent(conversationId) + '/active-run', {
            method: 'DELETE',
        })
    }

    /**
     * Stream a run's events from afterSeq. Reconnects automatically (exponential
     * backoff, max 5 attempts) whenever the stream drops without a terminal
     * event, resuming from the last received seq — events are never duplicated.
     */
    async *streamEvents(runId: string, afterSeq = 0, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
        let cursor = wireNumber(afterSeq)
        let reconnects = 0
        while (true) {
            const cursorAtStart = cursor
            const events = this.streamOnce(runId, cursor, signal)
            let receivedAny = false
            let streamError: unknown
            try {
                for await (const event of events) {
                    receivedAny = true
                    if (event.seq > cursor) cursor = event.seq
                    yield event
                    if (TERMINAL_EVENT_TYPES.has(event.type)) {
                        return
                    }
                }
                // Stream ended without a terminal event. This normally means
                // an intermediary (nginx / gateway / vite proxy) closed the
                // connection, NOT that the run is done — the AgentCore protocol
                // guarantees a terminal event as the last frame. Treat this the
                // same as a network error and reconnect from the last seq.
            } catch (error) {
                if (signal?.aborted) throw error
                if (error instanceof AgentControlError || isPermanentStreamError(error)) throw error
                streamError = error
            }
            if (signal?.aborted) return
            // Reset the attempt counter only on genuine forward progress. A
            // clean non-terminal close (e.g. the server's durable gap-close)
            // must NOT reset it, otherwise the client reconnects every 500ms
            // forever without ever surfacing an error.
            if (receivedAny
                && cursor > cursorAtStart
                && !(streamError instanceof AgentSequenceGapError)) {
                reconnects = 0
            }
            if (reconnects >= MAX_RECONNECTS) {
                throw new Error('Agent stream disconnected after ' + MAX_RECONNECTS + ' reconnect attempts')
            }
            reconnects += 1
            const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnects - 1))
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    /**
     * Resume a paused run and stream from afterSeq (the resume response is an
     * SSE stream continuing the run's event log).
     */
    async resume(
        runId: string,
        payload: ResumePayload,
        afterSeq = 0,
        signal?: AbortSignal
    ): Promise<AsyncGenerator<AgentEvent>> {
        const controller = new AbortController()
        const forwardAbort = () => controller.abort()
        if (signal?.aborted) controller.abort()
        else signal?.addEventListener('abort', forwardAbort, { once: true })
        const timer = setTimeout(() => controller.abort(), RESUME_RESPONSE_TIMEOUT_MS)
        const transport = this.transport()
        let response: Response
        try {
            response = await transport.fetch(transport.apiBase + '/runs/' + encodeURIComponent(runId) + '/resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, afterSeq }),
                signal: controller.signal,
            })
        } catch (error) {
            signal?.removeEventListener('abort', forwardAbort)
            if (controller.signal.aborted && !signal?.aborted) {
                throw new Error('Resume request timed out before response headers')
            }
            throw error
        } finally {
            clearTimeout(timer)
        }
        if (!response.ok) {
            signal?.removeEventListener('abort', forwardAbort)
            throw new Error('Resume failed (' + response.status + ')')
        }
        if (!response.body) {
            signal?.removeEventListener('abort', forwardAbort)
            throw new Error('Resume response body is null')
        }
        const events = this.streamFromBody(response.body, afterSeq)
        return (async function* () {
            try {
                yield* events
            } finally {
                signal?.removeEventListener('abort', forwardAbort)
                controller.abort()
            }
        })()
    }

    // ==================== threads & memory ====================

    async getThread(conversationId: string, strict = false): Promise<ThreadView | null> {
        try {
            return await this.request<ThreadView>('/threads/' + encodeURIComponent(conversationId))
        } catch (error) {
            if (strict) throw error
            return null
        }
    }

    // ==================== chat sessions (durable UI records) ====================

    /** List the caller's persisted chat sessions (metadata only, newest first). */
    async listChatSessions(limit = 100): Promise<AgentChatSession[]> {
        const data = await this.request<{ items?: AgentChatSession[] }>(
            '/sessions?limit=' + encodeURIComponent(String(limit)),
        )
        return Array.isArray(data?.items) ? data!.items! : []
    }

    /** Load one chat session including its message blob; null when absent. */
    async getChatSession(sessionId: string, strict = false): Promise<AgentChatSession | null> {
        try {
            return await this.request<AgentChatSession>('/sessions/' + encodeURIComponent(sessionId))
        } catch (error) {
            if (strict) throw error
            return null
        }
    }

    /**
     * Create or update a session. Omit `messages` for a metadata-only write:
     * the stored message blob is left untouched.
     */
    async saveChatSession(sessionId: string, input: SaveAgentChatSessionInput): Promise<void> {
        await this.request('/sessions/' + encodeURIComponent(sessionId), {
            method: 'PUT',
            body: JSON.stringify(input),
        })
    }

    async deleteChatSession(sessionId: string): Promise<void> {
        await this.request('/sessions/' + encodeURIComponent(sessionId), { method: 'DELETE' })
    }

    /**
     * One-time migration: upload a pre-existing local transcript. The backend
     * rejects the upload once it owns an engine-projected transcript.
     */
    async importChatSession(sessionId: string, input: ImportAgentChatSessionInput): Promise<void> {
        await this.request('/sessions/' + encodeURIComponent(sessionId) + '/import', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    }

    /** Explicit user command to reset the engine-owned transcript. */
    async clearChatSessionTranscript(sessionId: string): Promise<void> {
        await this.request('/sessions/' + encodeURIComponent(sessionId) + '/transcript', {
            method: 'DELETE',
        })
    }

    async listMemory(params: {
        scope?: string
        query?: string
        spaceId?: string
        pageId?: string
        limit?: number
    } = {}): Promise<MemoryItem[]> {
        const search = new URLSearchParams()
        if (params.scope) search.set('scope', params.scope)
        if (params.query) search.set('query', params.query)
        if (params.spaceId) search.set('spaceId', params.spaceId)
        if (params.pageId) search.set('pageId', params.pageId)
        search.set('limit', String(params.limit ?? 20))
        const data = await this.request<{ memories?: MemoryItem[] }>('/memory?' + search.toString())
        return data?.memories ?? []
    }

    async deleteMemory(memoryId: string): Promise<void> {
        await this.request('/memory/' + encodeURIComponent(memoryId), { method: 'DELETE' })
    }

    // ==================== internals ====================

    private async *streamOnce(runId: string, afterSeq: number, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
        const transport = this.transport()
        const response = await transport.fetch(
            transport.apiBase + '/runs/' + encodeURIComponent(runId) + '/events?afterSeq=' + afterSeq,
            { method: 'GET', headers: {}, signal }
        )
        if (!response.ok) {
            throw new Error('Agent events error (' + response.status + ')')
        }
        if (!response.body) {
            throw new Error('Agent events response body is null')
        }
        yield* this.streamFromBody(response.body, afterSeq)
    }

    private async *streamFromBody(body: ReadableStream<Uint8Array>, afterSeq: number): AsyncGenerator<AgentEvent> {
        let cursor = wireNumber(afterSeq)
        for await (const payload of readSseDataLines(body)) {
            let event: AgentEvent | null
            try {
                event = normalizeAgentEvent(JSON.parse(payload))
            } catch {
                continue
            }
            if (!event) continue
            // Dedupe overlapping replay/live frames, but reject forward gaps so
            // a later run.suspended event cannot hide a missing tool.requested.
            if (acceptAgentEvent(event, cursor)) {
                cursor = event.seq
                yield event
            }
        }
    }

    private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const controller = new AbortController()
        const sourceSignal = init.signal
        const forwardAbort = () => controller.abort()
        if (sourceSignal?.aborted) controller.abort()
        else sourceSignal?.addEventListener('abort', forwardAbort, { once: true })
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        const transport = this.transport()
        try {
            const response = await transport.fetch(transport.apiBase + path, {
                ...init,
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
            })
            if (!response.ok) {
                throw new Error('Agent API error (' + response.status + ')')
            }
            const json = (await response.json().catch(() => ({}))) as ApiResponse<T>
            if (json.success === false || (json.code != null && json.code !== 200 && json.code !== 0)) {
                throw new Error(json.msg || 'Agent API error')
            }
            return json.data as T
        } catch (error) {
            if (controller.signal.aborted && !sourceSignal?.aborted) {
                throw new Error('Agent API request timed out')
            }
            throw error
        } finally {
            clearTimeout(timer)
            sourceSignal?.removeEventListener('abort', forwardAbort)
        }
    }
}
