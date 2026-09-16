import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@kn/ui'
import { LoaderCircle, Palette, Pencil, Plus, Tags, Trash2, Users } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { TablePagination } from '@/components/TablePagination'
import { DataState } from '@/components/DataState'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import type { PageResult } from '@/lib/request'
import {
  createOpsTag,
  deleteOpsTag,
  getOpsSubscribers,
  getOpsTags,
  updateOpsTag,
  type OpsSubscriber,
  type OpsTag,
} from '@/api/ops'

type StatusVariant = 'success' | 'warning' | 'danger' | 'muted'

const STATUS_META: Record<string, { label: string; variant: StatusVariant }> = {
  subscribed: { label: '已订阅', variant: 'success' },
  unsubscribed: { label: '已退订', variant: 'muted' },
  bounced: { label: '退信', variant: 'danger' },
  pending: { label: '待确认', variant: 'warning' },
}

const statusMeta = (status: string) => STATUS_META[status] ?? { label: status || '-', variant: 'muted' as StatusVariant }

const DEFAULT_TAG_COLOR = '#64748b'

interface TagForm {
  tag: string
  color: string
  description: string
}

const emptyTagForm: TagForm = { tag: '', color: DEFAULT_TAG_COLOR, description: '' }

export const Audience = () => {
  const { canManage } = useOpsPermission()

  const tagsState = useAsync(() => getOpsTags(), [])
  const tags = tagsState.data ?? []

  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [sizes, setSizes] = useState<Record<number, number>>({})

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OpsTag | null>(null)
  const [form, setForm] = useState<TagForm>(emptyTagForm)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<OpsTag | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 人群规模：每个标签各发一次 size=1 的统计请求，用一次 Promise.all 并发完成。
  // 依赖 tagsState.data 而不是 `tags`，避免 data 为 null 时 `?? []` 每次渲染产生新数组导致死循环。
  useEffect(() => {
    const list = tagsState.data ?? []
    const withIds = list.filter((tag): tag is OpsTag & { id: number } => typeof tag.id === 'number')
    if (withIds.length === 0) {
      setSizes({})
      return
    }
    let cancelled = false
    Promise.all(
      withIds.map(async (tag) => {
        try {
          const res = await getOpsSubscribers({ current: 1, size: 1, tagId: tag.id })
          return [tag.id, res?.total ?? 0] as const
        } catch {
          return [tag.id, -1] as const
        }
      }),
    ).then((entries) => {
      if (!cancelled) setSizes(Object.fromEntries(entries) as Record<number, number>)
    })
    return () => {
      cancelled = true
    }
  }, [tagsState.data])

  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData(
    (page) =>
      selectedTagId === null
        ? Promise.resolve<PageResult<OpsSubscriber>>({ records: [], total: 0, size: 20, current: page, pages: 0 })
        : getOpsSubscribers({ current: page, size: 20, tagId: selectedTagId }),
    [selectedTagId],
  )

  const selectedTag = tags.find((tag) => tag.id === selectedTagId) ?? null

  const openCreate = () => {
    setEditing(null)
    setForm(emptyTagForm)
    setDialogOpen(true)
  }

  const openEdit = (tag: OpsTag) => {
    setEditing(tag)
    setForm({ tag: tag.tag ?? '', color: tag.color || DEFAULT_TAG_COLOR, description: tag.description ?? '' })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.tag.trim()) {
      toast.error('请填写标签名称')
      return
    }
    setSaving(true)
    try {
      const payload = {
        tag: form.tag.trim(),
        color: form.color || undefined,
        description: form.description || undefined,
      }
      if (editing?.id !== undefined) {
        await updateOpsTag(editing.id, payload)
        toast.success('标签已更新')
      } else {
        await createOpsTag(payload)
        toast.success('标签已创建')
      }
      setDialogOpen(false)
      tagsState.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (deleteTarget?.id === undefined) return
    setDeleting(true)
    try {
      await deleteOpsTag(deleteTarget.id)
      toast.success('已删除')
      if (selectedTagId === deleteTarget.id) setSelectedTagId(null)
      setDeleteTarget(null)
      tagsState.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="人群与标签"
        description="维护订阅者标签，并按标签查看对应人群"
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              新建标签
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>标签</CardTitle>
            <CardDescription>共 {tags.length} 个标签，点击标签查看人群</CardDescription>
          </CardHeader>
          <CardContent>
            <DataState
              loading={tagsState.loading}
              error={tagsState.error}
              empty={tags.length === 0}
              emptyText="暂无标签"
              onRetry={tagsState.reload}
            >
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标签</TableHead>
                      <TableHead>颜色</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead className="text-right">人群规模</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tags.map((tag) => (
                      <TableRow
                        key={tag.id ?? tag.tag}
                        data-state={tag.id === selectedTagId ? 'selected' : undefined}
                        className={tag.id === selectedTagId ? 'bg-muted/60' : undefined}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 font-medium hover:underline"
                            onClick={() => setSelectedTagId(tag.id ?? null)}
                          >
                            <Tags className="size-3.5 text-muted-foreground" />
                            {tag.tag}
                          </button>
                        </TableCell>
                        <TableCell>
                          <span
                            className="inline-block size-4 rounded-full border align-middle"
                            style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }}
                            title={tag.color || DEFAULT_TAG_COLOR}
                          />
                        </TableCell>
                        <TableCell className="max-w-56 truncate text-muted-foreground" title={tag.description}>
                          {tag.description || '-'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {tag.id !== undefined && sizes[tag.id] !== undefined && sizes[tag.id] >= 0
                            ? sizes[tag.id]
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="查看人群"
                              onClick={() => setSelectedTagId(tag.id ?? null)}
                            >
                              <Users className="size-4" />
                            </Button>
                            {canManage && (
                              <>
                                <Button variant="ghost" size="sm" title="编辑" onClick={() => openEdit(tag)}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" title="删除" onClick={() => setDeleteTarget(tag)}>
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </DataState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>该标签下的人群</CardTitle>
            <CardDescription>
              {selectedTag ? `标签「${selectedTag.tag}」下的订阅者` : '请选择左侧标签'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedTagId === null ? (
              <p className="py-16 text-center text-sm text-muted-foreground">请选择左侧标签查看人群</p>
            ) : (
              <DataState
                loading={loading}
                error={error}
                empty={records.length === 0}
                emptyText="该标签下暂无订阅者"
                onRetry={reload}
              >
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>邮箱</TableHead>
                        <TableHead>来源页</TableHead>
                        <TableHead>UTM</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((row) => {
                        const meta = statusMeta(row.status)
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.email}</TableCell>
                            <TableCell className="max-w-40 truncate text-muted-foreground" title={row.sourcePath}>
                              {row.sourcePath || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {[row.utmSource, row.utmMedium, row.utmCampaign].filter(Boolean).join(' / ') || '-'}
                            </TableCell>
                            <TableCell>
                              <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{formatDateTime(row.createTime)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
                </div>
              </DataState>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 新建 / 编辑标签 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑标签' : '新建标签'}</DialogTitle>
            <DialogDescription>标签用于订阅者分层与邮件人群筛选。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tag-name">标签名称</Label>
              <Input
                id="tag-name"
                value={form.tag}
                placeholder="如：付费意向"
                onChange={(e) => setForm((prev) => ({ ...prev, tag: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tag-color">颜色</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="tag-color"
                  type="color"
                  className="h-9 w-16 p-1"
                  value={form.color}
                  onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                />
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Palette className="size-4" />
                  {form.color}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tag-description">描述</Label>
              <Textarea
                id="tag-description"
                rows={3}
                value={form.description}
                placeholder="可选，说明该标签的口径"
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除二次确认 */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除标签</DialogTitle>
            <DialogDescription>
              确认删除标签「{deleteTarget?.tag}」？该标签与订阅者的关联会一并移除。
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
    </div>
  )
}
