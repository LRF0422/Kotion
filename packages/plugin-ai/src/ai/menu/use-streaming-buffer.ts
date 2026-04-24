import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * Batches streaming text chunks via requestAnimationFrame (~16fps)
 * instead of setState per chunk (50-100fps).
 *
 * Includes forceFlush() to immediately push buffer content to displayText
 * so the streaming bubble is guaranteed visible before the buffer is reset.
 */
export function useStreamingBuffer() {
    const [displayText, setDisplayText] = useState<string | null>(null)
    const bufferRef = useRef('')
    const rafRef = useRef<number | null>(null)

    const flush = useCallback(() => {
        setDisplayText(bufferRef.current)
        rafRef.current = null
    }, [])

    const append = useCallback((chunk: string) => {
        bufferRef.current += chunk
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flush)
        }
    }, [flush])

    /**
     * Immediately push the current buffer content into displayText
     * without waiting for the next animation frame.
     * Call this before reset() to guarantee the streaming text was
     * at least set once, so the streaming bubble is visible.
     */
    const forceFlush = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        setDisplayText(bufferRef.current)
    }, [])

    const reset = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        bufferRef.current = ''
        setDisplayText(null)
    }, [])

    const getContent = useCallback(() => bufferRef.current, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current)
            }
        }
    }, [])

    return { displayText, append, forceFlush, reset, getContent }
}
