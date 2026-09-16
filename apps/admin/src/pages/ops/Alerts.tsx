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
  toast,
} from '@kn/ui'
import { LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { DataState } from '@/components/DataState'
import { TablePagination } from '@/components/TablePagination'
import { useAsync } from '@/lib/use-async'
import { usePagedData, formatDateTime } from '@/lib/use-paged-data'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsAlertRule,
  deleteOpsAlertRule,
  getOpsAlertEvents,
  getOpsAlertRules,
  runOpsAlertCheck,
  updateOpsAlertRule,
  type OpsAlertRule,
} from '@/api/ops'

type AlertMetric = OpsAlertRule['metric']
type AlertComparator = OpsAlertRule['comparator']
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const METRIC_OPTIONS: Array<{ value: AlertMetric; label: string }> = [
  { value: 'CONVERSIONS', label: '转化数' },
  { value: 'VISITORS', label: '访客数' },
  { value: 'PAGEVIEWS', label: '浏览量' },
  { value: 'COLLECT_SILENCE', label: '埋点断流' },
  { value: 'LINK_CLICKS', label: '短链点击' },
  { value: 'GOAL_RATE', label: '目标转化率' },
]

const COMPARATOR_OPTIONS: Array<{ value: AlertComparator; label: string }> = [
  { value: 'LT', label: '<' },
  { value: 'LTE', label: '≤' },
  { value: 'GT', label: '>' },
  { value: 'GTE', label: '≥' },
  { value: 'DROP_PCT', label: '环比下降%' },
]

const metricLabel = (metric?: string | null) =>
  METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? metric ?? '-'

const comparatorLabel = (comparator?: string | null) =>
  COMPARATOR_OPTIONS.find((option) => option.value === comparator)?.label ?? comparator ?? '-'

const levelVariant = (level?: string | null): BadgeVariant => {
  const value = (level ?? '').toUpperCase()
  if (value === 'ERROR' || value === 'CRITICAL' || value === 'DANGER' || value === 'HIGH') return 'danger'
  if (value === 'WARN' || value === 'WARNING' || value === 'MEDIUM') return 'warning'
  if (value === 'INFO' || value === 'LOW') return 'info'
  return 'muted'
}

interface AlertForm {
  name: string
  metric: AlertMetric
  goalKey: string
  comparator: AlertComparator
  threshold: string
  windowMinutes: string
  lookbackDays: string
  channels: string
  webhookUrl: string
  enabled: boolean
}

const emptyForm: AlertForm = {
  name: '',
  metric: 'CONVERSIONS',
  goalKey: '',
  comparator: 'LT',
  threshold: '0',
  windowMinutes: '60',
  lookbackDays: '7',
  channels: 'log,email',
  webhookUrl: '',
  enabled: true,
}

const toForm = (rule: OpsAlertRule): AlertForm => ({
  name: rule.name,
  metric: rule.metric,
  goalKey: rule.goalKey ?? '',
  comparator: rule.comparator,
  threshold: String(rule.threshold ?? 0),
  windowMinutes: String(rule.windowMinutes ?? 0),
  lookbackDays: String(rule.lookbackDays ?? 0),
  channels: rule.channels ?? '',
  webhookUrl: rule.webhookUrl ?? '',
  enabled: rule.enabled,
})

export const Alerts = () => {
  const { canManage } = useOpsPermission()

  const { data: rules, loading: rulesLoading, error: rulesError, reload: reloadRules } = useAsync(
    () => getOpsAlertRules(),
    [],
  )
  const ruleList = rules ?? []

  const {
    records,
    total,
    pages,
    current,
    setCurrent,
    loading: eventsLoading,
    error: eventsError,
    reload: reloadEvents,
  } = usePagedData((page) => getOpsAlertEvents({ current: page, size: 20 }))

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OpsAlertRule | null>(null)
  const [form, setForm] = useState<AlertForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<OpsAlertRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [checking, setChecking] = useState(false)

  const isEdit = Boolean(editing?.id)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (rule: OpsAlertRule) => {
    setEditing(rule)
    setForm(toForm(rule))
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('请填写规则名称')
      return
    }
    const threshold = Number(form.threshold)
    if (!Number.isFinite(threshold)) {
      toast.error('阈值必须是数字')
      return
    }
    const windowMinutes = Number(form.windowMinutes)
    if (!Number.isFinite(windowMinutes) || windowMinutes < 0) {
      toast.error('窗口分钟数必须是非负数字')
      return
    }
    const lookbackDays = Number(form.lookbackDays)
    if (!Number.isFinite(lookbackDays) || lookbackDays < 0) {
      toast.error('回看天数必须是非负数字')
      return
    }
    const channels = form.channels.trim()
    const payload: OpsAlertRule = {
      name: form.name.trim(),
      metric: form.metric,
      goalKey: form.metric === 'GOAL_RATE' ? form.goalKey.trim() || null : null,
      comparator: form.comparator,
      threshold,
      windowMinutes,
      lookbackDays,
      channels,
      webhookUrl: channels.includes('webhook') ? form.webhookUrl.trim() || null : null,
      enabled: form.enabled,
    }
    setSaving(true)
    try {
      if (isEdit && editing?.id) {
        await updateOpsAlertRule(editing.id, payload)
      } else {
        await createOpsAlertRule(payload)
      }
      toast.success(isEdit ? '规则已更新' : '规则已创建')
      setDialogOpen(false)
      reloadRules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const toggleRule = async (rule: OpsAlertRule, enabled: boolean) => {
    if (!rule.id) return
    setTogglingId(rule.id)
    try {
      await updateOpsAlertRule(rule.id, { ...rule, enabled })
      toast.success(enabled ? '规则已启用' : '规则已停用')
      reloadRules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setTogglingId(null)
    }
  }

  const confirmRemove = async () => {
    if (!pendingDelete?.id) return
    setDeleting(true)
    try {
      await deleteOpsAlertRule(pendingDelete.id)
      toast.success('规则已删除')
      setPendingDelete(null)
      reloadRules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const runCheck = async () => {
    setChecking(true)
    try {
      const res = await runOpsAlertCheck()
      toast.success(`已评估 ${res?.evaluated ?? 0} 条规则，触发 ${res?.triggered ?? 0} 条`)
      reloadRules()
      reloadEvents()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '巡检失败')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="告警"
        description="按指标阈值巡检埋点数据，命中后写入告警记录并通过通道通知"
        actions={
          canManage && (
            <Button variant="outline" onClick={runCheck} disabled={checking}>
              {checking ? (
                <LoaderCircle className="mr-1.5 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-4" />
              )}
              立即巡检
            </Button>
          )
        }
      />

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>告警规则</CardTitle>
            <CardDescription>共 {ruleList.length} 条规则</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              新建规则
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <DataState
            loading={rulesLoading}
            error={rulesError}
            onRetry={reloadRules}
            empty={ruleList.length === 0}
            emptyText="暂无告警规则"
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>指标</TableHead>
                    <TableHead>条件</TableHead>
                    <TableHead>窗口</TableHead>
                    <TableHead>通道</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>最近触发</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ruleList.map((rule) => (
                    <TableRow key={rule.id ?? rule.name}>
                      <TableCell className="font-medium">
                        {rule.name}
                        {rule.metric === 'GOAL_RATE' && rule.goalKey && (
                          <span className="ml-1 font-mono text-xs text-muted-foreground">({rule.goalKey})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{metricLabel(rule.metric)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {comparatorLabel(rule.comparator)} {rule.threshold}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {rule.windowMinutes} 分钟 / 回看 {rule.lookbackDays} 天
                      </TableCell>
                      <TableCell className="text-muted-foreground">{rule.channels || '-'}</TableCell>
                      <TableCell>
                        {canManage ? (
                          <Switch
                            checked={rule.enabled}
                            disabled={!rule.id || togglingId === rule.id}
                            onCheckedChange={(checked) => toggleRule(rule, checked)}
                          />
                        ) : (
                          <StatusBadge variant={rule.enabled ? 'success' : 'muted'}>
                            {rule.enabled ? '启用' : '停用'}
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(rule.lastTriggeredAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" title="编辑" onClick={() => openEdit(rule)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="删除" onClick={() => setPendingDelete(rule)}>
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

      <Card>
        <CardHeader>
          <CardTitle>告警记录</CardTitle>
          <CardDescription>规则命中的历史记录，按时间倒序</CardDescription>
        </CardHeader>
        <CardContent>
          <DataState
            loading={eventsLoading}
            error={eventsError}
            onRetry={reloadEvents}
            empty={records.length === 0}
            emptyText="暂无告警记录"
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>规则</TableHead>
                    <TableHead>指标</TableHead>
                    <TableHead className="text-right">当前值</TableHead>
                    <TableHead className="text-right">阈值</TableHead>
                    <TableHead>级别</TableHead>
                    <TableHead>消息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.createTime)}
                      </TableCell>
                      <TableCell className="font-medium">{row.ruleName || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{metricLabel(row.metric)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.metricValue ?? '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.threshold ?? '-'}</TableCell>
                      <TableCell>
                        <StatusBadge variant={levelVariant(row.level)}>{row.level || '-'}</StatusBadge>
                      </TableCell>
                      <TableCell className="max-w-72 truncate" title={row.message}>
                        {row.message || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
            </div>
          </DataState>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑告警规则' : '新建告警规则'}</DialogTitle>
            <DialogDescription>阈值按窗口内的指标值判定，环比下降用于对比上一周期</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={form.name}
                placeholder="如 转化数骤降"
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>指标</Label>
              <Select
                value={form.metric}
                onValueChange={(value) => setForm((prev) => ({ ...prev, metric: value as AlertMetric }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.metric === 'GOAL_RATE' && (
              <div className="space-y-1.5">
                <Label>目标标识</Label>
                <Input
                  value={form.goalKey}
                  placeholder="如 signup_success"
                  onChange={(e) => setForm((prev) => ({ ...prev, goalKey: e.target.value }))}
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>比较方式</Label>
                <Select
                  value={form.comparator}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, comparator: value as AlertComparator }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPARATOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>阈值</Label>
                <Input
                  type="number"
                  value={form.threshold}
                  onChange={(e) => setForm((prev) => ({ ...prev, threshold: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>窗口（分钟）</Label>
                <Input
                  type="number"
                  value={form.windowMinutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, windowMinutes: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>回看（天）</Label>
                <Input
                  type="number"
                  value={form.lookbackDays}
                  onChange={(e) => setForm((prev) => ({ ...prev, lookbackDays: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>通知通道</Label>
              <Input
                value={form.channels}
                placeholder="log,email,webhook"
                onChange={(e) => setForm((prev) => ({ ...prev, channels: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">多个通道用英文逗号分隔，如 log,email,webhook</p>
            </div>
            {form.channels.includes('webhook') && (
              <div className="space-y-1.5">
                <Label>Webhook 地址</Label>
                <Input
                  value={form.webhookUrl}
                  placeholder="https://example.com/hooks/ops-alert"
                  onChange={(e) => setForm((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                />
              </div>
            )}
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
            <DialogTitle>删除告警规则</DialogTitle>
            <DialogDescription>确认删除「{pendingDelete?.name}」？历史告警记录会保留。</DialogDescription>
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
