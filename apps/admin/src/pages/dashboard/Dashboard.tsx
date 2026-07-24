import { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
  Pie,
  PieChart,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kn/ui'
import { Users, FolderKanban, FileText, MessageSquare, Loader2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { getCommentList, getLogList, getPageList, getSpaceList, getUserList, type LogVO } from '@/api'
import { formatDateTime } from '@/lib/use-paged-data'

const pageChartConfig = {
  value: { label: '页面数' },
} satisfies ChartConfig

interface DashboardStats {
  userTotal: number
  spaceTotal: number
  pageActive: number
  pageDraft: number
  pageTrash: number
  commentOpen: number
}

export const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentLogs, setRecentLogs] = useState<LogVO[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // 只取 total，pageSize/size 用 1 减少传输
    Promise.all([
      getUserList({ current: 1, size: 1 }),
      getSpaceList({ current: 1, pageSize: 1 }),
      getPageList({ current: 1, pageSize: 1, status: 'ACTIVE' }),
      getPageList({ current: 1, pageSize: 1, status: 'DRAFT' }),
      getPageList({ current: 1, pageSize: 1, status: 'TRASH' }),
      getCommentList({ current: 1, pageSize: 1, resolved: false }),
      getLogList('api', { current: 1, size: 5 }).catch(() => null),
    ])
      .then(([users, spaces, pageActive, pageDraft, pageTrash, comments, logs]) => {
        if (cancelled) return
        setStats({
          userTotal: users.total,
          spaceTotal: spaces.total,
          pageActive: pageActive.total,
          pageDraft: pageDraft.total,
          pageTrash: pageTrash.total,
          commentOpen: comments.total,
        })
        setRecentLogs(logs?.records ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

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
        <StatCard title="已发布页面" value={String(stats.pageActive)} icon={FileText} />
        <StatCard title="未解决评论" value={String(stats.commentOpen)} icon={MessageSquare} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
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
                  <TableHead>请求</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="text-right">时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无日志</TableCell>
                  </TableRow>
                )}
                {recentLogs.map((log, index) => (
                  <TableRow key={log.strId || index}>
                    <TableCell className="font-medium">{log.createBy || '-'}</TableCell>
                    <TableCell>{log.title || '-'}</TableCell>
                    <TableCell className="max-w-52 truncate font-mono text-xs text-muted-foreground" title={log.requestUri}>
                      {log.method ? `${log.method} ${log.requestUri || ''}` : log.requestUri || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{log.remoteIp || '-'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDateTime(log.createTime)}</TableCell>
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
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">暂无页面数据</div>
            ) : (
              <ChartContainer config={pageChartConfig} className="mx-auto h-[280px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                  <Pie data={pageDistribution} dataKey="value" nameKey="name" innerRadius={55} label={(entry) => entry.name} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
