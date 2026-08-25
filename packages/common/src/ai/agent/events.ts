/**
 * SSE parsing + reconnect streaming for the AgentCore event protocol.
 *
 * Frames are default SSE events whose "data:" payload is one JSON object
 * { seq, type, ...payload }. Comment frames (keepalive) are ignored.
 *
 * Wire caveat: the platform's Jackson config serializes Java `long` as a JSON
 * string to protect JS precision, so `seq` and the token counters arrive as
 * strings ("44"). Everything downstream compares seq numerically, so events are
 * normalized here — at the single parse boundary — rather than at each use site.
 */

import type { AgentEvent } from './types'

export class AgentControlError extends Error {
    readonly code: string

    constructor(code: string, message?: string) {
        super(message || code)
        this.name = 'AgentControlError'
        this.code = code
    }
}

export class AgentSequenceGapError extends Error {
    readonly expectedSeq: number
    readonly receivedSeq: number

    constructor(expectedSeq: number, receivedSeq: number) {
        super('Agent event sequence gap: expected ' + expectedSeq + ', received ' + receivedSeq)
        this.name = 'AgentSequenceGapError'
        this.expectedSeq = expectedSeq
        this.receivedSeq = receivedSeq
    }
}

/** Coerce a wire number (may arrive as a string) to a finite number. */
export function wireNumber(value: unknown, fallback = 0): number {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Normalize a parsed event payload: seq and usage counters become real numbers.
 * Returns null when the payload is not a usable event.
 */
export function normalizeAgentEvent(raw: unknown): AgentEvent | null {
    if (!raw || typeof raw !== 'object') return null
    const event = raw as Record<string, any>
    if (typeof event.type !== 'string') return null
    const normalized: Record<string, any> = { ...event, seq: wireNumber(event.seq) }
    if (normalized.usage && typeof normalized.usage === 'object') {
        normalized.usage = {
            ...normalized.usage,
            promptTokens: wireNumber(normalized.usage.promptTokens),
            completionTokens: wireNumber(normalized.usage.completionTokens),
            cachedPromptTokens: wireNumber(normalized.usage.cachedPromptTokens),
        }
    }
    return normalized as AgentEvent
}

/** Parse one SSE data line into an event or null (comments/empty). */
export function parseAgentEventFrame(line: string): AgentEvent | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return null
    const data = trimmed.slice(5).trim()
    if (!data) return null
    try {
        return normalizeAgentEvent(JSON.parse(data))
    } catch {
        return null
    }
}

/**
 * Validate one normalized stream event against the last contiguous sequence.
 * Control errors are out-of-band and duplicates are safe to ignore.
 */
export function acceptAgentEvent(event: AgentEvent, cursor: number): boolean {
    if (event.type === 'control.error') {
        throw new AgentControlError(event.code, event.error)
    }
    // Backward compatibility for servers that encoded control failures as an
    // unsequenced run.failed frame before control.error was introduced.
    if (event.seq === 0 && event.type === 'run.failed') {
        throw new AgentControlError(event.code || 'AGENT_CONTROL_ERROR', event.error)
    }
    if (event.seq <= cursor) {
        return false
    }
    const expectedSeq = cursor + 1
    if (event.seq !== expectedSeq) {
        throw new AgentSequenceGapError(expectedSeq, event.seq)
    }
    return true
}

/**
 * Minimal SSE reader over a fetch Response body — yields complete
 * data payload strings, ignoring keepalive comments and CR/LF variants.
 */
export async function* readSseDataLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            // Split on double-newline (SSE frame boundary), supporting \n\n and \r\n\r\n.
            while (true) {
                const lfBoundary = buffer.indexOf('\n\n')
                const crlfBoundary = buffer.indexOf('\r\n\r\n')
                if (lfBoundary === -1 && crlfBoundary === -1) break
                const useCrlf = crlfBoundary !== -1 && (lfBoundary === -1 || crlfBoundary <= lfBoundary)
                const boundary = useCrlf ? crlfBoundary : lfBoundary
                const frame = buffer.slice(0, boundary)
                buffer = buffer.slice(boundary + (useCrlf ? 4 : 2))
                const dataLines = frame.split(/\r?\n/).filter(l => l.trimStart().startsWith('data:'))
                if (dataLines.length > 0) {
                    const payload = dataLines
                        .map(l => l.replace(/^data:\s?/, ''))
                        .join('\n')
                        .trim()
                    if (payload) yield payload
                }
            }
        }
        // Flush trailing frame (some proxies omit the final blank line).
        if (buffer.trim().startsWith('data:')) {
            const payload = buffer.replace(/^data:\s?/, '').trim()
            if (payload) yield payload
        }
    } finally {
        reader.releaseLock()
    }
}
