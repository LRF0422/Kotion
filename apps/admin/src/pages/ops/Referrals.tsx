import { useState } from 'react'
import {
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@kn/ui'
import { Copy, LoaderCircle, Pencil, Plus, QrCode, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsReferral,
  deleteOpsReferral,
  getOpsReferrals,
  updateOpsReferral,
  type OpsReferral,
} from '@/api/ops'
import { qrToSvg } from '@/lib/qr'

const OWNER_TYPES: Array<{ value: OpsReferral['ownerType']; label: string }> = [
  { value: 'USER', label: '用户' },
  { value: 'PARTNER', label: '合作伙伴' },
  { value: 'CAMPAIGN', label: '市场活动' },
]

const ownerTypeLabel = (value: string) => OWNER_TYPES.find((item) => item.value === value)?.label ?? value

const inviteLink = (code: string) => `${window.location.origin}/api/knowledge-system/ops/r/${code}`

const randomSuffix = () => Math.random().toString(36).slice(2, 6)

/** 由 ownerName 生成邀请码建议：小写 + 4 位随机串。 */
const suggestCode = (ownerName: string) => {
  const base = ownerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'invite'}-${randomSuffix()}`
}

const isValidTarget = (target: string) => /^https?:\/\//i.test(target) || target.startsWith('/')

interface ReferralForm {
  code: string
  ownerType: OpsReferral['ownerType']
  ownerId: string
  ownerName: string
  target: string
  enabled: boolean
}

const emptyForm: ReferralForm = {
  code: '',
  ownerType: 'USER',
  ownerId: '',
  ownerName: '',
  target: '',
  enabled: true,
}

export const Referrals = () => {
  const { canManage } = useOpsPermission()

  const referralsState = useAsync(() => getOpsReferrals(), [])
  const referrals = referralsState.data ?? []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OpsReferral | null>(null)
  const [form, setForm] = useState<ReferralForm>(emptyForm)
  const [codeTouched, setCodeTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<OpsReferral | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [qrTarget, setQrTarget] = useState<OpsReferral | null>(null)

  const [togglingId, setTogglingId] = useState<number | null>(null)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, code: suggestCode('') })
    setCodeTouched(false)
    setDialogOpen(true)
  }

  const openEdit = (row: OpsReferral) => {
    setEditing(row)
    setForm({
      code: row.code,
      ownerType: row.ownerType,
      ownerId: row.ownerId ?? '',
      ownerName: row.ownerName ?? '',
      target: row.target,
      enabled: row.enabled,
    })
    setCodeTouched(true)
    setDialogOpen(true)
  }

  const copy = async (text: string, message = '已复制') => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(message)
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const save = async () => {
    if (!form.code.trim()) {
      toast.error('请填写邀请码')
      return
    }
    if (!form.target.trim()) {
      toast.error('请填写目标地址')
      return
    }
    if (!isValidTarget(form.target.trim())) {
      toast.error('目标地址需以 http(s):// 或 / 开头')
      return
    }
    setSaving(true)
    try {
      const payload: Partial<OpsReferral> = {
        code: form.code.trim(),
        ownerType: form.ownerType,
        ownerId: form.ownerId || undefined,
        ownerName: form.ownerName || undefined,
        target: form.target.trim(),
        enabled: form.enabled,
      }
      if (editing?.id !== undefined) {
        await updateOpsReferral(editing.id, payload)
        toast.success('邀请码已更新')
      } else {
        await createOpsReferral(payload)
        toast.success('邀请码已创建')
      }
      setDialogOpen(false)
      referralsState.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (row: OpsReferral, enabled: boolean) => {
    if (row.id === undefined) return
    setTogglingId(row.id)
    try {
      await updateOpsReferral(row.id, { enabled })
      toast.success(enabled ? '已启用' : '已停用')
      referralsState.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setTogglingId(null)
    }
  }

  const confirmDelete = async () => {
    if (deleteTarget?.id === undefined) return
    setDeleting(true)
    try {
      await deleteOpsReferral(deleteTarget.id)
      toast.success('已删除')
      setDeleteTarget(null)
      referralsState.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const activationRate = (row: OpsReferral) =>
    row.clicks > 0 ? `${Math.round(((row.activations || 0) / row.clicks) * 1000) / 10}%` : '0%'

  return (
    <div>
      <PageHeader
        title="推荐 / 邀请"
        description="维护邀请码、归属与目标地址，跟踪点击 / 注册 / 激活转化"
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              新建邀请码
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>邀请码列表</CardTitle>
          <CardDescription>邀请链接形如 {inviteLink('code')}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataState
            loading={referralsState.loading}
            error={referralsState.error}
            empty={referrals.length === 0}
            emptyText="暂无邀请码"
            onRetry={referralsState.reload}
          >
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>邀请码</TableHead>
                    <TableHead>归属</TableHead>
                    <TableHead>目标地址</TableHead>
                    <TableHead className="text-right">点击</TableHead>
                    <TableHead className="text-right">注册</TableHead>
                    <TableHead className="text-right">激活</TableHead>
                    <TableHead className="text-right">激活率</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((row) => (
                    <TableRow key={row.id ?? row.code}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="mr-1.5 rounded border px-1.5 py-0.5 text-xs">{ownerTypeLabel(row.ownerType)}</span>
                        {row.ownerName || row.ownerId || '-'}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground" title={row.target}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 hover:text-foreground"
                          onClick={() => void copy(row.target, '目标地址已复制')}
                        >
                          <span className="max-w-48 truncate">{row.target || '-'}</span>
                          <Copy className="size-3.5 shrink-0" />
                        </button>
                      </TableCell>
                      <TableCell className="text-right">{row.clicks ?? 0}</TableCell>
                      <TableCell className="text-right">{row.signups ?? 0}</TableCell>
                      <TableCell className="text-right">{row.activations ?? 0}</TableCell>
                      <TableCell className="text-right">{activationRate(row)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={Boolean(row.enabled)}
                          disabled={!canManage || togglingId === row.id}
                          onCheckedChange={(checked) => void toggleEnabled(row, checked)}
                          aria-label="启用状态"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="复制邀请链接"
                            onClick={() => void copy(inviteLink(row.code), '邀请链接已复制')}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="二维码" onClick={() => setQrTarget(row)}>
                            <QrCode className="size-4" />
                          </Button>
                          {canManage && (
                            <>
                              <Button variant="ghost" size="sm" title="编辑" onClick={() => openEdit(row)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="sm" title="删除" onClick={() => setDeleteTarget(row)}>
                                <Trash2 className="size-4 text-destructive" />
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
        </CardContent>
      </Card>

      {/* 新建 / 编辑 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑邀请码' : '新建邀请码'}</DialogTitle>
            <DialogDescription>邀请码用于归因推荐来源，创建后不可修改。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="referral-code">邀请码</Label>
              <Input
                id="referral-code"
                value={form.code}
                disabled={Boolean(editing)}
                placeholder="如：alice-1a2b"
                onChange={(e) => {
                  setCodeTouched(true)
                  setForm((prev) => ({ ...prev, code: e.target.value }))
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>归属类型</Label>
              <Select
                value={form.ownerType}
                onValueChange={(value) => setForm((prev) => ({ ...prev, ownerType: value as OpsReferral['ownerType'] }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="归属类型" />
                </SelectTrigger>
                <SelectContent>
                  {OWNER_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="referral-owner-id">归属 ID</Label>
              <Input
                id="referral-owner-id"
                value={form.ownerId}
                placeholder="用户 / 伙伴 / 活动 ID"
                onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="referral-owner-name">归属名称</Label>
              <Input
                id="referral-owner-name"
                value={form.ownerName}
                placeholder="如：Alice"
                onChange={(e) => {
                  const ownerName = e.target.value
                  setForm((prev) => ({
                    ...prev,
                    ownerName,
                    // 新建时按归属名称自动建议邀请码，用户手动改过则不再覆盖。
                    code: !editing && !codeTouched ? suggestCode(ownerName) : prev.code,
                  }))
                }}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="referral-target">目标地址</Label>
              <Input
                id="referral-target"
                value={form.target}
                placeholder="https://example.com/invite 或 /invite"
                onChange={(e) => setForm((prev) => ({ ...prev, target: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
                aria-label="启用"
              />
              <span className="text-sm text-muted-foreground">启用</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 邀请链接 + 二维码 */}
      <Dialog open={Boolean(qrTarget)} onOpenChange={(open) => (!open ? setQrTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>邀请链接</DialogTitle>
            <DialogDescription>邀请码：{qrTarget?.code}</DialogDescription>
          </DialogHeader>
          {qrTarget && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteLink(qrTarget.code)} />
                <Button
                  variant="outline"
                  onClick={() => void copy(inviteLink(qrTarget.code), '邀请链接已复制')}
                >
                  <Copy className="mr-1.5 size-4" />
                  复制
                </Button>
              </div>
              <div
                className="mx-auto flex w-fit justify-center rounded-lg border bg-white p-3"
                dangerouslySetInnerHTML={{ __html: qrToSvg(inviteLink(qrTarget.code), { size: 160 }) }}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrTarget(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除二次确认 */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除邀请码</DialogTitle>
            <DialogDescription>
              确认删除邀请码「{deleteTarget?.code}」？该操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
