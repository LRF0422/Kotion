/**
 * React hook for the Tour Registry.
 *
 * Provides a singleton registry plus reactive access to tour definitions and
 * progress. Mirrors use-skill-registry.ts.
 */

import { useEffect, useMemo, useState } from 'react'
import { TourRegistry, createTourRegistry } from './tour-registry'
import type { TourConfig } from './tour'

let globalRegistry: TourRegistry | null = null

export function getTourRegistry(): TourRegistry {
    if (!globalRegistry) {
        globalRegistry = createTourRegistry()
    }
    return globalRegistry
}

export interface UseTourRegistryReturn {
    tours: TourConfig[]
    loading: boolean
    registry: TourRegistry
}

export function useTourRegistry(): UseTourRegistryReturn {
    const registry = useMemo(() => getTourRegistry(), [])
    const [tours, setTours] = useState<TourConfig[]>(() => registry.getTours())
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true

        registry.initialize().finally(() => {
            if (mounted) {
                setTours(registry.getTours())
                setLoading(false)
            }
        })

        const unsubscribe = registry.subscribe(() => {
            if (mounted) setTours(registry.getTours())
        })

        return () => {
            mounted = false
            unsubscribe()
        }
    }, [registry])

    return { tours, loading, registry }
}

/** Initialize the tour registry early in the app lifecycle. */
export async function initializeTourRegistry(): Promise<TourRegistry> {
    const registry = getTourRegistry()
    await registry.initialize()
    return registry
}
