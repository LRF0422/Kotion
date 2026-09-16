import { useEffect, useState } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, toast } from '@kn/ui'
import { Loader2, Save } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { getOpsSettings, saveOpsSettings } from '@/api/ops'

const SUGGESTED = [
  'public.seo.title',
  'public.seo.description',
  'public.seo.og-image',
  'public.social.github',
  'public.social.zhihu',
]

/** 公开设置：仅 public.* 前缀会通过 /ops/settings 暴露给落地页。 */
export const SeoSettings = () => {
  const [text, setText] = useState('{}')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    getOpsSettings()
      .then((settings) => {
        const publicOnly = Object.fromEntries(
          Object.entries(settings || {}).filter(([key]) => key.startsWith('public.')),
        )
        setText(JSON.stringify(publicOnly, null, 2))
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    let parsed: Record<string, string>
    try {
      const value = JSON.parse(text)
      if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape')
      parsed = value as Record<string, string>
    } catch {
      toast.error('必须是 JSON 对象')
      return
    }
    setSaving(true)
    try {
      await saveOpsSettings(parsed)
      toast.success('已保存，落地页将在 1 分钟内生效')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="分享与 SEO"
        description="落地页公开设置，仅 public.* 前缀会对外暴露"
        actions={
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
            保存
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>public.* 设置</CardTitle>
          <CardDescription>
            常用于 SEO 标题、描述、分享图与社交链接。建议键：
            <span className="ml-1 font-mono text-xs">{SUGGESTED.join(' · ')}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={16}
              className="w-full rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed"
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
