import { Fragment, useMemo, useState } from 'react'
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import {
  Activity,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Eye,
  Funnel,
  Gauge,
  History,
  LoaderCircle,
  MousePointerClick,
  Target,
  Timer,
  Users,
} from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { DataState } from '@/components/DataState'
import { useAsync } from '@/lib/use-async'
import { formatDateTime } from '@/lib/use-paged-data'
import {
  getOpsChannels,
  getOpsDataQuality,
  getOpsEventProps,
  getOpsEvents,
  getOpsFunnelStats,
  getOpsFunnels,
  getOpsGoalStats,
  getOpsOverview,
  getOpsPages,
  getOpsRealtime,
  getOpsReferrers,
  getOpsSessions,
  getOpsTech,
  getOpsTimeseries,
  postOpsFunnel,
  type OpsBreakdown,
  type OpsChannel,
  type OpsEventRank,
  type OpsFunnelStats,
  type OpsFunnelStep,
  type OpsGoalStat,
  type OpsPageRank,
  type OpsPropCount,
  type OpsReferrer,
  type OpsSession,
  type OpsTrendPoint,
} from '@/api/ops'

const trendConfig = {
  pageviews: { label: '浏览量', color: 'hsl(var(--chart-1))' },
  visitors: { label: '访客', color: 'hsl(var(--chart-2))' },
  // 上一周期：同一色系压暗，并用虚线区分。
  prevPageviews: { label: '上一周期浏览量', color: 'hsl(var(--muted-foreground) / 0.5)' },
  prevVisitors: { label: '上一周期访客', color: 'hsl(var(--muted-foreground) / 0.28)' },
} satisfies ChartConfig

const DAY_OPTIONS = [7, 30, 90] as const
const DEFAULT_FUNNEL = 'pageview,cta_click,plugin_install'

/** 事件属性下钻预设：落地页埋点里最常用的「事件 + 属性名」组合。 */
const PROP_PRESETS: Array<{ name: string; key: string }> = [
  { name: 'cta_click', key: 'target' },
  { name: 'cta_click', key: 'location' },
  { name: 'template_use', key: 'templateName' },
  { name: 'plugin_install', key: 'pluginName' },
  { name: 'outbound_click', key: 'location' },
  { name: 'experiment_exposure', key: 'variant' },
  { name: 'form_error', key: 'errorCode' },
]

const PROP_EVENT_NAMES = Array.from(new Set(PROP_PRESETS.map((item) => item.name)))

const keysForEvent = (name: string) => PROP_PRESETS.filter((item) => item.name === name).map((item) => item.key)

const formatDuration = (ms: number) => {
  const seconds = Math.round((ms || 0) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

const percent = (value: number) => `${Math.round((value || 0) * 1000) / 10}%`

/**
 * 后端 conversionRate 已经是 0-100 的百分比数值，直接格式化，**不要**再乘 100。
 */
const formatRate = (value?: number | null) => `${(value ?? 0).toFixed(2)}%`

const growth = (current: number, previous: number) =>
  previous === 0 ? 0 : Math.round(((current - previous) / previous) * 10000) / 100

const sumPoints = (points: OpsTrendPoint[], pick: (point: OpsTrendPoint) => number) =>
  points.reduce((acc, point) => acc + (pick(point) || 0), 0)

/** 绿色 / 红色环比数值：负数用 ChevronDown（ArrowDownRight 在 @kn/icon 里不可用）。 */
const TrendDelta = ({ value }: { value: number }) => {
  const up = value >= 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 tabular-nums',
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      )}
    >
      {up ? <ArrowUpRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      {`${up ? '+' : ''}${value.toFixed(2)}%`}
    </span>
  )
}

/** 漏斗条形图：保存漏斗与「快速试算」共用同一套视觉。 */
const FunnelBars = ({ steps, emptyText }: { steps: OpsFunnelStep[]; emptyText: string }) => {
  const max = useMemo(() => Math.max(1, ...steps.map((step) => step.sessions)), [steps])

  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <div className="space-y-3">
      {steps.map((step) => (
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
              style={{ width: `${Math.round((step.sessions / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 设备 / 浏览器 / 系统共用的紧凑条形列表。 */
const BreakdownList = ({ title, rows }: { title: string; rows: OpsBreakdown[] }) => {
  const max = Math.max(1, ...rows.map((row) => row.visitors))
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无数据</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${title}-${row.label}-${index}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate" title={row.label}>
                  {row.label || '未知'}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{row.visitors}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((row.visitors / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 事件属性下钻：label / count / visitors 的条形列表。 */
const PropCountList = ({ rows, emptyText }: { rows: OpsPropCount[]; emptyText: string }) => {
  const max = Math.max(1, ...rows.map((row) => row.count))
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate" title={row.label}>
              {row.label || '(空)'}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {row.count} 次 · {row.visitors} 访客
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export const OpsDashboard = () => {
  const [days, setDays] = useState<number>(30)

  // 核心指标：一次 Promise.all 拿到概览 + 2 倍窗口的趋势，失败时整块降级。
  const core = useAsync(() => Promise.all([getOpsOverview(days), getOpsTimeseries(days * 2)]), [days])
  const overview = core.data?.[0] ?? null
  const timeseries = useMemo(() => core.data?.[1] ?? [], [core.data])

  // 各可选面板独立 useAsync：单个面板失败只降级自己，不会白屏。
  const pages = useAsync(() => getOpsPages(days, 10), [days])
  const events = useAsync(() => getOpsEvents(days, 15), [days])
  const channels = useAsync(() => getOpsChannels(days, 10), [days])
  const realtime = useAsync(() => getOpsRealtime(30), [])
  const goals = useAsync(() => getOpsGoalStats(days), [days])
  const funnels = useAsync(() => getOpsFunnels(), [])
  const referrers = useAsync(() => getOpsReferrers(days, 10), [days])
  const tech = useAsync(() => getOpsTech(days), [days])
  const sessions = useAsync(() => getOpsSessions(30), [])
  const dataQuality = useAsync(() => getOpsDataQuality(), [])

  const [selectedFunnel, setSelectedFunnel] = useState('')
  const funnelStats = useAsync<OpsFunnelStats | null>(
    () => (selectedFunnel ? getOpsFunnelStats(selectedFunnel, days) : Promise.resolve(null)),
    [selectedFunnel, days],
  )

  const [propEvent, setPropEvent] = useState('cta_click')
  const [propKey, setPropKey] = useState('target')
  const [propKeyDraft, setPropKeyDraft] = useState('target')
  const eventProps = useAsync<OpsPropCount[]>(
    () => (propKey.trim() ? getOpsEventProps(propEvent, propKey, days, 20) : Promise.resolve([])),
    [propEvent, propKey, days],
  )

  // 快速试算（临时漏斗）保留为折叠区，与保存漏斗并存。
  const [funnelInput, setFunnelInput] = useState(DEFAULT_FUNNEL)
  const [funnel, setFunnel] = useState<OpsFunnelStep[]>([])
  const [funnelLoading, setFunnelLoading] = useState(false)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  // 周期对比：只请求一次 days*2，前端切成「当前窗口 / 上一周期」。
  const { chartData, trends, previousPointCount } = useMemo(() => {
    const currentPoints = timeseries.slice(-days)
    const previousPoints = timeseries.slice(0, Math.max(0, timeseries.length - days))
    return {
      chartData: currentPoints.map((point, index) => ({
        date: point.date,
        pageviews: point.pageviews,
        visitors: point.visitors,
        prevPageviews: previousPoints[index]?.pageviews ?? 0,
        prevVisitors: previousPoints[index]?.visitors ?? 0,
      })),
      trends: {
        pageviews: growth(
          sumPoints(currentPoints, (point) => point.pageviews),
          sumPoints(previousPoints, (point) => point.pageviews),
        ),
        visitors: growth(
          sumPoints(currentPoints, (point) => point.visitors),
          sumPoints(previousPoints, (point) => point.visitors),
        ),
        events: growth(
          sumPoints(currentPoints, (point) => point.events),
          sumPoints(previousPoints, (point) => point.events),
        ),
      },
      previousPointCount: previousPoints.length,
    }
  }, [timeseries, days])

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

  const changePropEvent = (name: string) => {
    const nextKey = keysForEvent(name)[0] ?? 'target'
    setPropEvent(name)
    setPropKey(nextKey)
    setPropKeyDraft(nextKey)
  }

  const commitPropKey = () => {
    const next = propKeyDraft.trim()
    if (!next) {
      setPropKeyDraft(propKey)
      return
    }
    setPropKey(next)
  }

  const sampleRate = dataQuality.data?.sampleRate
  const sampled = typeof sampleRate === 'number' && sampleRate < 100
  const techRows = tech.data
  const techEmpty =
    (techRows?.device.length ?? 0) === 0 && (techRows?.browser.length ?? 0) === 0 && (techRows?.os.length ?? 0) === 0

  return (
    <div>
      <PageHeader
        title="运营看板"
        description="落地页流量、转化与渠道归因（数据来自自托管埋点）"
        actions={
          <>
            {sampled && (
              <span
                title={
                  dataQuality.data?.dataNote ||
                  `当前采样率 ${sampleRate}%，看板数字为抽样估算值，仅用于判断趋势，不等同于全量真实值。`
                }
                className="inline-flex cursor-help items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"
              >
                <CircleAlert className="size-3.5" />
                采样率 {sampleRate}%
              </span>
            )}
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
          </>
        }
      />

      {sampled && (
        <p className="mb-4 text-xs text-amber-700 dark:text-amber-300">
          当前处于抽样口径（采样率 {sampleRate}%），所有数字均为估算值，仅用于观察趋势。
        </p>
      )}

      {realtime.data ? (
        <div className="mb-4 inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm">
          <Activity className="size-3.5 animate-pulse text-emerald-500" />
          <span className="text-muted-foreground">最近 {realtime.data.minutes} 分钟</span>
          <span className="font-medium">{realtime.data.visitors}</span> 访客
          <span className="font-medium">{realtime.data.pageviews}</span> 浏览
        </div>
      ) : realtime.error ? (
        <button
          type="button"
          onClick={realtime.reload}
          className="mb-4 inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300"
        >
          <CircleAlert className="size-3.5" />
          实时数据暂不可用，点击重试
        </button>
      ) : null}

      <DataState loading={core.loading} error={core.error} empty={!overview} emptyText="暂无看板数据" onRetry={core.reload}>
        {overview && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard title="浏览量 PV" value={String(overview.pageviews)} icon={Eye} trend={trends.pageviews} trendLabel="较上期" />
              <StatCard title="访客 UV" value={String(overview.visitors)} icon={Users} trend={trends.visitors} trendLabel="较上期" />
              <StatCard
                title="自定义事件"
                value={String(overview.events)}
                icon={MousePointerClick}
                trend={trends.events}
                trendLabel="较上期"
              />
              {/* 平均会话时长在 /stats/timeseries 里没有分日字段，无法做周期对比。 */}
              <StatCard title="平均会话时长" value={formatDuration(overview.avgDurationMs)} icon={Timer} />
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              环比按「近 {days} 天」与「上一个 {days} 天」的每日数据累加计算
              {previousPointCount > 0 ? '' : '（暂无可对比的上一周期数据，环比显示 0%）'}。
            </p>

            <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
              <span>会话 {overview.sessions}</span>
              <span>新增访客 {overview.newVisitors}</span>
              <span>跳出率 {percent(overview.bounceRate)}</span>
              <span>跳出会话 {overview.bounces}</span>
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>访问趋势</CardTitle>
                <CardDescription>每日浏览量 / 访客数 · 虚线为上一周期</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={trendConfig} className="h-[280px] w-full">
                  <AreaChart data={chartData} margin={{ left: -20 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => v.slice(5)}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      dataKey="pageviews"
                      type="monotone"
                      stroke="var(--color-pageviews)"
                      fill="var(--color-pageviews)"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                    <Area
                      dataKey="visitors"
                      type="monotone"
                      stroke="var(--color-visitors)"
                      fill="var(--color-visitors)"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                    <Area
                      dataKey="prevPageviews"
                      type="monotone"
                      stroke="var(--color-prevPageviews)"
                      fill="var(--color-prevPageviews)"
                      fillOpacity={0.06}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                    />
                    <Area
                      dataKey="prevVisitors"
                      type="monotone"
                      stroke="var(--color-prevVisitors)"
                      fill="var(--color-prevVisitors)"
                      fillOpacity={0.04}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                    />
                  </AreaChart>
                </ChartContainer>
                <p className="mt-2 text-xs text-muted-foreground">虚线为上一周期</p>
              </CardContent>
            </Card>
          </>
        )}
      </DataState>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>渠道归因</CardTitle>
            <CardDescription>按 UTM source / medium / campaign</CardDescription>
          </CardHeader>
          <CardContent>
            <DataState
              loading={channels.loading}
              error={channels.error}
              rows={2}
              onRetry={channels.reload}
            >
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
                  {(channels.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  )}
                  {(channels.data ?? []).map((row: OpsChannel, i) => (
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
            </DataState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TOP 页面</CardTitle>
            <CardDescription>按浏览量排序</CardDescription>
          </CardHeader>
          <CardContent>
            <DataState loading={pages.loading} error={pages.error} rows={2} onRetry={pages.reload}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>路径</TableHead>
                    <TableHead className="text-right">浏览</TableHead>
                    <TableHead className="text-right">访客</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pages.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  )}
                  {(pages.data ?? []).map((row: OpsPageRank) => (
                    <TableRow key={row.path}>
                      <TableCell className="max-w-64 truncate font-medium" title={row.path}>
                        {row.path}
                      </TableCell>
                      <TableCell className="text-right">{row.pageviews}</TableCell>
                      <TableCell className="text-right">{row.visitors}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataState>
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
            <DataState loading={events.loading} error={events.error} rows={2} onRetry={events.reload}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>事件</TableHead>
                    <TableHead className="text-right">次数</TableHead>
                    <TableHead className="text-right">访客</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(events.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  )}
                  {(events.data ?? []).map((row: OpsEventRank) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{row.visitors}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Funnel className="size-4 text-muted-foreground" />
              保存漏斗
            </CardTitle>
            <CardDescription>选择已保存的漏斗查看分步转化（近 {days} 天）</CardDescription>
          </CardHeader>
          <CardContent>
            <DataState loading={funnels.loading} error={funnels.error} rows={2} onRetry={funnels.reload}>
              {(funnels.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  还没有保存的漏斗，可到「转化漏斗」页面创建，或先用下方「快速试算」。
                </p>
              ) : (
                <Select value={selectedFunnel} onValueChange={setSelectedFunnel}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择保存的漏斗" />
                  </SelectTrigger>
                  <SelectContent>
                    {(funnels.data ?? []).map((item) => (
                      <SelectItem key={item.funnelKey} value={item.funnelKey}>
                        {item.name}（{item.steps.length} 步）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedFunnel && (
                <div className="mt-4">
                  <DataState
                    loading={funnelStats.loading}
                    error={funnelStats.error}
                    rows={3}
                    onRetry={funnelStats.reload}
                  >
                    <FunnelBars
                      steps={funnelStats.data?.steps ?? []}
                      emptyText="该漏斗在所选周期内没有数据。"
                    />
                  </DataState>
                </div>
              )}
            </DataState>

            <details className="mt-4 rounded-lg border bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">快速试算（临时事件序列）</summary>
              <div className="mt-3 space-y-3">
                <div className="flex gap-2">
                  <input
                    value={funnelInput}
                    onChange={(e) => setFunnelInput(e.target.value)}
                    placeholder={DEFAULT_FUNNEL}
                    className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  <Button onClick={runFunnel} disabled={funnelLoading}>
                    {funnelLoading ? <LoaderCircle className="size-4 animate-spin" /> : '计算'}
                  </Button>
                </div>
                <FunnelBars steps={funnel} emptyText="输入事件名后点击「计算」查看漏斗。" />
              </div>
            </details>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4 text-muted-foreground" />
              转化目标
            </CardTitle>
            <CardDescription>近 {days} 天各目标的转化数、转化率与环比</CardDescription>
          </CardHeader>
          <CardContent>
            <DataState loading={goals.loading} error={goals.error} rows={2} onRetry={goals.reload}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>目标</TableHead>
                    <TableHead className="text-right">转化数</TableHead>
                    <TableHead className="text-right">访客</TableHead>
                    <TableHead className="text-right">转化率</TableHead>
                    <TableHead className="text-right">环比</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(goals.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  )}
                  {(goals.data ?? []).map((row: OpsGoalStat) => (
                    <TableRow key={row.goalKey}>
                      <TableCell className="font-medium">
                        {row.name}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{row.goalKey}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.conversions}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.visitors}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRate(row.conversionRate)}</TableCell>
                      <TableCell className="text-right">
                        <TrendDelta value={row.changePct} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              来源站点
            </CardTitle>
            <CardDescription>近 {days} 天外部来源 TOP 10</CardDescription>
          </CardHeader>
          <CardContent>
            <DataState loading={referrers.loading} error={referrers.error} rows={2} onRetry={referrers.reload}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>来源</TableHead>
                    <TableHead className="text-right">访客</TableHead>
                    <TableHead className="text-right">浏览量</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(referrers.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  )}
                  {(referrers.data ?? []).map((row: OpsReferrer, index) => (
                    <TableRow key={`${row.referrer}-${index}`}>
                      <TableCell className="max-w-72 truncate font-medium" title={row.referrer}>
                        {row.referrer || '直接访问'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.visitors}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.pageviews}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataState>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="size-4 text-muted-foreground" />
              设备 / 浏览器 / 系统
            </CardTitle>
            <CardDescription>近 {days} 天访问者分布</CardDescription>
          </CardHeader>
          <CardContent>
            <DataState
              loading={tech.loading}
              error={tech.error}
              empty={techEmpty}
              emptyText="暂无终端分布数据"
              rows={2}
              onRetry={tech.reload}
            >
              <div className="grid gap-5 sm:grid-cols-3">
                <BreakdownList title="设备" rows={techRows?.device ?? []} />
                <BreakdownList title="浏览器" rows={techRows?.browser ?? []} />
                <BreakdownList title="系统" rows={techRows?.os ?? []} />
              </div>
            </DataState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MousePointerClick className="size-4 text-muted-foreground" />
              事件属性下钻
            </CardTitle>
            <CardDescription>按事件 + 属性值统计次数与访客（近 {days} 天 TOP 20）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">事件名</Label>
                  <Select value={propEvent} onValueChange={changePropEvent}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择事件" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROP_EVENT_NAMES.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">属性名</Label>
                  <Select
                    value={propKey}
                    onValueChange={(value) => {
                      setPropKey(value)
                      setPropKeyDraft(value)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择属性" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([...keysForEvent(propEvent), propKey])).map((key) => (
                        <SelectItem key={key} value={key}>
                          {key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={propKeyDraft}
                  placeholder="自定义属性名，回车生效"
                  onChange={(e) => setPropKeyDraft(e.target.value)}
                  onBlur={commitPropKey}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitPropKey()
                  }}
                />
                <Button variant="outline" onClick={commitPropKey}>
                  应用
                </Button>
              </div>

              <DataState loading={eventProps.loading} error={eventProps.error} rows={3} onRetry={eventProps.reload}>
                <PropCountList
                  rows={eventProps.data ?? []}
                  emptyText={propKey.trim() ? '该事件在此周期内没有该属性的数据。' : '请先填写属性名。'}
                />
              </DataState>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            最近会话
          </CardTitle>
          <CardDescription>最近 30 个会话；小屏仅展示关键列，点击行可展开完整信息</CardDescription>
        </CardHeader>
        <CardContent>
          <DataState loading={sessions.loading} error={sessions.error} rows={3} onRetry={sessions.reload}>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>访客</TableHead>
                    <TableHead>落地页</TableHead>
                    <TableHead className="hidden md:table-cell">来源</TableHead>
                    <TableHead className="hidden md:table-cell">UTM 来源 / 活动</TableHead>
                    <TableHead>设备</TableHead>
                    <TableHead className="hidden md:table-cell">语言</TableHead>
                    <TableHead className="hidden lg:table-cell">首次时间</TableHead>
                    <TableHead>最近时间</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">浏览量</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">事件数</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sessions.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  )}
                  {(sessions.data ?? []).map((row: OpsSession) => {
                    const expanded = expandedSession === row.id
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpandedSession(expanded ? null : row.id)}
                        >
                          <TableCell className="max-w-32 truncate font-mono text-xs" title={row.visitorId}>
                            {row.visitorId}
                          </TableCell>
                          <TableCell className="max-w-40 truncate" title={row.landingPath}>
                            {row.landingPath || '-'}
                          </TableCell>
                          <TableCell className="hidden max-w-40 truncate text-muted-foreground md:table-cell" title={row.referrer}>
                            {row.referrer || '直接访问'}
                          </TableCell>
                          <TableCell className="hidden max-w-40 truncate text-muted-foreground md:table-cell">
                            {row.utmSource || '-'}
                            {row.utmCampaign ? ` / ${row.utmCampaign}` : ''}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{row.device || '-'}</TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{row.language || '-'}</TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">
                            {formatDateTime(row.firstSeen)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDateTime(row.lastSeen)}</TableCell>
                          <TableCell className="hidden text-right tabular-nums lg:table-cell">{row.pageviews ?? 0}</TableCell>
                          <TableCell className="hidden text-right tabular-nums lg:table-cell">{row.events ?? 0}</TableCell>
                          <TableCell>
                            <ChevronRight
                              className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-90')}
                            />
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={11}>
                              <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <dt className="text-muted-foreground">会话 ID</dt>
                                  <dd className="font-mono">{row.id}</dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">来源</dt>
                                  <dd>{row.referrer || '直接访问'}</dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">UTM 来源 / 媒介 / 活动</dt>
                                  <dd>
                                    {row.utmSource || '-'} / {row.utmMedium || '-'} / {row.utmCampaign || '-'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">设备 / 浏览器 / 系统</dt>
                                  <dd>
                                    {row.device || '-'} / {row.browser || '-'} / {row.os || '-'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">语言</dt>
                                  <dd>{row.language || '-'}</dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">首次 / 最近时间</dt>
                                  <dd>
                                    {formatDateTime(row.firstSeen)} / {formatDateTime(row.lastSeen)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">浏览量 / 事件数</dt>
                                  <dd>
                                    {row.pageviews ?? 0} / {row.events ?? 0}
                                  </dd>
                                </div>
                              </dl>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </DataState>
        </CardContent>
      </Card>
    </div>
  )
}
