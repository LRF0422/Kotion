import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { LoaderCircle, Plus, Save, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'
import { JsonField, parseJsonObject, toJsonText } from '@/components/JsonField'
import { StatusBadge } from '@/components/StatusBadge'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  deleteOpsResource,
  getOpsResources,
  saveOpsResource,
  type OpsResource,
  type OpsSeoPayload,
} from '@/api/ops'

/** 落地页线上域名（SERP 预览展示用，按约定以明确常量推导）。 */
const SERP_ORIGIN = 'https://kotion.top'
const SITE_LABEL = SERP_ORIGIN.replace(/^https?:\/\//, '').charAt(0).toUpperCase()

const LOCALES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
] as const

type Locale = (typeof LOCALES)[number]['value']

const STATUS_META: Record<OpsResource['status'], { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  DRAFT: { label: '草稿', variant: 'muted' },
  PUBLISHED: { label: '已发布', variant: 'success' },
  OFFLINE: { label: '已下线', variant: 'warning' },
}

/** 覆盖率卡片里的落地页路由（`/en*` 按 en 语言配置比对）。 */
const COVERAGE_ROUTES = [
  '/',
  '/templates',
  '/plugins',
  '/doc',
  '/changelog',
  '/en',
  '/en/templates',
  '/en/plugins',
  '/en/doc',
  '/en/changelog',
]

const routeLocale = (route: string): Locale => (route === '/en' || route.startsWith('/en/') ? 'en' : 'zh')
/** `/en/templates` → `/templates`；`/en` → `/`（英文首页）。 */
const routePath = (route: string): string => (route === '/en' ? '/' : route.startsWith('/en/') ? route.slice(3) : route)

interface SeoForm {
  title: string
  description: string
  keywords: string
  canonical: string
  robots: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  jsonLd: string
}

const EMPTY_FORM: SeoForm = {
  title: '',
  description: '',
  keywords: '',
  canonical: '',
  robots: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  jsonLd: '{}',
}

/** jsonLd 契约上是字符串，这里对历史对象形态做兼容，避免编辑框崩掉。 */
const toJsonLdText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim() ? value : '{}'
  if (value === undefined || value === null) return '{}'
  return toJsonText(value, '{}')
}

const toForm = (payload?: Record<string, unknown> | null): SeoForm => {
  const data = (payload ?? {}) as unknown as OpsSeoPayload
  return {
    title: data.title ?? '',
    description: data.description ?? '',
    keywords: data.keywords ?? '',
    canonical: data.canonical ?? '',
    robots: data.robots ?? '',
    ogTitle: data.ogTitle ?? '',
    ogDescription: data.ogDescription ?? '',
    ogImage: data.ogImage ?? '',
    jsonLd: toJsonLdText(data.jsonLd),
  }
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

/**
 * 分路径 SEO 编辑：`landing_resource` kind `SEO`，resKey = 路由路径。
 * 左侧维护已配置路径，右侧编辑单条 payload 并给出 Google SERP 预览。
 */
export const SeoSettings = () => {
  const { canManage } = useOpsPermission()
  const [locale, setLocale] = useState<Locale>('zh')
  const [selectedPath, setSelectedPath] = useState('')
  const [newPath, setNewPath] = useState('')
  /** 本地新增、尚未落库的路径（按语言分组） */
  const [extraPaths, setExtraPaths] = useState<Record<Locale, string[]>>({ zh: [], en: [] })
  const [form, setForm] = useState<SeoForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [brokenImage, setBrokenImage] = useState(false)

  // 覆盖率需要同时看到 zh / en 两侧配置，因此一次加载两种语言再派生。
  const { data, loading, error, reload } = useAsync(
    () => Promise.all(LOCALES.map((item) => getOpsResources({ kind: 'SEO', locale: item.value }))),
    [locale],
  )

  const rowsByLocale = useMemo<Record<Locale, OpsResource[]>>(
    () => ({ zh: data?.[0] ?? [], en: data?.[1] ?? [] }),
    [data],
  )

  useEffect(() => {
    const rows = rowsByLocale[locale]
    const row = rows.find((item) => item.resKey === selectedPath)
    setForm(row ? toForm(row.payload) : EMPTY_FORM)
    setBrokenImage(false)
  }, [rowsByLocale, locale, selectedPath])

  const listKeys = useMemo(() => {
    const keys = rowsByLocale[locale].map((row) => row.resKey)
    extraPaths[locale].forEach((path) => {
      if (!keys.includes(path)) keys.push(path)
    })
    return keys
  }, [rowsByLocale, locale, extraPaths])

  const configuredSet = useMemo(() => {
    const set = new Set<string>()
    LOCALES.forEach((item) => {
      rowsByLocale[item.value].forEach((row) => set.add(`${item.value}:${row.resKey}`))
    })
    return set
  }, [rowsByLocale])

  const isCovered = (route: string) => {
    const item = routeLocale(route)
    return configuredSet.has(`${item}:${route}`) || configuredSet.has(`${item}:${routePath(route)}`)
  }

  const addPath = () => {
    const path = newPath.trim()
    if (!path) {
      toast.error('请输入路径')
      return
    }
    if (!path.startsWith('/')) {
      toast.error('路径需以 / 开头，如 /templates')
      return
    }
    if (!rowsByLocale[locale].some((row) => row.resKey === path)) {
      setExtraPaths((prev) =>
        prev[locale].includes(path) ? prev : { ...prev, [locale]: [...prev[locale], path] },
      )
    }
    setSelectedPath(path)
    setNewPath('')
  }

  const remove = async (path: string) => {
    if (!window.confirm(`确认删除「${path}」的 SEO 配置？`)) return
    try {
      await deleteOpsResource('SEO', path, locale)
      toast.success('已删除')
      setExtraPaths((prev) => ({ ...prev, [locale]: prev[locale].filter((item) => item !== path) }))
      if (selectedPath === path) setSelectedPath('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  const save = async (status: OpsResource['status']) => {
    if (!selectedPath) {
      toast.error('请先选择或新增一个路径')
      return
    }
    const jsonLd = parseJsonObject(form.jsonLd, true)
    if (!jsonLd.ok) {
      toast.error(`结构化数据 JSON 格式错误：${jsonLd.error ?? ''}`)
      return
    }
    const payload: OpsSeoPayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      keywords: form.keywords.trim(),
      canonical: form.canonical.trim(),
      robots: form.robots.trim(),
      ogTitle: form.ogTitle.trim(),
      ogDescription: form.ogDescription.trim(),
      ogImage: form.ogImage.trim(),
      jsonLd: form.jsonLd.trim(),
    }
    setSaving(true)
    try {
      await saveOpsResource('SEO', selectedPath, {
        locale,
        payload: { ...payload },
        status,
        enabled: true,
        position: 0,
      })
      toast.success(status === 'DRAFT' ? '草稿已保存' : '已保存，落地页将实时生效')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const serpTitle = truncate(form.title.trim() || selectedPath, 60)
  const serpDescription = truncate(form.description.trim(), 160)

  return (
    <div>
      <PageHeader
        title="分享与 SEO"
        description="按路径维护落地页标题、描述、分享图与结构化数据；未配置的路径继续使用内置默认值"
        actions={
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
        }
      />

      <DataState loading={loading} error={error} rows={4} onRetry={reload}>
        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <Card className="self-start">
            <CardHeader>
              <CardTitle>已配置路径</CardTitle>
              <CardDescription>
                {locale === 'zh' ? '中文' : 'English'} 共 {listKeys.length} 条
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canManage && (
                <div className="flex gap-2">
                  <Input
                    value={newPath}
                    placeholder="/templates"
                    onChange={(e) => setNewPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addPath()
                    }}
                  />
                  <Button variant="outline" onClick={addPath}>
                    <Plus className="size-4" />
                    新增路径
                  </Button>
                </div>
              )}

              <div className="space-y-1">
                {listKeys.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">暂无已配置路径</p>
                )}
                {listKeys.map((path) => {
                  const row = rowsByLocale[locale].find((item) => item.resKey === path)
                  const meta = row ? STATUS_META[row.status] : null
                  return (
                    <div
                      key={path}
                      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${
                        selectedPath === path ? 'bg-muted' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPath(path)}
                        className="flex-1 truncate text-left font-mono text-xs hover:underline"
                        title={path}
                      >
                        {path}
                      </button>
                      {meta ? (
                        <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                      ) : (
                        <StatusBadge variant="info">未保存</StatusBadge>
                      )}
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          title="删除"
                          onClick={() => remove(path)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                          删除
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {!selectedPath ? (
              <Card>
                <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  请选择左侧路径，或新增一个路径后开始编辑
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-mono text-base">{selectedPath}</CardTitle>
                    <CardDescription>
                      语言 {locale === 'zh' ? '中文' : 'English'} · 保存后落地页实时生效
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>标题 title</Label>
                      <Input
                        value={form.title}
                        placeholder="Kotion · 知识管理平台"
                        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>描述 description</Label>
                      <Textarea
                        value={form.description}
                        rows={3}
                        placeholder="一句话说明这个页面的价值，建议 160 字符以内"
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                      />
                      <p
                        className={
                          form.description.length > 160
                            ? 'text-xs text-amber-600 dark:text-amber-400'
                            : 'text-xs text-muted-foreground'
                        }
                      >
                        {form.description.length}/160
                        {form.description.length > 160 && ' · 超出 160 字符，搜索结果里可能被截断'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>关键词 keywords</Label>
                      <Input
                        value={form.keywords}
                        placeholder="知识库, 文档协作, 开源"
                        onChange={(e) => setForm((prev) => ({ ...prev, keywords: e.target.value }))}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>规范链接 canonical</Label>
                        <Input
                          value={form.canonical}
                          placeholder="https://kotion.top/templates"
                          onChange={(e) => setForm((prev) => ({ ...prev, canonical: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>爬虫指令 robots</Label>
                        <Input
                          value={form.robots}
                          placeholder="index,follow"
                          onChange={(e) => setForm((prev) => ({ ...prev, robots: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">常用值：index,follow</p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>分享标题 ogTitle</Label>
                        <Input
                          value={form.ogTitle}
                          onChange={(e) => setForm((prev) => ({ ...prev, ogTitle: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>分享描述 ogDescription</Label>
                        <Input
                          value={form.ogDescription}
                          onChange={(e) => setForm((prev) => ({ ...prev, ogDescription: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>分享图 ogImage</Label>
                      <Input
                        value={form.ogImage}
                        placeholder="https://kotion.top/og/templates.png"
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, ogImage: e.target.value }))
                          setBrokenImage(false)
                        }}
                      />
                      {form.ogImage.trim() && (
                        <div className="mt-2">
                          {brokenImage ? (
                            <p className="text-xs text-amber-600 dark:text-amber-400">图片无法加载，请检查地址</p>
                          ) : (
                            <img
                              src={form.ogImage}
                              alt="og 预览"
                              className="h-[63px] w-[120px] rounded-md border object-cover"
                              onError={() => setBrokenImage(true)}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    <JsonField
                      label="结构化数据 jsonLd"
                      value={form.jsonLd}
                      allowArray
                      rows={6}
                      hint="填写 JSON-LD（对象或数组），留空表示不输出"
                      onChange={(value) => setForm((prev) => ({ ...prev, jsonLd: value }))}
                    />

                    {canManage && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button onClick={() => save('PUBLISHED')} disabled={saving}>
                          {saving ? (
                            <LoaderCircle className="mr-1.5 size-4 animate-spin" />
                          ) : (
                            <Save className="mr-1.5 size-4" />
                          )}
                          保存
                        </Button>
                        <Button variant="outline" onClick={() => save('DRAFT')} disabled={saving}>
                          另存为草稿
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Google SERP 预览</CardTitle>
                    <CardDescription>标题最多显示 60 字符，描述最多 160 字符</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border bg-white p-4 dark:bg-slate-950">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-[11px] font-semibold text-muted-foreground">
                          {SITE_LABEL}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-slate-700 dark:text-slate-300">Kotion</p>
                          <p className="truncate text-xs text-emerald-700 dark:text-emerald-500">
                            {SERP_ORIGIN}
                            {selectedPath}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 truncate text-lg text-blue-700 dark:text-blue-400">
                        {serpTitle || '未填写标题'}
                      </p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {serpDescription || '未填写描述，搜索引擎将自行截取页面正文。'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <Card>
              <CardHeader>
                <CardTitle>落地页 SEO 覆盖率</CardTitle>
                <CardDescription>
                  固定路由清单；`/en*` 路由按 en 语言配置比对（同时加载 zh / en 两侧数据）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>路由</TableHead>
                        <TableHead>语言</TableHead>
                        <TableHead>配置状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {COVERAGE_ROUTES.map((route) => {
                        const covered = isCovered(route)
                        return (
                          <TableRow key={route}>
                            <TableCell className="font-mono text-xs">{route}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {routeLocale(route) === 'zh' ? '中文' : 'English'}
                            </TableCell>
                            <TableCell>
                              {covered ? (
                                <StatusBadge variant="success">已配置</StatusBadge>
                              ) : (
                                <StatusBadge variant="muted">未配置</StatusBadge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DataState>
    </div>
  )
}
