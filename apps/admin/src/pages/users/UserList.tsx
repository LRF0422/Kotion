import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  DeviceSwitch,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  MultiSelect,
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
  useToast,
} from '@kn/ui'
import {
  Ban,
  CircleCheck,
  Eye,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import {
  disableUsers,
  enableUsers,
  getAdminUserDetail,
  getRoleTree,
  getUserInfo,
  getUserList,
  grantUserRoles,
  removeUsers,
  resetUserPassword,
  submitUser,
  type RoleVO,
  type UserSubmitDTO,
  type UserVO,
} from '@/api'
import { getAuthUser } from '@/lib/auth'
import { usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

interface UserFormState {
  id?: string
  account: string
  name: string
  realName: string
  password: string
  email: string
  phone: string
  roleIds: string[]
}

const EMPTY_FORM: UserFormState = {
  account: '',
  name: '',
  realName: '',
  password: '',
  email: '',
  phone: '',
  roleIds: [],
}

const splitValues = (value?: string) => value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []

const flattenRoles = (roles: RoleVO[], depth = 0): { label: string; value: string; role: RoleVO }[] =>
  roles.flatMap((role) => [
    { label: `${depth > 0 ? `${'—'.repeat(depth)} ` : ''}${role.roleName}`, value: role.id, role },
    ...flattenRoles(role.children ?? [], depth + 1),
  ])

const RoleBadges = ({ roleName }: { roleName?: string }) => {
  const roles = splitValues(roleName)
  if (roles.length === 0) return <span className="text-muted-foreground">-</span>
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}
    </div>
  )
}

export const UserList = () => {
  const { toast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchWorking, setBatchWorking] = useState(false)

  const [roles, setRoles] = useState<RoleVO[]>([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(() => getAuthUser()?.userId)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<UserVO | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailRequestId = useRef(0)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM)
  const [formKey, setFormKey] = useState(0)
  const [saving, setSaving] = useState(false)

  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [roleTargetIds, setRoleTargetIds] = useState<string[]>([])
  const [roleTargetLabel, setRoleTargetLabel] = useState('')
  const [assignedRoleIds, setAssignedRoleIds] = useState<string[]>([])
  const [roleDialogKey, setRoleDialogKey] = useState(0)
  const [assigningRoles, setAssigningRoles] = useState(false)

  const roleOptions = useMemo(() => flattenRoles(roles), [roles])

  useEffect(() => {
    let cancelled = false
    setRolesLoading(true)
    getRoleTree()
      .then((data) => {
        if (!cancelled) setRoles(data ?? [])
      })
      .catch((err) => {
        if (!cancelled) {
          toast({ title: '加载角色失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
        }
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  useEffect(() => {
    if (currentUserId) return
    getUserInfo()
      .then((user) => setCurrentUserId(user.id))
      .catch(() => undefined)
  }, [currentUserId])

  const fetcher = useCallback(
    (current: number) =>
      getUserList({
        current,
        size: PAGE_SIZE,
        searchValue: search || undefined,
        status: statusFilter === 'all' ? undefined : Number(statusFilter) as 1 | 2,
        roleId: roleFilter === 'all' ? undefined : roleFilter,
      }),
    [search, statusFilter, roleFilter],
  )
  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData<UserVO>(
    fetcher,
    [search, statusFilter, roleFilter],
  )

  useEffect(() => {
    setSelected(new Set())
  }, [current, search, statusFilter, roleFilter])

  useEffect(() => {
    if (!loading && current > Math.max(pages, 1)) {
      setCurrent(Math.max(pages, 1))
    }
  }, [current, loading, pages, setCurrent])

  const isSelf = (userOrId: UserVO | string) =>
    String(typeof userOrId === 'string' ? userOrId : userOrId.id) === String(currentUserId || '')

  const selectableRecords = records.filter((user) => !isSelf(user))
  const allChecked = selectableRecords.length > 0 && selectableRecords.every((user) => selected.has(user.id))

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(selectableRecords.map((user) => user.id)) : new Set())
  }

  const toggleOne = (id: string, checked: boolean) => {
    if (isSelf(id)) return
    setSelected((previous) => {
      const next = new Set(previous)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const clearAndReload = () => {
    setSelected(new Set())
    reload()
  }

  const loadDetail = useCallback(async (id: string) => {
    const requestId = ++detailRequestId.current
    setDetailLoading(true)
    setDetailError(null)
    try {
      const data = await getAdminUserDetail(id)
      if (detailRequestId.current === requestId) setDetail(data)
    } catch (err) {
      if (detailRequestId.current === requestId) {
        setDetailError(err instanceof Error ? err.message : '加载详情失败')
      }
    } finally {
      if (detailRequestId.current === requestId) setDetailLoading(false)
    }
  }, [])

  const openDetail = (user: UserVO) => {
    setDetail(user)
    setDetailOpen(true)
    loadDetail(user.id)
  }

  const openCreate = () => {
    setFormMode('create')
    setForm({ ...EMPTY_FORM })
    setFormKey((key) => key + 1)
    setFormOpen(true)
  }

  const openEdit = (user: UserVO) => {
    setFormMode('edit')
    setForm({
      id: user.id,
      account: user.account,
      name: user.name || '',
      realName: user.realName || '',
      password: '',
      email: user.email || '',
      phone: user.phone || '',
      roleIds: [],
    })
    setFormKey((key) => key + 1)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.account.trim()) {
      toast({ title: '账号不能为空', variant: 'destructive' })
      return
    }
    if (formMode === 'create' && (!form.password || form.roleIds.length === 0)) {
      toast({ title: '初始密码和角色为必填项', variant: 'destructive' })
      return
    }

    const payload: UserSubmitDTO = {
      id: form.id,
      account: form.account.trim(),
      name: form.name.trim() || form.account.trim(),
      realName: form.realName.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      ...(formMode === 'create' ? { password: form.password, roleIds: form.roleIds } : {}),
    }

    setSaving(true)
    try {
      const saved = await submitUser(payload)
      toast({ title: formMode === 'create' ? '用户已创建' : '用户资料已更新' })
      setFormOpen(false)
      if (detail?.id === saved.id) setDetail(saved)
      clearAndReload()
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const openRoleDialog = (targets: UserVO[]) => {
    const ids = targets.map((user) => user.id).filter((id) => !isSelf(id))
    if (ids.length === 0) {
      toast({ title: '当前账号不能修改自己的角色', variant: 'destructive' })
      return
    }
    setRoleTargetIds(ids)
    setRoleTargetLabel(targets.length === 1 ? targets[0].name || targets[0].account : `${ids.length} 位用户`)
    setAssignedRoleIds(targets.length === 1 ? splitValues(targets[0].roleId) : [])
    setRoleDialogKey((key) => key + 1)
    setRoleDialogOpen(true)
  }

  const openBatchRoleDialog = () => {
    const targets = records.filter((user) => selected.has(user.id))
    openRoleDialog(targets)
  }

  const handleAssignRoles = async () => {
    if (assignedRoleIds.length === 0) {
      toast({ title: '至少选择一个角色', variant: 'destructive' })
      return
    }
    setAssigningRoles(true)
    try {
      await grantUserRoles(roleTargetIds.join(','), assignedRoleIds.join(','))
      toast({ title: '角色已更新', description: '用户重新登录或刷新令牌后权限生效' })
      setRoleDialogOpen(false)
      if (roleTargetIds.length === 1 && detail?.id === roleTargetIds[0]) {
        loadDetail(roleTargetIds[0])
      }
      clearAndReload()
    } catch (err) {
      toast({ title: '角色设置失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setAssigningRoles(false)
    }
  }

  const handleStatus = async (ids: string[], status: 1 | 2) => {
    if (ids.some(isSelf)) {
      toast({ title: '不能启停当前登录账号', variant: 'destructive' })
      return
    }
    if (status === 2 && !window.confirm(`确认禁用选中的 ${ids.length} 个账号？禁用后账号无法登录。`)) return
    setBatchWorking(true)
    try {
      await (status === 1 ? enableUsers(ids.join(',')) : disableUsers(ids.join(',')))
      toast({ title: status === 1 ? '账号已启用' : '账号已禁用' })
      clearAndReload()
    } catch (err) {
      toast({ title: '操作失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBatchWorking(false)
    }
  }

  const handleReset = async (ids: string[]) => {
    if (ids.some(isSelf)) {
      toast({ title: '不能通过管理员操作重置当前账号密码', variant: 'destructive' })
      return
    }
    if (!window.confirm(`确认重置选中的 ${ids.length} 个账号密码？密码将恢复为系统初始密码。`)) return
    setBatchWorking(true)
    try {
      await resetUserPassword(ids.join(','))
      toast({ title: '密码已重置', description: `${ids.length} 个账号已恢复为初始密码` })
      setSelected(new Set())
    } catch (err) {
      toast({ title: '重置失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBatchWorking(false)
    }
  }

  const handleRemove = async (ids: string[]) => {
    if (ids.some(isSelf)) {
      toast({ title: '不能删除当前登录账号', variant: 'destructive' })
      return
    }
    if (!window.confirm(`确认删除选中的 ${ids.length} 个用户？该操作不可恢复。`)) return
    setBatchWorking(true)
    try {
      await removeUsers(ids.join(','))
      toast({ title: '用户已删除' })
      if (detail && ids.includes(detail.id)) setDetailOpen(false)
      clearAndReload()
    } catch (err) {
      toast({ title: '删除失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBatchWorking(false)
    }
  }

  const UserActions = ({ user }: { user: UserVO }) => {
    const self = isSelf(user)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11 sm:size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openDetail(user)}>
            <Eye className="mr-2 size-4" />查看详情
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openEdit(user)}>
            <Pencil className="mr-2 size-4" />编辑资料
          </DropdownMenuItem>
          <DropdownMenuItem disabled={self} onClick={() => openRoleDialog([user])}>
            <ShieldCheck className="mr-2 size-4" />设置角色
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={self} onClick={() => handleReset([user.id])}>
            <KeyRound className="mr-2 size-4" />重置密码
          </DropdownMenuItem>
          {user.status === 2 ? (
            <DropdownMenuItem disabled={self} onClick={() => handleStatus([user.id], 1)}>
              <CircleCheck className="mr-2 size-4" />启用账号
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={self} onClick={() => handleStatus([user.id], 2)}>
              <Ban className="mr-2 size-4" />禁用账号
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={self} className="text-destructive" onClick={() => handleRemove([user.id])}>
            <Trash2 className="mr-2 size-4" />删除用户
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const batchIds = [...selected]

  const desktopList = (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allChecked} onCheckedChange={(checked) => toggleAll(checked === true)} aria-label="全选" />
                </TableHead>
                <TableHead>用户</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>角色</TableHead>
                <TableHead className="hidden xl:table-cell">手机</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="hidden 2xl:table-cell">所属租户</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground"><Loader2 className="mx-auto size-5 animate-spin" /></TableCell></TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="space-y-3"><div className="text-destructive">{error}</div><Button size="sm" variant="outline" onClick={reload}>重新加载</Button></div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && records.length === 0 && (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">暂无用户</TableCell></TableRow>
              )}
              {!loading && !error && records.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(user.id)}
                      disabled={isSelf(user)}
                      onCheckedChange={(checked) => toggleOne(user.id, checked === true)}
                      aria-label={`选择 ${user.account}`}
                    />
                  </TableCell>
                  <TableCell>
                    <button type="button" className="flex items-center gap-3 text-left" onClick={() => openDetail(user)}>
                      <Avatar className="size-8">
                        {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                        <AvatarFallback>{(user.name || user.account || '?').slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{user.name || user.realName || '-'}</div>
                        <div className="text-xs text-muted-foreground">{user.email || '-'}</div>
                      </div>
                    </button>
                  </TableCell>
                  <TableCell>{user.account}{isSelf(user) && <Badge variant="outline" className="ml-2">当前账号</Badge>}</TableCell>
                  <TableCell><RoleBadges roleName={user.roleName} /></TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">{user.phone || '-'}</TableCell>
                  <TableCell>
                    {user.status === 2 ? <StatusBadge variant="danger">已禁用</StatusBadge> : <StatusBadge variant="success">正常</StatusBadge>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground 2xl:table-cell">{user.tenantId || '-'}</TableCell>
                  <TableCell><UserActions user={user} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
      </CardContent>
    </Card>
  )

  const mobileList = (
    <div className="space-y-3">
      {loading && <Card><CardContent className="flex h-32 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></CardContent></Card>}
      {!loading && error && (
        <Card><CardContent className="space-y-3 py-8 text-center"><div className="text-destructive">{error}</div><Button variant="outline" onClick={reload}>重新加载</Button></CardContent></Card>
      )}
      {!loading && !error && records.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">暂无用户</CardContent></Card>}
      {!loading && !error && records.map((user) => (
        <Card key={user.id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                className="mt-3"
                checked={selected.has(user.id)}
                disabled={isSelf(user)}
                onCheckedChange={(checked) => toggleOne(user.id, checked === true)}
                aria-label={`选择 ${user.account}`}
              />
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openDetail(user)}>
                <Avatar className="size-11">
                  {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                  <AvatarFallback>{(user.name || user.account || '?').slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-medium">{user.name || user.realName || user.account}</div>
                  <div className="truncate text-sm text-muted-foreground">{user.account}</div>
                </div>
              </button>
              <UserActions user={user} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              {user.status === 2 ? <StatusBadge variant="danger">已禁用</StatusBadge> : <StatusBadge variant="success">正常</StatusBadge>}
              {isSelf(user) && <Badge variant="outline">当前账号</Badge>}
              <RoleBadges roleName={user.roleName} />
            </div>
          </CardContent>
        </Card>
      ))}
      <Card><TablePagination current={current} pages={pages} total={total} onChange={setCurrent} /></Card>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="管理当前租户的账户资料、状态与角色"
        actions={<Button onClick={openCreate}><Plus className="mr-1 size-4" />新建用户</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索姓名 / 账号 / 邮箱 / 手机（回车）"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && setSearch(keyword.trim())}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="1">正常</SelectItem>
            <SelectItem value="2">已禁用</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter} disabled={rolesLoading}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="角色" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部角色</SelectItem>
            {roleOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 位用户</span>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <span className="mr-2 text-sm text-muted-foreground">已选 {selected.size} 位用户</span>
          <Button size="sm" variant="outline" onClick={openBatchRoleDialog} disabled={batchWorking}><ShieldCheck className="mr-1 size-4" />设置角色</Button>
          <Button size="sm" variant="outline" onClick={() => handleStatus(batchIds, 1)} disabled={batchWorking}><CircleCheck className="mr-1 size-4" />启用</Button>
          <Button size="sm" variant="outline" onClick={() => handleStatus(batchIds, 2)} disabled={batchWorking}><Ban className="mr-1 size-4" />禁用</Button>
          <Button size="sm" variant="outline" onClick={() => handleReset(batchIds)} disabled={batchWorking}><KeyRound className="mr-1 size-4" />重置密码</Button>
          <Button size="sm" variant="destructive" onClick={() => handleRemove(batchIds)} disabled={batchWorking}><Trash2 className="mr-1 size-4" />删除</Button>
          {batchWorking && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      )}

      <DeviceSwitch mobile={mobileList} desktop={desktopList} />

      <Sheet open={detailOpen} onOpenChange={(open) => {
        setDetailOpen(open)
        if (!open) detailRequestId.current += 1
      }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detail?.name || detail?.account || '用户详情'}</SheetTitle>
            <SheetDescription>用户资料、账号状态与角色信息</SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="mt-6 space-y-6">
              {detailLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在刷新详情…</div>}
              {detailError && <div className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{detailError}</div>}
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  {detail.avatar && <AvatarImage src={detail.avatar} alt={detail.name} />}
                  <AvatarFallback><UserRound className="size-6" /></AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-lg font-semibold">{detail.name || detail.realName || detail.account}</div>
                  <div className="text-sm text-muted-foreground">{detail.account}</div>
                  <div className="mt-2 flex gap-2">
                    {detail.status === 2 ? <StatusBadge variant="danger">已禁用</StatusBadge> : <StatusBadge variant="success">正常</StatusBadge>}
                    {isSelf(detail) && <Badge variant="outline">当前账号</Badge>}
                  </div>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border p-4 text-sm">
                {[
                  ['真名', detail.realName || '-'],
                  ['邮箱', detail.email || '-'],
                  ['手机', detail.phone || '-'],
                  ['租户', detail.tenantId || '-'],
                  ['角色别名', detail.roleAlias || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="break-all text-right">{value}</span></div>
                ))}
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">角色</div>
                <RoleBadges roleName={detail.roleName} />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => openEdit(detail)}><Pencil className="mr-1 size-4" />编辑资料</Button>
                <Button disabled={isSelf(detail)} onClick={() => openRoleDialog([detail])}><ShieldCheck className="mr-1 size-4" />设置角色</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{formMode === 'create' ? '新建用户' : '编辑用户资料'}</DialogTitle>
            <DialogDescription>
              {formMode === 'create' ? '创建当前租户的账户并设置初始角色' : '账号资料修改不影响密码、状态和角色'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2"><Label>账号 *</Label><Input value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value })} /></div>
            <div className="grid gap-2"><Label>昵称</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div className="grid gap-2"><Label>真名</Label><Input value={form.realName} onChange={(event) => setForm({ ...form, realName: event.target.value })} /></div>
            {formMode === 'create' && (
              <div className="grid gap-2 sm:col-span-2"><Label>初始密码 *</Label><Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div>
            )}
            <div className="grid gap-2"><Label>邮箱</Label><Input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
            <div className="grid gap-2"><Label>手机</Label><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
            {formMode === 'create' && (
              <div className="grid gap-2 sm:col-span-2">
                <Label>角色 *</Label>
                <MultiSelect
                  key={`create-roles-${formKey}`}
                  options={roleOptions.map(({ label, value }) => ({ label, value }))}
                  defaultValue={form.roleIds}
                  onValueChange={(roleIds) => setForm((previous) => ({ ...previous, roleIds }))}
                  placeholder={rolesLoading ? '正在加载角色…' : '选择一个或多个角色'}
                  disabled={rolesLoading}
                  className="min-h-11"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}{formMode === 'create' ? '创建' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>设置角色</DialogTitle>
            <DialogDescription>为 {roleTargetLabel} 替换完整角色集合；权限在重新登录或刷新令牌后生效。</DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <MultiSelect
              key={`assign-roles-${roleDialogKey}`}
              options={roleOptions.map(({ label, value }) => ({ label, value }))}
              defaultValue={assignedRoleIds}
              onValueChange={setAssignedRoleIds}
              placeholder="选择一个或多个角色"
              disabled={rolesLoading}
              className="min-h-11"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>取消</Button>
            <Button onClick={handleAssignRoles} disabled={assigningRoles}>{assigningRoles && <Loader2 className="mr-2 size-4 animate-spin" />}替换角色</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
