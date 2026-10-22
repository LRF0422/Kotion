import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentClient } from '@kn/common'
import type { AgentProfileTrait, ChatMode, MemoryItem } from '@kn/common'
import {
    buildStarterSuggestions,
    hasPersonalizedSuggestions,
    type StarterSuggestion,
} from './starter-suggestions'

/**
 * Data behind the memory-aware starter grid.
 *
 * The empty state is mounted in every idle tab, so the fetch is shared:
 * module-level cache (60s), in-flight de-duplication, and a silent fallback to
 * the static prompts on any failure (signed out, no backend, transport not
 * configured). Recommendation is an enhancement, never a blocker — the chat
 * must open instantly even when none of this is available.
 */

const client = new AgentClient()

const CACHE_TTL_MS = 60_000
const MEMORY_FETCH_LIMIT = 60
const MIN_TRAIT_CONFIDENCE = 60
const MIN_QUERY_CHARS = 2

interface StarterSignals {
    memories: MemoryItem[]
    traits: AgentProfileTrait[]
}

const EMPTY_SIGNALS: StarterSignals = { memories: [], traits: [] }
const signalCache = new Map<string, { at: number; signals: StarterSignals }>()
const inflight = new Map<string, Promise<StarterSignals>>()

async function fetchSignals(query: string): Promise<StarterSignals> {
    // Independent calls: a missing profile (or a failed memory request) must
    // not take the other signal down with it.
    const [memories, profile] = await Promise.allSettled([
        client.listMemory({ scope: '*', query: query || undefined, limit: MEMORY_FETCH_LIMIT }),
        client.getProfile(),
    ])
    return {
        memories: memories.status === 'fulfilled' ? memories.value : [],
        traits: profile.status === 'fulfilled' && profile.value.consent
            ? profile.value.traits.filter(
                trait => trait.status === 'active' && trait.confidence >= MIN_TRAIT_CONFIDENCE,
            )
            : [],
    }
}

function loadSignals(query: string): Promise<StarterSignals> {
    const key = query.trim().toLowerCase()
    const cached = signalCache.get(key)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return Promise.resolve(cached.signals)
    }
    const pending = inflight.get(key)
    if (pending) return pending
    const request = fetchSignals(query)
        .catch((): StarterSignals => EMPTY_SIGNALS)
        .then(signals => {
            const at = Date.now()
            // Bound the cache by its TTL: entries are only read on demand, so
            // a long session with many visited pages would otherwise pile up.
            for (const [cachedKey, entry] of signalCache) {
                if (at - entry.at >= CACHE_TTL_MS) signalCache.delete(cachedKey)
            }
            signalCache.set(key, { at, signals })
            return signals
        })
        .finally(() => {
            inflight.delete(key)
        })
    inflight.set(key, request)
    return request
}

export interface UseStarterSuggestionsInput {
    mode: ChatMode
    /** Document title — also the recall query that ranks relevant memories. */
    pageTitle?: string
    pageId?: string
    spaceId?: string
}

export interface UseStarterSuggestionsResult {
    suggestions: StarterSuggestion[]
    /** True when at least one card is backed by memory/profile. */
    personalized: boolean
    loading: boolean
}

export function useStarterSuggestions({
    mode,
    pageTitle,
    pageId,
    spaceId,
}: UseStarterSuggestionsInput): UseStarterSuggestionsResult {
    const [signals, setSignals] = useState<StarterSignals>(EMPTY_SIGNALS)
    const [loading, setLoading] = useState(false)
    const requestIdRef = useRef(0)

    const title = (pageTitle ?? '').trim()
    const query = title.length >= MIN_QUERY_CHARS ? title : ''

    useEffect(() => {
        // Ask mode answers from the document and keeps its fixed read-only
        // prompts; no memory fetch is needed there.
        if (mode !== 'agent') {
            setLoading(false)
            return
        }
        const requestId = ++requestIdRef.current
        // A page switch must not keep showing another page's memories while
        // the new recall is in flight: fall back to the static grid first.
        setSignals(current => (current === EMPTY_SIGNALS ? current : EMPTY_SIGNALS))
        setLoading(true)
        let cancelled = false
        void loadSignals(query).then(next => {
            if (cancelled || requestId !== requestIdRef.current) return
            setSignals(next)
            setLoading(false)
        })
        return () => {
            cancelled = true
        }
    }, [mode, query])

    const suggestions = useMemo(
        () => buildStarterSuggestions({
            mode,
            memories: mode === 'agent' ? signals.memories : [],
            traits: mode === 'agent' ? signals.traits : [],
            pageTitle: title || undefined,
            pageId,
            spaceId,
        }),
        [mode, signals, title, pageId, spaceId],
    )

    const personalized = useMemo(() => hasPersonalizedSuggestions(suggestions), [suggestions])

    return { suggestions, personalized, loading }
}
