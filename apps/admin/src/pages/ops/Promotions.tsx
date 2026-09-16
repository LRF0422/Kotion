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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@kn/ui'
import { Copy, LoaderCircle, Megaphone, Pencil, Plus, Save, Trash2, X } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime } from '@/lib/use-paged-data'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  deleteOpsResource,
  getOpsResources,
  saveOpsResource,
  type OpsPromotionPayload,
  type OpsResource,
} from '@/api/ops'

const LOCALES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
] as const

type Locale = (typeof LOCALES)[number]['value']
type PromotionType = OpsPromotionPayload['type']
type PromotionTheme = 'default' | 'accent' | 'warn'
type PromotionStatus = OpsResource['status']

const TYPE_META: Record<PromotionType, { label: string; variant: 'info' | 'warning' | 'success' }> = {
  announcement: { label: '顶部公告条', variant: 'info' },
  exit_intent: { label: '退出意图弹窗', variant: 'warning' },
  sticky_cta: { label: '吸底 CTA', variant: 'success' },
}

const THEME_LABEL: Record<PromotionTheme, string> = {
  default: '默认（深色）',
  accent: '强调（品牌色）',
  warn: '警示（琥珀色）',
}

const THEME_CLASS: Record<PromotionTheme, string> = {
  default: 'bg-slate-900 text-white',
  accent: 'bg-indigo-600 text-white',
  warn: 'bg-amber-500 text-slate-900',
}

const STATUS_META: Record<PromotionStatus, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  DRAFT: { label: '草稿', variant: 'muted' },
  PUBLISHED: { label: '已发布', variant: 'success' },
  OFFLINE: { label: '已下线', variant: 'warning' },
}

/** ISO 字符串 → `<input type="datetime-local">` 需要的本地时间文本。 */
const toLocalInput = (iso?: string | null): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `datetime-local` 文本 → ISO 字符串；空值返回 null（表示不限时间）。 */
const fromLocalInput = (value: string): string | null => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

interface PromotionForm {
  resKey: string
  type: PromotionType
  title: string
  body: string
  ctaLabel: string
  ctaHref: string
  /** 逗号分隔的路径，留空表示全站 */
  pagesText: string
  frequency: number
  theme: PromotionTheme
  status: PromotionStatus
  enabled: boolean
  startTime: string
  endTime: string
  position: number
}

const EMPTY_FORM: PromotionForm = {
  resKey: '',
  type: 'announcement',
  title: '',
  body: '',
  ctaLabel: '',
  ctaHref: '',
  pagesText: '',
  frequency: 0,
  theme: 'default',
  status: 'PUBLISHED',
  enabled: true,
  startTime: '',
  endTime: '',
  position: 0,
}

const toForm = (row: OpsResource): PromotionForm => {
  const payload = (row.payload ?? {}) as unknown as OpsPromotionPayload
  return {
    resKey: row.resKey,
    type: payload.type ?? 'announcement',
    title: payload.title ?? '',
    body: payload.body ?? '',
    ctaLabel: payload.ctaLabel ?? '',
    ctaHref: payload.ctaHref ?? '',
    pagesText: (payload.pages ?? []).join(', '),
    frequency: typeof payload.frequency === 'number' ? payload.frequency : 0,
    theme: payload.theme ?? 'default',
    status: row.status,
    enabled: row.enabled,
    startTime: toLocalInput(row.startTime),
    endTime: toLocalInput(row.endTime),
    position: typeof row.position === 'number' ? row.position : 0,
  }
}

/** 推广位 CRUD：`landing_resource` kind `PROMOTION`，resKey = 推广位标识。 */
export const Promotions = () => {
  const { canManage } = useOpsPermission()
  const [locale, setLocale] = useState<Locale>('zh')
  const [dialogOpen, setDialogOpen] = useState(false)
  /** null 表示新建 */
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [form, setForm] = useState<PromotionForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const { data, loading, error, reload } = useAsync(
    () => getOpsResources({ kind: 'PROMOTION', locale }),
    [locale],
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
    if (!window.confirm(`确认删除推广位「${row.resKey}」？`)) return
    try {
      await deleteOpsResource('PROMOTION', row.resKey, locale)
      toast.success('已删除')
      if (editingKey === row.resKey) setEditingKey(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  const copyKey = async (resKey: string) => {
    try {
      await navigator.clipboard.writeText(resKey)
      toast.success('标识已复制')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const save = async () => {
    const resKey = form.resKey.trim()
    if (!resKey) {
      toast.error('请填写推广位标识')
      return
    }
    if (editingKey === null && rows.some((row) => row.resKey === resKey)) {
      toast.error('该标识已存在，请更换')
      return
    }
    const payload: OpsPromotionPayload = {
      type: form.type,
      title: form.title.trim() || undefined,
      body: form.body.trim() || undefined,
      ctaLabel: form.ctaLabel.trim() || undefined,
      ctaHref: form.ctaHref.trim() || undefined,
      pages: form.pagesText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      frequency: Number.isFinite(form.frequency) ? form.frequency : 0,
      theme: form.theme,
    }
    setSaving(true)
    try {
      await saveOpsResource('PROMOTION', resKey, {
        locale,
        payload: { ...payload },
        status: form.status,
        enabled: form.enabled,
        position: form.position,
        startTime: fromLocalInput(form.startTime),
        endTime: fromLocalInput(form.endTime),
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

  const previewTitle = form.title.trim() || '推广标题'
  const previewBody = form.body.trim()
  const previewCta = form.ctaLabel.trim()
  const previewPages = form.pagesText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const renderPreview = () => {
    const theme = THEME_CLASS[form.theme]
    const close = <X className="size-3.5 opacity-70" />
    if (form.type === 'announcement') {
      return (
        <div className={`rounded-lg px-3 py-2 text-xs ${theme}`}>
          <div className="flex items-center gap-2">
            <Megaphone className="size-3.5 shrink-0" />
            <span className="font-medium">{previewTitle}</span>
            {previewCta && <span className="ml-auto rounded bg-black/20 px-2 py-0.5">{previewCta}</span>}
            <span className={previewCta ? '' : 'ml-auto'}>{close}</span>
          </div>
          {previewBody && <p className="mt-1 opacity-90">{previewBody}</p>}
        </div>
      )
    }
    if (form.type === 'exit_intent') {
      return (
        <div className="flex h-56 items-center justify-center rounded-lg bg-slate-900/50 p-4">
          <div className="w-full max-w-[240px] rounded-lg bg-background p-4 text-center shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{previewTitle}</span>
              {close}
            </div>
            {previewBody && <p className="mt-2 text-xs text-muted-foreground">{previewBody}</p>}
            {previewCta && (
              <span className={`mt-3 inline-block rounded-md px-3 py-1.5 text-xs ${theme}`}>
                {previewCta}
              </span>
            )}
          </div>
        </div>
      )
    }
    return (
      <div className="relative h-40 overflow-hidden rounded-lg border bg-muted/30">
        <div className={`absolute inset-x-0 bottom-0 flex items-center gap-3 px-3 py-2 text-xs ${theme}`}>
          <span className="shrink-0 font-medium">{previewTitle}</span>
          {previewBody && <span className="truncate opacity-90">{previewBody}</span>}
          {previewCta && <span className="ml-auto shrink-0 rounded bg-white/25 px-2 py-0.5">{previewCta}</span>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="推广位"
        description="顶部公告、退出意图与吸底 CTA 的投放配置，按语言分别维护"
        actions={
          <>
            <div className="flex rounded-lg border p-0.5">
              {LOCALES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setLocale(item.value)}
                  className={`rounded-md px-3 py-1 text-sm ${
                    locale === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {canManage && (
              <Button onClick={openCreate}>
                <Plus className="mr-1.5 size-4" />
                新建推广位
              </Button>
            )}
          </>
        }
      />

      <DataState
        loading={loading}
        error={error}
        empty={!loading && rows.length === 0 && !dialogOpen}
        emptyText="暂无推广位，点击右上角新建"
        rows={4}
        onRetry={reload}
      >
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>推广位列表</CardTitle>
              <CardDescription>
                共 {rows.length} 条 · 语言 {locale === 'zh' ? '中文' : 'English'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标识</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead>目标页面</TableHead>
                      <TableHead>频次</TableHead>
                      <TableHead>生效时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const payload = (row.payload ?? {}) as unknown as OpsPromotionPayload
                      const typeMeta = TYPE_META[payload.type] ?? TYPE_META.announcement
                      const statusMeta = STATUS_META[row.status]
                      const pages = payload.pages ?? []
                      return (
                        <TableRow key={row.resKey}>
                          <TableCell className="font-mono text-xs">{row.resKey}</TableCell>
                          <TableCell>
                            <StatusBadge variant={typeMeta.variant}>{typeMeta.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={payload.title}>
                            {payload.title || '-'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={pages.join('、')}>
                            {pages.length > 0 ? pages.join('、') : '全站'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {payload.frequency ? `${payload.frequency} 次/访客` : '不限'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {row.startTime || row.endTime
                              ? `${formatDateTime(row.startTime)} ~ ${
                                  row.endTime ? formatDateTime(row.endTime) : '长期'
                                }`
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              <StatusBadge variant={statusMeta.variant}>{statusMeta.label}</StatusBadge>
                              <StatusBadge variant={row.enabled ? 'success' : 'muted'}>
                                {row.enabled ? '启用' : '停用'}
                              </StatusBadge>
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
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="删除"
                                  onClick={() => remove(row)}
                                >
                                  <Trash2 className="size-3.5 text-destructive" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                title="复制标识"
                                onClick={() => copyKey(row.resKey)}
                              >
                                <Copy className="size-3.5" />
                              </Button>
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

          <Card className="self-start">
            <CardHeader>
              <CardTitle>预览</CardTitle>
              <CardDescription>
                {form.resKey ? `按当前表单值近似预览「${form.resKey}」` : '选择或新建推广位后展示近似效果'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {renderPreview()}
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  投放页面：
                  {previewPages.length > 0 ? previewPages.join('、') : '全站'}
                </p>
                <p>展示频次：{form.frequency ? `${form.frequency} 次/访客` : '不限'}</p>
                <p>
                  生效时间：
                  {form.startTime || form.endTime
                    ? `${form.startTime || '不限'} ~ ${form.endTime || '长期'}`
                    : '不限'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DataState>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingKey ? `编辑推广位「${editingKey}」` : '新建推广位'}</DialogTitle>
            <DialogDescription>保存前请确认投放页面与生效时间</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>标识 resKey</Label>
                <Input
                  value={form.resKey}
                  disabled={editingKey !== null}
                  placeholder="launch-banner"
                  onChange={(e) => setForm((prev) => ({ ...prev, resKey: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>类型</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, type: value as PromotionType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="announcement">顶部公告条</SelectItem>
                    <SelectItem value="exit_intent">退出意图弹窗</SelectItem>
                    <SelectItem value="sticky_cta">吸底 CTA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>标题 title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>正文 body</Label>
              <Textarea
                value={form.body}
                rows={3}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>按钮文案 ctaLabel</Label>
                <Input
                  value={form.ctaLabel}
                  placeholder="立即体验"
                  onChange={(e) => setForm((prev) => ({ ...prev, ctaLabel: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>按钮链接 ctaHref</Label>
                <Input
                  value={form.ctaHref}
                  placeholder="/templates"
                  onChange={(e) => setForm((prev) => ({ ...prev, ctaHref: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>目标页面 pages</Label>
              <Input
                value={form.pagesText}
                placeholder="/templates, /doc"
                onChange={(e) => setForm((prev) => ({ ...prev, pagesText: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                用英文逗号分隔；留空表示全站；支持 `/`、`/templates` 或以 `/doc` 开头的前缀匹配
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>展示频次 frequency</Label>
                <Input
                  type="number"
                  min={0}
                  value={String(form.frequency)}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, frequency: Number(e.target.value) || 0 }))
                  }
                />
                <p className="text-xs text-muted-foreground">0 表示不限</p>
              </div>
              <div className="space-y-2">
                <Label>主题 theme</Label>
                <Select
                  value={form.theme}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, theme: value as PromotionTheme }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(THEME_LABEL) as PromotionTheme[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {THEME_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>状态 status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, status: value as PromotionStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">草稿</SelectItem>
                    <SelectItem value="PUBLISHED">已发布</SelectItem>
                    <SelectItem value="OFFLINE">已下线</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>生效开始时间</Label>
                <Input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>生效结束时间</Label>
                <Input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
              />
              <span className="text-sm">{form.enabled ? '启用' : '停用'}</span>
            </div>
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
