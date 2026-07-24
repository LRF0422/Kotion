import { useCallback, useEffect, useState } from 'react'
import type { PageResult } from '@/lib/request'

const EMPTY_PAGE: PageResult<never> = { records: [], total: 0, size: 10, current: 1, pages: 0 }

/**
 * 分页数据加载 hook：deps 变化时回到第一页并重新请求。
 */
export function usePagedData<T>(
  fetcher: (current: number) => Promise<PageResult<T>>,
  deps: React.DependencyList = [],
) {
  const [result, setResult] = useState<PageResult<T>>(EMPTY_PAGE as PageResult<T>)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState(1)
  const [tick, setTick] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setCurrent(1), deps)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetcher(current)
      .then((res) => {
        if (!cancelled) setResult(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, tick, ...deps])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  return {
    records: result.records ?? [],
    total: result.total ?? 0,
    pages: result.pages ?? 0,
    current,
    setCurrent,
    loading,
    error,
    reload,
  }
}

/** LocalDateTime（ISO）转 'YYYY-MM-DD HH:mm' */
export const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
