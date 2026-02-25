import { useState, useEffect, useCallback, useRef } from 'react'
import { PluginConfigStore } from '@kn/core'
import type { GitHubPluginConfig } from '../types/config'
import { DEFAULT_GITHUB_CONFIG } from '../types/config'
import { GITHUB_PLUGIN_KEY } from './use-github-config'

interface UseGitHubDataOptions<T> {
    fetcher: (token: string) => Promise<T>
    lastSyncAt?: string
    enabled?: boolean
}

interface UseGitHubDataResult<T> {
    data: T | null
    loading: boolean
    error: string | null
    token: string | null
    refresh: () => void
}

export function useGitHubData<T>(options: UseGitHubDataOptions<T>): UseGitHubDataResult<T> {
    const { fetcher, lastSyncAt, enabled = true } = options
    const [data, setData] = useState<T | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [config, setConfig] = useState<GitHubPluginConfig>(DEFAULT_GITHUB_CONFIG)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const fetcherRef = useRef(fetcher)
    const fetchedRef = useRef(false)

    // Keep fetcherRef up to date without triggering re-renders
    fetcherRef.current = fetcher

    // Load config
    useEffect(() => {
        let cancelled = false
        const store = PluginConfigStore.getInstance()
        const load = async () => {
            await store.initialize()
            const saved = await store.getConfig<GitHubPluginConfig>(GITHUB_PLUGIN_KEY)
            if (!cancelled && saved) {
                setConfig({ ...DEFAULT_GITHUB_CONFIG, ...saved })
            }
        }
        load()
        const unsub = store.subscribe(GITHUB_PLUGIN_KEY, (updated) => {
            if (!cancelled) setConfig({ ...DEFAULT_GITHUB_CONFIG, ...updated })
        })
        return () => { cancelled = true; unsub() }
    }, [])

    const fetchData = useCallback(async () => {
        if (!config.personalAccessToken || !enabled) return
        setLoading(true)
        setError(null)
        try {
            const result = await fetcherRef.current(config.personalAccessToken)
            setData(result)
        } catch (err: any) {
            const msg = err.status === 404 ? 'Not found'
                : err.status === 401 ? 'Authentication failed'
                : err.status === 403 ? 'Rate limit exceeded or access denied'
                : err.message || 'Failed to fetch data'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }, [config.personalAccessToken, enabled])

    // Initial fetch
    useEffect(() => {
        if (fetchedRef.current) return
        if (config.personalAccessToken && enabled) {
            fetchedRef.current = true
            fetchData()
        }
    }, [fetchData])

    // Auto refresh
    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current)
        if (config.autoRefreshEnabled && config.personalAccessToken && enabled) {
            const interval = config.autoRefreshIntervalMinutes * 60 * 1000
            intervalRef.current = setInterval(fetchData, interval)
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }, [config.autoRefreshEnabled, config.autoRefreshIntervalMinutes, config.personalAccessToken, fetchData, enabled])

    return { data, loading, error, token: config.personalAccessToken || null, refresh: fetchData }
}
