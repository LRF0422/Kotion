/**
 * useAIFoundation Hook
 *
 * Provides access to the global AI Foundation instance.
 */

import { useContext, useEffect, useState, useCallback, useRef } from 'react'
import { AppContext } from '@kn/common'
import type { AIFoundation } from '../types'
import { getAIFoundation } from '../ai-foundation'

/**
 * Hook to access the global AI Foundation instance
 *
 * @returns The AI Foundation instance
 *
 * @example
 * ```typescript
 * const aiFoundation = useAIFoundation()
 *
 * // Create an agent
 * const agent = aiFoundation.createAgent({ model: { provider: 'deepseek', model: 'deepseek-chat' } })
 *
 * // Stream a response
 * const result = await agent.stream({ prompt: 'Hello!' })
 * ```
 */
export function useAIFoundation(): AIFoundation {
    const { pluginManager } = useContext(AppContext)
    const [foundation, setFoundation] = useState<AIFoundation>(() => getAIFoundation())
    const registeredRef = useRef(false)

    useEffect(() => {
        // Initialize the foundation if not already initialized
        const initFoundation = async () => {
            if (!foundation.isInitialized()) {
                await foundation.initialize()
            }
        }

        initFoundation()
    }, [foundation])

    // Register AI Foundation to pluginManager services
    useEffect(() => {
        if (pluginManager && !registeredRef.current) {
            registeredRef.current = true
            pluginManager.registerCoreService('aiFoundation', foundation as any)
        }
    }, [pluginManager, foundation])

    return foundation
}

/**
 * Hook to check if AI Foundation is initialized
 */
export function useAIFoundationReady(): boolean {
    const foundation = useAIFoundation()
    const [ready, setReady] = useState(foundation.isInitialized())

    useEffect(() => {
        if (foundation.isInitialized()) {
            setReady(true)
            return
        }

        const checkReady = async () => {
            await foundation.initialize()
            setReady(true)
        }

        checkReady()
    }, [foundation])

    return ready
}

/**
 * Hook to subscribe to AI Foundation events
 */
export function useAIFoundationEvents(
    eventType?: string,
    callback?: (event: any) => void
): void {
    const foundation = useAIFoundation()

    useEffect(() => {
        if (!callback) return

        const unsubscribe = foundation.subscribe((event) => {
            if (!eventType || event.type === eventType) {
                callback(event)
            }
        })

        return unsubscribe
    }, [foundation, eventType, callback])
}
