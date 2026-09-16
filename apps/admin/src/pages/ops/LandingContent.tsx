import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, toast } from '@kn/ui'
import { Loader2, Save, Rocket, RotateCcw } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { formatDateTime } from '@/lib/use-paged-data'
import {
  getOpsContent,
  getOpsContentList,
  getOpsContentRevisions,
  publishOpsContent,
  rollbackOpsContent,
  saveOpsContentDraft,
  type OpsContent,
  type OpsContentRevision,
} from '@/api/ops'

const LOCALES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

// docs.* 键同样可覆盖：落地页 Docs 页有 279 处走 i18n，等价于文档内容数据化
const SUGGESTED_KEYS = ['landing.copy', 'landing.home', 'landing.docs', 'landing.seo']

/**
 * 落地页文案 CMS：按内容键 + 语言维护「i18n 键 → 文案」覆盖表。
 * 未覆盖的键继续使用落地页内置 resources.ts。
 */
export const LandingContent = () => {
  const [locale, setLocale] = useState('zh')
  const [key, setKey] = useState('landing.copy')
  const [draftText, setDraftText] = useState('{}')
  const [entry, setEntry] = useState<OpsContent | null>(null)
  const [revisions, setRevisions] = useState<OpsContentRevision[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<OpsContent[]>([])

  const load = useCallback(() => {
    setLoading(true)
    getOpsContent(key, locale)
      .then((res) => {
        setEntry(res)
        setDraftText(JSON.stringify(res?.draft ?? {}, null, 2))
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [key, locale])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    getOpsContentList().then(setExisting).catch(() => undefined)
  }, [])

  const parseDraft = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(draftText)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        toast.error('草稿必须是 JSON 对象')
        return null
      }
      return parsed as Record<string, unknown>
    } catch {
      toast.error('JSON 解析失败，请检查格式')
      return null
    }
  }

  const saveDraft = async () => {
    const draft = parseDraft()
    if (!draft) return false
    setSaving(true)
    try {
      await saveOpsContentDraft(key, locale, draft)
      toast.success('草稿已保存')
      load()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
      return false
    } finally {
      setSaving(false)
    }
  }

  const publish = async () => {
    const ok = await saveDraft()
    if (!ok) return
    setSaving(true)
    try {
      await publishOpsContent(key, locale)
      toast.success('已发布，落地页将实时生效')
      load()
      loadRevisions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发布失败')
    } finally {
      setSaving(false)
    }
  }

  const loadRevisions = useCallback(() => {
    getOpsContentRevisions(key, locale).then(setRevisions).catch(() => setRevisions([]))
  }, [key, locale])

  useEffect(() => {
    loadRevisions()
  }, [loadRevisions])

  const rollback = async (version: number) => {
    try {
      await rollbackOpsContent(key, locale, version)
      toast.success(`已回滚到 v${version} 的草稿，确认后再发布`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '回滚失败')
    }
  }

  const keyCount = (() => {
    try {
      const parsed = JSON.parse(draftText)
      return parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0
    } catch {
      return 0
    }
  })()

  return (
    <div>
      <PageHeader
        title="落地页内容"
        description="在不发版的前提下覆盖落地页文案；未覆盖的键使用内置文案兜底"
        actions={
          <>
            <Button variant="outline" onClick={saveDraft} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
              保存草稿
            </Button>
            <Button onClick={publish} disabled={saving}>
              <Rocket className="mr-1.5 size-4" />
              发布
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>文案编辑</CardTitle>
            <CardDescription>
              内容键「{key}」· {locale === 'zh' ? '中文' : 'English'} · 当前 {keyCount} 条覆盖
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border p-0.5">
                {LOCALES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setLocale(item.value)}
                    className={`rounded-md px-3 py-1 text-sm ${locale === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value.trim())}
                className="w-56 rounded-md border bg-background px-3 py-1.5 text-sm"
                placeholder="landing.copy"
              />
              {SUGGESTED_KEYS.filter((k) => existing.every((e) => e.contentKey !== k || e.locale !== locale)).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKey(k)}
                  className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  {k}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : (
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                spellCheck={false}
                rows={22}
                className="w-full rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed"
                placeholder={'{\n  "home.hero-cta-primary": "立即体验"\n}'}
              />
            )}

            {entry?.publishedAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                当前线上版本 v{entry.contentVersion} · 发布于 {formatDateTime(entry.publishedAt)}
                {entry.updatedBy ? ` · 操作人 ${entry.updatedBy}` : ''}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>历史版本</CardTitle>
            <CardDescription>发布时自动留档，可回滚到任意版本</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>版本</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">暂无历史版本</TableCell>
                  </TableRow>
                )}
                {revisions.map((rev) => (
                  <TableRow key={rev.id}>
                    <TableCell className="font-medium">v{rev.contentVersion}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(rev.createTime)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => rollback(rev.contentVersion)}>
                        <RotateCcw className="mr-1 size-3.5" />
                        回滚
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
