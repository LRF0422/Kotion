import { useCallback, useState } from 'react'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  useToast,
} from '@kn/ui'
import { MoreHorizontal, Plus, Search, KeyRound, Trash2, Loader2, Ban, CircleCheck } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import { disableUsers, enableUsers, getUserList, removeUsers, resetUserPassword, submitUser, type UserVO } from '@/api'
import { usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

export const UserList = () => {
  const { toast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ account: '', name: '', password: '', email: '', phone: '' })

  const fetcher = useCallback(
    (current: number) => getUserList({ current, size: PAGE_SIZE, searchValue: search || undefined }),
    [search],
  )
  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData<UserVO>(
    fetcher,
    [search],
  )

  const handleCreate = async () => {
    if (!form.account || !form.password) {
      toast({ title: '账号和密码为必填项', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await submitUser({ ...form, name: form.name || form.account })
      toast({ title: '用户已创建' })
      setDialogOpen(false)
      setForm({ account: '', name: '', password: '', email: '', phone: '' })
      reload()
    } catch (err) {
      toast({ title: '创建失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async (user: UserVO) => {
    try {
      await resetUserPassword(String(user.id))
      toast({ title: '密码已重置', description: `账号 ${user.account} 的密码已恢复为初始密码` })
    } catch (err) {
      toast({ title: '重置失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const handleToggleStatus = async (user: UserVO) => {
    const disabling = user.status !== 2
    if (disabling && !window.confirm(`确认禁用用户「${user.name || user.account}」？禁用后该账号无法登录。`)) return
    try {
      await (disabling ? disableUsers(String(user.id)) : enableUsers(String(user.id)))
      toast({ title: disabling ? '用户已禁用' : '用户已启用', description: user.account })
      reload()
    } catch (err) {
      toast({ title: '操作失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const handleRemove = async (user: UserVO) => {
    if (!window.confirm(`确认删除用户「${user.name || user.account}」？该操作不可恢复。`)) return
    try {
      await removeUsers(String(user.id))
      toast({ title: '用户已删除' })
      reload()
    } catch (err) {
      toast({ title: '删除失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="管理平台账户、状态与角色分配"
        actions={(
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 size-4" />
            新建用户
          </Button>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索姓名 / 账号（回车）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(keyword.trim())}
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 位用户</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>手机</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>所属租户</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-destructive">{error}</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">暂无用户</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                        <AvatarFallback>{(user.name || user.account || '?').slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{user.name || user.realName || '-'}</div>
                        <div className="text-xs text-muted-foreground">{user.email || '-'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user.account}</TableCell>
                  <TableCell>{user.roleName || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{user.phone || '-'}</TableCell>
                  <TableCell>
                    {user.status === 2
                      ? <StatusBadge variant="danger">已禁用</StatusBadge>
                      : <StatusBadge variant="success">正常</StatusBadge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.tenantId || '-'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                          <KeyRound className="mr-2 size-4" />
                          重置密码
                        </DropdownMenuItem>
                        {user.status === 2 ? (
                          <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                            <CircleCheck className="mr-2 size-4" />
                            启用账号
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                            <Ban className="mr-2 size-4" />
                            禁用账号
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onClick={() => handleRemove(user)}>
                          <Trash2 className="mr-2 size-4" />
                          删除用户
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
            <DialogDescription>创建平台账户，密码可由用户登录后自行修改</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>账号 *</Label>
              <Input value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>昵称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>初始密码 *</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>邮箱</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>手机</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
