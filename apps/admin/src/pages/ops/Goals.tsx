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
  cn,
  toast,
} from '@kn/ui'
import { ArrowUpRight, ChevronDown, LoaderCircle, Pencil, Plus, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { DataState } from '@/components/DataState'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsGoal,
  deleteOpsGoal,
  getOpsGoalStats,
  getOpsGoals,
  updateOpsGoal,
  type OpsGoal,
} from '@/api/ops'

const DAY_OPTIONS = [7, 30, 90] as const

/** 约定：后端 conversionRate 一律为百分比数值（0-100），前端只做格式化。 */
const formatPercent = (value?: number | null) => {
  const v = value ?? 0
  return `${v.toFixed(2)}%`
}

interface GoalForm {
  goalKey: string
  name: string
  stepType: OpsGoal['stepType']
  stepValue: string
  description: string
  position: string
  enabled: boolean
}

const emptyForm: GoalForm = {
  goalKey: '',
  name: '',
  stepType: 'EVENT',
  stepValue: '',
  description: '',
  position: '0',
  enabled: true,
}

export const Goals = () => {
  const { canManage } = useOpsPermission()
  const [days, setDays] = useState<number>(30)

  const { data, loading, error, reload } = useAsync(
    () => Promise.all([getOpsGoals(), getOpsGoalStats(days)]),
    [days],
  )
  const goals = data?.[0] ?? []
  const stats = data?.[1] ?? []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OpsGoal | null>(null)
  const [form, setForm] = useState<GoalForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OpsGoal | null>(null)
  const [deleting, setDeleting] = useState(false)

  const isEdit = Boolean(editing?.id)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (goal: OpsGoal) => {
    setEditing(goal)
    setForm({
      goalKey: goal.goalKey,
      name: goal.name,
      stepType: goal.stepType,
      stepValue: goal.stepValue,
      description: goal.description ?? '',
      position: String(goal.position ?? 0),
      enabled: goal.enabled,
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.goalKey.trim()) {
      toast.error('请填写目标标识')
      return
    }
    if (!form.name.trim()) {
      toast.error('请填写目标名称')
      return
    }
    if (!form.stepValue.trim()) {
      toast.error('请填写匹配值')
      return
    }
    const payload: OpsGoal = {
      goalKey: form.goalKey.trim(),
      name: form.name.trim(),
      stepType: form.stepType,
      stepValue: form.stepValue.trim(),
      description: form.description.trim() || undefined,
      enabled: form.enabled,
      position: Number(form.position) || 0,
    }
    setSaving(true)
    try {
      if (isEdit && editing?.id) {
        await updateOpsGoal(editing.id, payload)
      } else {
        await createOpsGoal(payload)
      }
      toast.success(isEdit ? '目标已更新' : '目标已创建')
      setDialogOpen(false)
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
      await deleteOpsGoal(pendingDelete.id)
      toast.success('目标已删除')
      setPendingDelete(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const changeCell = (value?: number | null) => {
    const v = value ?? 0
    const up = v >= 0
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1',
          up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
        )}
      >
        {up ? <ArrowUpRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {`${up ? '+' : ''}${v.toFixed(2)}%`}
      </span>
    )
  }

  return (
    <div>
      <PageHeader
        title="转化目标"
        description="定义落地页的关键转化行为，并跟踪各目标的转化效果"
        actions={
          <div className="flex items-center gap-2">
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
            {canManage && (
              <Button onClick={openCreate}>
                <Plus className="mr-1.5 size-4" />
                新建目标
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>目标效果</CardTitle>
          <CardDescription>近 {days} 天各目标的转化数与环比</CardDescription>
        </CardHeader>
        <CardContent>
          <DataState
            loading={loading}
            error={error}
            onRetry={reload}
            empty={stats.length === 0}
            emptyText="暂无目标效果数据"
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>标识</TableHead>
                    <TableHead className="text-right">转化数</TableHead>
                    <TableHead className="text-right">访客数</TableHead>
                    <TableHead className="text-right">转化率</TableHead>
                    <TableHead className="text-right">上周期转化</TableHead>
                    <TableHead className="text-right">环比</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map((row) => (
                    <TableRow key={row.goalKey}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.goalKey}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.conversions}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.visitors}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(row.conversionRate)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.previousConversions}
                      </TableCell>
                      <TableCell className="text-right">{changeCell(row.changePct)}</TableCell>
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
          <CardTitle>目标配置</CardTitle>
          <CardDescription>共 {goals.length} 个目标</CardDescription>
        </CardHeader>
        <CardContent>
          <DataState
            loading={loading}
            error={error}
            onRetry={reload}
            empty={goals.length === 0}
            emptyText="暂无转化目标"
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>标识</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>匹配值</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">排序</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {goals.map((row) => (
                    <TableRow key={row.id ?? row.goalKey}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.goalKey}</TableCell>
                      <TableCell>
                        <StatusBadge variant={row.stepType === 'EVENT' ? 'info' : 'muted'}>
                          {row.stepType}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground" title={row.stepValue}>
                        {row.stepValue}
                      </TableCell>
                      <TableCell>
                        <StatusBadge variant={row.enabled ? 'success' : 'muted'}>
                          {row.enabled ? '启用' : '停用'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.position ?? 0}</TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" title="编辑" onClick={() => openEdit(row)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="删除" onClick={() => setPendingDelete(row)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DataState>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑转化目标' : '新建转化目标'}</DialogTitle>
            <DialogDescription>目标由「类型 + 匹配值」定义，标识创建后不可修改</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>标识</Label>
              <Input
                value={form.goalKey}
                disabled={isEdit}
                placeholder="如 signup_success"
                onChange={(e) => setForm((prev) => ({ ...prev, goalKey: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={form.name}
                placeholder="如 注册成功"
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select
                value={form.stepType}
                onValueChange={(value) => setForm((prev) => ({ ...prev, stepType: value as OpsGoal['stepType'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EVENT">EVENT（自定义事件）</SelectItem>
                  <SelectItem value="PATH">PATH（页面路径）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>匹配值</Label>
              <Input
                value={form.stepValue}
                placeholder={form.stepType === 'EVENT' ? '如 signup_success' : '如 /pricing'}
                onChange={(e) => setForm((prev) => ({ ...prev, stepValue: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>描述</Label>
              <Input
                value={form.description}
                placeholder="选填，便于团队理解这个目标"
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.position}
                  onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
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
            <DialogTitle>删除转化目标</DialogTitle>
            <DialogDescription>
              确认删除「{pendingDelete?.name}」？删除后该目标的统计数据将不再展示。
            </DialogDescription>
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
