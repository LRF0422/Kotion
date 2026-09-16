import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from '@kn/ui'
import { EyeOff, Eye, Loader2, Pin, RefreshCw } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { formatDateTime } from '@/lib/use-paged-data'
import { getOpsChangelog, refreshOpsChangelog, updateOpsChangelog, type OpsChangelog } from '@/api/ops'

export const ChangelogAdmin = () => {
  const [items, setItems] = useState<OpsChangelog[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getOpsChangelog()
      .then(setItems)
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refresh = async () => {
    setRefreshing(true)
    try {
      const res = await refreshOpsChangelog()
      toast.success(`已同步 ${res?.count ?? 0} 条 Release`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '同步失败')
    } finally {
      setRefreshing(false)
    }
  }

  const toggle = async (id: string, payload: { pinned?: boolean; hidden?: boolean }) => {
    try {
      await updateOpsChangelog(id, payload)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    }
  }

  return (
    <div>
      <PageHeader
        title="更新日志"
        description="聚合 GitHub Releases，落地页 /changelog 直接读取"
        actions={
          <Button onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <RefreshCw className="mr-1.5 size-4" />}
            同步 Releases
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Release 列表</CardTitle>
          <CardDescription>置顶会排在落地页最前，隐藏则不在落地页展示</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>版本</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>发布时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto size-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      暂无数据，点击右上角「同步 Releases」
                    </TableCell>
                  </TableRow>
                )}
                {!loading && items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.tag || item.id}</TableCell>
                    <TableCell className="max-w-72 truncate font-medium" title={item.name}>{item.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(item.publishedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title={item.pinned ? '取消置顶' : '置顶'}
                          onClick={() => toggle(item.id, { pinned: !item.pinned })}
                        >
                          <Pin className={`size-4 ${item.pinned ? 'text-primary' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={item.hidden ? '取消隐藏' : '隐藏'}
                          onClick={() => toggle(item.id, { hidden: !item.hidden })}
                        >
                          {item.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
