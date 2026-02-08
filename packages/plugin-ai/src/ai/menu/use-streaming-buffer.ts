import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * Batches streaming text chunks via requestAnimationFrame (~16fps)
 * instead of setState per chunk (50-100fps).
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

    return { displayText, append, reset, getContent }
}
