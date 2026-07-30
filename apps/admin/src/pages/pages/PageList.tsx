import { useCallback, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Checkbox,
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
import { Search, Loader2, FileText, RotateCcw, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import {
  batchDeletePages,
  batchRestorePages,
  getAdminPageList,
  restorePage,
  type PageStatus,
  type PageVO,
} from '@/api'
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchWorking, setBatchWorking] = useState(false)

  const fetcher = useCallback(
    (current: number) =>
      getAdminPageList({
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

  // 仅回收站视图支持批量选择
  const selectable = statusFilter === 'TRASH'
  const allChecked = records.length > 0 && records.every((page) => selected.has(String(page.id)))

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(records.map((page) => String(page.id))) : new Set())
  }

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const clearAndReload = () => {
    setSelected(new Set())
    reload()
  }

  const handleRestore = async (page: PageVO) => {
    try {
      await restorePage(String(page.id))
      toast({ title: '页面已恢复', description: page.title })
      clearAndReload()
    } catch (err) {
      toast({ title: '恢复失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const handleBatchRestore = async () => {
    if (selected.size === 0) return
    setBatchWorking(true)
    try {
      await batchRestorePages([...selected].join(','))
      toast({ title: `已恢复 ${selected.size} 个页面` })
      clearAndReload()
    } catch (err) {
      toast({ title: '批量恢复失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBatchWorking(false)
    }
  }

  const handleBatchDelete = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`确认彻底删除选中的 ${selected.size} 个页面？该操作不可恢复。`)) return
    setBatchWorking(true)
    try {
      await batchDeletePages([...selected].join(','))
      toast({ title: `已彻底删除 ${selected.size} 个页面` })
      clearAndReload()
    } catch (err) {
      toast({ title: '批量删除失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBatchWorking(false)
    }
  }

  const colSpan = selectable ? 7 : 6

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
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value)
            setSelected(new Set())
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="ACTIVE">已发布</SelectItem>
            <SelectItem value="DRAFT">草稿</SelectItem>
            <SelectItem value="TRASH">回收站</SelectItem>
          </SelectContent>
        </Select>
        {selectable && selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">已选 {selected.size} 项</span>
            <Button variant="outline" size="sm" onClick={handleBatchRestore} disabled={batchWorking}>
              {batchWorking ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <RotateCcw className="mr-1 size-3.5" />}
              批量恢复
            </Button>
            <Button variant="destructive" size="sm" onClick={handleBatchDelete} disabled={batchWorking}>
              <Trash2 className="mr-1 size-3.5" />
              彻底删除
            </Button>
          </div>
        )}
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 个页面</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="全选"
                    />
                  </TableHead>
                )}
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
                  <TableCell colSpan={colSpan} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="h-32 text-center text-destructive">{error}</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="h-32 text-center text-muted-foreground">暂无页面</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((page) => {
                const badge = STATUS_BADGE[page.status || 'ACTIVE'] || STATUS_BADGE.ACTIVE
                const id = String(page.id)
                return (
                  <TableRow key={page.id}>
                    {selectable && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(id)}
                          onCheckedChange={(checked) => toggleOne(id, checked === true)}
                          aria-label="选择页面"
                        />
                      </TableCell>
                    )}
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
