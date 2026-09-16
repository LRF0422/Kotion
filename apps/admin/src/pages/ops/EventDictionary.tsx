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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
  toast,
} from '@kn/ui'
import { CircleAlert, LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { DataState } from '@/components/DataState'
import { JsonField, parseJsonObject } from '@/components/JsonField'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsEventDict,
  deleteOpsEventDict,
  getOpsEventDict,
  getOpsEventDictCoverage,
  syncOpsEventDict,
  updateOpsEventDict,
  type OpsEventDict,
} from '@/api/ops'

const CATEGORY_OPTIONS = ['NAV', 'CONVERSION', 'ENGAGEMENT', 'FORM', 'EXPERIMENT', 'QUALITY', 'GENERAL']

const CATEGORY_LABEL: Record<string, string> = {
  NAV: '导航',
  CONVERSION: '转化',
  ENGAGEMENT: '互动',
  FORM: '表单',
  EXPERIMENT: '实验',
  QUALITY: '质量',
  GENERAL: '通用',
}

const STATUS_META: Record<
  OpsEventDict['status'],
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }
> = {
  REGISTERED: { label: '已注册', variant: 'success' },
  DEPRECATED: { label: '已废弃', variant: 'muted' },
}

const STATUS_OPTIONS: Array<{ value: OpsEventDict['status']; label: string }> = [
  { value: 'REGISTERED', label: '已注册' },
  { value: 'DEPRECATED', label: '已废弃' },
]

const DAY_OPTIONS = [7, 30, 90] as const

/**
 * 落地页前端已注册的事件字典（21 个）。
 *
 * 管理后台无法 import 落地页应用，所以这里硬编码一份用于「同步前端字典」，
 * 后端按事件名幂等新增，不会覆盖已有条目。
 */
const LANDING_EVENTS: Array<{ eventName: string; category: string }> = [
  { eventName: 'pageview', category: 'NAV' },
  { eventName: 'section_view', category: 'ENGAGEMENT' },
  { eventName: 'scroll_depth', category: 'ENGAGEMENT' },
  { eventName: 'cta_click', category: 'CONVERSION' },
  { eventName: 'outbound_click', category: 'CONVERSION' },
  { eventName: 'template_use', category: 'CONVERSION' },
  { eventName: 'plugin_install', category: 'CONVERSION' },
  { eventName: 'form_start', category: 'FORM' },
  { eventName: 'form_submit', category: 'FORM' },
  { eventName: 'form_error', category: 'FORM' },
  { eventName: 'subscribe', category: 'FORM' },
  { eventName: 'experiment_exposure', category: 'EXPERIMENT' },
  { eventName: 'experiment_conversion', category: 'EXPERIMENT' },
  { eventName: 'web_vitals', category: 'QUALITY' },
  { eventName: 'consent_decided', category: 'QUALITY' },
  { eventName: 'campaign_impression', category: 'CONVERSION' },
  { eventName: 'campaign_dismiss', category: 'CONVERSION' },
  { eventName: 'doc_search', category: 'ENGAGEMENT' },
  { eventName: 'doc_copy', category: 'ENGAGEMENT' },
  { eventName: 'not_found', category: 'QUALITY' },
  { eventName: 'referral_click', category: 'CONVERSION' },
]

interface EventFormState {
  eventName: string
  category: string
  description: string
  propsSchema: string
  status: OpsEventDict['status']
  owner: string
}

const EMPTY_FORM: EventFormState = {
  eventName: '',
  category: 'GENERAL',
  description: '',
  propsSchema: '{}',
  status: 'REGISTERED',
  owner: '',
}

const categoryLabel = (category: string) => CATEGORY_LABEL[category] ?? category

const metaOf = (status: OpsEventDict['status']) =>
  STATUS_META[status] ?? { label: status, variant: 'muted' as const }

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value)

/** 字典里存的是 JSON 字符串，编辑时尽量格式化成可读文本。 */
const prettySchema = (raw?: string) => {
  if (!raw) return '{}'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/**
 * 事件字典与覆盖率：登记事件、维护属性 schema，并对比「已上报 / 未注册 / 静默」。
 */
export const EventDictionary = () => {
  const { canManage } = useOpsPermission()

  const registry = useAsync(() => getOpsEventDict(), [])
  const rows = registry.data ?? []

  const [days, setDays] = useState<number>(30)
  const coverage = useAsync(() => getOpsEventDictCoverage(days), [days])
  const coverageData = coverage.data

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<OpsEventDict | null>(null)
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<OpsEventDict | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [registering, setRegistering] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const rowKey = (row: OpsEventDict) => String(row.id ?? row.eventName)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  const openEdit = (row: OpsEventDict) => {
    setEditing(row)
    setForm({
      eventName: row.eventName,
      category: row.category || 'GENERAL',
      description: row.description ?? '',
      propsSchema: prettySchema(row.propsSchema),
      status: row.status,
      owner: row.owner ?? '',
    })
    setEditorOpen(true)
  }

  const save = async () => {
    if (!canManage) return
    const eventName = form.eventName.trim()
    if (!eventName) {
      toast.error('请填写事件名')
      return
    }

    // propsSchema 在契约里是字符串，统一校验后压缩成一行 JSON。
    const parsedSchema = parseJsonObject(form.propsSchema)
    if (!parsedSchema.ok) {
      toast.error(`属性 schema JSON 格式错误：${parsedSchema.error}`)
      return
    }
    const schemaValue = (parsedSchema.value ?? {}) as Record<string, unknown>
    const propsSchema = Object.keys(schemaValue).length > 0 ? JSON.stringify(schemaValue) : undefined

    setSaving(true)
    try {
      const payload: OpsEventDict = {
        eventName,
        category: form.category,
        description: form.description.trim(),
        propsSchema,
        status: form.status,
        owner: form.owner.trim(),
      }
      if (editing?.id != null) {
        await updateOpsEventDict(editing.id, payload)
        toast.success('事件已更新')
      } else {
        await createOpsEventDict(payload)
        toast.success('事件已登记')
      }
      setEditorOpen(false)
      registry.reload()
      coverage.reload()
    } catch (err) {
      toast.error(errorText(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const registerUnknown = async (eventName: string) => {
    setRegistering(eventName)
    try {
      // OpsEventDict 没有 enabled 字段，这里只提交真实存在的字段。
      await createOpsEventDict({
        eventName,
        category: 'GENERAL',
        description: '自动登记',
        status: 'REGISTERED',
      })
      toast.success(`已登记 ${eventName}`)
      registry.reload()
      coverage.reload()
    } catch (err) {
      toast.error(errorText(err, '登记失败'))
    } finally {
      setRegistering(null)
    }
  }

  const syncLandingDict = async () => {
    setSyncing(true)
    try {
      const res = await syncOpsEventDict({ events: LANDING_EVENTS })
      toast.success(`新增 ${res?.created ?? 0} / 已存在 ${res?.existing ?? 0}`)
      registry.reload()
      coverage.reload()
    } catch (err) {
      toast.error(errorText(err, '同步失败'))
    } finally {
      setSyncing(false)
    }
  }

  const confirmDelete = async () => {
    if (deleteTarget?.id == null) return
    setDeleting(true)
    try {
      await deleteOpsEventDict(deleteTarget.id)
      toast.success('已删除')
      setDeleteTarget(null)
      registry.reload()
      coverage.reload()
    } catch (err) {
      toast.error(errorText(err, '删除失败'))
    } finally {
      setDeleting(false)
    }
  }

  const registered = coverageData?.registered ?? []
  const observed = coverageData?.observed ?? []
  const unknown = coverageData?.unknown ?? []
  const silent = coverageData?.silent ?? []

  return (
    <div>
      <PageHeader
        title="事件字典"
        description="登记埋点事件与属性 schema，并发现「已上报未注册」「已注册无数据」的口径问题"
        actions={
          <>
            <div className="flex items-center gap-1">
              {DAY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm transition-colors',
                    days === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  近{option}天
                </button>
              ))}
            </div>
            {canManage && (
              <>
                <Button variant="outline" onClick={syncLandingDict} disabled={syncing}>
                  {syncing ? (
                    <LoaderCircle className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 size-4" />
                  )}
                  同步前端字典
                </Button>
                <Button onClick={openCreate}>
                  <Plus className="mr-1.5 size-4" />
                  新建事件
                </Button>
              </>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>覆盖率</CardTitle>
          <CardDescription>近 {days} 天的上报情况与字典对比</CardDescription>
        </CardHeader>
        <CardContent>
          <DataState
            loading={coverage.loading}
            error={coverage.error}
            empty={!coverageData}
            emptyText="暂无覆盖率数据"
            onRetry={coverage.reload}
          >
            <Tabs defaultValue="registered">
              <TabsList>
                <TabsTrigger value="registered">已注册 ({registered.length})</TabsTrigger>
                <TabsTrigger value="observed">已收到 ({observed.length})</TabsTrigger>
                <TabsTrigger value="unknown">未注册 ({unknown.length})</TabsTrigger>
                <TabsTrigger value="silent">静默 ({silent.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="registered" className="pt-3">
                {registered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">字典里还没有注册任何事件</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {registered.map((name) => (
                      <li key={name} className="rounded-md border px-2 py-1 font-mono text-xs">
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="observed" className="pt-3">
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>事件名</TableHead>
                        <TableHead className="text-right">次数</TableHead>
                        <TableHead className="text-right">访客</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {observed.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                            该时间段内没有收到事件
                          </TableCell>
                        </TableRow>
                      )}
                      {observed.map((row) => (
                        <TableRow key={row.name}>
                          <TableCell className="font-mono text-xs">{row.name}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right">{row.visitors}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="unknown" className="pt-3">
                {unknown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">太好了，前端上报的事件都已在字典里</p>
                ) : (
                  <ul className="space-y-2">
                    {unknown.map((name) => (
                      <li
                        key={name}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <CircleAlert className="size-4 text-amber-600 dark:text-amber-400" />
                          <span className="font-mono text-sm">{name}</span>
                          <span className="text-xs text-amber-700 dark:text-amber-300">前端已上报但字典缺失</span>
                        </div>
                        {canManage && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={registering === name}
                            onClick={() => registerUnknown(name)}
                          >
                            {registering === name && <LoaderCircle className="mr-1 size-3.5 animate-spin" />}
                            一键登记
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="silent" className="pt-3">
                {silent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">没有静默事件</p>
                ) : (
                  <ul className="flex flex-wrap gap-2 text-muted-foreground">
                    {silent.map((name) => (
                      <li key={name} className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs">
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </DataState>
        </CardContent>
      </Card>

      <DataState
        loading={registry.loading}
        error={registry.error}
        empty={rows.length === 0}
        emptyText="字典还是空的，可以点「同步前端字典」一键登记"
        onRetry={registry.reload}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>事件名</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead>属性 schema</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>负责人</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const key = rowKey(row)
                    const meta = metaOf(row.status)
                    const expanded = expandedKey === key
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-mono text-xs">{row.eventName}</TableCell>
                        <TableCell className="text-muted-foreground">{categoryLabel(row.category)}</TableCell>
                        <TableCell className="max-w-56 truncate text-muted-foreground" title={row.description}>
                          {row.description || '-'}
                        </TableCell>
                        <TableCell className="max-w-72">
                          {row.propsSchema ? (
                            <div className="space-y-1">
                              <code className="block break-all font-mono text-xs text-muted-foreground">
                                {expanded ? row.propsSchema : truncate(row.propsSchema, 60)}
                              </code>
                              {row.propsSchema.length > 60 && (
                                <button
                                  type="button"
                                  className="text-xs text-primary hover:underline"
                                  onClick={() => setExpandedKey(expanded ? null : key)}
                                >
                                  {expanded ? '收起' : '展开'}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.owner || '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1">
                            {canManage && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                                  <Pencil className="mr-1 size-3.5" />
                                  编辑
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)}>
                                  <Trash2 className="mr-1 size-3.5 text-destructive" />
                                  删除
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </DataState>

      {/* 新建 / 编辑 */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑事件' : '新建事件'}</DialogTitle>
            <DialogDescription>事件名与前端埋点上报的 name 完全一致才会计入覆盖率。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>事件名</Label>
                <Input
                  value={form.eventName}
                  disabled={Boolean(editing)}
                  placeholder="cta_click"
                  onChange={(event) => setForm((prev) => ({ ...prev, eventName: event.target.value.trim() }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>分类</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="通用" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {categoryLabel(option)}（{option}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>说明</Label>
              <Textarea
                value={form.description}
                rows={3}
                placeholder="什么时候上报、有哪些业务含义"
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>

            <JsonField
              label="属性 schema"
              rows={8}
              value={form.propsSchema}
              hint='形如 { "location": { "type": "string", "required": true } }'
              onChange={(value) => setForm((prev) => ({ ...prev, propsSchema: value }))}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as OpsEventDict['status'] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="已注册" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>负责人</Label>
                <Input
                  value={form.owner}
                  placeholder="如：前端 / @zhangsan"
                  onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}
                />
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

      {/* 删除确认 */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除事件</DialogTitle>
            <DialogDescription>
              确认从字典删除「{deleteTarget?.eventName}」？已上报的历史数据不会被删除。
            </DialogDescription>
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
