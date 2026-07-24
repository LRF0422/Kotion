import { useCallback, useState } from 'react'
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
  useToast,
} from '@kn/ui'
import { Check, Loader2, RotateCcw, Search, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import { deleteComment, getCommentList, toggleCommentResolved, type PageCommentDTO } from '@/api'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

export const CommentList = () => {
  const { toast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState('all')

  const fetcher = useCallback(
    (current: number) =>
      getCommentList({
        current,
        pageSize: PAGE_SIZE,
        searchValue: search || undefined,
        resolved: statusTab === 'all' ? undefined : statusTab === 'resolved',
      }),
    [search, statusTab],
  )
  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData<PageCommentDTO>(
    fetcher,
    [search, statusTab],
  )

  const handleToggleResolved = async (comment: PageCommentDTO) => {
    try {
      await toggleCommentResolved(comment.id)
      toast({ title: comment.resolved ? '评论已重新打开' : '评论已标记为解决' })
      reload()
    } catch (err) {
      toast({ title: '操作失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const handleDelete = async (comment: PageCommentDTO) => {
    if (!window.confirm('确认删除这条评论？此操作不可恢复。')) return
    try {
      await deleteComment(comment.id)
      toast({ title: '评论已删除' })
      reload()
    } catch (err) {
      toast({ title: '删除失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div>
      <PageHeader title="评论管理" description="查看平台内页面评论，处理违规与未解决内容" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="open">未解决</TabsTrigger>
            <TabsTrigger value="resolved">已解决</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索评论内容（回车）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(keyword.trim())}
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 条评论</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36%]">评论内容</TableHead>
                <TableHead>所在页面</TableHead>
                <TableHead>评论人</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="w-44">操作</TableHead>
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
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">暂无评论</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((comment) => (
                <TableRow key={comment.id}>
                  <TableCell className="max-w-0 truncate" title={comment.content}>{comment.content}</TableCell>
                  <TableCell className="text-muted-foreground">{comment.pageTitle || '-'}</TableCell>
                  <TableCell>{comment.userName || '-'}</TableCell>
                  <TableCell>
                    {comment.resolved
                      ? <StatusBadge variant="success">已解决</StatusBadge>
                      : <StatusBadge variant="warning">未解决</StatusBadge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(comment.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleToggleResolved(comment)}>
                        {comment.resolved
                          ? <><RotateCcw className="mr-1 size-3.5" />重开</>
                          : <><Check className="mr-1 size-3.5" />解决</>}
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDelete(comment)}>
                        <Trash2 className="mr-1 size-3.5" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination current={current} pages={pages} total={total} onChange={setCurrent} />
        </CardContent>
      </Card>
    </div>
  )
}
