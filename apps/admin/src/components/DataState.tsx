import { Alert, Card, CardContent, Button, Skeleton } from '@kn/ui'
import { CircleAlert, Inbox, RefreshCw } from '@kn/icon'

interface DataStateProps {
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyText?: string
  /** 骨架行数，默认 3 */
  rows?: number
  onRetry?: () => void
  children: React.ReactNode
}

/**
 * 统一的加载 / 失败 / 空态包装。
 *
 * 运营页面的历史问题之一就是请求失败被渲染成「暂无数据」，这里强制把
 * error 与 empty 分开表达。
 */
export const DataState = ({
  loading,
  error,
  empty,
  emptyText = '暂无数据',
  rows = 3,
  onRetry,
  children,
}: DataStateProps) => {
  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CircleAlert className="size-4" />
          <span className="text-sm">{error}</span>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" />
            重试
          </Button>
        )}
      </Alert>
    )
  }

  if (empty) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Inbox className="size-6" />
          {emptyText}
        </CardContent>
      </Card>
    )
  }

  return <>{children}</>
}
