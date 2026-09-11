import { useCallback, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  useToast,
} from '@kn/ui'
import { Check, Loader2, X } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import {
  getAdminPluginReportList,
  handleAdminPluginReport,
  type PluginReportStatus,
  type PluginReportVO,
} from '@/api'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

const REPORT_REASON_LABEL: Record<string, string> = {
  MALICIOUS: '恶意代码或行为',
  PRIVACY: '隐私与数据问题',
  COPYRIGHT: '侵权或抄袭',
  SPAM: '垃圾或误导信息',
  OTHER: '其他',
}

const REPORT_STATUS_META: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }
> = {
  PENDING: { label: '待处理', variant: 'warning' },
  RESOLVED: { label: '已采纳', variant: 'success' },
  REJECTED: { label: '已驳回', variant: 'muted' },
}

const getEnumValue = (value: unknown) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'value' in value) {
    const enumValue = (value as { value?: unknown }).value
    return typeof enumValue === 'string' ? enumValue : undefined
  }
  return undefined
}

const REPORT_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'PENDING', label: '待处理' },
  { value: 'RESOLVED', label: '已采纳' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'all', label: '全部' },
]

export const PluginReports = () => {
  const { toast } = useToast()
  const [statusTab, setStatusTab] = useState('PENDING')
  const [handleTarget, setHandleTarget] = useState<PluginReportVO | null>(null)
  const [handleApproved, setHandleApproved] = useState(true)
  const [handleNote, setHandleNote] = useState('')
  const [handling, setHandling] = useState(false)

  const fetcher = useCallback(
    (current: number) =>
      getAdminPluginReportList({
        current,
        pageSize: PAGE_SIZE,
        status: statusTab === 'all' ? undefined : (statusTab as PluginReportStatus),
      }),
    [statusTab],
  )
  const { records, total, pages, current, setCurrent, loading, error, reload } =
    usePagedData<PluginReportVO>(fetcher, [statusTab])

  const openHandle = (report: PluginReportVO, approved: boolean) => {
    setHandleTarget(report)
    setHandleApproved(approved)
    setHandleNote('')
  }

  const submitHandle = async () => {
    if (!handleTarget || handling) return
    setHandling(true)
    try {
      await handleAdminPluginReport(handleTarget.id, {
        approved: handleApproved,
        note: handleNote.trim() || undefined,
      })
      toast({ title: handleApproved ? '已采纳举报' : '已驳回举报' })
      setHandleTarget(null)
      setHandleNote('')
      reload()
    } catch (err) {
      toast({
        title: '处理失败',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setHandling(false)
    }
  }

  return (
    <div>
      <PageHeader title="插件举报" description="处理用户对插件（恶意行为、隐私、侵权等）的举报" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            {REPORT_STATUS_FILTERS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 条举报</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>插件</TableHead>
                <TableHead>举报原因</TableHead>
                <TableHead>补充说明</TableHead>
                <TableHead>举报人</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">举报时间</TableHead>
                <TableHead className="w-44 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="space-y-3">
                      <div className="text-destructive">{error}</div>
                      <Button size="sm" variant="outline" onClick={reload}>重新加载</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    暂无举报
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((report) => {
                const reason = getEnumValue(report.reasonType)
                const status = getEnumValue(report.status)
                const meta = status ? REPORT_STATUS_META[status] : undefined
                return (
                  <TableRow key={report.id}>
                    <TableCell>
                      <div className="font-medium">{report.pluginName || '-'}</div>
                      <div className="max-w-56 truncate font-mono text-xs text-muted-foreground">
                        {report.pluginKey || '-'}
                        {report.version ? ` · v${report.version}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{REPORT_REASON_LABEL[reason || ''] || reason || '-'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <span className="line-clamp-2 text-sm text-muted-foreground">
                        {report.reasonText || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>{report.reporterName || '-'}</div>
                      {report.reporterId && (
                        <div className="text-xs text-muted-foreground">ID: {report.reporterId}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {meta
                        ? <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                        : <StatusBadge variant="muted">{status || '未知'}</StatusBadge>}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTime(report.createTime)}
                    </TableCell>
                    <TableCell>
                      {status === 'PENDING' ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => openHandle(report, false)}>
                            <X className="mr-1 size-4" />
                            驳回
                          </Button>
                          <Button size="sm" onClick={() => openHandle(report, true)}>
                            <Check className="mr-1 size-4" />
                            采纳
                          </Button>
                        </div>
                      ) : (
                        <div className="text-right text-xs text-muted-foreground">
                          {report.handleNote || '-'}
                        </div>
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

      <Dialog open={Boolean(handleTarget)} onOpenChange={(open) => !open && setHandleTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{handleApproved ? '采纳举报' : '驳回举报'}</DialogTitle>
            <DialogDescription>
              {handleApproved
                ? `确认采纳对「${handleTarget?.pluginName || ''}」的举报？如有必要，请到插件审核页执行下架。`
                : `确认驳回对「${handleTarget?.pluginName || ''}」的举报？`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="report-handle-note" className="text-sm font-medium">处理说明</label>
            <Textarea
              id="report-handle-note"
              value={handleNote}
              maxLength={500}
              rows={3}
              placeholder="可选，记录处理依据"
              onChange={(event) => setHandleNote(event.target.value)}
            />
            <div className="text-right text-xs text-muted-foreground">{handleNote.length}/500</div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={handling} onClick={() => setHandleTarget(null)}>取消</Button>
            <Button
              variant={handleApproved ? 'default' : 'destructive'}
              disabled={handling}
              onClick={() => void submitHandle()}
            >
              {handling && <Loader2 className="mr-2 size-4 animate-spin" />}
              {handleApproved ? '确认采纳' : '确认驳回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
