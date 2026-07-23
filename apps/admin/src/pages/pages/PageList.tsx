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
import { MoreHorizontal, Search, History, Eye, RotateCcw, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { MOCK_PAGES, type AdminPage } from '@/mock/data'

const STATUS_META: Record<AdminPage['status'], { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  published: { label: '已发布', variant: 'success' },
  draft: { label: '草稿', variant: 'warning' },
  trashed: { label: '回收站', variant: 'muted' },
}

export const PageList = () => {
  const { toast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [statusTab, setStatusTab] = useState('all')

  const filtered = useMemo(() => {
    return MOCK_PAGES.filter((page) => {
      const matchKeyword = !keyword || page.title.includes(keyword) || page.author.includes(keyword)
      const matchStatus = statusTab === 'all' || page.status === statusTab
      return matchKeyword && matchStatus
    })
  }, [keyword, statusTab])

  return (
    <div>
      <PageHeader title="页面管理" description="平台全部页面的检索、版本与回收站管理" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="published">已发布</TabsTrigger>
            <TabsTrigger value="draft">草稿</TabsTrigger>
            <TabsTrigger value="trashed">回收站</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索标题 / 作者"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">共 {filtered.length} 个页面</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>页面标题</TableHead>
                <TableHead>所属空间</TableHead>
                <TableHead>作者</TableHead>
                <TableHead>块数量</TableHead>
                <TableHead>版本数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((page) => {
                const meta = STATUS_META[page.status]
                return (
                  <TableRow key={page.id}>
                    <TableCell className="font-medium">{page.title}</TableCell>
                    <TableCell className="text-muted-foreground">{page.space}</TableCell>
                    <TableCell>{page.author}</TableCell>
                    <TableCell>{page.blocks}</TableCell>
                    <TableCell>{page.versions}</TableCell>
                    <TableCell>
                      <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{page.updateTime}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => toast({ title: '查看页面', description: '跳转前台预览，接入后开放' })}>
                            <Eye className="mr-2 size-4" />
                            查看页面
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast({ title: '版本历史', description: '接入版本接口后开放' })}>
                            <History className="mr-2 size-4" />
                            版本历史
                          </DropdownMenuItem>
                          {page.status === 'trashed' ? (
                            <DropdownMenuItem onClick={() => toast({ title: '页面已恢复' })}>
                              <RotateCcw className="mr-2 size-4" />
                              恢复页面
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => toast({ title: '移入回收站', description: '接入后端后开放' })}
                            >
                              <Trash2 className="mr-2 size-4" />
                              移入回收站
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
