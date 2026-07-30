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
  type ChartConfig,
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
  XAxis,
  YAxis,
  cn,
  useToast,
} from '@kn/ui'
import { Bot, CircleDollarSign, Cpu, Loader2, MessageSquare, Pencil, Plus, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import {
  deleteModelPrice,
  getAiUsageByModel,
  getAiUsageByUser,
  getAiUsageSummary,
  getAiUsageTrend,
  getModelPriceList,
  submitModelPrice,
  type AiUsageByModel,
  type AiUsageByUser,
  type AiUsageSummary,
  type ModelPrice,
} from '@/api'
import { formatDateTime } from '@/lib/use-paged-data'

const trendChartConfig = {
  promptTokens: { label: '输入 Tokens', color: 'hsl(var(--chart-1))' },
  completionTokens: { label: '输出 Tokens', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

const DAY_OPTIONS = [7, 30, 90] as const

/** Token 数量缩写展示 */
const formatTokens = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

const shortDate = (date: string) => date.slice(5)

const EMPTY_PRICE: ModelPrice = { modelName: '', promptPrice: undefined, completionPrice: undefined, currency: 'CNY', remark: '' }

export const AiUsage = () => {
  const { toast } = useToast()
  const [days, setDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<AiUsageSummary | null>(null)
  const [trend, setTrend] = useState<{ date: string; promptTokens: number; completionTokens: number }[]>([])
  const [byUser, setByUser] = useState<AiUsageByUser[]>([])
  const [byModel, setByModel] = useState<AiUsageByModel[]>([])
  const [prices, setPrices] = useState<ModelPrice[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ModelPrice>(EMPTY_PRICE)

  const loadPrices = useCallback(() => {
    getModelPriceList()
      .then(setPrices)
      .catch(() => setPrices([]))
  }, [])

  useEffect(() => {
    loadPrices()
  }, [loadPrices])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getAiUsageSummary(days).catch(() => null),
      getAiUsageTrend(days).catch(() => []),
      getAiUsageByUser(days, 20).catch(() => []),
      getAiUsageByModel(days).catch(() => []),
    ])
      .then(([sum, trendData, users, models]) => {
        if (cancelled) return
        setSummary(sum)
        setTrend(trendData)
        setByUser(users)
        setByModel(models)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const openCreate = () => {
    setForm(EMPTY_PRICE)
    setDialogOpen(true)
  }

  const openEdit = (price: ModelPrice) => {
    setForm({ ...price })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.modelName.trim()) {
      toast({ title: '模型名称为必填项', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await submitModelPrice({
        ...form,
        modelName: form.modelName.trim(),
        promptPrice: form.promptPrice === undefined || Number.isNaN(form.promptPrice) ? undefined : form.promptPrice,
        completionPrice: form.completionPrice === undefined || Number.isNaN(form.completionPrice) ? undefined : form.completionPrice,
      })
      toast({ title: form.id ? '单价已更新' : '单价已新增' })
      setDialogOpen(false)
      loadPrices()
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (price: ModelPrice) => {
    if (!price.id) return
    if (!window.confirm(`确认删除模型「${price.modelName}」的单价配置？`)) return
    try {
      await deleteModelPrice(price.id)
      toast({ title: '已删除' })
      loadPrices()
    } catch (err) {
      toast({ title: '删除失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const currency = byModel.find((m) => m.currency)?.currency || 'CNY'

  return (
    <div>
      <PageHeader
        title="AI 用量"
        description="Token 消耗趋势、用户与模型维度统计、模型计费单价"
        actions={(
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {DAY_OPTIONS.map((option) => (
              <Button
                key={option}
                variant="ghost"
                size="sm"
                className={cn('h-7 px-3', days === option && 'bg-muted font-medium')}
                onClick={() => setDays(option)}
              >
                近{option}天
              </Button>
            ))}
          </div>
        )}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Token 总消耗" value={formatTokens(summary?.totalTokens ?? 0)} icon={Cpu} />
        <StatCard title="会话数" value={String(summary?.sessions ?? 0)} icon={MessageSquare} />
        <StatCard title="预估成本" value={`${(summary?.totalCost ?? 0).toFixed(2)} ${currency}`} icon={CircleDollarSign} />
        <StatCard title="覆盖模型" value={String(summary?.models ?? 0)} icon={Bot} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Token 消耗趋势</CardTitle>
          <CardDescription>近 {days} 天输入 / 输出 Token 每日消耗</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <ChartContainer config={trendChartConfig} className="h-64 w-full">
              <AreaChart data={trend} margin={{ left: 4, right: 12 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tickFormatter={(v: number) => formatTokens(v)} tickLine={false} axisLine={false} width={52} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="promptTokens"
                  type="monotone"
                  stackId="tokens"
                  stroke="var(--color-promptTokens)"
                  fill="var(--color-promptTokens)"
                  fillOpacity={0.2}
                />
                <Area
                  dataKey="completionTokens"
                  type="monotone"
                  stackId="tokens"
                  stroke="var(--color-completionTokens)"
                  fill="var(--color-completionTokens)"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>用户用量 TOP</CardTitle>
            <CardDescription>近 {days} 天 Token 消耗最高的用户</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead className="text-right">会话数</TableHead>
                  <TableHead className="text-right">输入</TableHead>
                  <TableHead className="text-right">输出</TableHead>
                  <TableHead className="text-right">合计</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byUser.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无数据</TableCell>
                  </TableRow>
                )}
                {byUser.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.userName || row.userId}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{row.sessions}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatTokens(row.promptTokens)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatTokens(row.completionTokens)}</TableCell>
                    <TableCell className="text-right font-medium">{formatTokens(row.totalTokens)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>模型用量与成本</CardTitle>
            <CardDescription>按模型汇总 Token 消耗及按单价折算的成本</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模型</TableHead>
                  <TableHead className="text-right">会话数</TableHead>
                  <TableHead className="text-right">输入</TableHead>
                  <TableHead className="text-right">输出</TableHead>
                  <TableHead className="text-right">成本</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byModel.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无数据</TableCell>
                  </TableRow>
                )}
                {byModel.map((row) => (
                  <TableRow key={row.modelName || 'unknown'}>
                    <TableCell className="font-medium">{row.modelName || '未知模型'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{row.sessions}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatTokens(row.promptTokens)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatTokens(row.completionTokens)}</TableCell>
                    <TableCell className="text-right">
                      {row.cost !== undefined && row.cost !== null
                        ? `${Number(row.cost).toFixed(4)} ${row.currency || currency}`
                        : <span className="text-muted-foreground">未配置单价</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>模型单价</CardTitle>
            <CardDescription>按每千 Token 配置输入 / 输出单价，用于成本折算</CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 size-4" />
            新增单价
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模型名称</TableHead>
                <TableHead className="text-right">输入单价 / 1k</TableHead>
                <TableHead className="text-right">输出单价 / 1k</TableHead>
                <TableHead>币种</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {prices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    暂无单价配置，成本将无法折算
                  </TableCell>
                </TableRow>
              )}
              {prices.map((price) => (
                <TableRow key={price.id}>
                  <TableCell className="font-medium">{price.modelName}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{price.promptPrice ?? '-'}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{price.completionPrice ?? '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{price.currency || 'CNY'}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{price.remark || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(price.updateTime)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(price)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => handleDelete(price)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? '编辑模型单价' : '新增模型单价'}</DialogTitle>
            <DialogDescription>单价为每 1000 Token 的费用，留空表示该项不计费</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>模型名称 *</Label>
              <Input
                placeholder="deepseek-chat"
                value={form.modelName}
                onChange={(e) => setForm({ ...form, modelName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>输入单价 / 1k</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={form.promptPrice ?? ''}
                  onChange={(e) => setForm({ ...form, promptPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-2">
                <Label>输出单价 / 1k</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={form.completionPrice ?? ''}
                  onChange={(e) => setForm({ ...form, completionPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>币种</Label>
              <Input value={form.currency || ''} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>备注</Label>
              <Input value={form.remark || ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
