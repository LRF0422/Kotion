import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from '@kn/ui'
import { Copy, Link2, Loader2, Plus, Trash2 } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { createOpsLink, deleteOpsLink, getOpsLinks, type OpsLink } from '@/api/ops'

const emptyForm = {
  label: '',
  slug: '',
  target: 'https://kotion.top:888',
  channel: 'zhihu',
  utmSource: 'zhihu',
  utmMedium: 'social',
  utmCampaign: 'launch',
}

export const ChannelLinks = () => {
  const [links, setLinks] = useState<OpsLink[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(() => {
    setLoading(true)
    getOpsLinks()
      .then(setLinks)
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const shortUrl = (slug: string) => `${window.location.origin}/api/knowledge-system/ops/go/${slug}`

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(shortUrl(slug))
      toast.success('短链已复制')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const create = async () => {
    if (!form.target.trim()) {
      toast.error('请填写目标地址')
      return
    }
    setCreating(true)
    try {
      await createOpsLink({
        slug: form.slug || undefined,
        target: form.target,
        label: form.label || undefined,
        channel: form.channel || undefined,
        utm: {
          source: form.utmSource,
          medium: form.utmMedium,
          campaign: form.utmCampaign,
        },
      })
      toast.success('短链已创建')
      setForm(emptyForm)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: number) => {
    try {
      await deleteOpsLink(id)
      toast.success('已删除')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <div>
      <PageHeader title="渠道链接" description="为知乎、掘金、V2EX 等渠道生成带 UTM 的短链，点击自动计数" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>新建短链</CardTitle>
          <CardDescription>短链形如 {shortUrl('slug')}，跳转时自动附加 UTM</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {([
              ['label', '名称（如：知乎首发）'],
              ['slug', '短链标识（留空自动生成）'],
              ['target', '目标地址'],
              ['channel', '渠道（zhihu / juejin …）'],
              ['utmSource', 'utm_source'],
              ['utmMedium', 'utm_medium'],
              ['utmCampaign', 'utm_campaign'],
            ] as const).map(([field, placeholder]) => (
              <input
                key={field}
                value={form[field]}
                placeholder={placeholder}
                onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            ))}
          </div>
          <Button className="mt-4" onClick={create} disabled={creating}>
            {creating ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Plus className="mr-1.5 size-4" />}
            创建短链
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>短链列表</CardTitle>
          <CardDescription>共 {links.length} 条</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>短链</TableHead>
                  <TableHead>渠道</TableHead>
                  <TableHead>UTM</TableHead>
                  <TableHead className="text-right">点击</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto size-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && links.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">暂无短链</TableCell>
                  </TableRow>
                )}
                {!loading && links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.label || link.slug}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => copy(link.slug)}
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
                        title={shortUrl(link.slug)}
                      >
                        <Link2 className="size-3.5" />
                        /go/{link.slug}
                        <Copy className="size-3.5" />
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{link.channel || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[link.utmSource, link.utmMedium, link.utmCampaign].filter(Boolean).join(' / ') || '-'}
                    </TableCell>
                    <TableCell className="text-right">{link.clicks ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(link.id)} title="删除">
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
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
