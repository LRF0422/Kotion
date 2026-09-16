import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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
  Textarea,
  toast,
} from '@kn/ui'
import { Check, Download, LoaderCircle, Search, Tags, Trash2, Upload, X } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { TablePagination } from '@/components/TablePagination'
import { DataState } from '@/components/DataState'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import { getAccessToken } from '@/lib/auth'
import {
  batchUpdateOpsSubscribers,
  deleteOpsSubscriber,
  getOpsSubscribers,
  getOpsSubscribersExportUrl,
  getOpsTags,
  importOpsSubscribers,
  setOpsSubscriberTags,
  updateOpsSubscriber,
  type OpsSubscriber,
} from '@/api/ops'

type StatusVariant = 'success' | 'warning' | 'danger' | 'muted'

/** 订阅状态口径：subscribed / unsubscribed / bounced / pending */
const STATUS_META: Record<string, { label: string; variant: StatusVariant }> = {
  subscribed: { label: '已订阅', variant: 'success' },
  unsubscribed: { label: '已退订', variant: 'muted' },
  bounced: { label: '退信', variant: 'danger' },
  pending: { label: '待确认', variant: 'warning' },
}

const statusMeta = (status: string) => STATUS_META[status] ?? { label: status || '-', variant: 'muted' as StatusVariant }

/** 顶部筛选：额外提供「全部状态」 */
const FILTER_STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'subscribed', label: '已订阅' },
  { value: 'unsubscribed', label: '已退订' },
  { value: 'bounced', label: '退信' },
  { value: 'pending', label: '待确认' },
]

/** 批量流转 / 导入：不允许「全部状态」 */
const FLOW_STATUS_OPTIONS = FILTER_STATUS_OPTIONS.filter((option) => option.value !== 'all')

const pad = (n: number) => String(n).padStart(2, '0')

const exportFilename = () => {
  const now = new Date()
  return `landing-subscribers-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`
}

/** 导出 CSV：带 Bearer 鉴权，走 Blob 下载（不再依赖裸 fetch）。 */
const downloadSubscribersCsv = async (params: { status?: string; tagId?: number; utmSource?: string }) => {
  const token = getAccessToken()
  const res = await fetch(getOpsSubscribersExportUrl(params), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('导出失败')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = exportFilename()
  link.click()
  URL.revokeObjectURL(url)
}

export const Subscribers = () => {
  const { canManage } = useOpsPermission()

  const [statusValue, setStatusValue] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [tagId, setTagId] = useState<number | null>(null)
  const [utmInput, setUtmInput] = useState('')
  const [utmSource, setUtmSource] = useState('')
  const [exporting, setExporting] = useState(false)

  // 搜索防抖：输入即时反馈，300ms 后才驱动分页请求。
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchValue(inputValue), 300)
    return () => window.clearTimeout(timer)
  }, [inputValue])

  // 渠道防抖：同样 300ms。
  useEffect(() => {
    const timer = window.setTimeout(() => setUtmSource(utmInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [utmInput])

  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData(
    (page) =>
      getOpsSubscribers({
        current: page,
        size: 20,
        status: statusValue || undefined,
        search: searchValue || undefined,
        tagId: tagId ?? undefined,
        utmSource: utmSource || undefined,
      }),
    [statusValue, searchValue, tagId, utmSource],
  )

  const tagsState = useAsync(() => getOpsTags(), [])
  const tags = tagsState.data ?? []

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [batchStatus, setBatchStatus] = useState('subscribed')
  const [batchWorking, setBatchWorking] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<OpsSubscriber | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [tagTarget, setTagTarget] = useState<OpsSubscriber | null>(null)
  const [tagSelection, setTagSelection] = useState<number[]>([])
  const [savingTags, setSavingTags] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importCsv, setImportCsv] = useState('')
  const [importSource, setImportSource] = useState('')
  const [importStatus, setImportStatus] = useState('subscribed')
  const [importing, setImporting] = useState(false)

  // 筛选 / 翻页后清空选择，避免对不可见行批量操作。
  useEffect(() => {
    setSelectedIds([])
  }, [statusValue, searchValue, tagId, utmSource, current])

  const allChecked = records.length > 0 && records.every((row) => selectedIds.includes(row.id))

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? records.map((row) => row.id) : [])
  }

  const toggleOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)))
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      await downloadSubscribersCsv({
        status: statusValue || undefined,
        tagId: tagId ?? undefined,
        utmSource: utmSource || undefined,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const toggleStatus = async (row: OpsSubscriber, next: string) => {
    try {
      await updateOpsSubscriber(row.id, { status: next })
      toast.success('已更新')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteOpsSubscriber(deleteTarget.id)
      toast.success('已删除')
      setDeleteTarget(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const applyBatchStatus = async () => {
    if (selectedIds.length === 0) return
    setBatchWorking(true)
    try {
      await batchUpdateOpsSubscribers({ ids: selectedIds, status: batchStatus })
      toast.success(`已更新 ${selectedIds.length} 条`)
      setSelectedIds([])
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '批量更新失败')
    } finally {
      setBatchWorking(false)
    }
  }

  const openTagDialog = (row: OpsSubscriber) => {
    setTagTarget(row)
    setTagSelection(row.tagIds ?? [])
  }

  const saveTags = async () => {
    if (!tagTarget) return
    setSavingTags(true)
    try {
      await setOpsSubscriberTags(tagTarget.id, tagSelection)
      toast.success('标签已保存')
      setTagTarget(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingTags(false)
    }
  }

  const submitImport = async () => {
    if (!importCsv.trim()) {
      toast.error('请粘贴 CSV 内容')
      return
    }
    setImporting(true)
    try {
      const res = await importOpsSubscribers({
        csv: importCsv,
        source: importSource || undefined,
        status: importStatus || undefined,
      })
      toast.success(`新增 ${res?.imported ?? 0} / 重复 ${res?.duplicated ?? 0} / 无效 ${res?.invalid ?? 0}`)
      setImportOpen(false)
      setImportCsv('')
      setImportSource('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="订阅线索"
        description="落地页「订阅更新」收集的邮箱，可按渠道归因并导出"
        actions={
          <div className="flex items-center gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1.5 size-4" />
                导入 CSV
              </Button>
            )}
            <Button variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
              导出 CSV
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select value={statusValue || 'all'} onValueChange={(value) => setStatusValue(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                {FILTER_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="搜索邮箱或备注"
                className="w-56 pl-8"
              />
            </div>

            <Select
              value={tagId === null ? 'all' : String(tagId)}
              onValueChange={(value) => setTagId(value === 'all' ? null : Number(value))}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="全部标签" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部标签</SelectItem>
                {tags.map((tag) =>
                  tag.id === undefined ? null : (
                    <SelectItem key={tag.id} value={String(tag.id)}>{tag.tag}</SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>

            <Input
              value={utmInput}
              onChange={(e) => setUtmInput(e.target.value)}
              placeholder="utm_source（如 zhihu）"
              className="w-48"
            />

            {canManage && selectedIds.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">已选 {selectedIds.length} 条</span>
                <Select value={batchStatus} onValueChange={setBatchStatus}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="目标状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {FLOW_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => void applyBatchStatus()} disabled={batchWorking}>
                  {batchWorking && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
                  应用到 {selectedIds.length} 条
                </Button>
              </div>
            )}
          </div>

          <DataState
            loading={loading}
            error={error}
            empty={records.length === 0}
            emptyText="暂无订阅"
            onRetry={reload}
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canManage && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(checked) => toggleAll(checked === true)}
                          aria-label="全选"
                        />
                      </TableHead>
                    )}
                    <TableHead>邮箱</TableHead>
                    <TableHead>来源渠道</TableHead>
                    <TableHead>落地页</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((row) => {
                    const meta = statusMeta(row.status)
                    return (
                      <TableRow key={row.id}>
                        {canManage && (
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(row.id)}
                              onCheckedChange={(checked) => toggleOne(row.id, checked === true)}
                              aria-label={`选择 ${row.email}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{row.email}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {[row.utmSource, row.utmMedium, row.utmCampaign].filter(Boolean).join(' / ') || '-'}
                        </TableCell>
                        <TableCell className="max-w-40 truncate text-muted-foreground" title={row.sourcePath}>
                          {row.sourcePath || '-'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDateTime(row.createTime)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canManage && (
                              <>
                                {row.status === 'subscribed' ? (
                                  <Button variant="ghost" size="sm" onClick={() => void toggleStatus(row, 'unsubscribed')} title="标记退订">
                                    <X className="size-4" />
                                  </Button>
                                ) : (
                                  <Button variant="ghost" size="sm" onClick={() => void toggleStatus(row, 'subscribed')} title="恢复订阅">
                                    <Check className="size-4" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => openTagDialog(row)} title="打标">
                                  <Tags className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)} title="删除">
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
            </div>
          </DataState>
        </CardContent>
      </Card>

      {/* 删除二次确认 */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除订阅</DialogTitle>
            <DialogDescription>
              确认删除「{deleteTarget?.email}」？该操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 打标 */}
      <Dialog open={Boolean(tagTarget)} onOpenChange={(open) => (!open ? setTagTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>打标签</DialogTitle>
            <DialogDescription>{tagTarget?.email}</DialogDescription>
          </DialogHeader>
          {tagsState.error ? (
            <p className="text-sm text-destructive">{tagsState.error}</p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无可用标签，请先到「人群与标签」创建。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) =>
                tag.id === undefined ? null : (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      setTagSelection((prev) =>
                        prev.includes(tag.id as number)
                          ? prev.filter((item) => item !== tag.id)
                          : [...prev, tag.id as number],
                      )
                    }
                    className={
                      tagSelection.includes(tag.id)
                        ? 'rounded-full border border-primary bg-primary px-3 py-1 text-xs text-primary-foreground'
                        : 'rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted'
                    }
                  >
                    {tag.tag}
                  </button>
                ),
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={savingTags} onClick={() => setTagTarget(null)}>取消</Button>
            <Button disabled={savingTags || tags.length === 0} onClick={() => void saveTags()}>
              {savingTags && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV 导入 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导入订阅</DialogTitle>
            <DialogDescription>
              粘贴 CSV 文本，第一列为邮箱；重复邮箱会被跳过。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="subscriber-import-csv">CSV 内容</Label>
              <Textarea
                id="subscriber-import-csv"
                value={importCsv}
                rows={6}
                placeholder={'email\na@example.com\nb@example.com'}
                onChange={(e) => setImportCsv(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subscriber-import-source">来源（可选）</Label>
              <Input
                id="subscriber-import-source"
                value={importSource}
                placeholder="如：newsletter-import"
                onChange={(e) => setImportSource(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>初始状态</Label>
              <Select value={importStatus} onValueChange={setImportStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="初始状态" />
                </SelectTrigger>
                <SelectContent>
                  {FLOW_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={importing} onClick={() => setImportOpen(false)}>取消</Button>
            <Button disabled={importing} onClick={() => void submitImport()}>
              {importing && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
