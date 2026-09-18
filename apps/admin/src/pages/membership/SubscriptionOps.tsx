import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@kn/ui'
import { PageHeader } from '@/components/PageHeader'
import { formatDateTime } from '@/lib/use-paged-data'
import {
  batchGrantSubscriptions,
  batchRevokeSubscriptions,
  getExpiringSubscriptions,
  getSubscriptionAudit,
  getSubscriptionCatalog,
  getSubscriptionOverview,
  type AdminUserSubscription,
  type SubscriptionGrantLog,
  type SubscriptionOverview,
  type SubscriptionPlanVO,
} from '@/api'

const planLabelOf = (plans: SubscriptionPlanVO[], code?: string) =>
  plans.find((plan) => plan.planCode === code)?.planName || code || '-'

/** 订阅运维：看板 / 临期批量处置 / 操作审计。 */
export const SubscriptionOps = () => {
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null)
  const [expiring, setExpiring] = useState<AdminUserSubscription[]>([])
  const [audit, setAudit] = useState<SubscriptionGrantLog[]>([])
  const [plans, setPlans] = useState<SubscriptionPlanVO[]>([])
  const [days, setDays] = useState(7)
  const [selected, setSelected] = useState<string[]>([])
  const [grantPlan, setGrantPlan] = useState('PRO')
  const [grantDays, setGrantDays] = useState('30')
  const [busy, setBusy] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeRemark, setRevokeRemark] = useState('')

  const load = useCallback(() => {
    getSubscriptionOverview().then(setOverview).catch(() => setOverview(null))
    getExpiringSubscriptions(days, 200).then(setExpiring).catch(() => setExpiring([]))
    getSubscriptionAudit({ limit: 100 }).then(setAudit).catch(() => setAudit([]))
  }, [days])

  useEffect(() => {
    getSubscriptionCatalog().then((catalog) => setPlans(catalog.plans || [])).catch(() => undefined)
  }, [])

  useEffect(() => {
    setSelected([])
    load()
  }, [load])

  const allSelected = expiring.length > 0 && selected.length === expiring.length
  const toggleAll = () => setSelected(allSelected ? [] : expiring.map((row) => row.userId))
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const doGrant = async () => {
    if (selected.length === 0) {
      toast.error('请先选择用户')
      return
    }
    setBusy(true)
    try {
      const value = Number(grantDays)
      await batchGrantSubscriptions({
        userIds: selected,
        planCode: grantPlan,
        days: Number.isFinite(value) && value > 0 ? value : undefined,
      })
      toast.success('已批量授予')
      setSelected([])
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const doRevoke = async () => {
    if (selected.length === 0) {
      toast.error('请先选择用户')
      return
    }
    setBusy(true)
    try {
      await batchRevokeSubscriptions({ userIds: selected, remark: revokeRemark || undefined })
      toast.success('已批量撤销')
      setRevokeOpen(false)
      setRevokeRemark('')
      setSelected([])
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const cards = overview
    ? [
        { label: '有订阅记录', value: overview.totalSubscriptions },
        { label: '付费订阅', value: overview.paidSubscriptions },
        { label: '7 天内到期', value: overview.expiring7 },
        { label: '30 天内到期', value: overview.expiring30 },
        { label: '已过期', value: overview.expired },
        { label: '兑换码核销', value: String(overview.redeemUsed) + ' / ' + String(overview.redeemCodes) },
      ]
    : []

  return (
    <div>
      <PageHeader title="订阅运维" description="用量与额度、临期与批量处置、操作审计" />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-normal text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {overview ? (
        <div className="mb-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {Object.entries(overview.planCounts).map(([code, count]) => (
            <span key={code} className="rounded-full border px-3 py-1">
              {planLabelOf(plans, code)}: <span className="font-medium text-foreground">{count}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">临期订阅</h2>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={String(days)}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value="7">7 天内</option>
          <option value="30">30 天内</option>
          <option value="90">90 天内</option>
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={grantPlan}
          onChange={(event) => setGrantPlan(event.target.value)}
        >
          {plans.map((plan) => (
            <option key={plan.planCode} value={plan.planCode}>
              {plan.planName}
            </option>
          ))}
        </select>
        <Input className="h-9 w-24" value={grantDays} onChange={(event) => setGrantDays(event.target.value)} placeholder="天数" />
        <Button size="sm" onClick={doGrant} disabled={busy || selected.length === 0}>
          批量续期/授予（{selected.length}）
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRevokeOpen(true)} disabled={busy || selected.length === 0}>
          批量撤销
        </Button>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>用户</TableHead>
              <TableHead>方案</TableHead>
              <TableHead>到期</TableHead>
              <TableHead>来源</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expiring.map((row) => (
              <TableRow key={row.userId}>
                <TableCell>
                  <Checkbox checked={selected.includes(row.userId)} onCheckedChange={() => toggleOne(row.userId)} />
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{row.userName || row.account || row.userId}</div>
                  <div className="text-xs text-muted-foreground">{row.account}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.planName || row.planCode}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.endTime ? formatDateTime(row.endTime) : '-'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.source || '-'}</TableCell>
              </TableRow>
            ))}
            {expiring.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  没有临期订阅
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">操作审计（最近 100 条）</h2>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>变更</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {log.createTime ? formatDateTime(log.createTime) : '-'}
                </TableCell>
                <TableCell className="text-xs">{log.userName || log.account || log.userId}</TableCell>
                <TableCell className="text-xs">
                  {log.fromPlan || '-'} → {log.toPlan || '-'}
                </TableCell>
                <TableCell className="text-xs">{log.source || '-'}</TableCell>
                <TableCell className="text-xs">{log.operatorId || '-'}</TableCell>
                <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{log.remark || '-'}</TableCell>
              </TableRow>
            ))}
            {audit.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  暂无操作记录
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>批量撤销订阅</DialogTitle>
            <DialogDescription>将选中的 {selected.length} 个用户降回免费版</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>备注</Label>
            <Input value={revokeRemark} onChange={(event) => setRevokeRemark(event.target.value)} placeholder="可选" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeOpen(false)}>
              取消
            </Button>
            <Button onClick={doRevoke} disabled={busy}>
              确认撤销
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
