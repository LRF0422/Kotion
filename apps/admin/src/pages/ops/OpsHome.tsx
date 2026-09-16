import { Link } from 'react-router-dom'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kn/ui'
import {
  Activity,
  Bell,
  Download,
  FlaskConical,
  Funnel,
  Gauge,
  History,
  Link2,
  ListChecks,
  MousePointerClick,
  Percent,
  Target,
  Ticket,
  Users,
} from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { DataState } from '@/components/DataState'
import { useAsync } from '@/lib/use-async'
import { getOpsWorkbench, type OpsWorkbench } from '@/api/ops'

/**
 * 转化率口径历史上出现过两种：0-1 的比率与已经乘过 100 的百分比。
 * 约定：后端 conversionRate 一律返回**百分比数值**（0-100），前端只做格式化，
 * 不再做 >1 的猜测试探（猜测会把 0.5% 误显示成 50%）。
 */
const formatRate = (value?: number | null) => {
  const v = value ?? 0
  return `${v.toFixed(2)}%`
}

const formatChange = (value?: number | null) => {
  const v = value ?? 0
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

/** 工作台里可直接展示的计数项（排除 totals 子对象）。 */
type TodoField = Exclude<keyof OpsWorkbench, 'totals'>

interface TodoItem {
  field: TodoField
  title: string
  hint: string
  to: string
  icon: React.ComponentType<{ className?: string }>
}

const TODO_ITEMS: TodoItem[] = [
  { field: 'pendingDrafts', title: '待发布草稿', hint: '文案已修改但尚未发布', to: '/ops/content', icon: History },
  { field: 'newSubscribers', title: '新增订阅', hint: '近 7 天新增订阅邮箱', to: '/ops/subscribers', icon: Users },
  { field: 'runningExperiments', title: '运行中实验', hint: '正在分流中的 A/B 实验', to: '/ops/experiments', icon: FlaskConical },
  { field: 'openAlerts', title: '未处理告警', hint: '已触发但尚未处理的告警', to: '/ops/alerts', icon: Bell },
  { field: 'expiringPromotions', title: '即将到期推广位', hint: '临近下线时间的推广位', to: '/ops/promotions', icon: Ticket },
  { field: 'unreviewedChangelog', title: '待处理更新日志', hint: '未确认的 Release 记录', to: '/ops/changelog', icon: Activity },
]

interface QuickLink {
  title: string
  to: string
  icon: React.ComponentType<{ className?: string }>
}

const QUICK_LINKS: QuickLink[] = [
  { title: '运营看板', to: '/ops/dashboard', icon: Gauge },
  { title: '转化目标', to: '/ops/goals', icon: Target },
  { title: '保存漏斗', to: '/ops/funnels', icon: Funnel },
  { title: '事件字典', to: '/ops/events', icon: ListChecks },
  { title: '渠道链接', to: '/ops/links', icon: Link2 },
  { title: '数据导出', to: '/ops/export', icon: Download },
]

export const OpsHome = () => {
  const { data, loading, error, reload } = useAsync(() => getOpsWorkbench(7), [])

  const totals = data?.totals
  const visitors = totals?.visitors ?? 0
  const conversions = totals?.conversions ?? 0

  return (
    <div>
      <PageHeader title="运营工作台" description="每日待办与关键指标，数据口径为近 7 天" />

      <DataState loading={loading} error={error} onRetry={reload} rows={4}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="访客" value={String(visitors)} icon={Users} />
          <StatCard title="转化数" value={String(conversions)} icon={MousePointerClick} />
          <StatCard title="转化率" value={formatRate(totals?.conversionRate)} icon={Percent} />
          <StatCard title="环比" value={formatChange(totals?.changePct)} trend={totals?.changePct} icon={Activity} />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>待办</CardTitle>
            <CardDescription>点击卡片直达对应的处理页面</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {TODO_ITEMS.map((item) => {
                const Icon = item.icon
                const count = data ? data[item.field] : 0
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{item.title}</span>
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2 text-3xl font-semibold tabular-nums">{count}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>快捷入口</CardTitle>
            <CardDescription>常用运营页面的快捷导航</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {QUICK_LINKS.map((item) => {
                const Icon = item.icon
                return (
                  <Button key={item.to} variant="outline" asChild>
                    <Link to={item.to}>
                      <Icon className="mr-1.5 size-4" />
                      {item.title}
                    </Link>
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </DataState>
    </div>
  )
}
