import { useEffect, useMemo, useState } from 'react'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  XAxis,
  YAxis,
  cn,
  type ChartConfig,
} from '@kn/ui'
import { Eye, Users, MousePointerClick, Timer, Loader2, Radio } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import {
  getOpsChannels,
  getOpsEvents,
  getOpsOverview,
  getOpsPages,
  getOpsRealtime,
  getOpsTimeseries,
  postOpsFunnel,
  type OpsChannel,
  type OpsEventRank,
  type OpsFunnelStep,
  type OpsOverview,
  type OpsPageRank,
  type OpsRealtime,
  type OpsTrendPoint,
} from '@/api/ops'

const trendConfig = {
  pageviews: { label: '浏览量', color: 'hsl(var(--chart-1))' },
  visitors: { label: '访客', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

const DAY_OPTIONS = [7, 30, 90] as const
const DEFAULT_FUNNEL = 'pageview,cta_click,plugin_install'

const formatDuration = (ms: number) => {
  const seconds = Math.round((ms || 0) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

const percent = (value: number) => `${Math.round((value || 0) * 1000) / 10}%`

export const OpsDashboard = () => {
  const [days, setDays] = useState<number>(30)
  const [overview, setOverview] = useState<OpsOverview | null>(null)
  const [trend, setTrend] = useState<OpsTrendPoint[]>([])
  const [pages, setPages] = useState<OpsPageRank[]>([])
  const [events, setEvents] = useState<OpsEventRank[]>([])
  const [channels, setChannels] = useState<OpsChannel[]>([])
  const [realtime, setRealtime] = useState<OpsRealtime | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [funnelInput, setFunnelInput] = useState(DEFAULT_FUNNEL)
  const [funnel, setFunnel] = useState<OpsFunnelStep[]>([])
  const [funnelLoading, setFunnelLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all([
      getOpsOverview(days),
      getOpsTimeseries(days),
      getOpsPages(days, 10),
      getOpsEvents(days, 15),
      getOpsChannels(days, 10),
      getOpsRealtime(30).catch(() => null),
    ])
      .then(([ov, ts, pg, ev, ch, rt]) => {
        if (cancelled) return
        setOverview(ov)
        setTrend(ts)
        setPages(pg)
        setEvents(ev)
        setChannels(ch)
        setRealtime(rt)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const runFunnel = () => {
    const steps = funnelInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((value) => ({ type: 'event' as const, value }))
    if (steps.length === 0) return
    setFunnelLoading(true)
    postOpsFunnel({ days, steps })
      .then((res) => setFunnel(res?.result ?? []))
      .catch(() => setFunnel([]))
      .finally(() => setFunnelLoading(false))
  }

  const maxFunnel = useMemo(() => Math.max(1, ...funnel.map((s) => s.sessions)), [funnel])

  if (error) {
    return (
      <div>
        <PageHeader title="运营看板" description="落地页流量、转化与渠道归因" />
        <div className="flex h-40 items-center justify-center text-destructive">{error}</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="运营看板"
        description="落地页流量、转化与渠道归因（数据来自自托管埋点）"
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

      {realtime && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm">
          <Radio className="size-3.5 text-emerald-500" />
          <span className="text-muted-foreground">最近 {realtime.minutes} 分钟</span>
          <span className="font-medium">{realtime.visitors}</span> 访客
          <span className="font-medium">{realtime.pageviews}</span> 浏览
        </div>
      )}

      {!overview ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="浏览量 PV" value={String(overview.pageviews)} icon={Eye} />
            <StatCard title="访客 UV" value={String(overview.visitors)} icon={Users} />
            <StatCard title="自定义事件" value={String(overview.events)} icon={MousePointerClick} />
            <StatCard title="平均会话时长" value={formatDuration(overview.avgDurationMs)} icon={Timer} />
          </div>

          <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
            <span>会话 {overview.sessions}</span>
            <span>新增访客 {overview.newVisitors}</span>
            <span>跳出率 {percent(overview.bounceRate)}</span>
            <span>跳出会话 {overview.bounces}</span>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>访问趋势</CardTitle>
              <CardDescription>每日浏览量 / 访客数</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={trendConfig} className="h-[280px] w-full">
                <AreaChart data={trend} margin={{ left: -20 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area dataKey="pageviews" type="monotone" stroke="var(--color-pageviews)" fill="var(--color-pageviews)" fillOpacity={0.15} strokeWidth={2} />
                  <Area dataKey="visitors" type="monotone" stroke="var(--color-visitors)" fill="var(--color-visitors)" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>渠道归因</CardTitle>
            <CardDescription>按 UTM source / medium / campaign</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>来源</TableHead>
                  <TableHead>媒介</TableHead>
                  <TableHead>活动</TableHead>
                  <TableHead className="text-right">访客</TableHead>
                  <TableHead className="text-right">会话</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无数据</TableCell>
                  </TableRow>
                )}
                {channels.map((row, i) => (
                  <TableRow key={`${row.source}-${row.medium}-${row.campaign}-${i}`}>
                    <TableCell className="font-medium">{row.source}</TableCell>
                    <TableCell className="text-muted-foreground">{row.medium}</TableCell>
                    <TableCell className="text-muted-foreground">{row.campaign}</TableCell>
                    <TableCell className="text-right">{row.visitors}</TableCell>
                    <TableCell className="text-right">{row.sessions}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TOP 页面</CardTitle>
            <CardDescription>按浏览量排序</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>路径</TableHead>
                  <TableHead className="text-right">浏览</TableHead>
                  <TableHead className="text-right">访客</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">暂无数据</TableCell>
                  </TableRow>
                )}
                {pages.map((row) => (
                  <TableRow key={row.path}>
                    <TableCell className="max-w-64 truncate font-medium" title={row.path}>{row.path}</TableCell>
                    <TableCell className="text-right">{row.pageviews}</TableCell>
                    <TableCell className="text-right">{row.visitors}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>事件排行</CardTitle>
            <CardDescription>CTA 点击、模板使用、插件安装等</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>事件</TableHead>
                  <TableHead className="text-right">次数</TableHead>
                  <TableHead className="text-right">访客</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">暂无数据</TableCell>
                  </TableRow>
                )}
                {events.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{row.visitors}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>转化漏斗</CardTitle>
            <CardDescription>按会话内事件顺序去重计数，事件名用英文逗号分隔</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <input
                value={funnelInput}
                onChange={(e) => setFunnelInput(e.target.value)}
                placeholder={DEFAULT_FUNNEL}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Button onClick={runFunnel} disabled={funnelLoading}>
                {funnelLoading ? <Loader2 className="size-4 animate-spin" /> : '计算'}
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {funnel.length === 0 && (
                <p className="text-sm text-muted-foreground">输入事件名后点击「计算」查看漏斗。</p>
              )}
              {funnel.map((step) => (
                <div key={step.index}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{step.label}</span>
                    <span className="text-muted-foreground">
                      {step.sessions} 会话 · {percent(step.rateFromPrevious)} 转化
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((step.sessions / maxFunnel) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
