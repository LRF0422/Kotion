import { useState } from 'react'
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
  toast,
} from '@kn/ui'
import { CircleAlert, Copy, LoaderCircle, Pencil, Plus, Save, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  deleteOpsResource,
  getOpsResources,
  saveOpsResource,
  type OpsAssetPayload,
  type OpsResource,
} from '@/api/ops'

const MIME_OPTIONS = [
  { value: 'image/png', label: 'image/png' },
  { value: 'image/jpeg', label: 'image/jpeg' },
  { value: 'image/webp', label: 'image/webp' },
  { value: 'image/svg+xml', label: 'image/svg+xml' },
  { value: 'image/avif', label: 'image/avif' },
]

/** OG 图推荐尺寸（与 OpsAssetPayload 注释一致）。 */
const OG_WIDTH = 1200
const OG_HEIGHT = 630

interface AssetForm {
  resKey: string
  name: string
  url: string
  mime: string
  usage: string
  width: string
  height: string
}

const EMPTY_FORM: AssetForm = {
  resKey: '',
  name: '',
  url: '',
  mime: 'image/png',
  usage: '',
  width: '',
  height: '',
}

const toForm = (row: OpsResource): AssetForm => {
  const payload = (row.payload ?? {}) as unknown as OpsAssetPayload
  return {
    resKey: row.resKey,
    name: payload.name ?? '',
    url: payload.url ?? '',
    mime: payload.mime ?? 'image/png',
    usage: payload.usage ?? '',
    width: payload.width === undefined || payload.width === null ? '' : String(payload.width),
    height: payload.height === undefined || payload.height === null ? '' : String(payload.height),
  }
}

/** 素材库：`landing_resource` kind `ASSET`，resKey = 素材标识（素材与语言无关，固定 zh）。 */
export const Assets = () => {
  const { canManage } = useOpsPermission()
  const [dialogOpen, setDialogOpen] = useState(false)
  /** null 表示新建 */
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [form, setForm] = useState<AssetForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [broken, setBroken] = useState<Record<string, boolean>>({})

  const { data, loading, error, reload } = useAsync(
    () => getOpsResources({ kind: 'ASSET', locale: 'zh' }),
    [],
  )
  const rows = data ?? []

  const openCreate = () => {
    setEditingKey(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (row: OpsResource) => {
    setEditingKey(row.resKey)
    setForm(toForm(row))
    setDialogOpen(true)
  }

  const remove = async (row: OpsResource) => {
    if (!window.confirm(`确认删除素材「${row.resKey}」？`)) return
    try {
      await deleteOpsResource('ASSET', row.resKey, 'zh')
      toast.success('已删除')
      if (editingKey === row.resKey) setEditingKey(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('地址已复制')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const save = async () => {
    const resKey = form.resKey.trim()
    if (!resKey) {
      toast.error('请填写素材标识')
      return
    }
    const url = form.url.trim()
    if (!url) {
      toast.error('请填写素材地址')
      return
    }
    if (!/^(https?:\/\/|\/)/.test(url)) {
      toast.error('素材地址需以 http://、https:// 或 / 开头')
      return
    }
    const width = form.width.trim() ? Number(form.width) : undefined
    const height = form.height.trim() ? Number(form.height) : undefined
    if (width !== undefined && !Number.isFinite(width)) {
      toast.error('宽度需为数字')
      return
    }
    if (height !== undefined && !Number.isFinite(height)) {
      toast.error('高度需为数字')
      return
    }
    const payload: OpsAssetPayload = {
      url,
      name: form.name.trim() || undefined,
      mime: form.mime,
      usage: form.usage.trim() || undefined,
      width,
      height,
    }
    setSaving(true)
    try {
      await saveOpsResource('ASSET', resKey, {
        locale: 'zh',
        payload: { ...payload },
        status: 'PUBLISHED',
        enabled: true,
        position: 0,
      })
      toast.success('已保存')
      setEditingKey(resKey)
      setDialogOpen(false)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const usageIsOg = form.usage.trim() === 'og'
  const ogSizeOk = Number(form.width) === OG_WIDTH && Number(form.height) === OG_HEIGHT

  return (
    <div>
      <PageHeader
        title="素材库"
        description="落地页分享图、Hero 图等静态素材的集中登记，供 SEO 与区块配置引用"
        actions={
          canManage && (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              新增素材
            </Button>
          )
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>使用说明</CardTitle>
          <CardDescription>
            `og` 用途的素材会被落地页 SEO 引用；替换后需要重新分享（或等平台重新抓取）才生效。
          </CardDescription>
        </CardHeader>
      </Card>

      <DataState
        loading={loading}
        error={error}
        empty={!loading && rows.length === 0 && !dialogOpen}
        emptyText="暂无素材，点击右上角新增"
        rows={4}
        onRetry={reload}
      >
        <Card>
          <CardHeader>
            <CardTitle>素材列表</CardTitle>
            <CardDescription>共 {rows.length} 条</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>预览</TableHead>
                    <TableHead>标识</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>用途</TableHead>
                    <TableHead>尺寸</TableHead>
                    <TableHead>地址</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const payload = (row.payload ?? {}) as unknown as OpsAssetPayload
                    const url = payload.url ?? ''
                    return (
                      <TableRow key={row.resKey}>
                        <TableCell>
                          {broken[row.resKey] || !url ? (
                            <div className="flex h-12 w-24 items-center justify-center rounded border bg-muted text-[10px] text-muted-foreground">
                              无图
                            </div>
                          ) : (
                            <img
                              src={url}
                              alt={payload.name || row.resKey}
                              className="h-12 w-24 rounded border object-cover"
                              onError={() => setBroken((prev) => ({ ...prev, [row.resKey]: true }))}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.resKey}</TableCell>
                        <TableCell>{payload.name || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{payload.usage || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {payload.width && payload.height ? `${payload.width}×${payload.height}` : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span
                              className="block max-w-[220px] truncate font-mono text-xs text-muted-foreground"
                              title={url}
                            >
                              {url || '-'}
                            </span>
                            {url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="复制地址"
                                onClick={() => copyUrl(url)}
                              >
                                <Copy className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {canManage && (
                              <Button variant="ghost" size="sm" title="编辑" onClick={() => openEdit(row)}>
                                <Pencil className="size-3.5" />
                              </Button>
                            )}
                            {canManage && (
                              <Button variant="ghost" size="sm" title="删除" onClick={() => remove(row)}>
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </DataState>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingKey ? `编辑素材「${editingKey}」` : '新增素材'}</DialogTitle>
            <DialogDescription>素材与语言无关，统一存在 zh 命名空间下</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>标识 resKey</Label>
                <Input
                  value={form.resKey}
                  disabled={editingKey !== null}
                  placeholder="og-home"
                  onChange={(e) => setForm((prev) => ({ ...prev, resKey: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>名称 name</Label>
                <Input
                  value={form.name}
                  placeholder="首页分享图"
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>地址 url</Label>
              <Input
                value={form.url}
                placeholder="https://kotion.top/og/home.png 或 /og/home.png"
                onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">需以 http://、https:// 或 / 开头</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>类型 mime</Label>
                <Select
                  value={form.mime}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, mime: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MIME_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>用途 usage</Label>
                <Input
                  value={form.usage}
                  placeholder="og、hero、case-study"
                  onChange={(e) => setForm((prev) => ({ ...prev, usage: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>宽度 width</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.width}
                  onChange={(e) => setForm((prev) => ({ ...prev, width: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>高度 height</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.height}
                  onChange={(e) => setForm((prev) => ({ ...prev, height: e.target.value }))}
                />
              </div>
            </div>

            {usageIsOg && !ogSizeOk && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <CircleAlert className="size-3.5" />
                OG 素材建议尺寸 {OG_WIDTH}×{OG_HEIGHT}，当前 {form.width || '未填'}×{form.height || '未填'}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <LoaderCircle className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 size-4" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
