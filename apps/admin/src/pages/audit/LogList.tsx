import { useCallback, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@kn/ui'
import { Eye, Loader2 } from '@kn/icon'
import { getLogList, type LogKind, type LogVO } from '@/api'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

const KIND_LABEL: Record<LogKind, string> = {
  usual: '运行日志',
  api: '接口日志',
  error: '错误日志',
}

const getSummary = (log: LogVO, kind: LogKind) => {
  if (kind === 'error') return log.message || log.exceptionName || '-'
  if (kind === 'api') return log.title || log.requestUri || '-'
  return log.logData || log.message || '-'
}

const getSource = (log: LogVO) => log.requestUri || log.serviceId || log.methodName || '-'

const LogLevel = ({ log, kind }: { log: LogVO; kind: LogKind }) => {
  if (kind === 'error') return <StatusBadge variant="danger">ERROR</StatusBadge>
  if (kind === 'api') return <StatusBadge variant="info">{log.method || log.type || 'API'}</StatusBadge>

  const level = (log.logLevel || 'INFO').toUpperCase()
  if (level === 'ERROR') return <StatusBadge variant="danger">{level}</StatusBadge>
  if (level === 'WARN') return <StatusBadge variant="warning">{level}</StatusBadge>
  return <StatusBadge variant="muted">{level}</StatusBadge>
}

export const LogList = () => {
  const [kind, setKind] = useState<LogKind>('api')
  const [selected, setSelected] = useState<LogVO | null>(null)

  const fetcher = useCallback(
    (current: number) => getLogList(kind, { current, size: PAGE_SIZE }),
    [kind],
  )
  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData<LogVO>(
    fetcher,
    [kind],
  )

  return (
    <div>
      <PageHeader title="日志审计" description="查看平台运行、接口访问与异常日志" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={kind} onValueChange={(value) => setKind(value as LogKind)}>
          <TabsList>
            <TabsTrigger value="api">接口日志</TabsTrigger>
            <TabsTrigger value="usual">运行日志</TabsTrigger>
            <TabsTrigger value="error">错误日志</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 条日志</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">级别</TableHead>
                <TableHead>摘要</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>访问 IP</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead className="text-right">时间</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="space-y-3">
                      <div className="text-destructive">{error}</div>
                      <Button size="sm" variant="outline" onClick={reload}>重新加载</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    暂无{KIND_LABEL[kind]}
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((log, index) => (
                <TableRow key={log.strId || log.logId || `${kind}-${current}-${index}`}>
                  <TableCell><LogLevel log={log} kind={kind} /></TableCell>
                  <TableCell>
                    <div className="max-w-md truncate" title={getSummary(log, kind)}>
                      {getSummary(log, kind)}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                    {getSource(log)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{log.remoteIp || log.serverIp || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{log.time ? `${log.time} ms` : '-'}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDateTime(log.createTime)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(log)}>
                      <Eye className="mr-1 size-4" />
                      查看
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected ? getSummary(selected, kind) : '日志详情'}</SheetTitle>
            <SheetDescription>{KIND_LABEL[kind]}的完整记录</SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">服务</div>
                  <div className="mt-1 break-all">{selected.serviceId || '-'}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">访问 IP</div>
                  <div className="mt-1">{selected.remoteIp || selected.serverIp || '-'}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">请求方式</div>
                  <div className="mt-1">{selected.method || '-'}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">记录时间</div>
                  <div className="mt-1">{formatDateTime(selected.createTime)}</div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">完整内容</div>
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 text-xs leading-5">
                  {selected.stackTrace || selected.logData || selected.message || selected.params || JSON.stringify(selected, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
