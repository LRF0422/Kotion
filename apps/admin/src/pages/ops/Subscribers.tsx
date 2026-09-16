import { useState } from 'react'
import { Button, Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from '@kn/ui'
import { Download, Loader2, Trash2, UserCheck, UserX } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { TablePagination } from '@/components/TablePagination'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'
import { getAccessToken } from '@/lib/auth'
import {
  deleteOpsSubscriber,
  getOpsSubscribers,
  getOpsSubscribersExportUrl,
  updateOpsSubscriber,
} from '@/api/ops'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'subscribed', label: '已订阅' },
  { value: 'unsubscribed', label: '已退订' },
  { value: 'bounced', label: '退信' },
]

export const Subscribers = () => {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)

  const { records, total, pages, current, setCurrent, loading, reload } = usePagedData(
    (page) =>
      getOpsSubscribers({
        current: page,
        size: 20,
        status: status || undefined,
        search: search || undefined,
      }),
    [status, search],
  )

  const exportCsv = async () => {
    setExporting(true)
    try {
      const token = getAccessToken()
      const res = await fetch(getOpsSubscribersExportUrl(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('导出失败')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'landing-subscribers.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const toggleStatus = async (id: number, next: string) => {
    try {
      await updateOpsSubscriber(id, { status: next })
      toast.success('已更新')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    }
  }

  const remove = async (id: number) => {
    try {
      await deleteOpsSubscriber(id)
      toast.success('已删除')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <div>
      <PageHeader
        title="订阅线索"
        description="落地页「订阅更新」收集的邮箱，可按渠道归因并导出"
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
            导出 CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索邮箱或备注"
              className="w-56 rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>邮箱</TableHead>
                  <TableHead>来源渠道</TableHead>
                  <TableHead>落地页</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto size-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && records.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">暂无订阅</TableCell>
                  </TableRow>
                )}
                {!loading && records.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[row.utmSource, row.utmMedium, row.utmCampaign].filter(Boolean).join(' / ') || '-'}
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground" title={row.sourcePath}>
                      {row.sourcePath || '-'}
                    </TableCell>
                    <TableCell>
                      <span className={row.status === 'subscribed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(row.createTime)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {row.status === 'subscribed' ? (
                          <Button variant="ghost" size="sm" onClick={() => toggleStatus(row.id, 'unsubscribed')} title="标记退订">
                            <UserX className="size-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => toggleStatus(row.id, 'subscribed')} title="恢复订阅">
                            <UserCheck className="size-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => remove(row.id)} title="删除">
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
