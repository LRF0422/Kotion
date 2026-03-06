/**
 * useStreamBuffer - Shared streaming buffer hook
 *
 * Provides an efficient RAF-based (requestAnimationFrame) buffering mechanism
 * for streaming text content. Eliminates redundant state updates by batching
 * text chunks and flushing at display frame rate.
 *
 * Previously duplicated in:
 * - system-agent/context.tsx
 * - AiInlineMenu.tsx
 */

import { useCallback, useRef, useState, useEffect } from 'react'

export interface UseStreamBufferResult {
    /** Current buffered content (synced to React state at frame rate) */
    content: string
    /** Append a text chunk to the buffer */
    append: (chunk: string) => void
    /** Reset the buffer and content to empty */
    reset: () => void
    /** Get the current raw buffer value (no React state delay) */
    getRawContent: () => string
    /** Force flush the buffer to React state immediately */
    flush: () => void
}

/**
 * Efficient streaming buffer using requestAnimationFrame for batched updates.
 *
 * @example
 * ```tsx
 * const { content, append, reset } = useStreamBuffer()
 *
 * // In streaming loop:
 * for await (const chunk of stream) {
 *     append(chunk)
 * }
 * // content will update at frame rate, not on every chunk
 * ```
 */
export function useStreamBuffer(): UseStreamBufferResult {
    const [content, setContent] = useState('')
    const bufferRef = useRef('')
    const rafRef = useRef<number | null>(null)

    // Flush buffer to React state
    const flush = useCallback(() => {
        setContent(bufferRef.current)
        rafRef.current = null
    }, [])

    // Append chunk with RAF batching
    const append = useCallback((chunk: string) => {
        bufferRef.current += chunk
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flush)
        }
    }, [flush])

    // Reset everything
    const reset = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        bufferRef.current = ''
        setContent('')
    }, [])

    // Get raw buffer content (bypass React state)
    const getRawContent = useCallback(() => {
        return bufferRef.current
    }, [])

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current)
            }
        }
    }, [])

    return {
        content,
        append,
        reset,
        getRawContent,
        flush
    }
}
