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
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  Pie,
  PieChart,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kn/ui'
import { Users, FolderKanban, FileText, Sparkles } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { StatusBadge } from '@/components/StatusBadge'
import { MOCK_LOGS, MOCK_STORAGE, MOCK_TRENDS } from '@/mock/data'

const trendChartConfig = {
  activeUsers: { label: '活跃用户', color: 'hsl(var(--chart-1))' },
  newPages: { label: '新增页面', color: 'hsl(var(--chart-2))' },
  aiCalls: { label: 'AI 调用', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig

const storageChartConfig = {
  value: { label: '占比' },
} satisfies ChartConfig

export const Dashboard = () => {
  const recentLogs = MOCK_LOGS.slice(0, 5)

  return (
    <div>
      <PageHeader title="仪表盘" description="平台运行概览与核心指标" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="注册用户" value="1,286" trend={4.2} icon={Users} />
        <StatCard title="知识空间" value="94" trend={2.1} icon={FolderKanban} />
        <StatCard title="页面总数" value="12,483" trend={6.8} icon={FileText} />
        <StatCard title="本周 AI 调用" value="2,796" trend={-3.4} icon={Sparkles} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>近 7 日趋势</CardTitle>
            <CardDescription>活跃用户 / 新增页面 / AI 调用量</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendChartConfig} className="h-[280px] w-full">
              <AreaChart data={MOCK_TRENDS} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="aiCalls" type="monotone" fill="var(--color-aiCalls)" fillOpacity={0.15} stroke="var(--color-aiCalls)" />
                <Area dataKey="activeUsers" type="monotone" fill="var(--color-activeUsers)" fillOpacity={0.25} stroke="var(--color-activeUsers)" />
                <Area dataKey="newPages" type="monotone" fill="var(--color-newPages)" fillOpacity={0.25} stroke="var(--color-newPages)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>存储占用分布</CardTitle>
            <CardDescription>按资源类型统计（%）</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={storageChartConfig} className="mx-auto h-[280px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                <Pie data={MOCK_STORAGE} dataKey="value" nameKey="name" innerRadius={55} label={(entry) => entry.name} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>最近操作</CardTitle>
          <CardDescription>平台最新的管理与登录动态</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>操作人</TableHead>
                <TableHead>行为</TableHead>
                <TableHead>对象</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>结果</TableHead>
                <TableHead className="text-right">时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.operator}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell className="text-muted-foreground">{log.target}</TableCell>
                  <TableCell className="text-muted-foreground">{log.ip}</TableCell>
                  <TableCell>
                    {log.result === 'success'
                      ? <StatusBadge variant="success">成功</StatusBadge>
                      : <StatusBadge variant="danger">失败</StatusBadge>}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{log.time}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
