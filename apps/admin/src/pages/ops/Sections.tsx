import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Switch,
  toast,
} from '@kn/ui'
import { ChevronDown, ChevronRight, GripVertical, LoaderCircle, RefreshCw, Save } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'
import { JsonField, parseJsonObject, toJsonText } from '@/components/JsonField'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  getOpsResources,
  saveOpsResourceBatch,
  type OpsResource,
  type OpsSectionPayload,
} from '@/api/ops'

const LOCALES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
] as const

type Locale = (typeof LOCALES)[number]['value']

/**
 * 首页区块的默认顺序、中文标签与可配置 props 提示。
 *
 * 提示文案对应 landing-page-vite 的 `ops/section-props.ts` 读取逻辑：
 * 未列出的键会被静默忽略，因此这里只提示实际生效的字段。
 */
const DEFAULT_SECTIONS: Array<{ sectionKey: string; label: string; propsHint?: string }> = [
  {
    sectionKey: 'hero',
    label: '首屏 Hero',
    propsHint: 'badge, title1, title2, desc, ctaLabel, ctaHref, secondaryLabel, secondaryHref, meta[], showStats（hero-cta 实验的 CTA 仍优先）',
  },
  { sectionKey: 'stack-cloud', label: '技术栈条', propsHint: 'heading, items[]' },
  {
    sectionKey: 'capability-bento',
    label: '能力宫格',
    propsHint: 'eyebrow, title, desc, cards[]（editor / collab / bitable / ai / canvas / links）, hidden[]',
  },
  { sectionKey: 'workflows', label: '工作流', propsHint: 'eyebrow, title, desc' },
  {
    sectionKey: 'ecosystem-spotlight',
    label: '插件生态',
    propsHint: 'eyebrow, title, desc, limit（1-12）；精选插件请在「市场运营 → 精选位」配置',
  },
  { sectionKey: 'everywhere-you-work', label: '全平台', propsHint: 'eyebrow, title, desc' },
  {
    sectionKey: 'templates-preview',
    label: '模板预览',
    propsHint: 'eyebrow, title, desc, limit（1-12）；精选模板请在「市场运营 → 精选位」配置',
  },
  { sectionKey: 'open-source', label: '开源', propsHint: 'eyebrow, title, desc' },
  { sectionKey: 'faq', label: '常见问题', propsHint: 'eyebrow, title, desc' },
  {
    sectionKey: 'final-cta',
    label: '结尾行动号召',
    propsHint: 'eyebrow, title1, title2, desc, primaryLabel, primaryHref',
  },
]

/** 首页区块资源统一挂在 resKey = home 下。 */
const SECTION_PAGE_KEY = 'home'

interface SectionRow {
  sectionKey: string
  label: string
  enabled: boolean
  propsText: string
  /** 该区块实际支持的 props 字段，来自 DEFAULT_SECTIONS */
  propsHint?: string
}

interface MergedSection extends SectionRow {
  /** 后端已存排序，缺省时回退到默认顺序下标 */
  storedPosition?: number
  defaultIndex: number
}

/** 把后端配置合并进默认清单：enabled 以后端为准，顺序优先取 position。 */
const mergeSections = (resources: OpsResource[]): SectionRow[] => {
  const stored = new Map<string, { enabled: boolean; props: Record<string, unknown>; position?: number }>()
  resources.forEach((item) => {
    const payload = (item.payload ?? {}) as unknown as OpsSectionPayload
    const key = payload.sectionKey || item.resKey
    stored.set(key, {
      enabled: item.enabled,
      props: payload.props ?? {},
      position: typeof item.position === 'number' ? item.position : payload.position,
    })
  })

  const known: MergedSection[] = DEFAULT_SECTIONS.map((item, index) => {
    const hit = stored.get(item.sectionKey)
    stored.delete(item.sectionKey)
    return {
      sectionKey: item.sectionKey,
      label: item.label,
      enabled: hit ? hit.enabled : true,
      propsText: toJsonText(hit?.props ?? {}, '{}'),
      propsHint: item.propsHint,
      storedPosition: hit?.position,
      defaultIndex: index,
    }
  })

  // 后端存在但默认清单里没有的区块：保留在末尾，避免配置被静默丢弃。
  const unknown: MergedSection[] = Array.from(stored.entries()).map(([key, value], index) => ({
    sectionKey: key,
    label: key,
    enabled: value.enabled,
    propsText: toJsonText(value.props, '{}'),
    propsHint: undefined,
    storedPosition: value.position,
    defaultIndex: DEFAULT_SECTIONS.length + index,
  }))

  return [...known, ...unknown]
    .sort((a, b) => {
      const left = a.storedPosition ?? a.defaultIndex
      const right = b.storedPosition ?? b.defaultIndex
      return left === right ? a.defaultIndex - b.defaultIndex : left - right
    })
    .map(({ sectionKey, label, enabled, propsText, propsHint }) => ({ sectionKey, label, enabled, propsText, propsHint }))
}

/** 首页区块编排：`landing_resource` kind `SECTION`，resKey = 页面 key。 */
export const Sections = () => {
  const { canManage } = useOpsPermission()
  const [locale, setLocale] = useState<Locale>('zh')
  const [rows, setRows] = useState<SectionRow[]>(() =>
    DEFAULT_SECTIONS.map((item) => ({ ...item, enabled: true, propsText: '{}' })),
  )
  const [openProps, setOpenProps] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  const { data, loading, error, reload } = useAsync(
    () => getOpsResources({ kind: 'SECTION', locale }),
    [locale],
  )

  useEffect(() => {
    if (data) setRows(mergeSections(data))
  }, [data])

  const move = (index: number, delta: number) => {
    setRows((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const restoreDefaults = () => {
    setRows((prev) => {
      const order = new Map(DEFAULT_SECTIONS.map((item, index) => [item.sectionKey, index]))
      return [...prev].sort(
        (a, b) =>
          (order.get(a.sectionKey) ?? DEFAULT_SECTIONS.length) -
          (order.get(b.sectionKey) ?? DEFAULT_SECTIONS.length),
      )
    })
    toast.success('已恢复默认顺序，点击「保存编排」后生效')
  }

  const save = async () => {
    const items: Array<Partial<OpsResource>> = []
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const parsed = parseJsonObject(row.propsText)
      if (!parsed.ok) {
        toast.error(`「${row.label}」的自定义 props 不是合法 JSON：${parsed.error ?? ''}`)
        return
      }
      items.push({
        resKey: SECTION_PAGE_KEY,
        locale,
        payload: {
          sectionKey: row.sectionKey,
          position: index,
          props: (parsed.value ?? {}) as Record<string, unknown>,
        },
        position: index,
        status: 'PUBLISHED' as const,
        enabled: row.enabled,
      })
    }
    setSaving(true)
    try {
      await saveOpsResourceBatch('SECTION', items)
      toast.success('编排已保存，落地页将实时生效')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="首页区块"
        description="调整首页区块的展示顺序与启用状态；每个区块支持的自定义 props 见展开项。精选模板 / 插件请在「市场运营 → 精选位」维护"
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
              <>
                <Button variant="outline" onClick={restoreDefaults}>
                  <RefreshCw className="mr-1.5 size-4" />
                  恢复默认顺序
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? (
                    <LoaderCircle className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 size-4" />
                  )}
                  保存编排
                </Button>
              </>
            )}
          </>
        }
      />

      <DataState loading={loading} error={error} rows={5} onRetry={reload}>
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>区块顺序</CardTitle>
              <CardDescription>
                共 {rows.length} 个区块 · 语言 {locale === 'zh' ? '中文' : 'English'} · 未保存前不影响线上
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.map((row, index) => (
                <div key={row.sectionKey} className="rounded-lg border">
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="font-mono text-xs text-muted-foreground">{row.sectionKey}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{row.enabled ? '显示' : '隐藏'}</span>
                      <Switch
                        checked={row.enabled}
                        disabled={!canManage}
                        onCheckedChange={(checked) =>
                          setRows((prev) =>
                            prev.map((item) =>
                              item.sectionKey === row.sectionKey ? { ...item, enabled: checked } : item,
                            ),
                          )
                        }
                      />
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          上移
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={index === rows.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          下移
                        </Button>
                      </div>
                    )}
                  </div>
                  <Collapsible
                    open={Boolean(openProps[row.sectionKey])}
                    onOpenChange={(open) =>
                      setOpenProps((prev) => ({ ...prev, [row.sectionKey]: open }))
                    }
                  >
                    <CollapsibleTrigger className="flex w-full items-center gap-1 border-t px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50">
                      {openProps[row.sectionKey] ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                      自定义 props
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-t px-3 py-3">
                      {row.propsHint && (
                        <p className="mb-2 text-xs text-muted-foreground">
                          该区块支持：<span className="font-mono">{row.propsHint}</span>
                        </p>
                      )}
                      <JsonField
                        value={row.propsText}
                        rows={5}
                        disabled={!canManage}
                        hint="仅在上方列出的字段生效；留空为 {}"
                        onChange={(value) =>
                          setRows((prev) =>
                            prev.map((item) =>
                              item.sectionKey === row.sectionKey ? { ...item, propsText: value } : item,
                            ),
                          )
                        }
                      />
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="self-start">
            <CardHeader>
              <CardTitle>顺序预览</CardTitle>
              <CardDescription>落地页自上而下的区块顺序（灰底为已隐藏）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.map((row, index) => (
                <div
                  key={row.sectionKey}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                    row.enabled ? 'bg-background' : 'bg-muted/60 text-muted-foreground'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-5 shrink-0 text-xs text-muted-foreground">{index + 1}</span>
                    <span className="truncate">{row.label}</span>
                  </span>
                  {!row.enabled && <span className="shrink-0 text-xs">已隐藏</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </DataState>
    </div>
  )
}
