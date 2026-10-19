import { useCallback, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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
import { Check, ExternalLink, Loader2, Search, ShieldCheck, X } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import {
  approveAdminDeveloper,
  getAdminDeveloperList,
  rejectAdminDeveloper,
  revokeAdminDeveloper,
  type AdminDeveloperVO,
  type DeveloperStatus,
} from '@/api'
import { getAccessToken } from '@/lib/auth'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

const STATUS_META: Record<
  DeveloperStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }
> = {
  PENDING: { label: '待审核', variant: 'warning' },
  APPROVED: { label: '已通过', variant: 'success' },
  REJECTED: { label: '已驳回', variant: 'danger' },
  SUSPENDED: { label: '已撤销', variant: 'muted' },
}

const STATUS_FILTERS: Array<{ value: DeveloperStatus | 'all'; label: string }> = [
  { value: 'PENDING', label: '待审核' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'SUSPENDED', label: '已撤销' },
  { value: 'all', label: '全部' },
]

const ID_TYPE_LABEL: Record<string, string> = {
  ID_CARD: '身份证',
  PASSPORT: '护照',
  BUSINESS_LICENSE: '营业执照',
  OTHER: '其他证件',
}

const enumValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value
    return typeof inner === 'string' ? inner : undefined
  }
  return undefined
}

const statusOf = (developer: AdminDeveloperVO): DeveloperStatus =>
  (enumValue(developer.status) as DeveloperStatus) ?? 'PENDING'

const idTypeOf = (developer: AdminDeveloperVO) => enumValue(developer.idType) ?? ''

/** 资质材料走网关下载接口；与客户端一致，把 token 作为查询参数带上。 */
const qualificationUrl = (path?: string) => {
  if (!path) return undefined
  const token = getAccessToken()
  return `/api/knowledge-resource/oss/endpoint/download?fileName=${encodeURIComponent(path)}${
    token ? `&Authorization=${encodeURIComponent(token)}` : ''
  }`
}

type ReviewAction = 'approve' | 'reject' | 'revoke'

const ACTION_META: Record<ReviewAction, { title: string; description: string; confirm: string }> = {
  approve: {
    title: '通过开发者认证',
    description: '通过后，该开发者可以发布插件、发布新版本和管理已上架的插件。',
    confirm: '通过认证',
  },
  reject: {
    title: '驳回开发者认证',
    description: '驳回原因会展示给开发者，便于其修改资料后重新提交。',
    confirm: '驳回',
  },
  revoke: {
    title: '撤销开发者认证',
    description: '撤销后该开发者将无法继续发布或管理插件，原因会展示给开发者。',
    confirm: '撤销认证',
  },
}

export const DeveloperList = () => {
  const { toast } = useToast()
  const [statusTab, setStatusTab] = useState<DeveloperStatus | 'all'>('PENDING')
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const [detail, setDetail] = useState<AdminDeveloperVO | null>(null)
  const [action, setAction] = useState<ReviewAction | null>(null)
  const [target, setTarget] = useState<AdminDeveloperVO | null>(null)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetcher = useCallback(
    (current: number) =>
      getAdminDeveloperList({
        current,
        pageSize: PAGE_SIZE,
        status: statusTab === 'all' ? undefined : statusTab,
        searchValue: keyword || undefined,
      }),
    [statusTab, keyword],
  )
  const { records, total, pages, current, setCurrent, loading, error, reload } =
    usePagedData<AdminDeveloperVO>(fetcher, [statusTab, keyword])

  const openAction = (nextAction: ReviewAction, developer: AdminDeveloperVO) => {
    setAction(nextAction)
    setTarget(developer)
    setReason('')
    setComment('')
  }

  const closeAction = () => {
    if (submitting) return
    setAction(null)
    setTarget(null)
    setReason('')
    setComment('')
  }

  const submitAction = async () => {
    if (!action || !target || submitting) return
    const trimmedReason = reason.trim()
    if (action !== 'approve' && !trimmedReason) {
      toast({ title: '请填写原因', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      if (action === 'approve') {
        await approveAdminDeveloper(target.id, comment.trim() || undefined)
      } else if (action === 'reject') {
        await rejectAdminDeveloper(target.id, trimmedReason, comment.trim() || undefined)
      } else {
        await revokeAdminDeveloper(target.id, trimmedReason, comment.trim() || undefined)
      }
      toast({ title: ACTION_META[action].confirm + '成功' })
      closeAction()
      reload()
    } catch (err) {
      toast({
        title: ACTION_META[action].confirm + '失败',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const submitSearch = () => setKeyword(searchInput.trim())

  return (
    <div>
      <PageHeader
        title="开发者认证"
        description="发布和管理插件前必须通过的开发者身份审核。通过插件审核权限即可处理本页。"
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={statusTab} onValueChange={(value) => setStatusTab(value as DeveloperStatus | 'all')}>
              <TabsList className="flex-wrap">
                {STATUS_FILTERS.map((filter) => (
                  <TabsTrigger key={filter.value} value={filter.value}>
                    {filter.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Input
                className="h-9 w-56"
                placeholder="开发者名称 / 账号 / 联系方式"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitSearch()
                }}
              />
              <Button variant="outline" size="sm" onClick={submitSearch}>
                <Search className="mr-1 size-4" />
                搜索
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>开发者</TableHead>
                  <TableHead>联系人</TableHead>
                  <TableHead>证件</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>提交时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline size-4 animate-spin" />
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      暂无开发者认证记录
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((developer) => {
                    const status = statusOf(developer)
                    const meta = STATUS_META[status]
                    return (
                      <TableRow key={developer.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <ShieldCheck className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{developer.displayName || '-'}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {developer.userName || developer.userId || '-'}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p>{developer.contactName || '-'}</p>
                          <p className="text-xs text-muted-foreground">{developer.contactPhone || developer.contactEmail}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{ID_TYPE_LABEL[idTypeOf(developer)] || idTypeOf(developer) || '-'}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {developer.idNumberMasked || '已脱敏'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                          {status === 'REJECTED' && developer.rejectReason && (
                            <p className="mt-1 max-w-40 truncate text-xs text-muted-foreground" title={developer.rejectReason}>
                              {developer.rejectReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(developer.createTime)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setDetail(developer)}>
                              查看
                            </Button>
                            {status === 'PENDING' && (
                              <>
                                <Button size="sm" onClick={() => openAction('approve', developer)}>
                                  <Check className="mr-1 size-4" />
                                  通过
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => openAction('reject', developer)}
                                >
                                  <X className="mr-1 size-4" />
                                  驳回
                                </Button>
                              </>
                            )}
                            {status === 'APPROVED' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive"
                                onClick={() => openAction('revoke', developer)}
                              >
                                撤销
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
        </CardContent>
      </Card>

      {/* 详情 */}
      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>开发者认证详情</DialogTitle>
            <DialogDescription>完整证件信息仅用于审核，请勿外传。</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 border-b pb-3">
                <span className="text-muted-foreground">开发者名称</span>
                <span className="col-span-2 font-medium">{detail.displayName || '-'}</span>
                <span className="text-muted-foreground">账号</span>
                <span className="col-span-2">
                  {detail.userName || '-'}（ID: {detail.userId || '-'}）
                </span>
                <span className="text-muted-foreground">状态</span>
                <span className="col-span-2">
                  {STATUS_META[statusOf(detail)].label}
                </span>
                <span className="text-muted-foreground">联系人</span>
                <span className="col-span-2">{detail.contactName || '-'}</span>
                <span className="text-muted-foreground">电话</span>
                <span className="col-span-2">{detail.contactPhone || '-'}</span>
                <span className="text-muted-foreground">邮箱</span>
                <span className="col-span-2 break-all">{detail.contactEmail || '-'}</span>
                <span className="text-muted-foreground">证件类型</span>
                <span className="col-span-2">
                  {ID_TYPE_LABEL[idTypeOf(detail)] || idTypeOf(detail) || '-'}
                </span>
                <span className="text-muted-foreground">证件号码</span>
                <span className="col-span-2 break-all font-mono">
                  {detail.idNumber || detail.idNumberMasked || '-'}
                </span>
                <span className="text-muted-foreground">资质材料</span>
                <span className="col-span-2">
                  {detail.qualificationPath ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={qualificationUrl(detail.qualificationPath)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      查看材料
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    '-'
                  )}
                </span>
                <span className="text-muted-foreground">提交时间</span>
                <span className="col-span-2">{formatDateTime(detail.createTime)}</span>
                <span className="text-muted-foreground">审核时间</span>
                <span className="col-span-2">{formatDateTime(detail.reviewTime)}</span>
                <span className="text-muted-foreground">审核人</span>
                <span className="col-span-2">{detail.reviewerName || '-'}</span>
              </div>
              {detail.intro && (
                <div>
                  <p className="mb-1 text-muted-foreground">开发者简介</p>
                  <p className="whitespace-pre-wrap break-words">{detail.intro}</p>
                </div>
              )}
              {detail.rejectReason && (
                <div>
                  <p className="mb-1 text-muted-foreground">
                    {statusOf(detail) === 'SUSPENDED' ? '撤销原因' : '驳回原因'}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-destructive">{detail.rejectReason}</p>
                </div>
              )}
              {detail.reviewComment && (
                <div>
                  <p className="mb-1 text-muted-foreground">内部审核备注</p>
                  <p className="whitespace-pre-wrap break-words">{detail.reviewComment}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 审核动作 */}
      <Dialog open={Boolean(action)} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{action ? ACTION_META[action].title : ''}</DialogTitle>
            <DialogDescription>
              {action ? ACTION_META[action].description : ''}
              {target?.displayName ? `（${target.displayName}）` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {action !== 'approve' && (
              <div className="space-y-1.5">
                <Label htmlFor="developer-reason">
                  原因 <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="developer-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  placeholder="会展示给开发者，请说明需要修改的内容"
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="developer-comment">内部备注（可选）</Label>
              <Textarea
                id="developer-comment"
                rows={2}
                maxLength={500}
                value={comment}
                placeholder="仅后台可见"
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
            {target?.status !== undefined && (
              <Badge variant="outline">当前状态：{STATUS_META[statusOf(target)].label}</Badge>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={submitting} onClick={closeAction}>
              取消
            </Button>
            <Button
              variant={action === 'approve' ? 'default' : 'destructive'}
              disabled={submitting}
              onClick={() => void submitAction()}
            >
              {submitting && <Loader2 className="mr-1 size-4 animate-spin" />}
              {action ? ACTION_META[action].confirm : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
