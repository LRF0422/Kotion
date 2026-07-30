import { useCallback, useState } from 'react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
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
  Search,
  Loader2,
  FolderKanban,
  MoreHorizontal,
  Eye,
  Archive,
  ArchiveRestore,
  Ban,
  CircleCheck,
} from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { TablePagination } from '@/components/TablePagination'
import {
  archiveSpace,
  getAdminSpaceDetail,
  getAdminSpaceMembers,
  getSpaceList,
  unarchiveSpace,
  updateSpaceStatus,
  type AdminSpaceDetailVO,
  type SpaceMemberDTO,
  type SpaceType,
  type SpaceVO,
} from '@/api'
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
  const { toast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // 详情抽屉
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<AdminSpaceDetailVO | null>(null)
  const [members, setMembers] = useState<SpaceMemberDTO[]>([])

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
  const { records, total, pages, current, setCurrent, loading, error, reload } = usePagedData<SpaceVO>(
    fetcher,
    [search, typeFilter],
  )

  const openDetail = async (space: SpaceVO) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    setMembers([])
    try {
      const [detailData, memberData] = await Promise.all([
        getAdminSpaceDetail(String(space.id)),
        getAdminSpaceMembers(String(space.id)).catch(() => []),
      ])
      setDetail(detailData)
      setMembers(memberData)
    } catch (err) {
      toast({ title: '加载详情失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleArchive = async (space: SpaceVO) => {
    const archiving = !space.archived
    if (archiving && !window.confirm(`确认归档空间「${space.name}」？归档后空间只读。`)) return
    try {
      await (archiving ? archiveSpace(String(space.id)) : unarchiveSpace(String(space.id)))
      toast({ title: archiving ? '空间已归档' : '已取消归档', description: space.name })
      reload()
    } catch (err) {
      toast({ title: '操作失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const handleToggleStatus = async (space: SpaceVO) => {
    const disabling = space.status !== 'IN_ACTIVE'
    if (disabling && !window.confirm(`确认停用空间「${space.name}」？停用后所有成员无法访问。`)) return
    try {
      await updateSpaceStatus(String(space.id), disabling ? 'IN_ACTIVE' : 'ACTIVE')
      toast({ title: disabling ? '空间已停用' : '空间已启用', description: space.name })
      reload()
    } catch (err) {
      toast({ title: '操作失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const detailSpace = detail?.space

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
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">暂无空间</TableCell>
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
                        ? <StatusBadge variant="danger">已停用</StatusBadge>
                        : <StatusBadge variant="success">正常</StatusBadge>}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDateTime(space.createTime)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetail(space)}>
                          <Eye className="mr-2 size-4" />
                          查看详情
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleArchive(space)}>
                          {space.archived
                            ? <><ArchiveRestore className="mr-2 size-4" />取消归档</>
                            : <><Archive className="mr-2 size-4" />归档空间</>}
                        </DropdownMenuItem>
                        {space.status === 'IN_ACTIVE' ? (
                          <DropdownMenuItem onClick={() => handleToggleStatus(space)}>
                            <CircleCheck className="mr-2 size-4" />
                            启用空间
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="text-destructive" onClick={() => handleToggleStatus(space)}>
                            <Ban className="mr-2 size-4" />
                            停用空间
                          </DropdownMenuItem>
                        )}
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

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detailSpace?.name || '空间详情'}</SheetTitle>
            <SheetDescription>{detailSpace?.description || '空间基础信息与成员列表'}</SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : detail && detailSpace ? (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xl font-semibold">{detail.memberCount}</div>
                  <div className="text-xs text-muted-foreground">成员数</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xl font-semibold">{detail.pageCount}</div>
                  <div className="text-xs text-muted-foreground">页面数</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="pt-1">
                    {detailSpace.archived
                      ? <StatusBadge variant="muted">已归档</StatusBadge>
                      : detailSpace.status === 'IN_ACTIVE'
                        ? <StatusBadge variant="danger">已停用</StatusBadge>
                        : <StatusBadge variant="success">正常</StatusBadge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">状态</div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">类型</span>
                  <span>{TYPE_LABEL[detailSpace.type || ''] || detailSpace.type || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">拥有者</span>
                  <span>{detailSpace.nickName || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">可见性</span>
                  <span>{detailSpace.visibility || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">创建时间</span>
                  <span>{formatDateTime(detailSpace.createTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">更新时间</span>
                  <span>{formatDateTime(detailSpace.updateTime)}</span>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">成员（{members.length}）</div>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>成员</TableHead>
                        <TableHead>角色</TableHead>
                        <TableHead className="text-right">加入时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">暂无成员</TableCell>
                        </TableRow>
                      )}
                      {members.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="size-7">
                                {member.avatar && <AvatarImage src={member.avatar} alt={member.name} />}
                                <AvatarFallback>{(member.name || '?').slice(0, 1)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="text-sm font-medium">{member.name || '-'}</div>
                                <div className="text-xs text-muted-foreground">{member.email || '-'}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{member.role || '-'}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatDateTime(member.joinedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
