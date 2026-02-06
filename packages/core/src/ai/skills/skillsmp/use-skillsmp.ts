/**
 * SkillsMP React Hook
 *
 * React hook for interacting with SkillsMP marketplace
 */

import { useState, useCallback, useRef } from 'react'
import { skillsMPClient, SkillsMPClient } from './client'
import type {
    SkillsMPSkill,
    SkillsMPCategory,
    SkillsMPSearchParams
} from './types'

export interface UseSkillsMPOptions {
    apiKey?: string
    pageSize?: number
}

export interface UseSkillsMPResult {
    // State
    skills: SkillsMPSkill[]
    categories: SkillsMPCategory[]
    loading: boolean
    error: string | null
    hasMore: boolean
    total: number
    page: number

    // Actions
    search: (query: string, category?: string) => Promise<void>
    aiSearch: (query: string) => Promise<void>
    loadMore: () => Promise<void>
    loadCategories: () => Promise<void>
    reset: () => void

    // Client access
    client: SkillsMPClient
}

export function useSkillsMP(options: UseSkillsMPOptions = {}): UseSkillsMPResult {
    const { apiKey, pageSize = 20 } = options

    // Setup client
    const clientRef = useRef(skillsMPClient)
    if (apiKey) {
        console.log('Setting up SkillsMP client with API key', apiKey);

        clientRef.current.setApiKey(apiKey)
    }

    // State
    const [skills, setSkills] = useState<SkillsMPSkill[]>([])
    const [categories, setCategories] = useState<SkillsMPCategory[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [hasMore, setHasMore] = useState(false)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)

    // Search params ref for pagination
    const searchParamsRef = useRef<SkillsMPSearchParams | null>(null)
    const isAiSearchRef = useRef(false)

    /**
     * Search skills using keywords
     */
    const search = useCallback(async (query: string, category?: string) => {
        setLoading(true)
        setError(null)
        setPage(1)
        isAiSearchRef.current = false
        searchParamsRef.current = { query, category, page: 1, pageSize }

        try {
            const response = await clientRef.current.search(searchParamsRef.current)
            setSkills(response.skills)
            setTotal(response.total)
            setHasMore(response.hasMore)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Search failed'
            setError(message)
            setSkills([])
        } finally {
            setLoading(false)
        }
    }, [pageSize])

    /**
     * Search skills using AI semantic search
     */
    const aiSearch = useCallback(async (query: string) => {
        setLoading(true)
        setError(null)
        setPage(1)
        isAiSearchRef.current = true
        searchParamsRef.current = { query, page: 1, pageSize }

        try {
            const response = await clientRef.current.aiSearch(query, 1, pageSize)
            setSkills(response.skills)
            setTotal(response.total)
            setHasMore(response.hasMore)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'AI search failed'
            setError(message)
            setSkills([])
        } finally {
            setLoading(false)
        }
    }, [pageSize])

    /**
     * Load more results (pagination)
     */
    const loadMore = useCallback(async () => {
        if (loading || !hasMore || !searchParamsRef.current) return

        setLoading(true)
        const nextPage = page + 1

        try {
            let response
            if (isAiSearchRef.current) {
                response = await clientRef.current.aiSearch(
                    searchParamsRef.current.query,
                    nextPage,
                    pageSize
                )
            } else {
                response = await clientRef.current.search({
                    ...searchParamsRef.current,
                    page: nextPage
                })
            }

            setSkills(prev => [...prev, ...response.skills])
            setPage(nextPage)
            setHasMore(response.hasMore)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Load more failed'
            setError(message)
        } finally {
            setLoading(false)
        }
    }, [loading, hasMore, page, pageSize])

    /**
     * Load categories
     */
    const loadCategories = useCallback(async () => {
        try {
            const cats = await clientRef.current.getCategories()
            setCategories(cats)
        } catch (err) {
            console.error('Failed to load categories:', err)
        }
    }, [])

    /**
     * Reset state
     */
    const reset = useCallback(() => {
        setSkills([])
        setCategories([])
        setLoading(false)
        setError(null)
        setHasMore(false)
        setTotal(0)
        setPage(1)
        searchParamsRef.current = null
    }, [])

    return {
        skills,
        categories,
        loading,
        error,
        hasMore,
        total,
        page,
        search,
        aiSearch,
        loadMore,
        loadCategories,
        reset,
        client: clientRef.current
    }
}
