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
  toast,
} from '@kn/ui'
import { Copy, ExternalLink, LoaderCircle, Pencil, Plus, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { DataState } from '@/components/DataState'
import { JsonField, parseJsonObject, toJsonText } from '@/components/JsonField'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import { deleteOpsResource, getOpsResources, saveOpsResource, type OpsResource } from '@/api/ops'

/**
 * 落地页公开访问域名。
 *
 * `/c/<slug>` 是落地页应用（Next.js）注册的投放页路由，与管理后台不同源，
 * 无法用 `window.location.origin` 推导，因此这里显式声明为模块级常量。
 */
const LANDING_ORIGIN = 'https://kotion.top'

const SEO_HINT = '投放页 SEO 请在「页面 SEO」里为 /c/<slug> 单独配置'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const STATUS_META: Record<OpsResource['status'], { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: '草稿', variant: 'muted' },
  PUBLISHED: { label: '已发布', variant: 'success' },
  OFFLINE: { label: '已下线', variant: 'warning' },
}

const STATUS_OPTIONS: Array<{ value: OpsResource['status']; label: string }> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PUBLISHED', label: '已发布' },
  { value: 'OFFLINE', label: '已下线' },
]

const LOCALES: Array<{ value: string; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

/** 支持的区块类型。 */
const BLOCK_TYPES: Array<{ value: string; label: string }> = [
  { value: 'hero', label: '首屏' },
  { value: 'bullets', label: '要点' },
  { value: 'features', label: '功能' },
  { value: 'cta', label: '行动号召' },
  { value: 'form', label: '表单' },
  { value: 'faq', label: '问答' },
  { value: 'testimonial', label: '客户证言' },
  { value: 'logos', label: '合作方' },
]

/** 每种区块的起步 payload，「插入示例」一键填入。 */
const BLOCK_EXAMPLES: Record<string, Record<string, unknown>> = {
  hero: { title: '', subtitle: '', ctaLabel: '', ctaHref: '' },
  bullets: { items: [] },
  features: { items: [] },
  cta: { title: '', body: '', ctaLabel: '', ctaHref: '' },
  form: { title: '', submitLabel: '订阅' },
  faq: { items: [{ q: '', a: '' }] },
  testimonial: { items: [{ quote: '', author: '', role: '' }] },
  logos: { items: [] },
}

const blockLabel = (type: string) => BLOCK_TYPES.find((item) => item.value === type)?.label ?? type

interface CampaignBlock {
  type: string
  payload: Record<string, unknown>
}

interface CampaignPagePayload {
  title?: string
  blocks?: CampaignBlock[]
}

/** payload 是 `Record<string, unknown>`，这里做一次结构化读取。 */
const readPayload = (resource: OpsResource): CampaignPagePayload => {
  const payload = resource.payload
  if (!payload || typeof payload !== 'object') return {}
  return payload as unknown as CampaignPagePayload
}

const displayName = (resource: OpsResource) => readPayload(resource).title || resource.resKey

interface EditableBlock {
  type: string
  /** JsonField 的文本态，保存时再解析 */
  payloadText: string
}

interface PageFormState {
  slug: string
  title: string
  locale: string
  status: OpsResource['status']
  enabled: boolean
  blocks: EditableBlock[]
}

const EMPTY_FORM: PageFormState = {
  slug: '',
  title: '',
  locale: 'zh',
  status: 'DRAFT',
  enabled: true,
  blocks: [],
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const metaOf = (status: OpsResource['status']) =>
  STATUS_META[status] ?? { label: status, variant: 'muted' as BadgeVariant }

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/**
 * 投放页编排（landing_resource kind = CAMPAIGN_PAGE，resKey = slug）。
 *
 * 左侧是投放页清单，右侧编辑走 Dialog；区块按顺序渲染，payload 用 JsonField 编辑。
 */
export const CampaignPages = () => {
  const { canManage } = useOpsPermission()

  const [locale, setLocale] = useState('zh')
  const list = useAsync(() => getOpsResources({ kind: 'CAMPAIGN_PAGE', locale }), [locale])
  const resources = list.data ?? []

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<OpsResource | null>(null)
  const [form, setForm] = useState<PageFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<OpsResource | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, locale })
    setEditorOpen(true)
  }

  const openEdit = (resource: OpsResource) => {
    const payload = readPayload(resource)
    setEditing(resource)
    setForm({
      slug: resource.resKey,
      title: payload.title ?? '',
      locale: resource.locale || locale,
      status: resource.status,
      enabled: resource.enabled ?? true,
      blocks: (payload.blocks ?? []).map((block) => ({
        type: block?.type || 'hero',
        payloadText: toJsonText(block?.payload),
      })),
    })
    setEditorOpen(true)
  }

  const updateBlock = (index: number, patch: Partial<EditableBlock>) =>
    setForm((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)),
    }))

  const addBlock = () =>
    setForm((prev) => ({ ...prev, blocks: [...prev.blocks, { type: 'hero', payloadText: '{}' }] }))

  const moveBlock = (index: number, delta: number) =>
    setForm((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.blocks.length) return prev
      const next = [...prev.blocks]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return { ...prev, blocks: next }
    })

  const removeBlock = (index: number) =>
    setForm((prev) => ({ ...prev, blocks: prev.blocks.filter((_, i) => i !== index) }))

  const insertExample = (index: number, type: string) =>
    updateBlock(index, { payloadText: toJsonText(BLOCK_EXAMPLES[type] ?? {}) })

  const save = async () => {
    if (!canManage) return
    const slug = form.slug.trim()
    if (!slug) {
      toast.error('请填写 slug')
      return
    }

    const blocks: CampaignBlock[] = []
    for (let i = 0; i < form.blocks.length; i += 1) {
      const block = form.blocks[i]
      const parsed = parseJsonObject(block.payloadText)
      if (!parsed.ok) {
        toast.error(`第 ${i + 1} 个区块（${blockLabel(block.type)}）JSON 格式错误：${parsed.error}`)
        return
      }
      blocks.push({ type: block.type, payload: (parsed.value ?? {}) as Record<string, unknown> })
    }

    setSaving(true)
    try {
      await saveOpsResource('CAMPAIGN_PAGE', slug, {
        locale: form.locale,
        payload: { title: form.title.trim(), blocks },
        status: form.status,
        enabled: form.enabled,
        position: 0,
      })
      toast.success('投放页已保存')
      setEditorOpen(false)
      list.reload()
    } catch (err) {
      toast.error(errorText(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (resource: OpsResource, next: boolean) => {
    try {
      await saveOpsResource('CAMPAIGN_PAGE', resource.resKey, {
        locale: resource.locale,
        payload: readPayload(resource) as unknown as Record<string, unknown>,
        status: resource.status,
        enabled: next,
        position: resource.position ?? 0,
      })
      toast.success(next ? '已启用' : '已停用')
      list.reload()
    } catch (err) {
      toast.error(errorText(err, '更新失败'))
    }
  }

  const preview = (slug: string) => {
    window.open(`${LANDING_ORIGIN}/c/${slug}`, '_blank', 'noopener,noreferrer')
  }

  const copySlug = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(slug)
      toast.success(`已复制 slug：${slug}`)
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteOpsResource('CAMPAIGN_PAGE', deleteTarget.resKey, deleteTarget.locale)
      toast.success('已删除')
      setDeleteTarget(null)
      list.reload()
    } catch (err) {
      toast.error(errorText(err, '删除失败'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="投放页"
        description="按 slug 编排落地页区块，用于渠道投放与邮件活动承接"
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
                新建投放页
              </Button>
            )}
          </>
        }
      />

      <DataState
        loading={list.loading}
        error={list.error}
        empty={resources.length === 0}
        emptyText="该语言下还没有投放页"
        onRetry={list.reload}
      >
        <Card>
          <CardHeader>
            <CardTitle>投放页清单</CardTitle>
            <CardDescription>
              共 {resources.length} 个 · 公开地址为 {LANDING_ORIGIN}/c/&lt;slug&gt;
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border">
              {resources.map((resource) => {
                const meta = metaOf(resource.status)
                return (
                  <div
                    key={`${resource.resKey}-${resource.locale}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{displayName(resource)}</span>
                        <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        /c/{resource.resKey} · {resource.locale}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Switch
                        checked={resource.enabled}
                        disabled={!canManage}
                        onCheckedChange={(next) => toggleEnabled(resource, next)}
                        title={resource.enabled ? '已启用' : '已停用'}
                      />
                      <Button variant="ghost" size="sm" onClick={() => preview(resource.resKey)}>
                        <ExternalLink className="mr-1 size-3.5" />
                        预览
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => copySlug(resource.resKey)}>
                        <Copy className="mr-1 size-3.5" />
                        复制 slug
                      </Button>
                      {canManage && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(resource)}>
                            <Pencil className="mr-1 size-3.5" />
                            编辑
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(resource)}>
                            <Trash2 className="mr-1 size-3.5 text-destructive" />
                            删除
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{SEO_HINT}</p>
          </CardContent>
        </Card>
      </DataState>

      {/* 新建 / 编辑 */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑投放页' : '新建投放页'}</DialogTitle>
            <DialogDescription>区块按顺序自上而下渲染，payload 为区块配置。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>slug</Label>
                <Input
                  value={form.slug}
                  disabled={Boolean(editing)}
                  placeholder="launch-2024"
                  onChange={(event) => setForm((prev) => ({ ...prev, slug: slugify(event.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">小写字母与数字，其他字符自动转为 -</p>
              </div>

              <div className="space-y-1.5">
                <Label>标题</Label>
                <Input
                  value={form.title}
                  placeholder="页面展示标题"
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>语言</Label>
                <Select
                  value={form.locale}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, locale: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="中文" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, status: value as OpsResource['status'] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="草稿" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.enabled}
                onCheckedChange={(next) => setForm((prev) => ({ ...prev, enabled: next }))}
              />
              <span className="text-sm">启用（关闭后该投放页不对外展示）</span>
            </div>

            <p className="text-xs text-muted-foreground">
              当前对应路径 /c/{form.slug || '<slug>'} · {SEO_HINT}
            </p>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">区块编排（{form.blocks.length}）</p>
                <Button variant="outline" size="sm" onClick={addBlock}>
                  <Plus className="mr-1 size-3.5" />
                  添加区块
                </Button>
              </div>

              {form.blocks.length === 0 && (
                <p className="text-sm text-muted-foreground">还没有区块，点击「添加区块」开始编排。</p>
              )}

              {form.blocks.map((block, index) => (
                <div key={index} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{index + 1}</span>
                      <Select value={block.type} onValueChange={(value) => updateBlock(index, { type: value })}>
                        <SelectTrigger className="w-36">
                          <SelectValue placeholder="首屏" />
                        </SelectTrigger>
                        <SelectContent>
                          {BLOCK_TYPES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => insertExample(index, block.type)}>
                        插入示例
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={index === 0}
                        onClick={() => moveBlock(index, -1)}
                      >
                        上移
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={index === form.blocks.length - 1}
                        onClick={() => moveBlock(index, 1)}
                      >
                        下移
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeBlock(index)}>
                        <Trash2 className="mr-1 size-3.5 text-destructive" />
                        删除
                      </Button>
                    </div>
                  </div>

                  <JsonField
                    label="payload"
                    rows={6}
                    value={block.payloadText}
                    hint={toJsonText(BLOCK_EXAMPLES[block.type] ?? {})}
                    onChange={(value) => updateBlock(index, { payloadText: value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving || !canManage}>
              {saving && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除投放页</DialogTitle>
            <DialogDescription>
              确认删除「{deleteTarget ? displayName(deleteTarget) : ''}」？该操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
