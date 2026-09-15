/**
 * useAgentStream — the run's SSE transport: live tail with automatic
 * reconnection and the resume round-trip.
 *
 * Extracted from useEditorAgent so the run hook keeps only session/lifecycle
 * orchestration. Owns the reconnect timer/attempt counter and forwards typed
 * events to the reducer; it does not own the run state machine.
 */

import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import type { AgentClient } from './client'
import type { AgentRunStore } from './persistence'
import { TERMINAL_EVENT_TYPES, type ResumePayload } from './types'
import { isPermanentTransportError } from './retry-policy'
import type { Action, EditorAgentState } from './editor-agent-state'

/** Outer reconnect attempts before a stream is declared stopped. */
const MAX_OUTER_RECONNECTS = 5
const RESUME_FIRST_EVENT_TIMEOUT_MS = 30_000

export interface UseAgentStreamOptions {
    client: AgentClient
    store: AgentRunStore
    conversationId: string
    /** Persist the run handle's lastSeq while streaming. */
    persist: boolean
    dispatch: Dispatch<Action>
    stateRef: MutableRefObject<EditorAgentState>
    mountedRef: MutableRefObject<boolean>
    generationRef: MutableRefObject<number>
    /** Shared abort handle; the stream replaces its current controller. */
    abortRef: MutableRefObject<AbortController | null>
}

export interface UseAgentStreamApi {
    startStream: (runId: string, afterSeq: number, generation?: number) => void
    resumeWith: (runId: string, payload: ResumePayload, generation?: number) => Promise<void>
    /** Clear the reconnect timer and reset the attempt counter. */
    resetReconnect: () => void
    /** Clear only the reconnect timer (unmount). */
    clearReconnectTimer: () => void
}

export function useAgentStream(options: UseAgentStreamOptions): UseAgentStreamApi {
    const {
        client, store, conversationId, persist, dispatch,
        stateRef, mountedRef, generationRef, abortRef,
    } = options

    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const reconnectAttemptRef = useRef(0)
    const startStreamRef = useRef<(runId: string, afterSeq: number, generation: number) => void>(() => undefined)

    const startStream = useCallback(
        (runId: string, afterSeq: number, generation = generationRef.current) => {
            if (!mountedRef.current || generation !== generationRef.current) return
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = null
            }
            abortRef.current?.abort()
            const controller = new AbortController()
            abortRef.current = controller
            void (async () => {
                let cursor = afterSeq
                let receivedAny = false
                try {
                    for await (const event of client.streamEvents(runId, afterSeq, controller.signal)) {
                        if (controller.signal.aborted || generation !== generationRef.current) return
                        if (!receivedAny) {
                            receivedAny = true
                            reconnectAttemptRef.current = 0
                            dispatch({ type: 'transport-restored' })
                        }
                        cursor = event.seq
                        dispatch({ type: 'event', event })
                        if (persist && event.seq % 5 === 0) {
                            store.updateLastSeq(conversationId, event.seq, stateRef.current.phase)
                        }
                    }
                } catch (error: any) {
                    if (controller.signal.aborted || generation !== generationRef.current) return
                    const message = error?.message ?? String(error)
                    const attempt = reconnectAttemptRef.current++
                    if (isPermanentTransportError(error) || attempt >= MAX_OUTER_RECONNECTS) {
                        dispatch({ type: 'connection-stopped', error: message })
                        return
                    }
                    dispatch({ type: 'transport-error', error: message })
                    const delay = Math.min(30_000, 1000 * Math.pow(2, attempt))
                    reconnectTimerRef.current = setTimeout(() => {
                        if (!mountedRef.current || generation !== generationRef.current) return
                        const latest = stateRef.current
                        if (latest.runId === runId
                            && latest.phase !== 'completed'
                            && latest.phase !== 'failed'
                            && latest.phase !== 'cancelled') {
                            startStreamRef.current(runId, cursor, generation)
                        }
                    }, delay)
                }
            })()
        },
        [client, conversationId, persist, store]
    )

    startStreamRef.current = startStream

    const resumeWith = useCallback(
        async (runId: string, payload: ResumePayload, generation = generationRef.current) => {
            const current = stateRef.current
            if (current.runId !== runId || generation !== generationRef.current) return
            // The resume POST re-opens the event stream (replay from lastSeq +
            // live tail); abort the previous stream first so only one consumer
            // applies events.
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = null
            }
            abortRef.current?.abort()
            const controller = new AbortController()
            abortRef.current = controller
            let cursor = current.lastSeq
            try {
                const events = await client.resume(runId, payload, cursor, controller.signal)
                let firstTimer: ReturnType<typeof setTimeout> | undefined
                const first = payload.action === 'tool_results'
                    ? await Promise.race([
                        events.next(),
                        new Promise<never>((_, reject) => {
                            firstTimer = setTimeout(
                                () => reject(new Error('Agent resume timed out before the first event')),
                                RESUME_FIRST_EVENT_TIMEOUT_MS
                            )
                        }),
                    ]).finally(() => {
                        if (firstTimer) clearTimeout(firstTimer)
                    })
                    : await events.next()
                if (controller.signal.aborted || generation !== generationRef.current) return
                if (first.done) {
                    startStream(runId, cursor, generation)
                    return
                }
                cursor = first.value.seq
                reconnectAttemptRef.current = 0
                dispatch({ type: 'transport-restored' })
                dispatch({ type: 'event', event: first.value })
                if (TERMINAL_EVENT_TYPES.has(first.value.type)) {
                    await events.return(undefined)
                    return
                }

                void (async () => {
                    try {
                        for await (const event of events) {
                            if (controller.signal.aborted || generation !== generationRef.current) return
                            cursor = event.seq
                            dispatch({ type: 'event', event })
                        }
                        // Resume stream ended without terminal event (proxy cut the
                        // connection). Fall back to the reconnecting streamEvents so
                        // the run doesn't appear stuck.
                        if (!controller.signal.aborted && generation === generationRef.current) {
                            const latest = stateRef.current
                            if (latest.runId === runId
                                && latest.phase !== 'completed'
                                && latest.phase !== 'failed'
                                && latest.phase !== 'cancelled') {
                                startStream(runId, cursor, generation)
                            }
                        }
                    } catch (error: any) {
                        if (controller.signal.aborted || generation !== generationRef.current) return
                        const message = error?.message ?? String(error)
                        if (isPermanentTransportError(error)) {
                            dispatch({ type: 'connection-stopped', error: message })
                            return
                        }
                        dispatch({ type: 'transport-error', error: message })
                        startStream(runId, cursor, generation)
                    }
                })()
            } catch (error: any) {
                if (controller.signal.aborted || generation !== generationRef.current) return
                controller.abort()
                const message = error?.message ?? String(error)
                if (isPermanentTransportError(error)) {
                    dispatch({ type: 'connection-stopped', error: message })
                } else {
                    dispatch({ type: 'transport-error', error: message })
                    startStream(runId, cursor, generation)
                }
                throw error
            }
        },
        [client, startStream]
    )

    const resetReconnect = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null
        }
        reconnectAttemptRef.current = 0
    }, [])

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null
        }
    }, [])

    return { startStream, resumeWith, resetReconnect, clearReconnectTimer }
}
