import { useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  toast,
} from '@kn/ui'
import { Copy, Download, ExternalLink, LoaderCircle } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { getAccessToken } from '@/lib/auth'
import { getOpsExportUrl, type OpsExportDataset } from '@/api/ops'

const DATASET_OPTIONS: Array<{ value: OpsExportDataset; label: string; columns: string }> = [
  { value: 'events', label: '事件明细', columns: '时间 / 事件 / 路径 / 访客 / 会话 / 来源 / UTM / 设备' },
  { value: 'sessions', label: '会话明细', columns: '首末时间 / 落地页 / 来源 / UTM / 设备 / 浏览量 / 事件数' },
  { value: 'subscribers', label: '订阅线索', columns: '邮箱 / 状态 / 来源页 / UTM / 标签 / 时间' },
  { value: 'links', label: '渠道短链', columns: '短链 / 目标 / 渠道 / 点击 / 启用' },
  { value: 'goals', label: '转化目标', columns: '目标 / 转化数 / 访客 / 转化率' },
  { value: 'audit', label: '变更记录', columns: '时间 / 操作人 / 动作 / 对象 / 摘要' },
]

const DAY_OPTIONS = [7, 30, 90, 365]

const FORMAT_OPTIONS: Array<{ value: 'csv' | 'json'; label: string }> = [
  { value: 'csv', label: 'CSV (.csv)' },
  { value: 'json', label: 'JSON (.json)' },
]

/** 下载文件名用的 YYYYMMDD。 */
const dateStamp = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
}

export const DataExport = () => {
  const [dataset, setDataset] = useState<OpsExportDataset>('events')
  const [days, setDays] = useState(30)
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [downloading, setDownloading] = useState(false)

  const url = getOpsExportUrl(dataset, { days, format })
  const currentColumns = DATASET_OPTIONS.find((option) => option.value === dataset)?.columns ?? ''

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('导出地址已复制')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const download = async () => {
    setDownloading(true)
    try {
      const token = getAccessToken()
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (response.status === 401) {
        toast.error('登录已过期，请重新登录')
        return
      }
      if (!response.ok) throw new Error(`导出失败：${response.status} ${response.statusText}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `landing-${dataset}-${dateStamp()}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      toast.success('导出文件已开始下载')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="数据导出"
        description="按数据集导出明细数据，用于离线分析或对外汇报"
        actions={
          <Button onClick={download} disabled={downloading}>
            {downloading ? (
              <LoaderCircle className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 size-4" />
            )}
            下载
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>导出配置</CardTitle>
          <CardDescription>选择数据集、时间范围与文件格式</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>数据集</Label>
              <Select
                value={dataset}
                onValueChange={(value) => setDataset(value as OpsExportDataset)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATASET_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>时间范围</Label>
              <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      近 {option} 天
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>文件格式</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as 'csv' | 'json')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-5 space-y-1.5">
            <Label>导出地址</Label>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
                {url}
              </code>
              <Button variant="outline" onClick={copyUrl}>
                <Copy className="mr-1.5 size-4" />
                复制
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              该地址需要携带当前登录态的 Authorization 头才能访问，直接粘贴到浏览器可能返回 401。
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>数据集字段说明</CardTitle>
          <CardDescription>
            当前数据集「{DATASET_OPTIONS.find((option) => option.value === dataset)?.label}
            」的导出列
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">数据集</TableHead>
                  <TableHead>导出列</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DATASET_OPTIONS.map((option) => (
                  <TableRow key={option.value}>
                    <TableCell className="font-medium">{option.label}</TableCell>
                    <TableCell
                      className={
                        option.value === dataset ? 'text-foreground' : 'text-muted-foreground'
                      }
                    >
                      {option.columns}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ExternalLink className="mt-0.5 size-4 shrink-0" />
            <span>
              导出与看板使用同一份经过过滤 / 采样的数据，并遵循「数据口径」设置；
              修改采样率或过滤规则会同时影响导出结果。
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">当前数据集导出列：{currentColumns}</p>
        </CardContent>
      </Card>
    </div>
  )
}
