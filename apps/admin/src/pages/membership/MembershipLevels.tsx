import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
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
  createRedeemCode,
  getRedeemCodes,
  getSubscriptionCatalog,
  getSubscriptionPlanDetail,
  savePlanEntitlements,
  saveSubscriptionPlan,
  type EntitlementDefinition,
  type RedeemCode,
  type SubscriptionPlanVO,
} from '@/api'

/** 平台端：编辑方案权益 + 管理兑换码（本期不做支付）。 */
export const MembershipLevels = () => {
  const [plans, setPlans] = useState<SubscriptionPlanVO[]>([])
  const [defs, setDefs] = useState<EntitlementDefinition[]>([])
  const [active, setActive] = useState('')
  const [features, setFeatures] = useState<Record<string, boolean>>({})
  const [quotas, setQuotas] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [meta, setMeta] = useState({
    planName: '',
    description: '',
    monthlyPrice: '',
    yearlyPrice: '',
    highlight: '',
    sort: '0',
    status: '1',
  })
  const [codes, setCodes] = useState<RedeemCode[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ code: '', planCode: 'PRO', days: '30', maxUses: '1', remark: '' })

  const loadCatalog = useCallback(() => {
    getSubscriptionCatalog()
      .then((catalog) => {
        setDefs(catalog.entitlements || [])
        setPlans(catalog.plans || [])
        setActive((prev) => prev || catalog.plans?.[0]?.planCode || '')
      })
      .catch(() => undefined)
  }, [])

  const loadCodes = useCallback(() => {
    getRedeemCodes()
      .then(setCodes)
      .catch(() => setCodes([]))
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    loadCodes()
  }, [loadCodes])

  useEffect(() => {
    if (!active) return
    getSubscriptionPlanDetail(active)
      .then((plan) => {
        setFeatures({ ...(plan.features || {}) })
        setQuotas({ ...(plan.quotas || {}) })
        setMeta({
          planName: plan.planName || '',
          description: plan.description || '',
          monthlyPrice: plan.monthlyPrice === undefined || plan.monthlyPrice === null ? '' : String(plan.monthlyPrice),
          yearlyPrice: plan.yearlyPrice === undefined || plan.yearlyPrice === null ? '' : String(plan.yearlyPrice),
          highlight: plan.highlight || '',
          sort: plan.sort === undefined || plan.sort === null ? '0' : String(plan.sort),
          status: plan.status === undefined || plan.status === null ? '1' : String(plan.status),
        })
      })
      .catch(() => undefined)
  }, [active])

  const save = async () => {
    setSaving(true)
    try {
      await savePlanEntitlements(active, { features, quotas })
      toast.success('已保存方案权益')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const saveMeta = async () => {
    if (!active) return
    setSavingMeta(true)
    try {
      await saveSubscriptionPlan({
        planCode: active,
        planName: meta.planName,
        description: meta.description,
        monthlyPrice: meta.monthlyPrice === '' ? undefined : Number(meta.monthlyPrice),
        yearlyPrice: meta.yearlyPrice === '' ? undefined : Number(meta.yearlyPrice),
        highlight: meta.highlight,
        sort: Number(meta.sort) || 0,
        status: Number(meta.status),
      })
      toast.success('已保存方案信息')
      loadCatalog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingMeta(false)
    }
  }

  const createCode = async () => {
    try {
      const days = Number(form.days)
      await createRedeemCode({
        code: form.code.trim(),
        planCode: form.planCode,
        days: Number.isFinite(days) && days > 0 ? days : undefined,
        maxUses: Number(form.maxUses) || 1,
        remark: form.remark || undefined,
      })
      toast.success('已创建兑换码')
      setDialogOpen(false)
      setForm({ code: '', planCode: 'PRO', days: '30', maxUses: '1', remark: '' })
      loadCodes()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div>
      <PageHeader title="方案与兑换码" description="编辑 Free / Pro / Pro+ 权益，管理兑换码（本期不做支付）" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {plans.map((plan) => (
          <Button
            key={plan.planCode}
            variant={plan.planCode === active ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActive(plan.planCode)}
          >
            {plan.planName}
          </Button>
        ))}
        <Button size="sm" className="ml-auto" onClick={save} disabled={saving || !active}>
          保存权益
        </Button>
      </div>

      <div className="mb-8 grid gap-4 rounded-xl border p-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>方案名称</Label>
          <Input value={meta.planName} onChange={(event) => setMeta((prev) => ({ ...prev, planName: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>营销卖点</Label>
          <Input value={meta.highlight} onChange={(event) => setMeta((prev) => ({ ...prev, highlight: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>月付价格（仅展示）</Label>
          <Input value={meta.monthlyPrice} onChange={(event) => setMeta((prev) => ({ ...prev, monthlyPrice: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>年付价格（仅展示）</Label>
          <Input value={meta.yearlyPrice} onChange={(event) => setMeta((prev) => ({ ...prev, yearlyPrice: event.target.value }))} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>方案描述</Label>
          <Input value={meta.description} onChange={(event) => setMeta((prev) => ({ ...prev, description: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>排序</Label>
          <Input value={meta.sort} onChange={(event) => setMeta((prev) => ({ ...prev, sort: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>状态</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={meta.status}
            onChange={(event) => setMeta((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="1">启用</option>
            <option value="0">停用</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <Button size="sm" onClick={saveMeta} disabled={savingMeta || !active}>
            保存方案信息
          </Button>
        </div>
      </div>

      <div className="mb-8 divide-y rounded-xl border">
        {defs.map((def) => (
          <div key={def.code} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{def.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {def.code}
                {def.unit ? ' · ' + def.unit : ''}
              </div>
            </div>
            {def.valueType === 'BOOLEAN' ? (
              <Checkbox
                checked={features[def.code] === true}
                onCheckedChange={(value) => setFeatures((prev) => ({ ...prev, [def.code]: value === true }))}
              />
            ) : (
              <Input
                className="h-9 w-40 text-right"
                value={quotas[def.code] === undefined ? '' : String(quotas[def.code])}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setQuotas((prev) => ({ ...prev, [def.code]: Number.isFinite(value) ? value : 0 }))
                }}
              />
            )}
          </div>
        ))}
        {defs.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无权益定义</div> : null}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">兑换码</h2>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          新建兑换码
        </Button>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>兑换码</TableHead>
              <TableHead>方案</TableHead>
              <TableHead>时长</TableHead>
              <TableHead>使用</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((item) => (
              <TableRow key={item.id || item.code}>
                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                <TableCell>{item.planCode}</TableCell>
                <TableCell>{item.days ? item.days + ' 天' : '永久'}</TableCell>
                <TableCell>
                  {item.usedCount ?? 0} / {item.maxUses ?? 1}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.createTime ? formatDateTime(item.createTime) : '-'}
                </TableCell>
              </TableRow>
            ))}
            {codes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  暂无兑换码
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>新建兑换码</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>兑换码</Label>
              <Input value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="PRO-2026-XXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>方案</Label>
              <div className="flex gap-2">
                {plans.map((plan) => (
                  <Button
                    key={plan.planCode}
                    size="sm"
                    variant={form.planCode === plan.planCode ? 'default' : 'outline'}
                    onClick={() => setForm((prev) => ({ ...prev, planCode: plan.planCode }))}
                  >
                    {plan.planName}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>有效天数（留空永久）</Label>
              <Input value={form.days} onChange={(e) => setForm((prev) => ({ ...prev, days: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>最大使用次数</Label>
              <Input value={form.maxUses} onChange={(e) => setForm((prev) => ({ ...prev, maxUses: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={createCode} disabled={!form.code.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
