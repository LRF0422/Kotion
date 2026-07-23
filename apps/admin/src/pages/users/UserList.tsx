import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Input,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Avatar,
  AvatarFallback,
  useToast,
} from '@kn/ui'
import { MoreHorizontal, Plus, Search, KeyRound, Ban, CircleCheck, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { MOCK_USERS, type AdminUser } from '@/mock/data'

export const UserList = () => {
  const { toast } = useToast()
  const [users, setUsers] = useState<AdminUser[]>(MOCK_USERS)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    return users.filter((user) => {
      const matchKeyword = !keyword
        || user.name.includes(keyword)
        || user.account.includes(keyword)
        || user.email.includes(keyword)
      const matchStatus = statusFilter === 'all' || user.status === statusFilter
      return matchKeyword && matchStatus
    })
  }, [users, keyword, statusFilter])

  const toggleStatus = (id: string) => {
    setUsers((prev) => prev.map((user) => (
      user.id === id ? { ...user, status: user.status === 'active' ? 'disabled' : 'active' } : user
    )))
    toast({ title: '用户状态已更新' })
  }

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="管理平台账户、状态与角色分配"
        actions={(
          <Button onClick={() => toast({ title: '新建用户', description: '接入后端 UserController 后开放' })}>
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
            placeholder="搜索姓名 / 账号 / 邮箱"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">正常</SelectItem>
            <SelectItem value="disabled">已禁用</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">共 {filtered.length} 位用户</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>所属租户</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最近登录</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback>{user.name.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user.account}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell className="text-muted-foreground">{user.tenant}</TableCell>
                  <TableCell>
                    {user.status === 'active'
                      ? <StatusBadge variant="success">正常</StatusBadge>
                      : <StatusBadge variant="muted">已禁用</StatusBadge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.lastLogin}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toast({ title: '已发送重置密码邮件' })}>
                          <KeyRound className="mr-2 size-4" />
                          重置密码
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatus(user.id)}>
                          {user.status === 'active'
                            ? <><Ban className="mr-2 size-4" />禁用账户</>
                            : <><CircleCheck className="mr-2 size-4" />启用账户</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => toast({ title: '删除用户', description: '需二次确认，接入后端后开放' })}
                        >
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
        </CardContent>
      </Card>
    </div>
  )
}
