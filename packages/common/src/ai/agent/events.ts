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
            let boundary: number
            while ((boundary = buffer.indexOf('\n\n')) !== -1 || (boundary = buffer.indexOf('\r\n\r\n')) !== -1) {
                const frame = buffer.slice(0, boundary)
                buffer = buffer.slice(boundary + (frame.endsWith('\r') ? 4 : 2))
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
