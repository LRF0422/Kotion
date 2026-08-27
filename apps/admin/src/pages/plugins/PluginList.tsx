import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  useToast,
} from '@kn/ui'
import {
  Blocks,
  Check,
  ExternalLink,
  Eye,
  FileCode2,
  Loader2,
  Play,
  Search,
  X,
} from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import {
  getAdminPluginDetail,
  getAdminPluginList,
  reviewPluginSubmission,
  type PluginCategory,
  type PluginReviewDecision,
  type PluginStatus,
  type PluginVO,
  type PluginVersionVO,
} from '@/api'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

const CATEGORY_LABEL: Record<string, string> = {
  FEATURE: '功能扩展',
  APP: '应用',
  CONNECTOR: '连接器',
}

const STATUS_META: Record<PluginStatus, { label: string; variant: 'warning' | 'info' | 'danger' | 'success' }> = {
  PENDING: { label: '待审核', variant: 'warning' },
  IN_PROGRESS: { label: '审核中', variant: 'info' },
  REJECTED: { label: '已驳回', variant: 'danger' },
  DONE: { label: '已通过', variant: 'success' },
}

const VERSION_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待发布',
  ACTIVE: '已激活',
  IN_ACTIVE: '已停用',
}

const getReviewStatus = (plugin?: PluginVO | null) => plugin?.candidateVersion?.reviewStatus ?? plugin?.status

const getSubmittedVersion = (plugin: PluginVO) => plugin.candidateVersion ?? plugin.currentVersion

const formatVersionContent = (content?: string) => {
  if (!content) return '-'
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

const ReviewStatus = ({ plugin }: { plugin: PluginVO }) => {
  const status = getReviewStatus(plugin)
  if (!status) return <StatusBadge variant="muted">未知</StatusBadge>
  const meta = STATUS_META[status]
  return <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
}

const VersionSummary = ({ version, title }: { version?: PluginVersionVO; title: string }) => (
  <div className="rounded-lg border p-3">
    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
    {version ? (
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">版本</span>
          <span className="font-mono">v{version.version || '-'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">版本状态</span>
          <span>{VERSION_STATUS_LABEL[version.status || ''] || version.status || '-'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">更新时间</span>
          <span>{formatDateTime(version.updateTime || version.createTime)}</span>
        </div>
      </div>
    ) : (
      <div className="text-sm text-muted-foreground">无</div>
    )}
  </div>
)

export const PluginList = () => {
  const { toast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusTab, setStatusTab] = useState<string>('PENDING')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<PluginVO | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [reviewingDecision, setReviewingDecision] = useState<PluginReviewDecision | null>(null)
  const detailRequestId = useRef(0)

  const fetcher = useCallback(
    (current: number) =>
      getAdminPluginList({
        current,
        pageSize: PAGE_SIZE,
        searchValue: search || undefined,
        category: categoryFilter === 'all' ? undefined : (categoryFilter as PluginCategory),
        reviewStatus: statusTab === 'all' ? undefined : (statusTab as PluginStatus),
      }),
    [search, categoryFilter, statusTab],
  )
  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData<PluginVO>(
    fetcher,
    [search, categoryFilter, statusTab],
  )

  useEffect(() => {
    if (!loading && current > Math.max(pages, 1)) {
      setCurrent(Math.max(pages, 1))
    }
  }, [current, loading, pages, setCurrent])

  const loadDetail = useCallback(async (pluginId: string) => {
    const requestId = ++detailRequestId.current
    setDetailLoading(true)
    setDetailError(null)
    try {
      const data = await getAdminPluginDetail(pluginId)
      if (detailRequestId.current === requestId) setDetail(data)
    } catch (err) {
      if (detailRequestId.current === requestId) {
        setDetailError(err instanceof Error ? err.message : '加载详情失败')
      }
    } finally {
      if (detailRequestId.current === requestId) setDetailLoading(false)
    }
  }, [])

  const openDetail = (plugin: PluginVO) => {
    setDetail(plugin)
    setDetailOpen(true)
    loadDetail(plugin.id)
  }

  const handleDetailOpenChange = (open: boolean) => {
    setDetailOpen(open)
    if (!open) {
      detailRequestId.current += 1
      setDetailLoading(false)
      setDetailError(null)
    }
  }

  const handleReview = async (decision: PluginReviewDecision) => {
    if (!detail || reviewingDecision) return
    const candidate = detail.candidateVersion
    if (!candidate) {
      toast({ title: '无法执行审核', description: '当前插件缺少候选版本，请刷新后重试。', variant: 'destructive' })
      return
    }

    const decisionLabel = decision === 'START' ? '开始审核' : decision === 'APPROVE' ? '批准上架' : '驳回'
    if (decision !== 'START') {
      const confirmed = window.confirm(
        `确认${decisionLabel}插件「${detail.name}」的 v${candidate.version || '-'} 版本？`,
      )
      if (!confirmed) return
    }

    setReviewingDecision(decision)
    try {
      const updated = await reviewPluginSubmission(detail.id, decision)
      setDetail(updated)
      toast({
        title: decision === 'START' ? '已开始审核' : decision === 'APPROVE' ? '插件已批准上架' : '插件已驳回',
        description: `${detail.name} v${candidate.version || '-'}`,
      })
      reload()
    } catch (err) {
      toast({ title: `${decisionLabel}失败`, description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      await loadDetail(detail.id)
      reload()
    } finally {
      setReviewingDecision(null)
    }
  }

  const emptyText = statusTab === 'PENDING'
    ? '暂无待审核插件'
    : statusTab === 'IN_PROGRESS'
      ? '暂无审核中的插件'
      : '暂无符合条件的插件'

  const reviewStatus = getReviewStatus(detail)
  const candidate = detail?.candidateVersion
  const artifact = candidate ?? (reviewStatus === 'DONE' ? detail?.currentVersion : undefined)
  const artifactUrl = artifact?.resourcePath
    ? `/api/knowledge-resource/oss/endpoint/public/plugin?fileName=${encodeURIComponent(artifact.resourcePath)}`
    : undefined

  return (
    <div>
      <PageHeader title="插件审核" description="审核插件首次提交与版本更新，管理上架状态" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            <TabsTrigger value="PENDING">待审核</TabsTrigger>
            <TabsTrigger value="IN_PROGRESS">审核中</TabsTrigger>
            <TabsTrigger value="REJECTED">已驳回</TabsTrigger>
            <TabsTrigger value="DONE">已通过</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索名称或插件 Key（回车）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(keyword.trim())}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            <SelectItem value="FEATURE">功能扩展</SelectItem>
            <SelectItem value="APP">应用</SelectItem>
            <SelectItem value="CONNECTOR">连接器</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 个插件</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>插件</TableHead>
                <TableHead>提交版本</TableHead>
                <TableHead>提交类型</TableHead>
                <TableHead>开发者</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>审核状态</TableHead>
                <TableHead className="text-right">提交时间</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="space-y-3">
                      <div className="text-destructive">{error}</div>
                      <Button size="sm" variant="outline" onClick={reload}>重新加载</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">{emptyText}</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((plugin) => {
                const submittedVersion = getSubmittedVersion(plugin)
                const isUpdate = Boolean(plugin.currentVersion && plugin.candidateVersion)
                return (
                  <TableRow
                    key={plugin.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => openDetail(plugin)}
                    onKeyDown={(event) => event.key === 'Enter' && openDetail(plugin)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {plugin.icon ? (
                          <img src={plugin.icon} alt="" className="size-9 rounded-lg object-cover" />
                        ) : (
                          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Blocks className="size-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium">{plugin.name}</div>
                          <div className="max-w-56 truncate font-mono text-xs text-muted-foreground">
                            {plugin.pluginKey || '-'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">v{submittedVersion?.version || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{isUpdate ? '版本更新' : '首次提交'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>{plugin.developer || plugin.maintainer || '-'}</div>
                      {plugin.developerId && (
                        <div className="text-xs text-muted-foreground">ID: {plugin.developerId}</div>
                      )}
                    </TableCell>
                    <TableCell>{CATEGORY_LABEL[plugin.category || ''] || plugin.category || '-'}</TableCell>
                    <TableCell><ReviewStatus plugin={plugin} /></TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTime(submittedVersion?.updateTime || submittedVersion?.createTime || plugin.updateTime)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          openDetail(plugin)
                        }}
                      >
                        <Eye className="mr-1 size-4" />
                        查看
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
        </CardContent>
      </Card>

      <Sheet open={detailOpen} onOpenChange={handleDetailOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{detail?.name || '插件审核详情'}</SheetTitle>
            <SheetDescription>
              {detail?.pluginKey ? `插件 Key：${detail.pluginKey}` : '查看候选版本并完成审核'}
            </SheetDescription>
          </SheetHeader>

          {!detail && detailLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6 pb-24">
              {detailLoading && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在刷新审核详情…
                </div>
              )}
              {detailError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <div>{detailError}</div>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => loadDetail(detail.id)}>
                    重新加载详情
                  </Button>
                </div>
              )}

              <section className="space-y-3">
                <div className="flex items-start gap-3">
                  {detail.icon ? (
                    <img src={detail.icon} alt="" className="size-12 rounded-xl object-cover" />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Blocks className="size-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold">{detail.name}</div>
                      <ReviewStatus plugin={detail} />
                      <Badge variant="outline">
                        {detail.currentVersion && detail.candidateVersion ? '版本更新' : '首次提交'}
                      </Badge>
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{detail.pluginKey || '-'}</div>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {detail.description || '暂无描述'}
                </p>
                {detail.tags && detail.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {detail.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  </div>
                )}
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <VersionSummary version={detail.currentVersion} title="当前激活版本" />
                <VersionSummary version={detail.candidateVersion} title="本次候选版本" />
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium">提交信息</div>
                <div className="space-y-2 rounded-lg border p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">开发者</span>
                    <span className="text-right">{detail.developer || detail.maintainer || '-'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">开发者 ID</span>
                    <span>{detail.developerId || '-'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">分类</span>
                    <span>{CATEGORY_LABEL[detail.category || ''] || detail.category || '-'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">插件创建时间</span>
                    <span>{formatDateTime(detail.createTime)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">候选提交时间</span>
                    <span>{formatDateTime(candidate?.createTime || candidate?.updateTime)}</span>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileCode2 className="size-4" />
                  插件产物
                </div>
                <div className="space-y-3 rounded-lg border p-4 text-sm">
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">资源路径</div>
                    <code className="block break-all rounded bg-muted px-2 py-1.5 text-xs">
                      {artifact?.resourcePath || '-'}
                    </code>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">SRI Integrity</div>
                    <code className="block break-all rounded bg-muted px-2 py-1.5 text-xs">
                      {artifact?.integrity || '-'}
                    </code>
                  </div>
                  {artifactUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={artifactUrl} target="_blank" rel="noreferrer noopener">
                        <ExternalLink className="mr-1.5 size-4" />
                        查看原始 JS 产物
                      </a>
                    </Button>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium">版本说明</div>
                {artifact?.versionDescription && artifact.versionDescription.length > 0 ? (
                  <div className="space-y-3">
                    {artifact.versionDescription.map((description, index) => (
                      <div key={`${description.label || 'description'}-${index}`} className="rounded-lg border">
                        <div className="border-b px-4 py-2 text-sm font-medium">{description.label || '说明'}</div>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-muted-foreground">
                          {formatVersionContent(description.content)}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">暂无版本说明</div>
                )}
              </section>

              {(reviewStatus === 'PENDING' || reviewStatus === 'IN_PROGRESS') && !candidate && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  当前审核状态缺少候选版本，审核操作已禁用，请联系管理员检查数据。
                </div>
              )}

              <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur sm:absolute">
                <div className="flex justify-end gap-2">
                  {reviewStatus === 'PENDING' && (
                    <Button disabled={!candidate || Boolean(reviewingDecision)} onClick={() => handleReview('START')}>
                      {reviewingDecision === 'START'
                        ? <Loader2 className="mr-2 size-4 animate-spin" />
                        : <Play className="mr-2 size-4" />}
                      开始审核
                    </Button>
                  )}
                  {reviewStatus === 'IN_PROGRESS' && (
                    <>
                      <Button
                        variant="outline"
                        className="text-destructive"
                        disabled={!candidate || Boolean(reviewingDecision)}
                        onClick={() => handleReview('REJECT')}
                      >
                        {reviewingDecision === 'REJECT'
                          ? <Loader2 className="mr-2 size-4 animate-spin" />
                          : <X className="mr-2 size-4" />}
                        驳回
                      </Button>
                      <Button
                        disabled={!candidate || Boolean(reviewingDecision)}
                        onClick={() => handleReview('APPROVE')}
                      >
                        {reviewingDecision === 'APPROVE'
                          ? <Loader2 className="mr-2 size-4 animate-spin" />
                          : <Check className="mr-2 size-4" />}
                        批准上架
                      </Button>
                    </>
                  )}
                  {(reviewStatus === 'REJECTED' || reviewStatus === 'DONE') && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      当前状态无需进一步审核操作
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : detailError ? (
            <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {detailError}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
