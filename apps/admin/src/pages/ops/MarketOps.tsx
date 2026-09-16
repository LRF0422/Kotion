import { useMemo, useState } from 'react'
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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@kn/ui'
import { ArrowDown, ArrowUp, LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { DataState } from '@/components/DataState'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import { get } from '@/lib/request'
import {
  deleteOpsResource,
  getOpsResources,
  saveOpsResource,
  type OpsFeaturedPayload,
  type OpsResource,
} from '@/api/ops'

type CatalogType = 'template' | 'plugin'

interface CatalogItem {
  id: string
  name: string
  description?: string
}

interface SlotDraft {
  resKey: string
  targetType: CatalogType
  targetId: string
  name: string
  badge: string
  blurb: string
  isNew: boolean
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

/**
 * 公开接口的响应是分页包（`{ records: [...] }`），但也兼容直接返回数组的情况。
 * 真实结构见 landing-page 对 `/knowledge-wiki/space/public/templates` 的消费方式。
 */
const pickRecords = (res: unknown): unknown[] => {
  if (Array.isArray(res)) return res
  const records = (res as { records?: unknown } | null | undefined)?.records
  return Array.isArray(records) ? records : []
}

/** 每条记录只保证 id + name，其余字段一律按可选处理。 */
const normalizeItem = (raw: unknown): CatalogItem | null => {
  const record = asRecord(raw)
  if (!record) return null
  const { id, name, description } = record
  if (typeof id !== 'string' && typeof id !== 'number') return null
  const normalizedName = typeof name === 'string' && name.trim() ? name : String(id)
  return {
    id: String(id),
    name: normalizedName,
    description: typeof description === 'string' && description.trim() ? description : undefined,
  }
}

const toCatalogItems = (raw: unknown[]): CatalogItem[] =>
  raw.map(normalizeItem).filter((item): item is CatalogItem => item !== null)

/** 精选位 payload 解析：字段缺失或类型不对时降级，不抛错。 */
const featuredPayloadOf = (slot: OpsResource): OpsFeaturedPayload | null => {
  const record = asRecord(slot.payload)
  if (!record) return null
  const targetType = record.targetType === 'plugin' ? 'plugin' : record.targetType === 'template' ? 'template' : null
  if (!targetType) return null
  const rawTargetId = record.targetId
  if (typeof rawTargetId !== 'string' && typeof rawTargetId !== 'number') return null
  return {
    targetType,
    targetId: String(rawTargetId),
    name: typeof record.name === 'string' ? record.name : undefined,
    badge: typeof record.badge === 'string' ? record.badge : undefined,
    blurb: typeof record.blurb === 'string' ? record.blurb : undefined,
  }
}

/** resKey = `template:<id>` / `plugin:<id>`，payload 缺失时用它兜底。 */
const fallbackPayload = (slot: OpsResource): OpsFeaturedPayload => {
  const separator = slot.resKey.indexOf(':')
  const prefix = separator >= 0 ? slot.resKey.slice(0, separator) : ''
  return {
    targetType: prefix === 'plugin' ? 'plugin' : 'template',
    targetId: separator >= 0 ? slot.resKey.slice(separator + 1) : slot.resKey,
  }
}

const payloadOfSlot = (slot: OpsResource): OpsFeaturedPayload => featuredPayloadOf(slot) ?? fallbackPayload(slot)

const toWritePayload = (payload: OpsFeaturedPayload): Record<string, unknown> => ({
  targetType: payload.targetType,
  targetId: payload.targetId,
  name: payload.name,
  badge: payload.badge,
  blurb: payload.blurb,
})

const slotTargetType = (slot: OpsResource): CatalogType =>
  featuredPayloadOf(slot)?.targetType ?? fallbackPayload(slot).targetType

const slotName = (slot: OpsResource) => featuredPayloadOf(slot)?.name || slot.resKey

export const MarketOps = () => {
  const { canManage } = useOpsPermission()

  const featured = useAsync(() => getOpsResources({ kind: 'FEATURED', locale: 'zh' }), [])
  const catalog = useAsync(async () => {
    // 两个公开接口都走 PageDTO（默认 pageSize=10），显式放大分页参数才能列全可选内容。
    const [tpl, plg] = await Promise.all([
      get<unknown>('/knowledge-wiki/space/public/templates', { current: 1, pageSize: 100 }),
      get<unknown>('/knowledge-wiki/plugin/public/plugins', { current: 1, pageSize: 100 }),
    ])
    return { templates: pickRecords(tpl), plugins: pickRecords(plg) }
  }, [])

  const slots = useMemo(
    () => [...(featured.data ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [featured.data],
  )
  const templates = useMemo(() => toCatalogItems(catalog.data?.templates ?? []), [catalog.data])
  const plugins = useMemo(() => toCatalogItems(catalog.data?.plugins ?? []), [catalog.data])
  const curatedKeys = useMemo(() => new Set(slots.map((slot) => slot.resKey)), [slots])

  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<SlotDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OpsResource | null>(null)
  const [deleting, setDeleting] = useState(false)

  const nextPosition = slots.length
    ? Math.max(...slots.map((slot) => slot.position ?? 0)) + 1
    : 0

  const saveSlot = (slot: OpsResource, patch: Partial<OpsResource> = {}) =>
    saveOpsResource('FEATURED', slot.resKey, {
      locale: slot.locale || 'zh',
      payload: toWritePayload(payloadOfSlot(slot)),
      position: slot.position ?? 0,
      enabled: slot.enabled,
      status: 'PUBLISHED',
      ...patch,
    })

  const toggleEnabled = async (slot: OpsResource, enabled: boolean) => {
    setBusy(true)
    try {
      await saveSlot(slot, { enabled })
      toast.success(enabled ? '已启用' : '已下线')
      featured.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setBusy(false)
    }
  }

  /** 上移 / 下移：立即把重排后的 position 逐条写回（不使用批量接口）。 */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= slots.length) return
    const reordered = [...slots]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    setBusy(true)
    try {
      await Promise.all(reordered.map((slot, position) => saveSlot(slot, { position })))
      toast.success('排序已更新')
      featured.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '排序失败')
    } finally {
      setBusy(false)
    }
  }

  const openAdd = (targetType: CatalogType, item: CatalogItem) => {
    setDraft({
      resKey: `${targetType}:${item.id}`,
      targetType,
      targetId: item.id,
      name: item.name,
      badge: '',
      blurb: '',
      isNew: true,
    })
  }

  const openEdit = (slot: OpsResource) => {
    const payload = payloadOfSlot(slot)
    setDraft({
      resKey: slot.resKey,
      targetType: payload.targetType,
      targetId: payload.targetId,
      name: payload.name ?? '',
      badge: payload.badge ?? '',
      blurb: payload.blurb ?? '',
      isNew: false,
    })
  }

  const submitDraft = async () => {
    if (!draft) return
    const payload: OpsFeaturedPayload = {
      targetType: draft.targetType,
      targetId: draft.targetId,
      name: draft.name.trim() || undefined,
      badge: draft.badge.trim() || undefined,
      blurb: draft.blurb.trim() || undefined,
    }
    const existing = slots.find((slot) => slot.resKey === draft.resKey)
    setSaving(true)
    try {
      await saveOpsResource('FEATURED', draft.resKey, {
        locale: 'zh',
        payload: toWritePayload(payload),
        position: existing?.position ?? nextPosition,
        enabled: existing?.enabled ?? true,
        status: 'PUBLISHED',
      })
      toast.success(draft.isNew ? '已加入精选' : '精选位已更新')
      setDraft(null)
      featured.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmRemove = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteOpsResource('FEATURED', pendingDelete.resKey, pendingDelete.locale || 'zh')
      toast.success('已移出精选')
      setPendingDelete(null)
      featured.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const renderCatalog = (targetType: CatalogType, items: CatalogItem[], emptyText: string) => (
    <DataState
      loading={catalog.loading}
      error={catalog.error}
      onRetry={catalog.reload}
      empty={!catalog.loading && items.length === 0}
      emptyText={emptyText}
    >
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>说明</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const resKey = `${targetType}:${item.id}`
              const curated = curatedKeys.has(resKey)
              return (
                <TableRow key={resKey}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="max-w-72 truncate text-muted-foreground" title={item.description}>
                    {item.description || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {curated ? (
                      <StatusBadge variant="success">已精选</StatusBadge>
                    ) : canManage ? (
                      <Button variant="outline" size="sm" onClick={() => openAdd(targetType, item)}>
                        <Plus className="mr-1.5 size-4" />
                        加入精选
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </DataState>
  )

  return (
    <div>
      <PageHeader
        title="模板 / 插件精选"
        description="配置落地页首屏的模板与插件精选位（landing_resource · FEATURED）"
        actions={
          <Button variant="outline" onClick={featured.reload} disabled={featured.loading}>
            {featured.loading ? (
              <LoaderCircle className="mr-1.5 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 size-4" />
            )}
            刷新
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>当前精选位</CardTitle>
            <CardDescription>
              共 {slots.length} 个，顺序即落地页展示顺序（上移 / 下移会立即保存）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataState
              loading={featured.loading}
              error={featured.error}
              onRetry={featured.reload}
              empty={!featured.loading && slots.length === 0}
              emptyText="暂无精选位，请从右侧「可选内容」加入"
            >
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">排序</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>标识</TableHead>
                      <TableHead>角标</TableHead>
                      <TableHead>一句话</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slots.map((slot, index) => {
                      const targetType = slotTargetType(slot)
                      const payload = featuredPayloadOf(slot)
                      return (
                        <TableRow key={slot.resKey}>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {slot.position ?? index}
                          </TableCell>
                          <TableCell>
                            <StatusBadge variant={targetType === 'template' ? 'info' : 'warning'}>
                              {targetType === 'template' ? '模板' : '插件'}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="max-w-48 truncate font-medium" title={slotName(slot)}>
                            {slotName(slot)}
                          </TableCell>
                          <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground" title={slot.resKey}>
                            {slot.resKey}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{payload?.badge || '-'}</TableCell>
                          <TableCell className="max-w-56 truncate text-muted-foreground" title={payload?.blurb}>
                            {payload?.blurb || '-'}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={slot.enabled}
                              disabled={!canManage || busy}
                              onCheckedChange={(checked) => toggleEnabled(slot, checked)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage && (
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" title="编辑" onClick={() => openEdit(slot)}>
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="上移"
                                  disabled={busy || index === 0}
                                  onClick={() => move(index, -1)}
                                >
                                  <ArrowUp className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="下移"
                                  disabled={busy || index === slots.length - 1}
                                  onClick={() => move(index, 1)}
                                >
                                  <ArrowDown className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="删除"
                                  disabled={busy}
                                  onClick={() => setPendingDelete(slot)}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </DataState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>可选内容</CardTitle>
            <CardDescription>来自公开的模板 / 插件列表，加入后写入 FEATURED 精选位</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="template">
              <TabsList>
                <TabsTrigger value="template">模板</TabsTrigger>
                <TabsTrigger value="plugin">插件</TabsTrigger>
              </TabsList>
              <TabsContent value="template" className="mt-4">
                {renderCatalog('template', templates, '暂无可选模板')}
              </TabsContent>
              <TabsContent value="plugin" className="mt-4">
                {renderCatalog('plugin', plugins, '暂无可选插件')}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.isNew ? '加入精选' : '编辑精选位'}</DialogTitle>
            <DialogDescription>
              {draft?.resKey} · 角标与一句话会展示在落地页精选卡片上
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={draft?.name ?? ''}
                placeholder="展示名称，留空则用标识"
                onChange={(e) => setDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>角标</Label>
              <Input
                value={draft?.badge ?? ''}
                placeholder="如 官方推荐 / 热门"
                onChange={(e) => setDraft((prev) => (prev ? { ...prev, badge: e.target.value } : prev))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>一句话</Label>
              <Textarea
                rows={3}
                value={draft?.blurb ?? ''}
                placeholder="一句话介绍，展示在名称下方"
                onChange={(e) => setDraft((prev) => (prev ? { ...prev, blurb: e.target.value } : prev))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submitDraft} disabled={saving}>
              {saving && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>移出精选</DialogTitle>
            <DialogDescription>
              确认将「{pendingDelete ? slotName(pendingDelete) : ''}」移出精选位？该操作不影响模板 / 插件本身。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={deleting}>
              {deleting && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              确认移出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
