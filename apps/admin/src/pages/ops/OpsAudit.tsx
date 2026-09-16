import { Fragment, useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
} from '@kn/ui'
import { ChevronDown, ChevronRight } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { DataState } from '@/components/DataState'
import { TablePagination } from '@/components/TablePagination'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'
import { getOpsAudit } from '@/api/ops'

/** 全部 = 不传该筛选条件。Radix Select 不允许空字符串 value，故用 ALL 哨兵。 */
const ALL = 'ALL'

const ACTION_OPTIONS = [
  { value: ALL, label: '全部动作' },
  { value: 'SAVE_DRAFT', label: 'SAVE_DRAFT · 保存草稿' },
  { value: 'PUBLISH', label: 'PUBLISH · 发布' },
  { value: 'ROLLBACK', label: 'ROLLBACK · 回滚' },
  { value: 'CREATE', label: 'CREATE · 新建' },
  { value: 'UPDATE', label: 'UPDATE · 更新' },
  { value: 'DELETE', label: 'DELETE · 删除' },
  { value: 'IMPORT', label: 'IMPORT · 导入' },
  { value: 'SEND', label: 'SEND · 发送' },
]

const TARGET_TYPE_OPTIONS = [
  { value: ALL, label: '全部对象' },
  { value: 'CONTENT', label: 'CONTENT · 文案' },
  { value: 'SEO', label: 'SEO · SEO' },
  { value: 'SECTION', label: 'SECTION · 区块' },
  { value: 'PROMOTION', label: 'PROMOTION · 推广位' },
  { value: 'LINK', label: 'LINK · 短链' },
  { value: 'GOAL', label: 'GOAL · 转化目标' },
  { value: 'FUNNEL', label: 'FUNNEL · 漏斗' },
  { value: 'EXPERIMENT', label: 'EXPERIMENT · 实验' },
  { value: 'SETTING', label: 'SETTING · 设置' },
  { value: 'CAMPAIGN', label: 'CAMPAIGN · 邮件活动' },
  { value: 'RESOURCE', label: 'RESOURCE · 通用资源' },
]

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO 字符串 → `<input type="datetime-local">` 的本地时间值。 */
export const toLocalInput = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `<input type="datetime-local">` 的值 → ISO 字符串。 */
export const fromLocalInput = (value: string) => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

const actionVariant = (action: string): 'success' | 'danger' | 'info' | 'muted' => {
  if (action === 'DELETE') return 'danger'
  if (action === 'PUBLISH') return 'success'
  if (action === 'UPDATE') return 'info'
  return 'muted'
}

/** detail 可能是 JSON 字符串，也可能是纯文本。 */
const prettyDetail = (detail?: string) => {
  if (!detail) return ''
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}

export const OpsAudit = () => {
  const [action, setAction] = useState(ALL)
  const [targetType, setTargetType] = useState(ALL)
  const [operatorInput, setOperatorInput] = useState('')
  const [operator, setOperator] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // 操作人输入防抖 300ms，避免每敲一个字符就重新请求。
  useEffect(() => {
    const timer = window.setTimeout(() => setOperator(operatorInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [operatorInput])

  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData(
    (page) =>
      getOpsAudit({
        current: page,
        size: 20,
        action: action === ALL ? undefined : action,
        targetType: targetType === ALL ? undefined : targetType,
        operator: operator || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
      }),
    [action, targetType, operator, startTime, endTime],
  )

  const reset = () => {
    setAction(ALL)
    setTargetType(ALL)
    setOperatorInput('')
    setOperator('')
    setStartTime('')
    setEndTime('')
  }

  const toggleExpand = (id: number) => setExpandedId((prev) => (prev === id ? null : id))

  return (
    <div>
      <PageHeader
        title="变更记录"
        description="内容、配置、推广与发送操作的完整审计轨迹，可追溯到操作人与来源 IP"
      />

      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>共 {total} 条记录</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-48 space-y-1.5">
              <Label>动作</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-48 space-y-1.5">
              <Label>对象类型</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-48 space-y-1.5">
              <Label>操作人</Label>
              <Input
                value={operatorInput}
                placeholder="账号或用户名"
                onChange={(e) => setOperatorInput(e.target.value)}
              />
            </div>

            <div className="w-56 space-y-1.5">
              <Label>开始时间</Label>
              <Input
                type="datetime-local"
                value={toLocalInput(startTime)}
                onChange={(e) => setStartTime(fromLocalInput(e.target.value) ?? '')}
              />
            </div>

            <div className="w-56 space-y-1.5">
              <Label>结束时间</Label>
              <Input
                type="datetime-local"
                value={toLocalInput(endTime)}
                onChange={(e) => setEndTime(fromLocalInput(e.target.value) ?? '')}
              />
            </div>

            <Button variant="outline" onClick={reset}>
              重置
            </Button>
          </div>

          <DataState
            loading={loading}
            error={error}
            onRetry={reload}
            empty={!loading && records.length === 0}
            emptyText="暂无变更记录"
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>操作人</TableHead>
                    <TableHead>动作</TableHead>
                    <TableHead>对象类型</TableHead>
                    <TableHead>对象</TableHead>
                    <TableHead>摘要</TableHead>
                    <TableHead className="text-right">详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((row) => (
                    <Fragment key={row.id}>
                      <TableRow>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(row.createTime)}
                        </TableCell>
                        <TableCell>{row.operator || '-'}</TableCell>
                        <TableCell>
                          <StatusBadge variant={actionVariant(row.action)}>{row.action}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.targetType || '-'}</TableCell>
                        <TableCell
                          className="max-w-48 truncate font-mono text-xs text-muted-foreground"
                          title={row.targetKey}
                        >
                          {row.targetKey || '-'}
                        </TableCell>
                        <TableCell className="max-w-72 truncate" title={row.summary}>
                          {row.summary || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={expandedId === row.id ? '收起详情' : '展开详情'}
                            onClick={() => toggleExpand(row.id)}
                          >
                            {expandedId === row.id ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedId === row.id && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/40">
                            <div className="space-y-2 py-1">
                              <div className="text-xs text-muted-foreground">
                                来源 IP：<span className="font-mono">{row.clientIp || '-'}</span>
                              </div>
                              {row.detail ? (
                                <pre className="max-h-80 overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-relaxed">
                                  {prettyDetail(row.detail)}
                                </pre>
                              ) : (
                                <div className="text-xs text-muted-foreground">该记录没有详情</div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
              <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
            </div>
          </DataState>
        </CardContent>
      </Card>
    </div>
  )
}
