import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
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
import { TablePagination } from '@/components/TablePagination'
import { formatDateTime } from '@/lib/use-paged-data'
import {
  getAdminUserSubscriptions,
  getSubscriptionGrantLogs,
  grantUserSubscription,
  revokeUserSubscription,
  type AdminUserSubscription,
  type SubscriptionGrantLog,
} from '@/api'

const PLAN_OPTIONS = [
  { value: 'FREE', label: '免费版' },
  { value: 'PRO', label: '专业版' },
  { value: 'PRO_PLUS', label: '专业增强版' },
]

const planLabel = (code?: string) => PLAN_OPTIONS.find((item) => item.value === code)?.label ?? code ?? '-'

const selectClassName = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

/** 平台端订阅管理：本期用管理员授予替代支付。 */
export const SubscriptionUsers = () => {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AdminUserSubscription[]>([])
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState(1)
  const [size] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [target, setTarget] = useState<AdminUserSubscription | null>(null)
  const [grantsOpen, setGrantsOpen] = useState(false)
  const [grants, setGrants] = useState<SubscriptionGrantLog[]>([])
  const [formPlan, setFormPlan] = useState('PRO')
  const [formDays, setFormDays] = useState('30')
  const [formRemark, setFormRemark] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getAdminUserSubscriptions({ current, size, keyword: keyword || undefined, planCode: planFilter || undefined })
      .then((res) => {
        setRows(res.records ?? [])
        setTotal(res.total ?? 0)
      })
      .catch(() => {
        setRows([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [current, size, keyword, planFilter])

  useEffect(() => {
    load()
  }, [load])

  const openGrant = (row: AdminUserSubscription) => {
    setTarget(row)
    setFormPlan(row.planCode === 'FREE' ? 'PRO' : row.planCode)
    setFormDays('30')
    setFormRemark('')
    setDialogOpen(true)
  }

  const submitGrant = async () => {
    if (!target) return
    setSaving(true)
    try {
      const days = Number(formDays)
      await grantUserSubscription({
        userId: target.userId,
        planCode: formPlan,
        days: Number.isFinite(days) && days > 0 ? days : undefined,
        remark: formRemark || undefined,
      })
      toast.success('已更新订阅')
      setDialogOpen(false)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const submitRevoke = async (row: AdminUserSubscription) => {
    setSaving(true)
    try {
      await revokeUserSubscription(row.userId, '管理员撤销')
      toast.success('已撤销')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const openGrants = (row: AdminUserSubscription) => {
    setTarget(row)
    getSubscriptionGrantLogs(row.userId)
      .then((logs) => setGrants(logs))
      .catch(() => setGrants([]))
    setGrantsOpen(true)
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / size)), [total, size])

  return (
    <div>
      <PageHeader title="订阅管理" description="授予或撤销 Free / Pro / Pro+ 方案（本期不做支付）" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            setCurrent(1)
          }}
          placeholder="搜索账号或昵称"
          className="h-9 w-56"
        />
        <select
          value={planFilter}
          onChange={(event) => {
            setPlanFilter(event.target.value)
            setCurrent(1)
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">全部方案</option>
          {PLAN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>方案</TableHead>
              <TableHead>到期</TableHead>
              <TableHead>来源</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.userId}>
                <TableCell>
                  <div className="text-sm font-medium">{row.userName || row.account || row.userId}</div>
                  <div className="text-xs text-muted-foreground">{row.account}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={row.planCode === 'FREE' ? 'outline' : 'secondary'}>{planLabel(row.planCode)}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.endTime ? formatDateTime(row.endTime) : '永久'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.source || '-'}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openGrants(row)}>
                    日志
                  </Button>
                  <Button size="sm" variant="outline" className="ml-2" onClick={() => openGrant(row)}>
                    调整
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-2"
                    onClick={() => submitRevoke(row)}
                    disabled={saving || row.planCode === 'FREE'}
                  >
                    撤销
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <TablePagination current={current} pages={totalPages} total={total} onChange={setCurrent} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>调整订阅</DialogTitle>
            <DialogDescription>{target?.userName || target?.account || ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>方案</Label>
              <select value={formPlan} onChange={(event) => setFormPlan(event.target.value)} className={selectClassName}>
                {PLAN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>有效天数（留空为永久）</Label>
              <Input value={formDays} onChange={(event) => setFormDays(event.target.value)} placeholder="30" />
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Input value={formRemark} onChange={(event) => setFormRemark(event.target.value)} placeholder="可选" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={submitGrant} disabled={saving}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={grantsOpen} onOpenChange={setGrantsOpen}>
        <DialogContent className="md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>授予日志</DialogTitle>
            <DialogDescription>{target?.userName || target?.account || ''}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>变更</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>到期</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {log.createTime ? formatDateTime(log.createTime) : '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.fromPlan || '-'} → {log.toPlan || '-'}
                    </TableCell>
                    <TableCell className="text-xs">{log.source || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {log.endTime ? formatDateTime(log.endTime) : '永久'}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{log.remark || '-'}</TableCell>
                  </TableRow>
                ))}
                {grants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      暂无日志
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantsOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
