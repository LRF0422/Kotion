/**
 * AgentClient — the single frontend entry point to the AgentCore backend
 * (/api/knowledge-agent/api/agent/v1). UI code never parses SSE or manages
 * reconnects itself; the client owns create/attach/resume/cancel and streams
 * typed events with automatic reconnection from the last durable seq.
 */

import { authorizedFetch } from '../../utils/session'
import { readSseDataLines } from './events'
import type {
    AgentEvent,
    CreateRunInput,
    MemoryItem,
    ResumePayload,
    RunView,
    ThreadView,
} from './types'
import { TERMINAL_EVENT_TYPES } from './types'

const DEFAULT_API_BASE = '/api/knowledge-agent/api/agent/v1'

const MAX_RECONNECTS = 5
const RECONNECT_BASE_DELAY_MS = 500

export interface AgentClientOptions {
    /** API base (defaults to the gateway path). */
    apiBase?: string
}

interface ApiResponse<T> {
    code?: number
    success?: boolean
    data?: T
    msg?: string
}

export class AgentClient {
    private readonly apiBase: string

    constructor(options: AgentClientOptions = {}) {
        this.apiBase = options.apiBase || DEFAULT_API_BASE
    }

    // ==================== runs ====================

    async createRun(input: CreateRunInput): Promise<RunView> {
        return this.request<RunView>('/runs', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    }

    async getRun(runId: string): Promise<RunView> {
        return this.request<RunView>('/runs/' + encodeURIComponent(runId))
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
        let cursor = afterSeq
        let reconnects = 0
        while (true) {
            const events = this.streamOnce(runId, cursor, signal)
            let receivedAny = false
            try {
                for await (const event of events) {
                    receivedAny = true
                    if (event.seq > cursor) cursor = event.seq
                    yield event
                    if (TERMINAL_EVENT_TYPES.has(event.type)) {
                        return
                    }
                }
                return // clean stream end without terminal event — treat as done
            } catch (error) {
                if (signal?.aborted) throw error
                if (reconnects >= MAX_RECONNECTS) throw error
                reconnects += 1
                const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnects - 1)
                await new Promise(resolve => setTimeout(resolve, delay))
                if (receivedAny) {
                    // continue from the last durable event
                }
            }
        }
    }

    /**
     * Resume a paused run and stream from afterSeq (the resume response is an
     * SSE stream continuing the run's event log).
     */
    async *resume(runId: string, payload: ResumePayload, afterSeq = 0, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
        const response = await authorizedFetch(this.apiBase + '/runs/' + encodeURIComponent(runId) + '/resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, afterSeq }),
            signal,
        })
        if (!response.ok) {
            throw new Error('Resume failed (' + response.status + ')')
        }
        if (!response.body) {
            throw new Error('Resume response body is null')
        }
        yield* this.streamFromBody(response.body, afterSeq)
    }

    // ==================== threads & memory ====================

    async getThread(conversationId: string): Promise<ThreadView | null> {
        try {
            return await this.request<ThreadView>('/threads/' + encodeURIComponent(conversationId))
        } catch {
            return null
        }
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
        const response = await authorizedFetch(
            this.apiBase + '/runs/' + encodeURIComponent(runId) + '/events?afterSeq=' + afterSeq,
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
        let cursor = afterSeq
        for await (const payload of readSseDataLines(body)) {
            let event: AgentEvent
            try {
                event = JSON.parse(payload) as AgentEvent
            } catch {
                continue
            }
            // Dedupe: replays may overlap the live tail.
            if (event.seq > cursor) {
                cursor = event.seq
                yield event
            }
        }
    }

    private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const response = await authorizedFetch(this.apiBase + path, {
            ...init,
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
    }
}
