import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from '@kn/ui'
import { ExternalLink, Eye, EyeOff, LoaderCircle, Mail, Pin, RefreshCw } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'
import { StatusBadge } from '@/components/StatusBadge'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import { formatDateTime } from '@/lib/use-paged-data'
import { getOpsChangelog, notifyOpsChangelog, refreshOpsChangelog, updateOpsChangelog, type OpsCampaign, type OpsChangelog } from '@/api/ops'

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'pinned', label: '仅置顶' },
  { value: 'hidden', label: '仅隐藏' },
  { value: 'pending', label: '未处理' },
] as const

type FilterValue = (typeof FILTERS)[number]['value']

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export const ChangelogAdmin = () => {
  const { canManage } = useOpsPermission()
  const navigate = useNavigate()

  const list = useAsync(() => getOpsChangelog(), [])
  const items = useMemo(() => list.data ?? [], [list.data])

  const [filter, setFilter] = useState<FilterValue>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [preview, setPreview] = useState<OpsChangelog | null>(null)
  const [notifying, setNotifying] = useState<string | null>(null)
  const [campaignDraft, setCampaignDraft] = useState<OpsCampaign | null>(null)

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (filter === 'pinned') return item.pinned === true
        if (filter === 'hidden') return item.hidden === true
        if (filter === 'pending') return item.pinned !== true && item.hidden !== true
        return true
      }),
    [items, filter],
  )

  const refresh = async () => {
    if (!canManage) return
    setRefreshing(true)
    try {
      const res = await refreshOpsChangelog()
      toast.success(`已同步 ${res?.count ?? 0} 条 Release`)
      list.reload()
    } catch (err) {
      toast.error(errorText(err, '同步失败'))
    } finally {
      setRefreshing(false)
    }
  }

  const toggle = async (id: string, payload: { pinned?: boolean; hidden?: boolean }) => {
    if (!canManage) return
    try {
      await updateOpsChangelog(id, payload)
      list.reload()
    } catch (err) {
      toast.error(errorText(err, '更新失败'))
    }
  }

  const createCampaignDraft = async (item: OpsChangelog) => {
    if (!canManage) return
    setNotifying(item.id)
    try {
      const campaign = await notifyOpsChangelog(item.id)
      setCampaignDraft(campaign)
      // 关掉预览框，让页面上的「去邮件活动」入口可见。
      setPreview(null)
      toast.success(
        `已创建邮件活动草稿：#${campaign?.id ?? '-'} ${campaign?.name ?? ''}，请到「邮件活动」继续编辑`,
        { action: { label: '去编辑', onClick: () => navigate('/ops/campaigns') } },
      )
    } catch (err) {
      toast.error(errorText(err, '创建邮件活动草稿失败'))
    } finally {
      setNotifying(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="更新日志"
        description="聚合 GitHub Releases，落地页 /changelog 直接读取"
        actions={
          canManage && (
            <Button onClick={refresh} disabled={refreshing}>
              {refreshing ? (
                <LoaderCircle className="mr-1.5 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-4" />
              )}
              同步 Releases
            </Button>
          )
        }
      />

      {campaignDraft && (
        <Alert className="mb-4">
          <AlertTitle>已创建邮件活动草稿</AlertTitle>
          <AlertDescription>
            #{campaignDraft.id ?? '-'} {campaignDraft.name || '（未命名）'}
            <Link to="/ops/campaigns" className="ml-2 font-medium text-primary hover:underline">
              去「邮件活动」继续编辑
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Release 列表</CardTitle>
          <CardDescription>置顶会排在落地页最前，隐藏则不在落地页展示；点击标题可预览正文</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterValue)}>
            <TabsList>
              {FILTERS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="mt-4">
            <DataState
              loading={list.loading}
              error={list.error}
              empty={items.length === 0}
              emptyText="暂无数据，点击右上角「同步 Releases」"
              rows={4}
              onRetry={list.reload}
            >
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>版本</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead>发布时间</TableHead>
                      <TableHead>标记</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          当前筛选条件下没有记录
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.tag || item.id}</TableCell>
                        <TableCell className="max-w-72">
                          <button
                            type="button"
                            onClick={() => setPreview(item)}
                            className="max-w-full truncate text-left font-medium hover:underline"
                            title={item.name || item.tag || item.id}
                          >
                            {item.name || '-'}
                          </button>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDateTime(item.publishedAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {item.prerelease && <StatusBadge variant="warning">预发布</StatusBadge>}
                            {item.pinned === true && <StatusBadge variant="info">置顶</StatusBadge>}
                            {item.hidden === true && <StatusBadge variant="muted">隐藏</StatusBadge>}
                            {item.pinned !== true && item.hidden !== true && (
                              <StatusBadge variant="muted">未处理</StatusBadge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {canManage && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="生成邮件草稿"
                                  disabled={notifying === item.id}
                                  onClick={() => createCampaignDraft(item)}
                                >
                                  {notifying === item.id ? (
                                    <LoaderCircle className="size-4 animate-spin" />
                                  ) : (
                                    <Mail className="size-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title={item.pinned ? '取消置顶' : '置顶'}
                                  onClick={() => toggle(item.id, { pinned: !item.pinned })}
                                >
                                  <Pin className={`size-4 ${item.pinned ? 'text-primary' : ''}`} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title={item.hidden ? '取消隐藏' : '隐藏'}
                                  onClick={() => toggle(item.id, { hidden: !item.hidden })}
                                >
                                  {item.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </DataState>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>{preview?.name || preview?.tag || 'Release'}</span>
              {preview?.prerelease && <StatusBadge variant="warning">预发布</StatusBadge>}
            </DialogTitle>
            <DialogDescription className="space-y-1">
              <span className="block font-mono text-xs">{preview?.tag || preview?.id}</span>
              <span className="block">
                {preview?.author ? `作者 ${preview.author} · ` : ''}
                发布于 {formatDateTime(preview?.publishedAt)}
              </span>
            </DialogDescription>
          </DialogHeader>

          {preview?.url && (
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" />
              在 GitHub 查看该 Release
            </a>
          )}

          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap text-xs rounded-lg border bg-muted/30 p-3">
            {preview?.body || '（该 Release 没有正文）'}
          </pre>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>
              关闭
            </Button>
            {canManage && preview && (
              <Button disabled={notifying === preview.id} onClick={() => createCampaignDraft(preview)}>
                {notifying === preview.id ? (
                  <LoaderCircle className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Mail className="mr-1.5 size-4" />
                )}
                生成邮件草稿
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
