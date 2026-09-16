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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
  toast,
} from '@kn/ui'
import { GripVertical, LoaderCircle, Pencil, Plus, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsFunnel,
  deleteOpsFunnel,
  getOpsFunnelStats,
  getOpsFunnels,
  postOpsFunnel,
  updateOpsFunnel,
  type OpsFunnelDef,
  type OpsFunnelStep,
  type OpsFunnelStepDef,
} from '@/api/ops'

const DAY_OPTIONS = [7, 30, 90] as const
const DEFAULT_QUICK_INPUT = 'pageview,cta_click,plugin_install'

/** 约定：后端 conversionRate 一律为百分比数值（0-100），前端只做格式化。 */
const formatPercent = (value?: number | null) => {
  const v = value ?? 0
  return `${v.toFixed(1)}%`
}

interface FunnelForm {
  funnelKey: string
  name: string
  description: string
  enabled: boolean
  steps: OpsFunnelStepDef[]
}

const emptyStep = (): OpsFunnelStepDef => ({ label: '', type: 'event', value: '' })

const emptyForm: FunnelForm = {
  funnelKey: '',
  name: '',
  description: '',
  enabled: true,
  steps: [emptyStep(), emptyStep()],
}

/** 漏斗步骤横向条形图：条宽按「距首步转化率」计算，百分比标注在右侧。 */
const StepBars = ({ steps }: { steps: OpsFunnelStep[] }) => {
  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无步骤数据。</p>
  }
  return (
    <div className="space-y-4">
      {steps.map((step) => {
        const width = Math.min(100, Math.max(0, (step.rateFromFirst ?? 0) * 100))
        return (
          <div key={step.index}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {step.index + 1}. {step.label}
              </span>
              <span className="text-muted-foreground">
                {step.visitors} 访客 · 距上一步 {formatPercent(step.rateFromPrevious)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${width}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatPercent(step.rateFromFirst)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const Funnels = () => {
  const { canManage } = useOpsPermission()
  const [days, setDays] = useState<number>(30)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const { data: funnels, loading, error, reload } = useAsync(() => getOpsFunnels(), [])
  const list = funnels ?? []

  useEffect(() => {
    if (list.length === 0) {
      if (selectedKey !== null) setSelectedKey(null)
      return
    }
    if (!selectedKey || !list.some((item) => item.funnelKey === selectedKey)) {
      setSelectedKey(list[0].funnelKey)
    }
  }, [list, selectedKey])

  const selected = list.find((item) => item.funnelKey === selectedKey) ?? null

  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
    reload: reloadStats,
  } = useAsync(
    () => (selected ? getOpsFunnelStats(selected.funnelKey, days) : Promise.resolve(null)),
    [selected?.funnelKey, days],
  )
  const steps = stats?.steps ?? []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OpsFunnelDef | null>(null)
  const [form, setForm] = useState<FunnelForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OpsFunnelDef | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [quickInput, setQuickInput] = useState(DEFAULT_QUICK_INPUT)
  const [quickResult, setQuickResult] = useState<OpsFunnelStep[]>([])
  const [quickLoading, setQuickLoading] = useState(false)

  const isEdit = Boolean(editing?.id)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (funnel: OpsFunnelDef) => {
    setEditing(funnel)
    setForm({
      funnelKey: funnel.funnelKey,
      name: funnel.name,
      description: funnel.description ?? '',
      enabled: funnel.enabled,
      steps: funnel.steps?.length ? funnel.steps.map((step) => ({ ...step })) : [emptyStep(), emptyStep()],
    })
    setDialogOpen(true)
  }

  const updateStep = (index: number, patch: Partial<OpsFunnelStepDef>) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }))
  }

  const addStep = () => setForm((prev) => ({ ...prev, steps: [...prev.steps, emptyStep()] }))

  const removeStep = (index: number) =>
    setForm((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }))

  const moveStep = (index: number, delta: number) =>
    setForm((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.steps.length) return prev
      const next = [...prev.steps]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return { ...prev, steps: next }
    })

  const save = async () => {
    if (!form.funnelKey.trim()) {
      toast.error('请填写漏斗标识')
      return
    }
    if (!form.name.trim()) {
      toast.error('请填写漏斗名称')
      return
    }
    if (form.steps.length < 2) {
      toast.error('漏斗至少需要 2 个步骤')
      return
    }
    if (form.steps.some((step) => !step.label.trim() || !step.value.trim())) {
      toast.error('每个步骤的名称和匹配值都不能为空')
      return
    }
    const payload: OpsFunnelDef = {
      funnelKey: form.funnelKey.trim(),
      name: form.name.trim(),
      steps: form.steps.map((step) => ({
        label: step.label.trim(),
        type: step.type,
        value: step.value.trim(),
      })),
      description: form.description.trim() || undefined,
      enabled: form.enabled,
      position: editing?.position ?? list.length,
    }
    setSaving(true)
    try {
      if (isEdit && editing?.id) {
        await updateOpsFunnel(editing.id, payload)
      } else {
        await createOpsFunnel(payload)
      }
      toast.success(isEdit ? '漏斗已更新' : '漏斗已创建')
      setDialogOpen(false)
      setSelectedKey(payload.funnelKey)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const confirmRemove = async () => {
    if (!pendingDelete?.id) return
    setDeleting(true)
    try {
      await deleteOpsFunnel(pendingDelete.id)
      toast.success('漏斗已删除')
      setPendingDelete(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const runQuick = async () => {
    const quickSteps = quickInput
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((value) => ({ type: 'event' as const, value }))
    if (quickSteps.length === 0) {
      toast.error('请输入至少一个事件名')
      return
    }
    setQuickLoading(true)
    try {
      const res = await postOpsFunnel({ days, steps: quickSteps })
      setQuickResult(res?.result ?? [])
    } catch (err) {
      setQuickResult([])
      toast.error(err instanceof Error ? err.message : '试算失败')
    } finally {
      setQuickLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="保存漏斗"
        description="把常用的事件 / 路径序列保存为漏斗，随时查看逐步转化"
        actions={
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
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="self-start">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle>已保存漏斗</CardTitle>
              <CardDescription>共 {list.length} 个</CardDescription>
            </div>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 size-4" />
                新建
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <DataState
              loading={loading}
              error={error}
              onRetry={reload}
              empty={list.length === 0}
              emptyText="暂无保存的漏斗"
            >
              <div className="space-y-1">
                {list.map((item) => (
                  <button
                    key={item.funnelKey}
                    type="button"
                    onClick={() => setSelectedKey(item.funnelKey)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                      item.funnelKey === selectedKey
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted',
                    )}
                  >
                    <span className="block truncate font-medium">{item.name}</span>
                    <span
                      className={cn(
                        'block truncate font-mono text-xs',
                        item.funnelKey === selectedKey ? 'text-primary-foreground/80' : 'text-muted-foreground',
                      )}
                    >
                      {item.funnelKey} · {item.steps?.length ?? 0} 步
                    </span>
                  </button>
                ))}
              </div>
            </DataState>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle>{selected ? `${selected.name} · 漏斗效果` : '漏斗效果'}</CardTitle>
                <CardDescription>
                  {selected ? `近 ${days} 天，条宽为距首步转化率` : '选择左侧漏斗查看逐步转化'}
                </CardDescription>
              </div>
              {canManage && selected && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" title="编辑漏斗" onClick={() => openEdit(selected)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" title="删除漏斗" onClick={() => setPendingDelete(selected)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <DataState
                loading={statsLoading}
                error={statsError}
                onRetry={reloadStats}
                empty={!selected || steps.length === 0}
                emptyText={selected ? '该漏斗近周期内暂无数据' : '请先选择或新建漏斗'}
                rows={4}
              >
                <StepBars steps={steps} />
              </DataState>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>快速试算</CardTitle>
              <CardDescription>输入事件名（英文逗号分隔）临时计算漏斗，不会保存</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={quickInput}
                  placeholder={DEFAULT_QUICK_INPUT}
                  onChange={(e) => setQuickInput(e.target.value)}
                />
                <Button onClick={runQuick} disabled={quickLoading}>
                  {quickLoading && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
                  试算
                </Button>
              </div>
              <div className="mt-4">
                {quickResult.length === 0 ? (
                  <p className="text-sm text-muted-foreground">输入事件名后点击「试算」查看结果。</p>
                ) : (
                  <StepBars steps={quickResult} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑漏斗' : '新建漏斗'}</DialogTitle>
            <DialogDescription>按顺序添加步骤，至少 2 步；类型支持事件与路径</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>标识</Label>
                <Input
                  value={form.funnelKey}
                  disabled={isEdit}
                  placeholder="如 signup_funnel"
                  onChange={(e) => setForm((prev) => ({ ...prev, funnelKey: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>名称</Label>
                <Input
                  value={form.name}
                  placeholder="如 注册转化漏斗"
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>描述</Label>
              <Input
                value={form.description}
                placeholder="选填"
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <div className="flex h-10 items-center gap-2">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
                />
                <span className="text-sm text-muted-foreground">{form.enabled ? '启用' : '停用'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>步骤</Label>
              {form.steps.map((step, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2"
                >
                  <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                  <Input
                    value={step.label}
                    placeholder="步骤名称"
                    className="w-32"
                    onChange={(e) => updateStep(index, { label: e.target.value })}
                  />
                  <Select
                    value={step.type}
                    onValueChange={(value) => updateStep(index, { type: value as OpsFunnelStepDef['type'] })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">事件</SelectItem>
                      <SelectItem value="path">路径</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={step.value}
                    placeholder={step.type === 'event' ? '事件名' : '路径'}
                    className="min-w-40 flex-1"
                    onChange={(e) => updateStep(index, { value: e.target.value })}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => moveStep(index, -1)}
                  >
                    上移
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index === form.steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                  >
                    下移
                  </Button>
                  <Button variant="ghost" size="sm" title="删除步骤" onClick={() => removeStep(index)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="mr-1.5 size-4" />
                添加步骤
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除漏斗</DialogTitle>
            <DialogDescription>确认删除「{pendingDelete?.name}」？该操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={deleting}>
              {deleting && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
