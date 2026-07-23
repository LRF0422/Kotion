import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useToast,
} from '@kn/ui'
import { MoreHorizontal, Search, Archive, ArchiveRestore, Users, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { MOCK_SPACES, type AdminSpace } from '@/mock/data'

export const SpaceList = () => {
  const { toast } = useToast()
  const [spaces, setSpaces] = useState<AdminSpace[]>(MOCK_SPACES)
  const [keyword, setKeyword] = useState('')
  const [typeTab, setTypeTab] = useState('all')

  const filtered = useMemo(() => {
    return spaces.filter((space) => {
      const matchKeyword = !keyword || space.name.includes(keyword) || space.owner.includes(keyword)
      const matchType = typeTab === 'all' || space.type === typeTab
      return matchKeyword && matchType
    })
  }, [spaces, keyword, typeTab])

  const toggleArchive = (id: string) => {
    setSpaces((prev) => prev.map((space) => (
      space.id === id ? { ...space, status: space.status === 'normal' ? 'archived' : 'normal' } : space
    )))
    toast({ title: '空间状态已更新' })
  }

  return (
    <div>
      <PageHeader title="空间管理" description="管理个人空间与团队协作空间" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={typeTab} onValueChange={setTypeTab}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="team">团队空间</TabsTrigger>
            <TabsTrigger value="personal">个人空间</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索空间名 / 所有者"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">共 {filtered.length} 个空间</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>空间名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>所有者</TableHead>
                <TableHead>成员数</TableHead>
                <TableHead>页面数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((space) => (
                <TableRow key={space.id}>
                  <TableCell className="font-medium">{space.name}</TableCell>
                  <TableCell>
                    {space.type === 'team'
                      ? <StatusBadge variant="info">团队</StatusBadge>
                      : <StatusBadge variant="muted">个人</StatusBadge>}
                  </TableCell>
                  <TableCell>{space.owner}</TableCell>
                  <TableCell>{space.memberCount}</TableCell>
                  <TableCell>{space.pageCount}</TableCell>
                  <TableCell>
                    {space.status === 'normal'
                      ? <StatusBadge variant="success">正常</StatusBadge>
                      : <StatusBadge variant="warning">已归档</StatusBadge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{space.createTime}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toast({ title: '成员管理', description: '接入后端后开放' })}>
                          <Users className="mr-2 size-4" />
                          成员管理
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleArchive(space.id)}>
                          {space.status === 'normal'
                            ? <><Archive className="mr-2 size-4" />归档空间</>
                            : <><ArchiveRestore className="mr-2 size-4" />恢复空间</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => toast({ title: '删除空间', description: '需二次确认，接入后端后开放' })}
                        >
                          <Trash2 className="mr-2 size-4" />
                          删除空间
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
