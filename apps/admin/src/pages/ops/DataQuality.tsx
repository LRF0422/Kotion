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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@kn/ui'
import { Gauge, LoaderCircle, Pencil, Plus, Save, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { DataState } from '@/components/DataState'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsFilterRule,
  deleteOpsFilterRule,
  getOpsDataQuality,
  getOpsFilterRules,
  saveOpsDataQuality,
  updateOpsFilterRule,
  type OpsFilterRule,
} from '@/api/ops'

type RuleType = OpsFilterRule['ruleType']
type RuleAction = OpsFilterRule['action']

const RULE_TYPE_OPTIONS: Array<{ value: RuleType; label: string; hint: string }> = [
  { value: 'IP', label: 'IP · 精确 IP', hint: '只匹配单个精确 IP，如 1.2.3.4' },
  { value: 'IP_PREFIX', label: 'IP_PREFIX · IP 段前缀', hint: '按前缀匹配网段，如 192.168.1.' },
  { value: 'UA', label: 'UA · User-Agent 关键字', hint: 'UA 中包含该关键字即命中，如 HeadlessChrome' },
  { value: 'VISITOR', label: 'VISITOR · 测试访客标识', hint: '匹配指定的 visitor_id，用于排除自测流量' },
  { value: 'PATH', label: 'PATH · 路径前缀', hint: '以该前缀开头的路径，如 /preview' },
  { value: 'EMAIL_DOMAIN', label: 'EMAIL_DOMAIN · 邮箱域名', hint: '按订阅邮箱域名过滤，如 @internal.com' },
]

const ACTION_OPTIONS: Array<{ value: RuleAction; label: string; hint: string }> = [
  { value: 'EXCLUDE', label: 'EXCLUDE · 排除', hint: '命中规则的流量不计入统计' },
  { value: 'INCLUDE', label: 'INCLUDE · 白名单', hint: '仅保留命中规则的流量（谨慎使用）' },
]

/** 口径说明（静态定义，不走接口）。 */
const METRIC_DEFINITIONS: Array<{ metric: string; definition: string }> = [
  { metric: '浏览量', definition: 'pageview 事件总数' },
  { metric: '访客数', definition: '按 visitor_id 去重' },
  { metric: '会话数', definition: '30 分钟无事件即新会话' },
  { metric: '跳出', definition: '仅 1 次 pageview 的会话' },
  { metric: '平均时长', definition: '会话内首末事件时间差' },
  { metric: '新增访客', definition: '会话表中首次出现的 visitor' },
  { metric: '转化', definition: '命中转化目标的事件数' },
  { metric: '转化率', definition: '转化访客 / 总访客' },
]

interface RuleForm {
  ruleName: string
  ruleType: RuleType
  pattern: string
  action: RuleAction
  enabled: boolean
  remark: string
}

const emptyRuleForm: RuleForm = {
  ruleName: '',
  ruleType: 'IP',
  pattern: '',
  action: 'EXCLUDE',
  enabled: true,
  remark: '',
}

const actionVariant = (action: RuleAction) => (action === 'EXCLUDE' ? 'danger' : 'success')

export const DataQuality = () => {
  const { canManage } = useOpsPermission()

  const { data, loading, error, reload } = useAsync(
    () => Promise.all([getOpsDataQuality(), getOpsFilterRules()]),
    [],
  )
  const quality = data?.[0] ?? null
  const rules = data?.[1] ?? []

  // Card 1：采样与开关
  const [sampleRate, setSampleRate] = useState('100')
  const [filterEnabled, setFilterEnabled] = useState(true)
  const [dataNote, setDataNote] = useState('')
  const [savingQuality, setSavingQuality] = useState(false)

  useEffect(() => {
    if (!quality) return
    setSampleRate(String(quality.sampleRate ?? 100))
    setFilterEnabled(Boolean(quality.filterEnabled))
    setDataNote(quality.dataNote ?? '')
  }, [quality])

  // Card 2：规则编辑器
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OpsFilterRule | null>(null)
  const [form, setForm] = useState<RuleForm>(emptyRuleForm)
  const [savingRule, setSavingRule] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OpsFilterRule | null>(null)
  const [deleting, setDeleting] = useState(false)

  const isEdit = Boolean(editing?.id)

  const saveQuality = async () => {
    const rate = Number(sampleRate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error('采样率需为 0-100 之间的数字')
      return
    }
    setSavingQuality(true)
    try {
      await saveOpsDataQuality({
        sampleRate: rate,
        filterEnabled,
        dataNote: dataNote.trim() || undefined,
      })
      toast.success('数据口径已保存')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingQuality(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyRuleForm)
    setDialogOpen(true)
  }

  const openEdit = (rule: OpsFilterRule) => {
    setEditing(rule)
    setForm({
      ruleName: rule.ruleName ?? '',
      ruleType: rule.ruleType,
      pattern: rule.pattern ?? '',
      action: rule.action,
      enabled: rule.enabled,
      remark: rule.remark ?? '',
    })
    setDialogOpen(true)
  }

  const saveRule = async () => {
    if (!form.pattern.trim()) {
      toast.error('请填写匹配值')
      return
    }
    const payload: OpsFilterRule = {
      ruleName: form.ruleName.trim() || undefined,
      ruleType: form.ruleType,
      pattern: form.pattern.trim(),
      action: form.action,
      enabled: form.enabled,
      remark: form.remark.trim() || undefined,
    }
    setSavingRule(true)
    try {
      if (isEdit && editing?.id !== undefined) {
        await updateOpsFilterRule(editing.id, payload)
      } else {
        await createOpsFilterRule(payload)
      }
      toast.success(isEdit ? '规则已更新' : '规则已创建')
      setDialogOpen(false)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingRule(false)
    }
  }

  const toggleRule = async (rule: OpsFilterRule, enabled: boolean) => {
    if (rule.id === undefined) return
    try {
      await updateOpsFilterRule(rule.id, { ...rule, enabled })
      toast.success(enabled ? '规则已启用' : '规则已停用')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    }
  }

  const confirmRemove = async () => {
    if (pendingDelete?.id === undefined) return
    setDeleting(true)
    try {
      await deleteOpsFilterRule(pendingDelete.id)
      toast.success('规则已删除')
      setPendingDelete(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const currentTypeHint =
    RULE_TYPE_OPTIONS.find((option) => option.value === form.ruleType)?.hint ?? ''
  const currentActionHint =
    ACTION_OPTIONS.find((option) => option.value === form.action)?.hint ?? ''

  return (
    <div>
      <PageHeader
        title="数据口径"
        description="统一采样率与流量过滤规则，保证看板与导出口径一致"
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>采样与开关</CardTitle>
          <CardDescription>
            {quality?.excludedEvents ? `已排除 ${quality.excludedEvents} 条事件` : '采样率与过滤开关决定进入统计的数据量'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataState loading={loading} error={error} onRetry={reload}>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label>采样率（%）</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={sampleRate}
                  disabled={!canManage}
                  onChange={(e) => setSampleRate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  100 = 全量；小于 100 时看板数据为采样推算值
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>流量过滤</Label>
                <div className="flex h-10 items-center gap-2">
                  <Switch
                    checked={filterEnabled}
                    disabled={!canManage}
                    onCheckedChange={setFilterEnabled}
                  />
                  <span className="text-sm text-muted-foreground">
                    {filterEnabled ? '已启用过滤规则' : '已关闭，所有流量均计入'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  命中下方规则的流量在统计与导出时都会被排除
                </p>
              </div>

              <div className="space-y-1.5 lg:col-span-2">
                <Label>口径说明（备注）</Label>
                <Textarea
                  rows={3}
                  value={dataNote}
                  disabled={!canManage}
                  placeholder="记录当前口径的适用场景，便于团队对齐"
                  onChange={(e) => setDataNote(e.target.value)}
                />
              </div>
            </div>

            {canManage && (
              <Button className="mt-4" onClick={saveQuality} disabled={savingQuality}>
                {savingQuality ? (
                  <LoaderCircle className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-4" />
                )}
                保存
              </Button>
            )}
          </DataState>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>流量过滤规则</CardTitle>
          <CardDescription>共 {rules.length} 条规则，按从左到右的顺序生效</CardDescription>
        </CardHeader>
        <CardContent>
          <DataState
            loading={loading}
            error={error}
            onRetry={reload}
            empty={!loading && rules.length === 0}
            emptyText="暂无过滤规则"
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>匹配</TableHead>
                    <TableHead>动作</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id ?? `${rule.ruleType}-${rule.pattern}`}>
                      <TableCell className="font-medium">{rule.ruleName || '-'}</TableCell>
                      <TableCell>
                        <StatusBadge variant="muted">{rule.ruleType}</StatusBadge>
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs" title={rule.pattern}>
                        {rule.pattern}
                      </TableCell>
                      <TableCell>
                        <StatusBadge variant={actionVariant(rule.action)}>
                          {rule.action === 'EXCLUDE' ? '排除' : '白名单'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={rule.enabled}
                          disabled={!canManage}
                          onCheckedChange={(checked) => toggleRule(rule, checked)}
                        />
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground" title={rule.remark}>
                        {rule.remark || '-'}
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

          {canManage && (
            <Button className="mt-4" variant="outline" onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              新建规则
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>口径说明</CardTitle>
          <CardDescription>各项指标的定义（静态说明，不依赖接口）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">指标</TableHead>
                  <TableHead>定义</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {METRIC_DEFINITIONS.map((row) => (
                  <TableRow key={row.metric}>
                    <TableCell className="font-medium">{row.metric}</TableCell>
                    <TableCell className="text-muted-foreground">{row.definition}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <Gauge className="mt-0.5 size-4 shrink-0" />
            <span>
              <code className="font-mono">sampleRate &lt; 100</code> 时上述数值为采样推算值；
              100 以下的数据不用于对外汇报。
            </span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑过滤规则' : '新建过滤规则'}</DialogTitle>
            <DialogDescription>命中规则的流量会按「动作」被排除或保留</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={form.ruleName}
                placeholder="如 内网自测流量"
                onChange={(e) => setForm((prev) => ({ ...prev, ruleName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select
                value={form.ruleType}
                onValueChange={(value) => setForm((prev) => ({ ...prev, ruleType: value as RuleType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{currentTypeHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label>匹配</Label>
              <Input
                value={form.pattern}
                placeholder="如 192.168.1. / HeadlessChrome / /preview"
                onChange={(e) => setForm((prev) => ({ ...prev, pattern: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>动作</Label>
              <Select
                value={form.action}
                onValueChange={(value) => setForm((prev) => ({ ...prev, action: value as RuleAction }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{currentActionHint}</p>
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
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={form.remark}
                placeholder="选填，说明这条规则的用途"
                onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={savingRule}>
              取消
            </Button>
            <Button onClick={saveRule} disabled={savingRule}>
              {savingRule && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除过滤规则</DialogTitle>
            <DialogDescription>
              确认删除「{pendingDelete?.ruleName || pendingDelete?.pattern}」？删除后该规则立即失效。
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
