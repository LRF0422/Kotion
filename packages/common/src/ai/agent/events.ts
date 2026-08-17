/**
 * SSE parsing + reconnect streaming for the AgentCore event protocol.
 *
 * Frames are default SSE events whose "data:" payload is one JSON object
 * { seq, type, ...payload }. Comment frames (keepalive) are ignored.
 */

import type { AgentEvent } from './types'

/** Parse one SSE data line into an event or null (comments/empty). */
export function parseAgentEventFrame(line: string): AgentEvent | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return null
    const data = trimmed.slice(5).trim()
    if (!data) return null
    try {
        return JSON.parse(data) as AgentEvent
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
