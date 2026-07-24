import { useCallback, useState } from 'react'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kn/ui'
import { Blocks, Download, Loader2, Search } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import { getPluginList, type PluginCategory, type PluginVO } from '@/api'
import { usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 12

const CATEGORY_LABEL: Record<string, string> = {
  FEATURE: '功能扩展',
  APP: '应用',
  CONNECTOR: '连接器',
}

const STATUS_META: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'muted' }> = {
  PENDING: { label: '待审核', variant: 'warning' },
  IN_PROGRESS: { label: '审核中', variant: 'warning' },
  REJECTED: { label: '已驳回', variant: 'danger' },
  DONE: { label: '已上架', variant: 'success' },
}

export const PluginList = () => {
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const fetcher = useCallback(
    (current: number) =>
      getPluginList({
        current,
        pageSize: PAGE_SIZE,
        searchValue: search || undefined,
        category: categoryFilter === 'all' ? undefined : (categoryFilter as PluginCategory),
      }),
    [search, categoryFilter],
  )
  const { records, total, pages, current, setCurrent, loading, error } = usePagedData<PluginVO>(
    fetcher,
    [search, categoryFilter],
  )

  return (
    <div>
      <PageHeader title="插件管理" description="管理平台插件的上架、审核与安装情况" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索插件名称（回车）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(keyword.trim())}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            <SelectItem value="FEATURE">功能扩展</SelectItem>
            <SelectItem value="APP">应用</SelectItem>
            <SelectItem value="CONNECTOR">连接器</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 个插件</span>
      </div>

      {loading && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {!loading && error && (
        <div className="flex h-40 items-center justify-center text-destructive">{error}</div>
      )}
      {!loading && !error && records.length === 0 && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">暂无插件</div>
      )}

      {!loading && !error && records.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {records.map((plugin) => {
            const meta = STATUS_META[plugin.status || ''] || { label: plugin.status || '-', variant: 'muted' as const }
            return (
              <Card key={plugin.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {plugin.icon ? (
                        <img src={plugin.icon} alt={plugin.name} className="size-9 rounded-lg object-cover" />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Blocks className="size-5" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-base">{plugin.name}</CardTitle>
                        <CardDescription className="font-mono text-xs">{plugin.pluginKey || '-'}</CardDescription>
                      </div>
                    </div>
                    <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-2 line-clamp-2 min-h-8 text-xs text-muted-foreground">
                    {plugin.description || '暂无描述'}
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-3">
                      {plugin.currentVersion?.version && <Badge variant="outline">v{plugin.currentVersion.version}</Badge>}
                      <Badge variant="secondary">{CATEGORY_LABEL[plugin.category || ''] || plugin.category || '-'}</Badge>
                    </div>
                    <span className="flex items-center gap-1">
                      <Download className="size-3.5" />
                      {plugin.installCtn ?? 0}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">开发者：{plugin.developer || plugin.maintainer || '-'}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && !error && pages > 1 && (
        <div className="mt-4">
          <Card>
            <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
          </Card>
        </div>
      )}
    </div>
  )
}
