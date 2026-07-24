import { useCallback, useState } from 'react'
import {
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
} from '@kn/ui'
import { Search, Loader2, FolderKanban } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import { getSpaceList, type SpaceType, type SpaceVO } from '@/api'
import { formatDateTime, usePagedData } from '@/lib/use-paged-data'

const PAGE_SIZE = 10

const TYPE_LABEL: Record<string, string> = {
  SPACE: '团队空间',
  COLLABORATION: '协作空间',
  PERSONAL: '个人空间',
  TEMPLATE: '模板空间',
  INNER: '系统空间',
  JOURNAL: '日记空间',
}

export const SpaceList = () => {
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const fetcher = useCallback(
    (current: number) =>
      getSpaceList({
        current,
        pageSize: PAGE_SIZE,
        searchValue: search || undefined,
        type: typeFilter === 'all' ? undefined : (typeFilter as SpaceType),
      }),
    [search, typeFilter],
  )
  const { records, total, pages, current, setCurrent, loading, error } = usePagedData<SpaceVO>(
    fetcher,
    [search, typeFilter],
  )

  return (
    <div>
      <PageHeader title="空间管理" description="平台内所有知识空间的运行状况" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索空间名称（回车）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(keyword.trim())}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="SPACE">团队空间</SelectItem>
            <SelectItem value="COLLABORATION">协作空间</SelectItem>
            <SelectItem value="PERSONAL">个人空间</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 个空间</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>空间</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>拥有者</TableHead>
                <TableHead>成员数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">创建时间</TableHead>
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
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">暂无空间</TableCell>
                </TableRow>
              )}
              {!loading && !error && records.map((space) => (
                <TableRow key={space.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                        <FolderKanban className="size-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium">{space.name}</div>
                        <div className="max-w-64 truncate text-xs text-muted-foreground">
                          {space.description || '-'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{TYPE_LABEL[space.type || ''] || space.type || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{space.nickName || '-'}</TableCell>
                  <TableCell>{space.memberCount ?? '-'}</TableCell>
                  <TableCell>
                    {space.archived
                      ? <StatusBadge variant="muted">已归档</StatusBadge>
                      : space.status === 'IN_ACTIVE'
                        ? <StatusBadge variant="danger">已禁用</StatusBadge>
                        : <StatusBadge variant="success">正常</StatusBadge>}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDateTime(space.createTime)}
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
