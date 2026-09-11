import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Textarea,
  useToast,
} from '@kn/ui'
import {
  Blocks,
  Check,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  GitBranch,
  History,
  Loader2,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  TriangleAlert,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import {
  batchReviewPluginSubmissions,
  claimAdminPlugin,
  getAdminPluginDetail,
  getAdminPluginList,
  getAdminPluginReviewStats,
  getAdminPluginVersions,
  releaseAdminPlugin,
  reviewPluginSubmission,
  type PluginCategory,
  type PluginReviewDecision,
  type PluginReviewReasonValue,
  type PluginReviewStats,
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

const STATUS_META: Record<string, { label: string; variant: 'warning' | 'info' | 'danger' | 'success' }> = {
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

const REVIEW_REASON_META: Record<string, string> = {
  ARTIFACT_INVALID: '产物无效或无法加载',
  INTEGRITY_MISMATCH: '完整性校验不通过',
  DESCRIPTION_MISMATCH: '描述与实现不符',
  SECURITY_RISK: '存在安全风险',
  POLICY_VIOLATION: '违反平台规范',
  OTHER: '其他',
}

const REVIEW_REASON_OPTIONS: PluginReviewReasonValue[] = [
  'ARTIFACT_INVALID',
  'INTEGRITY_MISMATCH',
  'DESCRIPTION_MISMATCH',
  'SECURITY_RISK',
  'POLICY_VIOLATION',
  'OTHER',
]

/** Candidate waiting longer than this is flagged as overdue in the queue. */
const REVIEW_SLA_HOURS = 48

const hoursWaiting = (iso?: string) => {
  if (!iso) return undefined
  const started = new Date(iso).getTime()
  if (Number.isNaN(started)) return undefined
  return (Date.now() - started) / 36e5
}

const getEnumValue = (value: unknown) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'value' in value) {
    const enumValue = (value as { value?: unknown }).value
    return typeof enumValue === 'string' ? enumValue : undefined
  }
  return undefined
}

const getEnumDescription = (value: unknown) => {
  if (value && typeof value === 'object' && 'desc' in value) {
    const description = (value as { desc?: unknown }).desc
    return typeof description === 'string' ? description : undefined
  }
  return undefined
}

const getCategoryLabel = (category: unknown) => {
  const value = getEnumValue(category)
  return getEnumDescription(category) || CATEGORY_LABEL[value || ''] || value || '-'
}

const getVersionStatusLabel = (status: unknown) => {
  const value = getEnumValue(status)
  return getEnumDescription(status) || VERSION_STATUS_LABEL[value || ''] || value || '-'
}

const getReasonLabel = (value: unknown) => {
  const code = getEnumValue(value)
  return getEnumDescription(value) || REVIEW_REASON_META[code || ''] || code || '-'
}

const getReviewStatus = (plugin?: PluginVO | null) =>
  getEnumValue(plugin?.candidateVersion?.reviewStatus ?? plugin?.status)

const getSubmittedVersion = (plugin: PluginVO) => plugin.candidateVersion ?? plugin.currentVersion

const formatMetric = (value?: number) =>
  value === undefined || value === null ? '—' : value.toLocaleString('zh-CN')

const getReviewAudit = (version?: PluginVersionVO | null) => {
  if (!version) return null
  const comment = version.reviewComment?.trim()
  const reviewer = version.reviewerName || (version.reviewerId ? `ID: ${version.reviewerId}` : undefined)
  const reasonCode = version.reviewReasonCode
  if (!comment && !reviewer && !version.reviewTime && !reasonCode) return null
  return { comment, reviewer, time: version.reviewTime, reasonCode }
}

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
  const meta = status ? STATUS_META[status] : undefined
  if (!meta) return <StatusBadge variant="muted">{status || '未知'}</StatusBadge>
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
          <span>{getVersionStatusLabel(version.status)}</span>
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
  const [versions, setVersions] = useState<PluginVersionVO[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<'match' | 'mismatch' | 'error' | null>(null)
  const [rejectReasonCode, setRejectReasonCode] = useState<PluginReviewReasonValue | ''>('')
  const [rejectBatch, setRejectBatch] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [stats, setStats] = useState<PluginReviewStats | null>(null)
  const detailRequestId = useRef(0)
  const versionsRequestId = useRef(0)

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

  const loadStats = useCallback(async () => {
    try {
      setStats(await getAdminPluginReviewStats())
    } catch {
      // Stats are advisory; a failure must not break the review queue.
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    setSelectedIds([])
  }, [search, categoryFilter, statusTab])

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

  const loadVersions = useCallback(async (pluginId: string) => {
    const requestId = ++versionsRequestId.current
    setVersionsLoading(true)
    try {
      const data = await getAdminPluginVersions(pluginId)
      if (versionsRequestId.current === requestId) setVersions(data ?? [])
    } catch {
      if (versionsRequestId.current === requestId) setVersions([])
    } finally {
      if (versionsRequestId.current === requestId) setVersionsLoading(false)
    }
  }, [])

  const openDetail = (plugin: PluginVO) => {
    setDetail(plugin)
    setDetailOpen(true)
    setRejectOpen(false)
    setRejectReason('')
    setRejectReasonCode('')
    setRejectBatch(false)
    setVerifyResult(null)
    setVersions([])
    loadDetail(plugin.id)
    loadVersions(plugin.id)
  }

  const handleDetailOpenChange = (open: boolean) => {
    setDetailOpen(open)
    if (!open) {
      detailRequestId.current += 1
      versionsRequestId.current += 1
      setDetailLoading(false)
      setDetailError(null)
      setVersions([])
      setRejectOpen(false)
      setRejectReason('')
      setRejectReasonCode('')
      setRejectBatch(false)
      setVerifyResult(null)
    }
  }

  const handleReview = async (
    decision: PluginReviewDecision,
    reason?: string,
    reasonCode?: PluginReviewReasonValue,
  ) => {
    if (!detail || reviewingDecision) return
    const candidate = detail.candidateVersion
    if (!candidate) {
      toast({ title: '无法执行审核', description: '当前插件缺少候选版本，请刷新后重试。', variant: 'destructive' })
      return
    }

    const decisionLabel = decision === 'START' ? '开始审核' : decision === 'APPROVE' ? '批准上架' : '驳回'
    const trimmedReason = reason?.trim()
    if (decision === 'APPROVE') {
      const confirmed = window.confirm(
        `确认${decisionLabel}插件「${detail.name}」的 v${candidate.version || '-'} 版本？`,
      )
      if (!confirmed) return
    }
    if (decision === 'REJECT' && (!trimmedReason || !reasonCode)) {
      toast({
        title: '请填写驳回原因并选择原因分类',
        description: '驳回原因会展示给开发者，便于其修正后重新提交。',
        variant: 'destructive',
      })
      return
    }

    setReviewingDecision(decision)
    try {
      const updated = await reviewPluginSubmission(detail.id, decision, trimmedReason || undefined, reasonCode)
      setDetail(updated)
      if (decision === 'REJECT') {
        setRejectOpen(false)
        setRejectReason('')
        setRejectReasonCode('')
      }
      toast({
        title: decision === 'START' ? '已开始审核' : decision === 'APPROVE' ? '插件已批准上架' : '插件已驳回',
        description: `${detail.name} v${candidate.version || '-'}`,
      })
      reload()
      void loadVersions(detail.id)
      void loadStats()
    } catch (err) {
      toast({ title: `${decisionLabel}失败`, description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      await loadDetail(detail.id)
      reload()
    } finally {
      setReviewingDecision(null)
    }
  }

  const handleBatchReview = async (
    decision: PluginReviewDecision,
    reason?: string,
    reasonCode?: PluginReviewReasonValue,
  ) => {
    if (selectedIds.length === 0 || batchRunning) return
    const trimmedReason = reason?.trim()
    if (decision === 'APPROVE' && !window.confirm(`确认批量批准所选 ${selectedIds.length} 个插件上架？`)) return
    if (decision === 'REJECT' && (!trimmedReason || !reasonCode)) {
      toast({ title: '请填写驳回原因并选择原因分类', variant: 'destructive' })
      return
    }
    setBatchRunning(true)
    try {
      const result = await batchReviewPluginSubmissions({
        ids: selectedIds,
        decision,
        reason: trimmedReason || undefined,
        reasonCode,
      })
      const failures = result.failures ?? []
      if (failures.length > 0) {
        toast({
          title: `批量审核完成 ${result.succeeded}/${result.requested}`,
          description: failures.slice(0, 3).map((item) => `${item.id}：${item.message || '失败'}`).join('；'),
          variant: 'destructive',
        })
      } else {
        toast({ title: '批量审核完成', description: `成功 ${result.succeeded} 个` })
      }
      setSelectedIds([])
      setRejectOpen(false)
      setRejectBatch(false)
      setRejectReason('')
      setRejectReasonCode('')
      reload()
      void loadStats()
    } catch (err) {
      toast({ title: '批量审核失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBatchRunning(false)
    }
  }

  const handleClaim = async (action: 'claim' | 'release') => {
    if (!detail || claiming) return
    setClaiming(true)
    try {
      const updated = action === 'claim' ? await claimAdminPlugin(detail.id) : await releaseAdminPlugin(detail.id)
      setDetail(updated)
      toast({ title: action === 'claim' ? '已认领该候选版本' : '已释放该候选版本' })
      reload()
    } catch (err) {
      toast({
        title: action === 'claim' ? '认领失败' : '释放失败',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setClaiming(false)
    }
  }

  const openRejectDialog = (batch = false) => {
    setRejectReason('')
    setRejectReasonCode('')
    setRejectBatch(batch)
    setRejectOpen(true)
  }

  const confirmReject = () => {
    if (rejectBatch) {
      void handleBatchReview('REJECT', rejectReason, rejectReasonCode || undefined)
    } else {
      void handleReview('REJECT', rejectReason, rejectReasonCode || undefined)
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
  const reviewAudit = getReviewAudit(artifact)
  const artifactUrl = artifact?.resourcePath
    ? `/api/knowledge-resource/oss/endpoint/public/plugin?fileName=${encodeURIComponent(artifact.resourcePath)}`
    : undefined

  const verifyIntegrity = async () => {
    if (!artifactUrl || !artifact?.integrity) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const response = await fetch(artifactUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const digest = await crypto.subtle.digest('SHA-384', await response.arrayBuffer())
      const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
      setVerifyResult(`sha384-${base64}` === artifact.integrity ? 'match' : 'mismatch')
    } catch {
      setVerifyResult('error')
    } finally {
      setVerifying(false)
    }
  }

  const selectableIds = records
    .filter((plugin) => {
      const status = getReviewStatus(plugin)
      return status === 'PENDING' || status === 'IN_PROGRESS'
    })
    .map((plugin) => plugin.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id))
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : selectableIds)

  return (
    <div>
      <PageHeader title="插件审核" description="审核插件首次提交与版本更新，管理上架状态" />

      {stats && (
        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: '待审核', value: stats.pending },
              { label: '审核中', value: stats.inProgress },
              { label: '已通过', value: stats.approved },
              { label: '已驳回', value: stats.rejected },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">{item.label}</div>
                <div className="mt-1 text-xl font-semibold">{formatMetric(item.value)}</div>
              </div>
            ))}
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">通过率</div>
              <div className="mt-1 text-xl font-semibold">
                {stats.approved + stats.rejected === 0 ? '—' : `${Math.round(stats.approvalRate * 100)}%`}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">平均时效</div>
              <div className="mt-1 text-xl font-semibold">
                {stats.averageReviewHours == null ? '—' : `${stats.averageReviewHours.toFixed(1)}h`}
              </div>
            </div>
          </div>
          {stats.reasons && stats.reasons.some((item) => item.count > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">驳回原因分布：</span>
              {stats.reasons
                .filter((item) => item.count > 0)
                .map((item) => (
                  <span
                    key={getEnumValue(item.reason) || 'UNKNOWN'}
                    className="rounded border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {getReasonLabel(item.reason)} · {item.count}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm">已选 {selectedIds.length} 项</span>
          <Button size="sm" variant="outline" disabled={batchRunning} onClick={() => setSelectedIds([])}>
            清空
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={batchRunning} onClick={() => void handleBatchReview('START')}>
              {batchRunning ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Play className="mr-1.5 size-4" />}
              批量开始审核
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={batchRunning}
              onClick={() => openRejectDialog(true)}
            >
              <X className="mr-1.5 size-4" />
              批量驳回
            </Button>
            <Button size="sm" disabled={batchRunning} onClick={() => void handleBatchReview('APPROVE')}>
              <Check className="mr-1.5 size-4" />
              批量通过
            </Button>
          </div>
        </div>
      )}

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
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    disabled={selectableIds.length === 0}
                    onCheckedChange={toggleSelectAll}
                    aria-label="全选可审核插件"
                  />
                </TableHead>
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
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <div className="space-y-3">
                      <div className="text-destructive">{error}</div>
                      <Button size="sm" variant="outline" onClick={reload}>重新加载</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">{emptyText}</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((plugin) => {
                const submittedVersion = getSubmittedVersion(plugin)
                const isUpdate = Boolean(plugin.currentVersion && plugin.candidateVersion)
                const reviewState = getReviewStatus(plugin)
                const selectable = reviewState === 'PENDING' || reviewState === 'IN_PROGRESS'
                const waiting = hoursWaiting(submittedVersion?.updateTime || submittedVersion?.createTime)
                const overdue =
                  selectable && waiting !== undefined && waiting > REVIEW_SLA_HOURS
                return (
                  <TableRow
                    key={plugin.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => openDetail(plugin)}
                    onKeyDown={(event) => event.key === 'Enter' && openDetail(plugin)}
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.includes(plugin.id)}
                        disabled={!selectable}
                        onCheckedChange={() => toggleSelect(plugin.id)}
                        aria-label={`选择 ${plugin.name}`}
                      />
                    </TableCell>
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
                    <TableCell>{getCategoryLabel(plugin.category)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <ReviewStatus plugin={plugin} />
                        {overdue && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <TriangleAlert className="size-3.5" />
                            超 {REVIEW_SLA_HOURS}h
                          </span>
                        )}
                      </div>
                    </TableCell>
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

              {reviewStatus === 'REJECTED' && reviewAudit?.comment && (
                <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div className="space-y-1">
                    <div className="font-medium text-destructive">
                      驳回原因
                      <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs">
                        {getReasonLabel(reviewAudit.reasonCode)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-destructive/90">{reviewAudit.comment}</p>
                    <p className="text-xs text-muted-foreground">
                      审核人：{reviewAudit.reviewer || '-'} · {formatDateTime(reviewAudit.time)}
                    </p>
                  </div>
                </div>
              )}

              {(reviewStatus === 'PENDING' || reviewStatus === 'IN_PROGRESS') && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <UserCheck className="size-4 text-muted-foreground" />
                  {candidate?.claimedByName ? (
                    <span>
                      已由 <span className="font-medium">{candidate.claimedByName}</span> 认领 · {formatDateTime(candidate.claimedTime)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">尚未认领</span>
                  )}
                </div>
              )}

              <section className="grid gap-3 sm:grid-cols-2">
                <VersionSummary version={detail.currentVersion} title="当前激活版本" />
                <VersionSummary version={detail.candidateVersion} title="本次候选版本" />
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Star className="size-4" />
                  运行数据
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: '安装量', value: detail.installCtn },
                    { label: '收藏量', value: detail.favoriteCtn },
                    { label: '下载量', value: detail.downloads },
                    { label: '评分', value: detail.rating },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">{item.label}</div>
                      <div className="mt-1 text-lg font-semibold">
                        {typeof item.value === 'number' ? formatMetric(item.value) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
                {detail.gitPath && (
                  <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                    <GitBranch className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">仓库</span>
                    <a
                      href={detail.gitPath}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate text-primary hover:underline"
                    >
                      {detail.gitPath}
                    </a>
                  </div>
                )}
              </section>

              {reviewAudit && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4" />
                    最近一次审核
                  </div>
                  <div className="space-y-2 rounded-lg border p-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">审核人</span>
                      <span>{reviewAudit.reviewer || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">审核时间</span>
                      <span>{formatDateTime(reviewAudit.time)}</span>
                    </div>
                    {reviewAudit.reasonCode && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">驳回分类</span>
                        <span>{getReasonLabel(reviewAudit.reasonCode)}</span>
                      </div>
                    )}
                    {reviewAudit.comment && (
                      <div>
                        <div className="mb-1 text-muted-foreground">审核意见</div>
                        <p className="whitespace-pre-wrap rounded bg-muted px-3 py-2 text-sm">{reviewAudit.comment}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <UserCheck className="size-4" />
                  提交信息
                </div>
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
                    <span>{getCategoryLabel(detail.category)}</span>
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
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!artifact?.integrity || verifying}
                        onClick={() => void verifyIntegrity()}
                      >
                        {verifying
                          ? <Loader2 className="mr-1.5 size-4 animate-spin" />
                          : <ShieldCheck className="mr-1.5 size-4" />}
                        校验完整性
                      </Button>
                      {verifyResult === 'match' && <StatusBadge variant="success">完整性校验通过</StatusBadge>}
                      {verifyResult === 'mismatch' && (
                        <StatusBadge variant="danger">完整性校验失败，产物与声明不一致</StatusBadge>
                      )}
                      {verifyResult === 'error' && <StatusBadge variant="muted">校验失败，请重试</StatusBadge>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {artifactUrl && (
                      <Button asChild size="sm" variant="outline">
                        <a href={artifactUrl} target="_blank" rel="noreferrer noopener">
                          <ExternalLink className="mr-1.5 size-4" />
                          查看原始 JS 产物
                        </a>
                      </Button>
                    )}
                    {artifactUrl && (
                      <Button asChild size="sm" variant="outline">
                        <a href={artifactUrl} download>
                          <Download className="mr-1.5 size-4" />
                          下载产物
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <History className="size-4" />
                  版本历史
                  {versionsLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                </div>
                {versions.length === 0 ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                    {versionsLoading ? '加载中…' : '暂无版本记录'}
                  </div>
                ) : (
                  <ol className="space-y-2">
                    {versions.map((version) => {
                      const status = getEnumValue(version.reviewStatus) || getEnumValue(version.status)
                      const meta = status ? STATUS_META[status] : undefined
                      return (
                        <li key={version.id || version.version} className="rounded-lg border p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono">v{version.version || '-'}</span>
                            {meta ? <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge> : null}
                            <Badge variant="outline">{getVersionStatusLabel(version.status)}</Badge>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {formatDateTime(version.reviewTime || version.updateTime || version.createTime)}
                            </span>
                          </div>
                          {version.reviewComment && (
                            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                              {version.reviewReasonCode ? `[${getReasonLabel(version.reviewReasonCode)}] ` : ''}
                              {version.reviewComment}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {version.reviewerName && <span>审核人：{version.reviewerName}</span>}
                            {version.integrity && <span className="truncate font-mono">{version.integrity}</span>}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
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
                <div className="flex flex-wrap justify-end gap-2">
                  {(reviewStatus === 'PENDING' || reviewStatus === 'IN_PROGRESS') && (
                    candidate?.claimedByName ? (
                      <Button
                        variant="outline"
                        disabled={!candidate || claiming}
                        onClick={() => void handleClaim('release')}
                      >
                        {claiming
                          ? <Loader2 className="mr-2 size-4 animate-spin" />
                          : <UserMinus className="mr-2 size-4" />}
                        释放认领
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={!candidate || claiming}
                        onClick={() => void handleClaim('claim')}
                      >
                        {claiming
                          ? <Loader2 className="mr-2 size-4 animate-spin" />
                          : <UserPlus className="mr-2 size-4" />}
                        认领
                      </Button>
                    )
                  )}
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
                        onClick={() => openRejectDialog(false)}
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

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{rejectBatch ? '批量驳回插件提交' : '驳回插件提交'}</DialogTitle>
            <DialogDescription>
              {rejectBatch
                ? `将对所选 ${selectedIds.length} 个插件提交驳回，驳回原因与分类对全部条目生效。`
                : `驳回「${detail?.name}」v${candidate?.version || '-'}。驳回原因会展示给开发者，并用于后续重新提交。`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                驳回分类 <span className="text-destructive">*</span>
              </label>
              <Select
                value={rejectReasonCode}
                onValueChange={(value) => setRejectReasonCode(value as PluginReviewReasonValue)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择驳回分类" />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_REASON_OPTIONS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {REVIEW_REASON_META[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="plugin-reject-reason" className="text-sm font-medium">
                驳回原因 <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="plugin-reject-reason"
                value={rejectReason}
                maxLength={500}
                rows={4}
                placeholder="请说明需要修正的问题，例如：产物未通过完整性校验、功能说明与实现不符、缺少必要的权限声明…"
                onChange={(event) => setRejectReason(event.target.value)}
              />
              <div className="text-right text-xs text-muted-foreground">{rejectReason.length}/500</div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={rejectBatch ? batchRunning : Boolean(reviewingDecision)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={
                !rejectReason.trim()
                || !rejectReasonCode
                || (rejectBatch ? batchRunning : Boolean(reviewingDecision))
              }
              onClick={confirmReject}
            >
              {(rejectBatch ? batchRunning : reviewingDecision === 'REJECT')
                ? <Loader2 className="mr-2 size-4 animate-spin" />
                : <X className="mr-2 size-4" />}
              {rejectBatch ? '确认批量驳回' : '确认驳回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
