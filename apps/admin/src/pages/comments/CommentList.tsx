import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
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
import { Check, X } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { MOCK_COMMENTS, type AdminComment } from '@/mock/data'

const STATUS_META: Record<AdminComment['status'], { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  pending: { label: '待审核', variant: 'warning' },
  approved: { label: '已通过', variant: 'success' },
  rejected: { label: '已驳回', variant: 'danger' },
}

export const CommentList = () => {
  const { toast } = useToast()
  const [comments, setComments] = useState<AdminComment[]>(MOCK_COMMENTS)
  const [statusTab, setStatusTab] = useState('pending')

  const filtered = useMemo(() => {
    return comments.filter((comment) => statusTab === 'all' || comment.status === statusTab)
  }, [comments, statusTab])

  const review = (id: string, status: 'approved' | 'rejected') => {
    setComments((prev) => prev.map((comment) => (comment.id === id ? { ...comment, status } : comment)))
    toast({ title: status === 'approved' ? '评论已通过' : '评论已驳回' })
  }

  return (
    <div>
      <PageHeader title="评论审核" description="审核页面评论，处理违规与举报内容" />

      <div className="mb-4 flex items-center gap-3">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            <TabsTrigger value="pending">待审核</TabsTrigger>
            <TabsTrigger value="approved">已通过</TabsTrigger>
            <TabsTrigger value="rejected">已驳回</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="ml-auto text-sm text-muted-foreground">共 {filtered.length} 条评论</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[38%]">评论内容</TableHead>
                <TableHead>所在页面</TableHead>
                <TableHead>评论人</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="w-40">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((comment) => {
                const meta = STATUS_META[comment.status]
                return (
                  <TableRow key={comment.id}>
                    <TableCell className="max-w-0 truncate" title={comment.content}>{comment.content}</TableCell>
                    <TableCell className="text-muted-foreground">{comment.page}</TableCell>
                    <TableCell>{comment.author}</TableCell>
                    <TableCell>
                      <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{comment.createTime}</TableCell>
                    <TableCell>
                      {comment.status === 'pending' ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => review(comment.id, 'approved')}>
                            <Check className="mr-1 size-3.5" />
                            通过
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => review(comment.id, 'rejected')}>
                            <X className="mr-1 size-3.5" />
                            驳回
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">已处理</span>
                      )}
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
