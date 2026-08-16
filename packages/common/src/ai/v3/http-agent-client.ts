import { authorizedFetch } from '../../utils/session'
import type {
    AgentTaskEvent,
    AgentTaskState,
    CreateAgentTaskInput,
    ResumeAgentTaskInput,
} from './types'
import type { AgentClient } from './agent-client'

const DEFAULT_BASE = '/api/knowledge-agent/api/v3/agent/tasks'

interface R<T> {
    code?: number
    success?: boolean
    msg?: string
    data?: T
}

async function unwrap<T>(response: Response): Promise<T> {
    if (!response.ok) {
        throw new Error(`Agent V3 API error (${response.status})`)
    }
    const json = (await response.json().catch(() => ({}))) as R<T>
    if (json.success === false || (json.code != null && json.code !== 200)) {
        throw new Error(json.msg || 'Agent V3 API request failed')
    }
    return json.data as T
}

async function parseSse(
    body: ReadableStream<Uint8Array>,
): Promise<Array<{ event: string; data: string }>> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let event = 'message'
    let data = ''
    const out: Array<{ event: string; data: string }> = []

    const flush = () => {
        if (data) {
            out.push({ event, data })
        }
        event = 'message'
        data = ''
    }

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const raw of lines) {
            const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
            if (!line) {
                flush()
            } else if (line.startsWith('event:')) {
                event = line.slice(6).trim()
            } else if (line.startsWith('data:')) {
                const value = line.slice(5).trim()
                if (value === '[DONE]') {
                    flush()
                } else {
                    data += value
                }
            }
        }
    }
    flush()
    return out
}

export class HttpAgentClient implements AgentClient {
    constructor(private readonly base = DEFAULT_BASE) {}

    async create(input: CreateAgentTaskInput, signal?: AbortSignal): Promise<AgentTaskState> {
        const response = await authorizedFetch(this.base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            signal,
        })
        const record = await unwrap<Record<string, unknown>>(response)
        return {
            taskId: String(record.taskId),
            conversationId: String(record.conversationId || input.conversationId),
            status: String(record.status) as AgentTaskState['status'],
            finishReason: record.finishReason as string | undefined,
            errorMessage: record.errorMessage as string | undefined,
            assistantText: record.assistantText as string | undefined,
            lastSeq: Number(record.lastSeq || 0),
            pendingTools: [],
        }
    }

    async state(taskId: string, signal?: AbortSignal): Promise<AgentTaskState> {
        const response = await authorizedFetch(`${this.base}/${taskId}/state`, { signal })
        const state = await unwrap<Record<string, unknown>>(response)
        return {
            taskId: String(state.taskId || taskId),
            conversationId: String(state.conversationId || ''),
            status: String(state.status) as AgentTaskState['status'],
            finishReason: state.finishReason as string | undefined,
            errorMessage: state.errorMessage as string | undefined,
            assistantText: state.assistantText as string | undefined,
            lastSeq: Number(state.lastSeq || 0),
            pendingTools: Array.isArray(state.pendingTools)
                ? (state.pendingTools as Array<Record<string, unknown>>).map(t => ({
                    toolCallId: String(t.toolCallId || ''),
                    toolName: String(t.toolName || ''),
                    arguments: t.arguments as string | undefined,
                }))
                : [],
        }
    }

    async *events(
        taskId: string,
        afterSeq: number,
        signal?: AbortSignal,
    ): AsyncGenerator<AgentTaskEvent> {
        const query = afterSeq > 0 ? `?afterSeq=${afterSeq}` : ''
        const response = await authorizedFetch(`${this.base}/${taskId}/events${query}`, { signal })
        if (!response.ok || !response.body) {
            throw new Error(`Agent V3 events error (${response.status})`)
        }
        for (const frame of await parseSse(response.body)) {
            if (frame.data === '[DONE]') return
            try {
                const payload = JSON.parse(frame.data) as Record<string, unknown>
                yield {
                    seq: Number(payload.seq || 0),
                    type: frame.event,
                    data: payload,
                }
            } catch {
                // keepalive/comment frames are ignored
            }
        }
    }

    async *resume(
        taskId: string,
        input: ResumeAgentTaskInput,
        signal?: AbortSignal,
    ): AsyncGenerator<AgentTaskEvent> {
        const response = await authorizedFetch(`${this.base}/${taskId}/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            signal,
        })
        if (!response.ok || !response.body) {
            throw new Error(`Agent V3 resume error (${response.status})`)
        }
        for (const frame of await parseSse(response.body)) {
            if (frame.data === '[DONE]') return
            try {
                const payload = JSON.parse(frame.data) as Record<string, unknown>
                yield {
                    seq: Number(payload.seq || 0),
                    type: frame.event,
                    data: payload,
                }
            } catch {
                // ignore keepalive
            }
        }
    }

    async cancel(taskId: string, signal?: AbortSignal): Promise<void> {
        const response = await authorizedFetch(`${this.base}/${taskId}/cancel`, {
            method: 'POST',
            signal,
        })
        await unwrap<unknown>(response)
    }
}
