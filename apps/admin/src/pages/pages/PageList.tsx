import { useCallback, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@kn/ui'
import { Search, Loader2, FileText, RotateCcw } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import { getPageList, restorePage, type PageStatus, type PageVO } from '@/api'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

const STATUS_BADGE: Record<PageStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'muted' }> = {
  ACTIVE: { label: '已发布', variant: 'success' },
  DRAFT: { label: '草稿', variant: 'warning' },
  TRASH: { label: '回收站', variant: 'danger' },
  DELETED: { label: '已删除', variant: 'muted' },
}

export const PageList = () => {
  const { toast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE')

  const fetcher = useCallback(
    (current: number) =>
      getPageList({
        current,
        pageSize: PAGE_SIZE,
        searchValue: search || undefined,
        status: statusFilter === 'all' ? undefined : (statusFilter as PageStatus),
      }),
    [search, statusFilter],
  )
  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData<PageVO>(
    fetcher,
    [search, statusFilter],
  )

  const handleRestore = async (page: PageVO) => {
    try {
      await restorePage(String(page.id))
      toast({ title: '页面已恢复', description: page.title })
      reload()
    } catch (err) {
      toast({ title: '恢复失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div>
      <PageHeader title="页面管理" description="平台内页面内容的状态与治理" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索页面标题（回车）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(keyword.trim())}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">已发布</SelectItem>
            <SelectItem value="DRAFT">草稿</SelectItem>
            <SelectItem value="TRASH">回收站</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 个页面</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>页面标题</TableHead>
                <TableHead>所属空间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">创建时间</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-destructive">{error}</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">暂无页面</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((page) => {
                const badge = STATUS_BADGE[page.status || 'ACTIVE'] || STATUS_BADGE.ACTIVE
                return (
                  <TableRow key={page.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="max-w-72 truncate">{page.title || '（无标题）'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{page.spaceId || '-'}</TableCell>
                    <TableCell>
                      <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(page.updateTime)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDateTime(page.createTime)}</TableCell>
                    <TableCell className="text-right">
                      {page.status === 'TRASH' && (
                        <Button variant="outline" size="sm" onClick={() => handleRestore(page)}>
                          <RotateCcw className="mr-1 size-3.5" />
                          恢复
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
        </CardContent>
      </Card>
    </div>
  )
}
