import { useState } from 'react'
import {
  Bar,
  BarChart,
  Button,
  Card,
  CardContent,
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
  cn,
  toast,
  type ChartConfig,
} from '@kn/ui'
import { Activity, FlaskConical, ListChecks, LoaderCircle, Pencil, Plus, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { DataState } from '@/components/DataState'
import { JsonField, parseJsonObject, toJsonText } from '@/components/JsonField'
import { useAsync } from '@/lib/use-async'
import { formatDateTime } from '@/lib/use-paged-data'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsExperiment,
  deleteOpsExperiment,
  getOpsExperimentResults,
  getOpsExperiments,
  saveOpsExperimentVariants,
  updateOpsExperiment,
  type OpsExperiment,
  type OpsExperimentVariant,
} from '@/api/ops'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const STATUS_META: Record<OpsExperiment['status'], { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: '草稿', variant: 'muted' },
  RUNNING: { label: '运行中', variant: 'success' },
  PAUSED: { label: '已暂停', variant: 'warning' },
  FINISHED: { label: '已结束', variant: 'info' },
}

const STATUS_OPTIONS: Array<{ value: OpsExperiment['status']; label: string }> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'RUNNING', label: '运行中' },
  { value: 'PAUSED', label: '已暂停' },
  { value: 'FINISHED', label: '已结束' },
]

const DAY_OPTIONS = [7, 30, 90] as const

const RESULT_CONFIG = {
  conversionRate: { label: '转化率', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig

const metaOf = (status: OpsExperiment['status']) =>
  STATUS_META[status] ?? { label: status, variant: 'muted' as BadgeVariant }

/** ISO / LocalDateTime → `<input type="datetime-local">` 需要的本地时间文本。 */
const toLocalInput = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `<input type="datetime-local">` 文本 → 后端可解析的 ISO 字符串。 */
const fromLocalInput = (value: string) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

const percent = (value?: number | null) => (value === null || value === undefined ? '-' : `${Math.round(value * 1000) / 10}%`)

/** lift 为「相对对照组的提升百分比」，null / undefined 时显示占位符。 */
const formatLift = (value?: number | null) => {
  if (value === null || value === undefined) return '-'
  return `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10}%`
}

const probability = (value?: number | null) =>
  value === null || value === undefined ? '-' : `${Math.round(value * 10) / 10}%`

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

interface ExperimentFormState {
  expKey: string
  name: string
  hypothesis: string
  status: OpsExperiment['status']
  trafficSplit: number
  metricEvent: string
  guardrailNote: string
  startTime: string
  endTime: string
}

const EMPTY_FORM: ExperimentFormState = {
  expKey: '',
  name: '',
  hypothesis: '',
  status: 'DRAFT',
  trafficSplit: 100,
  metricEvent: '',
  guardrailNote: '',
  startTime: '',
  endTime: '',
}

interface EditableVariant {
  variantKey: string
  name: string
  weight: number
  isControl: boolean
  payloadText: string
}

/**
 * 实验结果面板：曝光 / 转化 / 转化率 / 提升 / 优于对照概率，含转化率柱状图。
 *
 * 独立成组件，只有打开「结果」时才挂载并发起请求。
 */
const ExperimentResultsPanel = ({ expKey }: { expKey: string }) => {
  const [days, setDays] = useState<number>(30)
  const results = useAsync(() => getOpsExperimentResults(expKey, days), [expKey, days])
  const variants = results.data?.variants ?? []

  const chartData = variants.map((variant) => ({
    name: variant.name || variant.variantKey,
    conversionRate: Math.round((variant.conversionRate ?? 0) * 10000) / 100,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {DAY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDays(option)}
            className={cn(
              'rounded-md px-3 py-1 text-sm transition-colors',
              days === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            近{option}天
          </button>
        ))}
      </div>

      <DataState
        loading={results.loading}
        error={results.error}
        empty={variants.length === 0}
        emptyText="该时间段内没有曝光数据"
        onRetry={results.reload}
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">主指标：{results.data?.metricEvent || '-'}</p>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>变体</TableHead>
                  <TableHead className="text-right">曝光</TableHead>
                  <TableHead className="text-right">转化</TableHead>
                  <TableHead className="text-right">转化率</TableHead>
                  <TableHead className="text-right">提升</TableHead>
                  <TableHead className="text-right">优于对照概率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((variant) => (
                  <TableRow key={variant.variantKey} className={variant.isControl ? 'bg-muted/40' : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{variant.name || variant.variantKey}</span>
                        <span className="font-mono text-xs text-muted-foreground">{variant.variantKey}</span>
                        {variant.isControl && <StatusBadge variant="info">对照</StatusBadge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{variant.exposures ?? 0}</TableCell>
                    <TableCell className="text-right">{variant.conversions ?? 0}</TableCell>
                    <TableCell className="text-right">{percent(variant.conversionRate)}</TableCell>
                    <TableCell className="text-right">{formatLift(variant.lift)}</TableCell>
                    <TableCell className="text-right">{probability(variant.probabilityToBeatControl)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ChartContainer config={RESULT_CONFIG} className="h-[240px] w-full">
            <BarChart data={chartData} margin={{ left: -20 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} unit="%" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="conversionRate" fill="var(--color-conversionRate)" radius={4} />
            </BarChart>
          </ChartContainer>
        </div>
      </DataState>
    </div>
  )
}

/**
 * A/B 实验：实验定义、变体权重、启停与结果对比。
 */
export const Experiments = () => {
  const { canManage } = useOpsPermission()

  const list = useAsync(() => getOpsExperiments(), [])
  const experiments = list.data ?? []

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<OpsExperiment | null>(null)
  const [form, setForm] = useState<ExperimentFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [variantTarget, setVariantTarget] = useState<OpsExperiment | null>(null)
  const [variants, setVariants] = useState<EditableVariant[]>([])
  const [savingVariants, setSavingVariants] = useState(false)

  const [resultsTarget, setResultsTarget] = useState<OpsExperiment | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<OpsExperiment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  const openEdit = (experiment: OpsExperiment) => {
    setEditing(experiment)
    setForm({
      expKey: experiment.expKey,
      name: experiment.name ?? '',
      hypothesis: experiment.hypothesis ?? '',
      status: experiment.status,
      trafficSplit: experiment.trafficSplit ?? 0,
      metricEvent: experiment.metricEvent ?? '',
      guardrailNote: experiment.guardrailNote ?? '',
      startTime: toLocalInput(experiment.startTime),
      endTime: toLocalInput(experiment.endTime),
    })
    setEditorOpen(true)
  }

  const save = async () => {
    if (!canManage) return
    const expKey = form.expKey.trim()
    if (!expKey) {
      toast.error('请填写实验标识')
      return
    }
    if (!form.name.trim()) {
      toast.error('请填写实验名称')
      return
    }
    const trafficSplit = Math.min(100, Math.max(0, Number(form.trafficSplit) || 0))

    setSaving(true)
    try {
      const payload: OpsExperiment = {
        expKey,
        name: form.name.trim(),
        hypothesis: form.hypothesis,
        status: form.status,
        trafficSplit,
        metricEvent: form.metricEvent.trim(),
        guardrailNote: form.guardrailNote,
        startTime: fromLocalInput(form.startTime),
        endTime: fromLocalInput(form.endTime),
      }
      if (editing?.id != null) {
        await updateOpsExperiment(editing.id, { ...editing, ...payload })
        toast.success('实验已更新')
      } else {
        await createOpsExperiment(payload)
        toast.success('实验已创建')
      }
      setEditorOpen(false)
      list.reload()
    } catch (err) {
      toast.error(errorText(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (experiment: OpsExperiment) => {
    if (experiment.id == null) return
    const nextStatus: OpsExperiment['status'] = experiment.status === 'RUNNING' ? 'PAUSED' : 'RUNNING'
    try {
      await updateOpsExperiment(experiment.id, { ...experiment, status: nextStatus })
      toast.success(nextStatus === 'RUNNING' ? '实验已启动' : '实验已暂停')
      list.reload()
    } catch (err) {
      toast.error(errorText(err, '状态更新失败'))
    }
  }

  const openVariants = (experiment: OpsExperiment) => {
    const existing = experiment.variants ?? []
    setVariantTarget(experiment)
    setVariants(
      existing.length > 0
        ? existing.map((variant) => ({
            variantKey: variant.variantKey,
            name: variant.name ?? '',
            weight: variant.weight ?? 0,
            isControl: Boolean(variant.isControl),
            payloadText: toJsonText(variant.payload),
          }))
        : [
            { variantKey: 'control', name: '对照组', weight: 50, isControl: true, payloadText: '{}' },
            { variantKey: 'variant_a', name: '变体 A', weight: 50, isControl: false, payloadText: '{}' },
          ],
    )
  }

  const updateVariant = (index: number, patch: Partial<EditableVariant>) =>
    setVariants((prev) => prev.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)))

  const addVariant = () =>
    setVariants((prev) => [
      ...prev,
      { variantKey: `variant_${prev.length}`, name: '', weight: 0, isControl: false, payloadText: '{}' },
    ])

  const moveVariant = (index: number, delta: number) =>
    setVariants((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })

  const removeVariant = (index: number) => setVariants((prev) => prev.filter((_, i) => i !== index))

  const saveVariants = async () => {
    if (!canManage || variantTarget?.id == null) return
    if (variants.length === 0) {
      toast.error('至少需要一个变体')
      return
    }

    const keys = variants.map((variant) => variant.variantKey.trim())
    if (keys.some((key) => !key)) {
      toast.error('变体标识不能为空')
      return
    }
    const duplicated = keys.find((key, index) => keys.indexOf(key) !== index)
    if (duplicated) {
      toast.error(`变体标识重复：${duplicated}`)
      return
    }
    if (variants.filter((variant) => variant.isControl).length !== 1) {
      toast.error('必须且只能指定一个对照组')
      return
    }

    const payloads: Record<string, unknown>[] = []
    for (let i = 0; i < variants.length; i += 1) {
      const parsed = parseJsonObject(variants[i].payloadText)
      if (!parsed.ok) {
        toast.error(`变体「${keys[i]}」的 payload JSON 格式错误：${parsed.error}`)
        return
      }
      payloads.push((parsed.value ?? {}) as Record<string, unknown>)
    }

    setSavingVariants(true)
    try {
      const payload: OpsExperimentVariant[] = variants.map((variant, index) => ({
        variantKey: keys[index],
        name: variant.name.trim(),
        weight: Number(variant.weight) || 0,
        isControl: variant.isControl,
        payload: payloads[index],
        position: index,
      }))
      await saveOpsExperimentVariants(variantTarget.id, payload)
      toast.success('变体已保存')
      setVariantTarget(null)
      list.reload()
    } catch (err) {
      toast.error(errorText(err, '保存失败'))
    } finally {
      setSavingVariants(false)
    }
  }

  const confirmDelete = async () => {
    if (deleteTarget?.id == null) return
    setDeleting(true)
    try {
      await deleteOpsExperiment(deleteTarget.id)
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
        title="A/B 实验"
        description="按流量比例灰度实验变体，用主指标对比转化率与显著性"
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              新建实验
            </Button>
          ) : undefined
        }
      />

      <DataState
        loading={list.loading}
        error={list.error}
        empty={experiments.length === 0}
        emptyText="还没有实验，先新建一个吧"
        onRetry={list.reload}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>实验标识</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">流量</TableHead>
                    <TableHead>主指标</TableHead>
                    <TableHead className="text-right">变体数</TableHead>
                    <TableHead>起止时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {experiments.map((experiment) => {
                    const meta = metaOf(experiment.status)
                    return (
                      <TableRow key={experiment.id ?? experiment.expKey}>
                        <TableCell className="font-mono text-xs">{experiment.expKey}</TableCell>
                        <TableCell className="max-w-48 truncate font-medium" title={experiment.name}>
                          {experiment.name || '-'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">{experiment.trafficSplit ?? 0}%</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {experiment.metricEvent || '-'}
                        </TableCell>
                        <TableCell className="text-right">{(experiment.variants ?? []).length}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(experiment.startTime)} ~ {formatDateTime(experiment.endTime)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {canManage && (
                              <>
                                <Switch
                                  checked={experiment.status === 'RUNNING'}
                                  disabled={experiment.status === 'FINISHED'}
                                  onCheckedChange={() => toggleStatus(experiment)}
                                  title={experiment.status === 'RUNNING' ? '暂停' : '启动'}
                                />
                                <Button variant="ghost" size="sm" onClick={() => openEdit(experiment)}>
                                  <Pencil className="mr-1 size-3.5" />
                                  编辑
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => openVariants(experiment)}>
                                  <ListChecks className="mr-1 size-3.5" />
                                  变体
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setResultsTarget(experiment)}>
                              <Activity className="mr-1 size-3.5" />
                              结果
                            </Button>
                            {canManage && (
                              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(experiment)}>
                                <Trash2 className="mr-1 size-3.5 text-destructive" />
                                删除
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

      {/* 新建 / 编辑 */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑实验' : '新建实验'}</DialogTitle>
            <DialogDescription>实验标识会写进曝光事件的属性，创建后不可修改。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>实验标识（expKey）</Label>
                <Input
                  value={form.expKey}
                  disabled={Boolean(editing)}
                  placeholder="hero_cta_copy"
                  onChange={(event) => setForm((prev) => ({ ...prev, expKey: event.target.value.trim() }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>名称</Label>
                <Input
                  value={form.name}
                  placeholder="首屏 CTA 文案对比"
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>实验假设</Label>
              <Textarea
                value={form.hypothesis}
                rows={3}
                placeholder="如果 CTA 改成「免费开始」，订阅转化率会提升。"
                onChange={(event) => setForm((prev) => ({ ...prev, hypothesis: event.target.value }))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, status: value as OpsExperiment['status'] }))
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

              <div className="space-y-1.5">
                <Label>流量比例（%）</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.trafficSplit}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, trafficSplit: Number(event.target.value) || 0 }))
                  }
                />
                <p className="text-xs text-muted-foreground">0-100，进入实验的访客占比</p>
              </div>

              <div className="space-y-1.5">
                <Label>主指标事件</Label>
                <Input
                  value={form.metricEvent}
                  placeholder="cta_click"
                  onChange={(event) => setForm((prev) => ({ ...prev, metricEvent: event.target.value.trim() }))}
                />
                <p className="text-xs text-muted-foreground">例如 cta_click / subscribe</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>护栏说明</Label>
              <Input
                value={form.guardrailNote}
                placeholder="如：跳出率上涨 5% 立即停止"
                onChange={(event) => setForm((prev) => ({ ...prev, guardrailNote: event.target.value }))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>开始时间</Label>
                <Input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>结束时间</Label>
                <Input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                />
              </div>
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

      {/* 变体编排 */}
      <Dialog open={Boolean(variantTarget)} onOpenChange={(open) => !open && setVariantTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>变体编排 · {variantTarget?.name}</DialogTitle>
            <DialogDescription>必须且只能指定一个对照组；变体标识需唯一。</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">共 {variants.length} 个变体</p>
              <Button variant="outline" size="sm" onClick={addVariant}>
                <Plus className="mr-1 size-3.5" />
                添加变体
              </Button>
            </div>

            {variants.length === 0 && (
              <p className="text-sm text-muted-foreground">还没有变体，至少需要对照组 + 一个实验组。</p>
            )}

            {variants.map((variant, index) => (
              <div key={index} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={variant.isControl}
                        onCheckedChange={(next) =>
                          // 类单选：打开某个变体的对照组时，其余变体自动取消。
                          setVariants((prev) => prev.map((item, i) => ({ ...item, isControl: next && i === index })))
                        }
                      />
                      <span className="text-sm">{variant.isControl ? '对照组' : '实验组'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => moveVariant(index, -1)}>
                      上移
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={index === variants.length - 1}
                      onClick={() => moveVariant(index, 1)}
                    >
                      下移
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeVariant(index)}>
                      <Trash2 className="mr-1 size-3.5 text-destructive" />
                      删除
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>变体标识</Label>
                    <Input
                      value={variant.variantKey}
                      placeholder="control"
                      onChange={(event) => updateVariant(index, { variantKey: event.target.value.trim() })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>名称</Label>
                    <Input
                      value={variant.name}
                      placeholder="对照组 / 变体 A"
                      onChange={(event) => updateVariant(index, { name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>权重</Label>
                    <Input
                      type="number"
                      min={0}
                      value={variant.weight}
                      onChange={(event) =>
                        updateVariant(index, { weight: Number(event.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                <JsonField
                  label="payload"
                  rows={5}
                  value={variant.payloadText}
                  hint='变体覆盖的配置，如 { "ctaLabel": "免费开始" }'
                  onChange={(value) => updateVariant(index, { payloadText: value })}
                />
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVariantTarget(null)}>
              取消
            </Button>
            <Button onClick={saveVariants} disabled={savingVariants || !canManage}>
              {savingVariants && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 实验结果 */}
      <Dialog open={Boolean(resultsTarget)} onOpenChange={(open) => !open && setResultsTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>实验结果 · {resultsTarget?.name}</DialogTitle>
            <DialogDescription>
              <span className="inline-flex items-center gap-1">
                <FlaskConical className="size-3.5" />
                {resultsTarget?.expKey}
              </span>
            </DialogDescription>
          </DialogHeader>
          {resultsTarget && <ExperimentResultsPanel expKey={resultsTarget.expKey} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultsTarget(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除实验</DialogTitle>
            <DialogDescription>确认删除「{deleteTarget?.name}」？该操作不可恢复。</DialogDescription>
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
