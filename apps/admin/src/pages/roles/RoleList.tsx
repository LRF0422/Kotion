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
  useToast,
} from '@kn/ui'
import { MoreHorizontal, Plus, Search, Pencil, Trash2, Loader2, ShieldCheck } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import { getRoleList, removeRoles, submitRole, type RoleVO } from '@/api'
import { usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

interface RoleForm {
  id?: string
  roleName: string
  roleAlias: string
  sort: string
}

const EMPTY_FORM: RoleForm = { roleName: '', roleAlias: '', sort: '1' }

export const RoleList = () => {
  const { toast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM)

  const fetcher = useCallback(
    (current: number) => getRoleList({ current, pageSize: PAGE_SIZE, searchValue: search || undefined }),
    [search],
  )
  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData<RoleVO>(
    fetcher,
    [search],
  )

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (role: RoleVO) => {
    setForm({
      id: role.id,
      roleName: role.roleName || '',
      roleAlias: role.roleAlias || '',
      sort: String(role.sort ?? 1),
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.roleName) {
      toast({ title: '请输入角色名称', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await submitRole({
        id: form.id,
        roleName: form.roleName,
        roleAlias: form.roleAlias || form.roleName,
        sort: Number(form.sort) || 1,
      })
      toast({ title: form.id ? '角色已更新' : '角色已创建' })
      setDialogOpen(false)
      reload()
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (role: RoleVO) => {
    if (!window.confirm(`确认删除角色「${role.roleName}」？`)) return
    try {
      await removeRoles(String(role.id))
      toast({ title: '角色已删除' })
      reload()
    } catch (err) {
      toast({ title: '删除失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div>
      <PageHeader
        title="角色权限"
        description="管理平台角色与权限分配"
        actions={(
          <Button onClick={openCreate}>
            <Plus className="mr-1 size-4" />
            新建角色
          </Button>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索角色名称（回车）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(keyword.trim())}
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 个角色</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>角色名称</TableHead>
                <TableHead>角色别名</TableHead>
                <TableHead>上级角色</TableHead>
                <TableHead>用户数</TableHead>
                <TableHead>类型</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-destructive">{error}</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">暂无角色</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <ShieldCheck className="size-4 text-muted-foreground" />
                      {role.roleName}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{role.roleAlias || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{role.parentName || '-'}</TableCell>
                  <TableCell>{role.userCount ?? '-'}</TableCell>
                  <TableCell>
                    {role.admin
                      ? <StatusBadge variant="info">管理员</StatusBadge>
                      : <StatusBadge variant="muted">普通角色</StatusBadge>}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(role)}>
                          <Pencil className="mr-2 size-4" />
                          编辑角色
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleRemove(role)}>
                          <Trash2 className="mr-2 size-4" />
                          删除角色
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
            <DialogTitle>{form.id ? '编辑角色' : '新建角色'}</DialogTitle>
            <DialogDescription>角色保存后可在用户管理中为用户分配</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>角色名称 *</Label>
              <Input value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>角色别名</Label>
              <Input value={form.roleAlias} onChange={(e) => setForm({ ...form, roleAlias: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>排序</Label>
              <Input value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
