import { useState } from 'react'
import {
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
  Textarea,
  toast,
} from '@kn/ui'
import { ListChecks, LoaderCircle, Mail, Pencil, Plus, Send, Trash2, Users } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { DataState } from '@/components/DataState'
import { TablePagination } from '@/components/TablePagination'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsCampaign,
  deleteOpsCampaign,
  getOpsCampaignSends,
  getOpsCampaigns,
  previewOpsCampaignAudience,
  sendOpsCampaign,
  testOpsCampaign,
  updateOpsCampaign,
  type OpsAudienceSelector,
  type OpsCampaign,
  type OpsCampaignPreview,
} from '@/api/ops'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const STATUS_META: Record<OpsCampaign['status'], { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: '草稿', variant: 'muted' },
  SCHEDULED: { label: '已排期', variant: 'info' },
  SENDING: { label: '发送中', variant: 'warning' },
  SENT: { label: '已发送', variant: 'success' },
  FAILED: { label: '失败', variant: 'danger' },
  CANCELLED: { label: '已取消', variant: 'muted' },
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: '全部' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'SCHEDULED', label: '已排期' },
  { value: 'SENDING', label: '发送中' },
  { value: 'SENT', label: '已发送' },
  { value: 'FAILED', label: '失败' },
  { value: 'CANCELLED', label: '已取消' },
]

const AUDIENCE_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: '全部' },
  { value: 'subscribed', label: '已确认订阅（subscribed）' },
  { value: 'pending', label: '待确认（pending）' },
]

interface CampaignFormState {
  name: string
  subject: string
  preheader: string
  templateKey: string
  bodyHtml: string
  audienceStatus: string
  tags: string
  utmSource: string
  days: number
}

const EMPTY_FORM: CampaignFormState = {
  name: '',
  subject: '',
  preheader: '',
  templateKey: '',
  bodyHtml: '',
  audienceStatus: 'ALL',
  tags: '',
  utmSource: '',
  days: 0,
}

const metaOf = (status: OpsCampaign['status']) =>
  STATUS_META[status] ?? { label: status, variant: 'muted' as BadgeVariant }

/** 打开率 / 点击率：分母为已发送数，为 0 时不显示 0% 而显示占位符。 */
const rate = (part?: number, whole?: number) => {
  const numerator = part ?? 0
  const denominator = whole ?? 0
  if (denominator <= 0) return '-'
  return `${Math.round((numerator / denominator) * 1000) / 10}%`
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/**
 * 发送明细分页表。
 *
 * `usePagedData` 不能条件调用，所以拆成子组件，仅在选中某个活动时渲染。
 */
const CampaignSendsPanel = ({ campaignId }: { campaignId: number }) => {
  const [status, setStatus] = useState('')

  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData(
    (page) => getOpsCampaignSends(campaignId, { current: page, size: 20, status: status || undefined }),
    [campaignId, status],
  )

  return (
    <div className="space-y-3">
      <Input
        value={status}
        onChange={(event) => setStatus(event.target.value.trim())}
        placeholder="按状态筛选，如 SENT / FAILED（留空为全部）"
      />
      <DataState loading={loading} error={error} empty={records.length === 0} emptyText="暂无发送记录" onRetry={reload}>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>邮箱</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>失败原因</TableHead>
                <TableHead>发送时间</TableHead>
                <TableHead>打开时间</TableHead>
                <TableHead>点击时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.email}</TableCell>
                  <TableCell>{row.status || '-'}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground" title={row.error}>
                    {row.error || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(row.sentAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(row.openedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(row.clickedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
        </div>
      </DataState>
    </div>
  )
}

/**
 * 邮件 / 触达活动：人群圈选、人群预估、测试发送与立即发送。
 */
export const Campaigns = () => {
  const { canManage } = useOpsPermission()

  const [statusFilter, setStatusFilter] = useState('ALL')

  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData(
    (page) =>
      getOpsCampaigns({
        current: page,
        size: 20,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      }),
    [statusFilter],
  )

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<OpsCampaign | null>(null)
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState<OpsCampaignPreview | null>(null)

  const [testTarget, setTestTarget] = useState<OpsCampaign | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)

  const [sendTarget, setSendTarget] = useState<OpsCampaign | null>(null)
  const [sending, setSending] = useState(false)

  const [sendsTarget, setSendsTarget] = useState<OpsCampaign | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<OpsCampaign | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  const openEdit = (row: OpsCampaign) => {
    const audience = row.audience ?? {}
    setEditing(row)
    setForm({
      name: row.name ?? '',
      subject: row.subject ?? '',
      preheader: row.preheader ?? '',
      templateKey: row.templateKey ?? '',
      bodyHtml: row.bodyHtml ?? '',
      audienceStatus: audience.status || 'ALL',
      tags: (audience.tags ?? []).join(', '),
      utmSource: audience.utmSource ?? '',
      days: audience.days ?? 0,
    })
    setEditorOpen(true)
  }

  const buildAudience = (): OpsAudienceSelector => ({
    status: form.audienceStatus === 'ALL' ? undefined : form.audienceStatus,
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    utmSource: form.utmSource.trim() || undefined,
    days: Number(form.days) || 0,
  })

  const save = async () => {
    if (!canManage) return
    if (!form.name.trim()) {
      toast.error('请填写活动名称')
      return
    }
    if (!form.subject.trim()) {
      toast.error('请填写邮件主题')
      return
    }
    setSaving(true)
    try {
      const payload: Partial<OpsCampaign> = {
        name: form.name.trim(),
        subject: form.subject.trim(),
        preheader: form.preheader.trim(),
        templateKey: form.templateKey.trim() || null,
        bodyHtml: form.bodyHtml,
        audience: buildAudience(),
      }
      if (editing?.id != null) {
        await updateOpsCampaign(editing.id, payload)
        toast.success('活动已更新')
      } else {
        await createOpsCampaign(payload)
        toast.success('活动已创建')
      }
      setEditorOpen(false)
      reload()
    } catch (err) {
      toast.error(errorText(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const runPreview = async (selector: OpsAudienceSelector) => {
    setPreviewLoading(true)
    try {
      const preview = await previewOpsCampaignAudience(selector)
      setPreviewData(preview)
      setPreviewOpen(true)
    } catch (err) {
      toast.error(errorText(err, '人群预估失败'))
    } finally {
      setPreviewLoading(false)
    }
  }

  const submitTest = async () => {
    if (testTarget?.id == null) return
    const email = testEmail.trim()
    if (!email) {
      toast.error('请填写测试收件邮箱')
      return
    }
    setTesting(true)
    try {
      await testOpsCampaign(testTarget.id, email)
      toast.success('测试邮件已发送')
      setTestTarget(null)
    } catch (err) {
      toast.error(errorText(err, '测试发送失败'))
    } finally {
      setTesting(false)
    }
  }

  const confirmSend = async () => {
    if (sendTarget?.id == null) return
    setSending(true)
    try {
      const res = await sendOpsCampaign(sendTarget.id)
      toast.success(`已入队 ${res?.queued ?? 0} 封`)
      setSendTarget(null)
      reload()
    } catch (err) {
      toast.error(errorText(err, '发送失败'))
    } finally {
      setSending(false)
    }
  }

  const confirmDelete = async () => {
    if (deleteTarget?.id == null) return
    setDeleting(true)
    try {
      await deleteOpsCampaign(deleteTarget.id)
      toast.success('已删除')
      setDeleteTarget(null)
      reload()
    } catch (err) {
      toast.error(errorText(err, '删除失败'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="邮件 / 触达活动"
        description="按人群圈选发送邮件，支持发送前人群预估、测试发送与效果回收"
        actions={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Button onClick={openCreate}>
                <Plus className="mr-1.5 size-4" />
                新建活动
              </Button>
            )}
          </>
        }
      />

      <DataState
        loading={loading}
        error={error}
        empty={records.length === 0}
        emptyText="暂无邮件活动，先新建一个吧"
        onRetry={reload}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>主题</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">人群</TableHead>
                    <TableHead className="text-right">已发</TableHead>
                    <TableHead className="text-right">打开率</TableHead>
                    <TableHead className="text-right">点击率</TableHead>
                    <TableHead className="text-right">退订</TableHead>
                    <TableHead>排期时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((row) => {
                    const meta = metaOf(row.status)
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-48 truncate font-medium" title={row.name}>
                          {row.name || '-'}
                        </TableCell>
                        <TableCell className="max-w-56 truncate text-muted-foreground" title={row.subject}>
                          {row.subject || '-'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">{row.totalCount ?? 0}</TableCell>
                        <TableCell className="text-right">{row.sentCount ?? 0}</TableCell>
                        <TableCell className="text-right">{rate(row.openCount, row.sentCount)}</TableCell>
                        <TableCell className="text-right">{rate(row.clickCount, row.sentCount)}</TableCell>
                        <TableCell className="text-right">{row.unsubscribeCount ?? 0}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDateTime(row.scheduledAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1">
                            {canManage && (
                              <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                                <Pencil className="mr-1 size-3.5" />
                                编辑
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={previewLoading}
                              onClick={() => runPreview(row.audience ?? {})}
                            >
                              <Users className="mr-1 size-3.5" />
                              人群预估
                            </Button>
                            {canManage && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setTestTarget(row)
                                    setTestEmail(row.testEmail ?? '')
                                  }}
                                >
                                  <Mail className="mr-1 size-3.5" />
                                  测试发送
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setSendTarget(row)}>
                                  <Send className="mr-1 size-3.5" />
                                  立即发送
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setSendsTarget(row)}>
                              <ListChecks className="mr-1 size-3.5" />
                              明细
                            </Button>
                            {canManage && (
                              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)}>
                                <Trash2 className="mr-1 size-3.5 text-destructive" />
                                删除
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
            </div>
          </CardContent>
        </Card>
      </DataState>

      {/* 新建 / 编辑 */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑活动' : '新建活动'}</DialogTitle>
            <DialogDescription>收件人群取自订阅线索；正文与模板至少填一项。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>活动名称</Label>
              <Input
                value={form.name}
                placeholder="如：v2.0 发布通知"
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>邮件主题</Label>
              <Input
                value={form.subject}
                placeholder="如：知识库 v2.0 正式发布"
                onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>预览文案（preheader）</Label>
              <Input
                value={form.preheader}
                placeholder="收件箱里跟在主题后的一行摘要"
                onChange={(event) => setForm((prev) => ({ ...prev, preheader: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>模板标识（templateKey）</Label>
              <Input
                value={form.templateKey}
                placeholder="welcome / release …"
                onChange={(event) => setForm((prev) => ({ ...prev, templateKey: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">留空则使用下方内联正文</p>
            </div>

            <div className="space-y-1.5">
              <Label>内联正文（HTML）</Label>
              <Textarea
                value={form.bodyHtml}
                rows={8}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder="<p>你好，……</p>"
                onChange={(event) => setForm((prev) => ({ ...prev, bodyHtml: event.target.value }))}
              />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">收件人群</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>订阅状态</Label>
                  <Select
                    value={form.audienceStatus}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, audienceStatus: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="全部" />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCE_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>标签（逗号分隔）</Label>
                  <Input
                    value={form.tags}
                    placeholder="beta, 付费用户"
                    onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>来源渠道（utmSource）</Label>
                  <Input
                    value={form.utmSource}
                    placeholder="zhihu / juejin …"
                    onChange={(event) => setForm((prev) => ({ ...prev, utmSource: event.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>最近天数</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.days}
                    onChange={(event) => setForm((prev) => ({ ...prev, days: Number(event.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">0 = 不限时间</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving || !canManage}>
              {saving && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 人群预估 */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>人群预估</DialogTitle>
            <DialogDescription>按当前圈选条件命中的订阅者数量与示例邮箱。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              预计命中 <span className="text-lg font-semibold">{previewData?.total ?? 0}</span> 人
            </p>
            {(previewData?.sample ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">没有可展示的示例邮箱</p>
            ) : (
              <ul className="space-y-1 rounded-lg border p-3 font-mono text-xs text-muted-foreground">
                {(previewData?.sample ?? []).map((email) => (
                  <li key={email}>{email}</li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 测试发送 */}
      <Dialog open={Boolean(testTarget)} onOpenChange={(open) => !open && setTestTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>测试发送</DialogTitle>
            <DialogDescription>给指定邮箱发一封测试邮件，不影响正式发送。</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>收件邮箱</Label>
            <Input
              value={testEmail}
              placeholder="you@example.com"
              onChange={(event) => setTestEmail(event.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTestTarget(null)}>
              取消
            </Button>
            <Button onClick={submitTest} disabled={testing}>
              {testing && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              发送测试
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 立即发送确认 */}
      <Dialog open={Boolean(sendTarget)} onOpenChange={(open) => !open && setSendTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>立即发送</DialogTitle>
            <DialogDescription>
              确认立即发送「{sendTarget?.name}」？预计触达 {sendTarget?.totalCount ?? 0} 人，发送后不可撤回。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSendTarget(null)}>
              取消
            </Button>
            <Button onClick={confirmSend} disabled={sending}>
              {sending && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              确认发送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 发送明细 */}
      <Dialog open={Boolean(sendsTarget)} onOpenChange={(open) => !open && setSendsTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>发送明细 · {sendsTarget?.name}</DialogTitle>
            <DialogDescription>逐封邮件的送达、打开与点击状态。</DialogDescription>
          </DialogHeader>
          {sendsTarget?.id != null && <CampaignSendsPanel campaignId={sendsTarget.id} />}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除活动</DialogTitle>
            <DialogDescription>确认删除「{deleteTarget?.name}」？该操作不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
