import { useCallback, useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CartesianGrid,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
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
  XAxis,
  YAxis,
  toast,
  type ChartConfig,
} from '@kn/ui'
import { Activity, Copy, Download, Link2, LoaderCircle, Pencil, Plus, QrCode, Trash2, Upload } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsLink,
  deleteOpsLink,
  getOpsLinkConversions,
  getOpsLinks,
  getOpsLinkStats,
  importOpsLinks,
  updateOpsLink,
  type OpsLink,
  type OpsLinkStatsPoint,
} from '@/api/ops'
import { qrToSvg } from '@/lib/qr'

/** 演示 / 占位目标地址；可通过 VITE_LANDING_DEMO_URL 覆盖，不做预填。 */
const DEFAULT_DEMO_URL = import.meta.env.VITE_LANDING_DEMO_URL ?? 'https://example.com'

const CSV_COLUMNS = 'slug,target,label,channel,utm_source,utm_medium,utm_campaign'

const clickConfig = {
  clicks: { label: '点击', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig

interface CreateForm {
  label: string
  slug: string
  target: string
  channel: string
  groupName: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
}

const emptyForm: CreateForm = {
  label: '',
  slug: '',
  target: '',
  channel: '',
  groupName: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
}

const CREATE_FIELDS = [
  ['label', '名称（如：知乎首发）'],
  ['slug', '短链标识（留空自动生成）'],
  ['target', `目标地址（例如 ${DEFAULT_DEMO_URL}/templates）`],
  ['channel', '渠道（zhihu / juejin …）'],
  ['groupName', '分组（如：launch）'],
  ['utmSource', 'utm_source'],
  ['utmMedium', 'utm_medium'],
  ['utmCampaign', 'utm_campaign'],
] as const

const EDIT_FIELDS = [
  ['slug', '短链标识'],
  ['label', '名称'],
  ['target', '目标地址'],
  ['channel', '渠道'],
  ['groupName', '分组'],
  ['utmSource', 'utm_source'],
  ['utmMedium', 'utm_medium'],
  ['utmCampaign', 'utm_campaign'],
] as const

const isValidTarget = (target: string) => /^https?:\/\//i.test(target) || target.startsWith('/')

/** 后端 conversionRate 已是百分比数值（0-100），这里只保留一位小数。 */
const formatRate = (value: number) => `${Math.round((value || 0) * 10) / 10}%`

export const ChannelLinks = () => {
  const { canManage } = useOpsPermission()

  const [groupFilter, setGroupFilter] = useState('')
  const [groupOptions, setGroupOptions] = useState<string[]>([])

  const linksState = useAsync(
    () => getOpsLinks(groupFilter ? { groupName: groupFilter } : undefined),
    [groupFilter],
  )
  const links = linksState.data ?? []

  const conversionsState = useAsync(() => getOpsLinkConversions(30), [])
  const conversions = conversionsState.data ?? []

  const [form, setForm] = useState<CreateForm>(emptyForm)
  const [creating, setCreating] = useState(false)

  const [editTarget, setEditTarget] = useState<OpsLink | null>(null)
  const [editForm, setEditForm] = useState<CreateForm>(emptyForm)
  const [savingEdit, setSavingEdit] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<OpsLink | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [togglingId, setTogglingId] = useState<number | null>(null)

  const [trendTarget, setTrendTarget] = useState<OpsLink | null>(null)
  const [trendData, setTrendData] = useState<OpsLinkStatsPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState<string | null>(null)

  const [qrTarget, setQrTarget] = useState<OpsLink | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importCsv, setImportCsv] = useState('')
  const [importing, setImporting] = useState(false)

  const shortUrl = (slug: string) => `${window.location.origin}/api/knowledge-system/ops/go/${slug}`

  /** 分组下拉的可选项：始终基于未过滤的全量短链。 */
  const loadGroups = useCallback(() => {
    getOpsLinks()
      .then((rows) => {
        const names = Array.from(
          new Set(rows.map((row) => row.groupName).filter((value): value is string => Boolean(value))),
        ).sort()
        setGroupOptions(names)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // 点击趋势：按打开的行加载近 30 天数据。
  useEffect(() => {
    if (!trendTarget) return
    let cancelled = false
    setTrendLoading(true)
    setTrendError(null)
    setTrendData([])
    getOpsLinkStats(trendTarget.slug, 30)
      .then((rows) => {
        if (!cancelled) setTrendData(rows ?? [])
      })
      .catch((err) => {
        if (!cancelled) setTrendError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [trendTarget])

  const copy = async (text: string, message = '已复制') => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(message)
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const downloadQrSvg = (slug: string) => {
    const blob = new Blob([qrToSvg(shortUrl(slug), { size: 200 })], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${slug}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  const create = async () => {
    if (!form.target.trim()) {
      toast.error('请填写目标地址')
      return
    }
    if (!isValidTarget(form.target.trim())) {
      toast.error('目标地址需以 http(s):// 或 / 开头')
      return
    }
    setCreating(true)
    try {
      await createOpsLink({
        slug: form.slug || undefined,
        target: form.target.trim(),
        label: form.label || undefined,
        channel: form.channel || undefined,
        groupName: form.groupName || undefined,
        utm: {
          ...(form.utmSource ? { source: form.utmSource } : {}),
          ...(form.utmMedium ? { medium: form.utmMedium } : {}),
          ...(form.utmCampaign ? { campaign: form.utmCampaign } : {}),
        },
      })
      toast.success('短链已创建')
      setForm(emptyForm)
      linksState.reload()
      loadGroups()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (link: OpsLink) => {
    setEditTarget(link)
    setEditForm({
      label: link.label ?? '',
      slug: link.slug,
      target: link.target,
      channel: link.channel ?? '',
      groupName: link.groupName ?? '',
      utmSource: link.utmSource ?? '',
      utmMedium: link.utmMedium ?? '',
      utmCampaign: link.utmCampaign ?? '',
    })
  }

  const saveEdit = async () => {
    if (!editTarget) return
    if (!editForm.target.trim()) {
      toast.error('请填写目标地址')
      return
    }
    if (!isValidTarget(editForm.target.trim())) {
      toast.error('目标地址需以 http(s):// 或 / 开头')
      return
    }
    setSavingEdit(true)
    try {
      await updateOpsLink(editTarget.id, {
        slug: editForm.slug.trim() || undefined,
        label: editForm.label || undefined,
        target: editForm.target.trim(),
        channel: editForm.channel || undefined,
        groupName: editForm.groupName || undefined,
        utmSource: editForm.utmSource || undefined,
        utmMedium: editForm.utmMedium || undefined,
        utmCampaign: editForm.utmCampaign || undefined,
      })
      toast.success('短链已更新')
      setEditTarget(null)
      linksState.reload()
      loadGroups()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setSavingEdit(false)
    }
  }

  const toggleEnabled = async (link: OpsLink, enabled: boolean) => {
    setTogglingId(link.id)
    try {
      await updateOpsLink(link.id, { enabled })
      toast.success(enabled ? '已启用' : '已停用')
      linksState.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setTogglingId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteOpsLink(deleteTarget.id)
      toast.success('已删除')
      setDeleteTarget(null)
      linksState.reload()
      loadGroups()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const submitImport = async () => {
    if (!importCsv.trim()) {
      toast.error('请粘贴 CSV 内容')
      return
    }
    setImporting(true)
    try {
      const res = await importOpsLinks({ csv: importCsv })
      toast.success(`导入 ${res?.imported ?? 0} / 跳过 ${res?.skipped ?? 0}`)
      setImportOpen(false)
      setImportCsv('')
      linksState.reload()
      loadGroups()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="渠道链接"
        description="为知乎、掘金、V2EX 等渠道生成带 UTM 的短链，点击自动计数"
        actions={
          canManage ? (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 size-4" />
              CSV 批量导入
            </Button>
          ) : undefined
        }
      />

      {canManage && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>新建短链</CardTitle>
            <CardDescription>短链形如 {shortUrl('slug')}，跳转时自动附加 UTM</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {CREATE_FIELDS.map(([field, placeholder]) => (
                <Input
                  key={field}
                  value={form[field]}
                  placeholder={placeholder}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                />
              ))}
            </div>
            <Button className="mt-4" onClick={() => void create()} disabled={creating}>
              {creating ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : <Plus className="mr-1.5 size-4" />}
              创建短链
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>短链列表</CardTitle>
              <CardDescription>共 {links.length} 条</CardDescription>
            </div>
            <Select value={groupFilter || 'all'} onValueChange={(value) => setGroupFilter(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="全部分组" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分组</SelectItem>
                {groupOptions.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataState
            loading={linksState.loading}
            error={linksState.error}
            empty={links.length === 0}
            emptyText="暂无短链"
            onRetry={linksState.reload}
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>短链</TableHead>
                    <TableHead>渠道 / 分组</TableHead>
                    <TableHead>UTM</TableHead>
                    <TableHead className="text-right">点击</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">{link.label || link.slug}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => void copy(shortUrl(link.slug), '短链已复制')}
                          className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
                          title={shortUrl(link.slug)}
                        >
                          <Link2 className="size-3.5" />
                          /go/{link.slug}
                          <Copy className="size-3.5" />
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {[link.channel, link.groupName].filter(Boolean).join(' / ') || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {[link.utmSource, link.utmMedium, link.utmCampaign].filter(Boolean).join(' / ') || '-'}
                      </TableCell>
                      <TableCell className="text-right">{link.clicks ?? 0}</TableCell>
                      <TableCell>
                        <Switch
                          checked={Boolean(link.enabled)}
                          disabled={!canManage || togglingId === link.id}
                          onCheckedChange={(checked) => void toggleEnabled(link, checked)}
                          aria-label="启用状态"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" title="点击趋势" onClick={() => setTrendTarget(link)}>
                            <Activity className="size-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="二维码" onClick={() => setQrTarget(link)}>
                            <QrCode className="size-4" />
                          </Button>
                          {canManage && (
                            <>
                              <Button variant="ghost" size="sm" title="编辑" onClick={() => openEdit(link)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="sm" title="删除" onClick={() => setDeleteTarget(link)}>
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

      {/* 渠道转化对比 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>渠道转化对比</CardTitle>
          <CardDescription>近 30 天：短链点击 → 访客 → 转化</CardDescription>
        </CardHeader>
        <CardContent>
          <DataState
            loading={conversionsState.loading}
            error={conversionsState.error}
            empty={conversions.length === 0}
            emptyText="暂无转化数据"
            onRetry={conversionsState.reload}
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>短链</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead className="text-right">点击</TableHead>
                    <TableHead className="text-right">访客</TableHead>
                    <TableHead className="text-right">转化</TableHead>
                    <TableHead className="text-right">转化率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversions.map((row) => (
                    <TableRow key={row.slug}>
                      <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                      <TableCell>{row.label || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{row.channel || '-'}</TableCell>
                      <TableCell className="text-right">{row.clicks}</TableCell>
                      <TableCell className="text-right">{row.visitors}</TableCell>
                      <TableCell className="text-right">{row.conversions}</TableCell>
                      <TableCell className="text-right">{formatRate(row.conversionRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DataState>
        </CardContent>
      </Card>

      {/* 编辑 */}
      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => (!open ? setEditTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑短链</DialogTitle>
            <DialogDescription>{editTarget?.slug}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {EDIT_FIELDS.map(([field, label]) => (
              <div key={field} className={field === 'target' ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
                <Label htmlFor={`link-edit-${field}`}>{label}</Label>
                <Input
                  id={`link-edit-${field}`}
                  value={editForm[field]}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={savingEdit} onClick={() => setEditTarget(null)}>取消</Button>
            <Button disabled={savingEdit} onClick={() => void saveEdit()}>
              {savingEdit && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 点击趋势 */}
      <Dialog open={Boolean(trendTarget)} onOpenChange={(open) => (!open ? setTrendTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>点击趋势</DialogTitle>
            <DialogDescription>
              {trendTarget?.label || trendTarget?.slug} · 近 30 天
            </DialogDescription>
          </DialogHeader>
          {trendLoading ? (
            <div className="flex h-56 items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
            </div>
          ) : trendError ? (
            <p className="text-sm text-destructive">{trendError}</p>
          ) : trendData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">暂无点击数据</p>
          ) : (
            <ChartContainer config={clickConfig} className="h-[260px] w-full">
              <AreaChart data={trendData} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => value.slice(5)}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="clicks"
                  type="monotone"
                  stroke="var(--color-clicks)"
                  fill="var(--color-clicks)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrendTarget(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 二维码 */}
      <Dialog open={Boolean(qrTarget)} onOpenChange={(open) => (!open ? setQrTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>短链二维码</DialogTitle>
            <DialogDescription>{qrTarget ? shortUrl(qrTarget.slug) : ''}</DialogDescription>
          </DialogHeader>
          {qrTarget && (
            <div className="space-y-4">
              <div
                className="mx-auto flex w-fit justify-center rounded-lg border bg-white p-3"
                dangerouslySetInnerHTML={{ __html: qrToSvg(shortUrl(qrTarget.slug), { size: 200 }) }}
              />
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => void copy(shortUrl(qrTarget.slug), '短链已复制')}>
                  <Copy className="mr-1.5 size-4" />
                  复制短链
                </Button>
                <Button onClick={() => downloadQrSvg(qrTarget.slug)}>
                  <Download className="mr-1.5 size-4" />
                  下载 SVG
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrTarget(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV 批量导入 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>批量导入短链</DialogTitle>
            <DialogDescription>
              CSV 列顺序：<span className="font-mono">{CSV_COLUMNS}</span>；slug 重复的行会被跳过。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={8}
            value={importCsv}
            placeholder={`${CSV_COLUMNS}\nzhihu-1,${DEFAULT_DEMO_URL}/templates,知乎首发,zhihu,launch,zhihu,social,launch`}
            onChange={(e) => setImportCsv(e.target.value)}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={importing} onClick={() => setImportOpen(false)}>取消</Button>
            <Button disabled={importing} onClick={() => void submitImport()}>
              {importing && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除二次确认 */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除短链</DialogTitle>
            <DialogDescription>
              确认删除短链「{deleteTarget?.slug}」？该操作不可恢复。
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
