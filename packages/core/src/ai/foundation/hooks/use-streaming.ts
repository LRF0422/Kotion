/**
 * useStreaming Hook
 *
 * Provides utilities for handling streaming responses.
 */

import { useState, useCallback, useRef } from 'react'

export interface UseStreamingResult {
    /** Current streamed content */
    content: string
    /** Whether currently streaming */
    isStreaming: boolean
    /** Error if any */
    error: Error | null
    /** Annotations received from Data Stream v2 */
    annotations: any[]
    /** Append text to content */
    append: (text: string) => void
    /** Set full content */
    setContent: (content: string) => void
    /** Reset to initial state */
    reset: () => void
    /** Start streaming state */
    startStreaming: () => void
    /** Stop streaming state */
    stopStreaming: () => void
    /** Set error */
    setError: (error: Error | null) => void
    /** Add annotations */
    addAnnotations: (annotations: any[]) => void
}

/**
 * Hook for managing streaming content state
 *
 * @param initialContent Initial content
 * @returns Streaming state and methods
 *
 * @example
 * ```typescript
 * const { content, append, isStreaming, startStreaming, stopStreaming } = useStreaming()
 *
 * const handleStream = async () => {
 *     startStreaming()
 *     for await (const chunk of stream) {
 *         append(chunk.text)
 *     }
 *     stopStreaming()
 * }
 * ```
 */
export function useStreaming(initialContent: string = ''): UseStreamingResult {
    const [content, setContentState] = useState(initialContent)
    const [isStreaming, setIsStreaming] = useState(false)
    const [error, setErrorState] = useState<Error | null>(null)
    const [annotations, setAnnotations] = useState<any[]>([])
    const abortControllerRef = useRef<AbortController | null>(null)

    const append = useCallback((text: string) => {
        setContentState(prev => prev + text)
    }, [])

    const setContent = useCallback((newContent: string) => {
        setContentState(newContent)
    }, [])

    const reset = useCallback(() => {
        setContentState(initialContent)
        setIsStreaming(false)
        setErrorState(null)
        setAnnotations([])
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
    }, [initialContent])

    const startStreaming = useCallback(() => {
        setIsStreaming(true)
        setErrorState(null)
        setAnnotations([])
        abortControllerRef.current = new AbortController()
    }, [])

    const stopStreaming = useCallback(() => {
        setIsStreaming(false)
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
    }, [])

    const setError = useCallback((err: Error | null) => {
        setErrorState(err)
        if (err) {
            setIsStreaming(false)
        }
    }, [])

    const addAnnotations = useCallback((newAnnotations: any[]) => {
        setAnnotations(prev => [...prev, ...newAnnotations])
    }, [])

    return {
        content,
        isStreaming,
        error,
        annotations,
        append,
        setContent,
        reset,
        startStreaming,
        stopStreaming,
        setError,
        addAnnotations
    }
}

export interface UseStreamProcessorOptions {
    /** Callback for annotation events from Data Stream v2 */
    onAnnotation?: (annotations: any[]) => void
}

/**
 * Hook for processing AI stream responses
 *
 * @example
 * ```typescript
 * const { content, processStream, reset } = useStreamProcessor()
 *
 * const handleGenerate = async (agent: AIAgent) => {
 *     const result = await agent.stream({ prompt: 'Hello' })
 *     await processStream(result.stream)
 * }
 */
export function useStreamProcessor(options?: UseStreamProcessorOptions) {
    const streaming = useStreaming()

    const processStream = useCallback(async (stream: AsyncIterable<any>) => {
        streaming.startStreaming()

        try {
            for await (const chunk of stream) {
                // Handle annotation events (Data Stream v2 protocol code 8:)
                if (chunk.type === 'annotation' || chunk.annotations) {
                    const annotations = chunk.annotations || [chunk.data]
                    streaming.addAnnotations(annotations)
                    options?.onAnnotation?.(annotations)
                    continue
                }

                // Handle different chunk formats
                const text = chunk.text || chunk.content || chunk.delta || ''
                if (text) {
                    streaming.append(text)
                }
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                streaming.setError(error)
            }
        } finally {
            streaming.stopStreaming()
        }
    }, [streaming, options])

    return {
        ...streaming,
        processStream
    }
}

/**
 * Hook for managing multiple concurrent streams
 */
export function useMultiStreaming() {
    const [streams, setStreams] = useState<Map<string, UseStreamingResult>>(new Map())

    const getStream = useCallback((id: string): UseStreamingResult => {
        let stream = streams.get(id)
        if (!stream) {
            // Create a new streaming instance
            stream = useStreaming()
            setStreams(prev => new Map(prev).set(id, stream!))
        }
        return stream
    }, [streams])

    const removeStream = useCallback((id: string) => {
        setStreams(prev => {
            const next = new Map(prev)
            next.delete(id)
            return next
        })
    }, [])

    const clearAll = useCallback(() => {
        streams.forEach(stream => stream.reset())
        setStreams(new Map())
    }, [streams])

    return {
        streams,
        getStream,
        removeStream,
        clearAll
    }
}
