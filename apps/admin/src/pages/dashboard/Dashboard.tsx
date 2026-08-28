import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
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
  Line,
  LineChart,
  Pie,
  PieChart,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  XAxis,
  YAxis,
  cn,
} from '@kn/ui'
import { Users, FolderKanban, FileText, MessageSquare, Loader2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import {
  getCommentList,
  getContentTrend,
  getDauTrend,
  getLogList,
  getPageList,
  getSpaceTrend,
  getTopSpaces,
  getTotalUsers,
  getUserRegistrationTrend,
  getWikiSummary,
  type LogVO,
  type TopSpaceVO,
} from '@/api'
import { formatDateTime } from '@/lib/use-paged-data'

const userChartConfig = {
  registrations: { label: '新增注册', color: 'hsl(var(--chart-1))' },
  dau: { label: '日活 DAU', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

const contentChartConfig = {
  pages: { label: '新建页面', color: 'hsl(var(--chart-1))' },
  spaces: { label: '新建空间', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig

const pageChartConfig = {
  value: { label: '页面数' },
} satisfies ChartConfig

const DAY_OPTIONS = [7, 30, 90] as const

interface DashboardStats {
  userTotal: number
  spaceTotal: number
  pageTotal: number
  pageActive: number
  pageDraft: number
  pageTrash: number
  commentOpen: number
}

interface UserTrendPoint {
  date: string
  registrations: number
  dau: number
}

interface ContentTrendPoint {
  date: string
  pages: number
  spaces: number
}

/** 合并两条 DailyCount 序列（日期已由后端补零对齐） */
const mergeTrend = <K1 extends string, K2 extends string>(
  a: { date: string; value: number }[],
  b: { date: string; value: number }[],
  keyA: K1,
  keyB: K2,
) => {
  const byDate = new Map<string, Record<string, number | string>>()
  a.forEach((item) => byDate.set(item.date, { date: item.date, [keyA]: item.value, [keyB]: 0 }))
  b.forEach((item) => {
    const row = byDate.get(item.date) ?? { date: item.date, [keyA]: 0 }
    row[keyB] = item.value
    byDate.set(item.date, row)
  })
  return [...byDate.values()].sort((x, y) => String(x.date).localeCompare(String(y.date)))
}

/** 横轴只展示 月-日 */
const shortDate = (date: string) => date.slice(5)

export const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentLogs, setRecentLogs] = useState<LogVO[]>([])
  const [topSpaces, setTopSpaces] = useState<TopSpaceVO[]>([])
  const [userTrend, setUserTrend] = useState<UserTrendPoint[]>([])
  const [contentTrend, setContentTrend] = useState<ContentTrendPoint[]>([])
  const [days, setDays] = useState<number>(30)
  const [error, setError] = useState<string | null>(null)

  // 总量/日志/TOP 空间：一次性加载
  useEffect(() => {
    let cancelled = false
    Promise.all([
      getTotalUsers().catch(() => 0),
      getWikiSummary().catch(() => ({ totalSpaces: 0, totalPages: 0 })),
      getPageList({ current: 1, pageSize: 1, status: 'ACTIVE' }).catch(() => ({ total: 0 } as any)),
      getPageList({ current: 1, pageSize: 1, status: 'DRAFT' }).catch(() => ({ total: 0 } as any)),
      getPageList({ current: 1, pageSize: 1, status: 'TRASH' }).catch(() => ({ total: 0 } as any)),
      getCommentList({ current: 1, pageSize: 1, resolved: false }).catch(() => ({ total: 0 } as any)),
      getLogList('api', { current: 1, size: 5 }).catch(() => null),
      getTopSpaces(8).catch(() => []),
    ])
      .then(([userTotal, wiki, pageActive, pageDraft, pageTrash, comments, logs, tops]) => {
        if (cancelled) return
        setStats({
          userTotal,
          spaceTotal: wiki.totalSpaces,
          pageTotal: wiki.totalPages,
          pageActive: pageActive.total,
          pageDraft: pageDraft.total,
          pageTrash: pageTrash.total,
          commentOpen: comments.total,
        })
        setRecentLogs(logs?.records ?? [])
        setTopSpaces(tops)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 趋势数据：随天数切换重新加载
  useEffect(() => {
    let cancelled = false
    Promise.all([
      getUserRegistrationTrend(days).catch(() => []),
      getDauTrend(days).catch(() => []),
      getContentTrend(days).catch(() => []),
      getSpaceTrend(days).catch(() => []),
    ]).then(([registrations, dau, pages, spaces]) => {
      if (cancelled) return
      setUserTrend(mergeTrend(registrations, dau, 'registrations', 'dau') as unknown as UserTrendPoint[])
      setContentTrend(mergeTrend(pages, spaces, 'pages', 'spaces') as unknown as ContentTrendPoint[])
    })
    return () => {
      cancelled = true
    }
  }, [days])

  if (error) {
    return (
      <div>
        <PageHeader title="仪表盘" description="平台运行概览与核心指标" />
        <div className="flex h-40 items-center justify-center text-destructive">{error}</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div>
        <PageHeader title="仪表盘" description="平台运行概览与核心指标" />
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    )
  }

  const pageDistribution = [
    { name: '已发布', value: stats.pageActive, fill: 'hsl(var(--chart-1))' },
    { name: '草稿', value: stats.pageDraft, fill: 'hsl(var(--chart-2))' },
    { name: '回收站', value: stats.pageTrash, fill: 'hsl(var(--chart-3))' },
  ].filter((item) => item.value > 0)

  return (
    <div>
      <PageHeader title="仪表盘" description="平台运行概览与核心指标" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="注册用户" value={String(stats.userTotal)} icon={Users} />
        <StatCard title="知识空间" value={String(stats.spaceTotal)} icon={FolderKanban} />
        <StatCard title="页面总数" value={String(stats.pageTotal)} icon={FileText} />
        <StatCard title="未解决评论" value={String(stats.commentOpen)} icon={MessageSquare} />
      </div>

      <div className="mt-6 flex items-center justify-end gap-1">
        {DAY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDays(option)}
            className={cn(
              'rounded-md px-3 py-1 text-sm transition-colors',
              days === option
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            近{option}天
          </button>
        ))}
      </div>

      <div className="mt-2 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>用户增长与活跃</CardTitle>
            <CardDescription>每日新增注册 / 日活跃用户（基于接口日志）</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={userChartConfig} className="h-[260px] w-full">
              <LineChart data={userTrend} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="registrations" type="monotone" stroke="var(--color-registrations)" strokeWidth={2} dot={false} />
                <Line dataKey="dau" type="monotone" stroke="var(--color-dau)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>内容创建趋势</CardTitle>
            <CardDescription>每日新建页面 / 新建空间</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={contentChartConfig} className="h-[260px] w-full">
              <AreaChart data={contentTrend} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="pages" type="monotone" stroke="var(--color-pages)" fill="var(--color-pages)" fillOpacity={0.15} strokeWidth={2} />
                <Area dataKey="spaces" type="monotone" stroke="var(--color-spaces)" fill="var(--color-spaces)" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>TOP 空间</CardTitle>
            <CardDescription>按有效页面数排序</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>空间</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead className="text-right">页面数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSpaces.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">暂无数据</TableCell>
                  </TableRow>
                )}
                {topSpaces.map((space) => (
                  <TableRow key={space.spaceId}>
                    <TableCell className="max-w-40 truncate font-medium" title={space.spaceName}>
                      {space.spaceName || space.spaceId}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{space.type || '-'}</TableCell>
                    <TableCell className="text-right">{space.pageCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>页面状态分布</CardTitle>
            <CardDescription>已发布 / 草稿 / 回收站</CardDescription>
          </CardHeader>
          <CardContent>
            {pageDistribution.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">暂无页面数据</div>
            ) : (
              <ChartContainer config={pageChartConfig} className="mx-auto h-[240px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                  <Pie data={pageDistribution} dataKey="value" nameKey="name" innerRadius={50} label={(entry) => entry.name} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近接口调用</CardTitle>
            <CardDescription>knowledge-log 最新接口日志</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>操作人</TableHead>
                  <TableHead>行为</TableHead>
                  <TableHead className="text-right">时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">暂无日志</TableCell>
                  </TableRow>
                )}
                {recentLogs.map((log, index) => (
                  <TableRow key={log.strId || index}>
                    <TableCell className="font-medium">{log.createBy || '-'}</TableCell>
                    <TableCell className="max-w-36 truncate" title={log.title}>{log.title || '-'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDateTime(log.createTime)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
