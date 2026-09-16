import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Progress,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@kn/ui'
import { Check, Clock, Copy, ExternalLink, History, Link2, LoaderCircle, Rocket, RotateCcw, Save, Upload } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'
import { parseJsonObject } from '@/components/JsonField'
import { formatDateTime } from '@/lib/use-paged-data'
import { useAsync } from '@/lib/use-async'
import { useOpsPermission } from '@/lib/permissions'
import {
  createOpsContentPreview,
  getOpsContent,
  getOpsContentCoverage,
  getOpsContentList,
  getOpsContentRevisions,
  importOpsContent,
  publishOpsContent,
  rollbackOpsContent,
  saveOpsContentDraft,
  type OpsContent,
  type OpsContentCoverage,
  type OpsContentRevision,
} from '@/api/ops'

const LOCALES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

// docs.* 键同样可覆盖：落地页 Docs 页有 279 处走 i18n，等价于文档内容数据化
const SUGGESTED_KEYS = ['landing.copy', 'landing.home', 'landing.docs', 'landing.seo']

/** 源键清单在浏览器本地持久化，避免运营每次重新粘贴。 */
const KEYS_STORAGE = 'kn.ops.content.keys'

/**
 * 提示运营如何从落地页 resources.ts 抽出一份「点分键」清单。
 * 后台无法 import 落地页应用，所以源键列表只能由运营提供。
 */
const KEYS_HINT_COMMAND = `node -e "const fs=require('fs');const src=fs.readFileSync('apps/landing-page-vite/src/locales/resources.ts','utf8');const obj=eval(src.replace(/^export const resources\\s*=\\s*/,'').replace(/;\\s*$/,''));const walk=(v,p='')=>Object.entries(v).flatMap(([k,x])=>x&&typeof x==='object'?walk(x,p?p+'.'+k:k):[p?p+'.'+k:k]);console.log(walk(obj.zh.translation).join('\\n'))"`

const toDraftText = (draft?: Record<string, unknown> | null) => JSON.stringify(draft ?? {}, null, 2)

const parseKeyLines = (text: string) =>
  Array.from(new Set(text.split('\n').map((line) => line.trim()).filter(Boolean)))

/**
 * 落地页文案 CMS：按内容键 + 语言维护「i18n 键 → 文案」覆盖表。
 * 未覆盖的键继续使用落地页内置 resources.ts。
 */
export const LandingContent = () => {
  const { canManage } = useOpsPermission()

  const [locale, setLocale] = useState('zh')
  const [key, setKey] = useState('landing.copy')
  const [keyDraft, setKeyDraft] = useState('landing.copy')
  const [draftText, setDraftText] = useState('{}')
  const [savedSnapshot, setSavedSnapshot] = useState('{}')
  const [entry, setEntry] = useState<OpsContent | null>(null)
  const [revisions, setRevisions] = useState<OpsContentRevision[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<OpsContent[]>([])
  const [note, setNote] = useState('')

  // 未保存变更守卫：切换键 / 语言前先确认。
  const [pendingSwitch, setPendingSwitch] = useState<{ key?: string; locale?: string } | null>(null)

  // 从内置文案导入
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importOverwrite, setImportOverwrite] = useState(true)
  const [importing, setImporting] = useState(false)

  // 源键清单 + 覆盖率
  const [keysDraft, setKeysDraft] = useState(() => localStorage.getItem(KEYS_STORAGE) ?? '')
  const [appliedKeys, setAppliedKeys] = useState<string[]>(() =>
    parseKeyLines(localStorage.getItem(KEYS_STORAGE) ?? ''),
  )
  const [showMissing, setShowMissing] = useState(false)

  // 预览链接
  const [preview, setPreview] = useState<{ url: string; expiresAt: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)

  const dirty = draftText !== savedSnapshot

  const load = useCallback(() => {
    setLoading(true)
    getOpsContent(key, locale)
      .then((res) => {
        setEntry(res)
        const text = toDraftText(res?.draft)
        setDraftText(text)
        setSavedSnapshot(text)
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

  const loadRevisions = useCallback(() => {
    getOpsContentRevisions(key, locale).then(setRevisions).catch(() => setRevisions([]))
  }, [key, locale])

  useEffect(() => {
    loadRevisions()
  }, [loadRevisions])

  useEffect(() => {
    if (!preview) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [preview])

  // 源键清单始终本地持久化，刷新后不用重新粘贴。
  useEffect(() => {
    localStorage.setItem(KEYS_STORAGE, keysDraft)
  }, [keysDraft])

  const coverage = useAsync<OpsContentCoverage | null>(
    () => (appliedKeys.length > 0 ? getOpsContentCoverage(locale, appliedKeys) : Promise.resolve(null)),
    [locale, appliedKeys.join('\n')],
  )

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
    if (!canManage) return false
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
    if (!canManage) return
    const ok = await saveDraft()
    if (!ok) return
    setSaving(true)
    try {
      await publishOpsContent(key, locale, note.trim() || undefined)
      toast.success('已发布，落地页将实时生效')
      setNote('')
      load()
      loadRevisions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发布失败')
    } finally {
      setSaving(false)
    }
  }

  const rollback = async (version: number) => {
    if (!canManage) return
    try {
      await rollbackOpsContent(key, locale, version)
      toast.success(`已回滚到 v${version} 的草稿，确认后再发布`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '回滚失败')
    }
  }

  const switchLocale = (next: string) => {
    if (next === locale) return
    if (dirty) {
      setPendingSwitch({ locale: next })
      return
    }
    setLocale(next)
  }

  const switchKey = (next: string) => {
    const normalized = next.trim()
    if (!normalized || normalized === key) {
      setKeyDraft(key)
      return
    }
    if (dirty) {
      setPendingSwitch({ key: normalized })
      return
    }
    setKeyDraft(normalized)
    setKey(normalized)
  }

  const discardAndSwitch = () => {
    if (!pendingSwitch) return
    if (pendingSwitch.locale) setLocale(pendingSwitch.locale)
    if (pendingSwitch.key) {
      setKeyDraft(pendingSwitch.key)
      setKey(pendingSwitch.key)
    }
    setPendingSwitch(null)
  }

  const keepEditing = () => {
    setKeyDraft(key)
    setPendingSwitch(null)
  }

  const applyKeys = () => {
    const parsed = parseKeyLines(keysDraft)
    setAppliedKeys(parsed)
    toast.success(parsed.length > 0 ? `已应用 ${parsed.length} 个源键` : '已清空源键清单')
  }

  const openImport = () => {
    setImportText('')
    setImportOverwrite(true)
    setImportOpen(true)
  }

  const confirmImport = async () => {
    if (!canManage) return
    const parsed = parseJsonObject(importText)
    if (!parsed.ok) {
      toast.error(`JSON 解析失败：${parsed.error}`)
      return
    }
    const raw = (parsed.value ?? {}) as Record<string, unknown>
    const entries: Record<string, string> = {}
    Object.entries(raw).forEach(([entryKey, value]) => {
      if (typeof value === 'string') entries[entryKey] = value
    })
    if (Object.keys(entries).length === 0) {
      toast.error('没有找到可导入的字符串条目，请粘贴 { "键": "文案" } 形式的 JSON')
      return
    }
    setImporting(true)
    try {
      const res = await importOpsContent({ locale, entries, overwrite: importOverwrite })
      toast.success(`导入 ${res?.imported ?? 0} 条 / 跳过 ${res?.skipped ?? 0} 条`)
      setImportOpen(false)
      coverage.reload()
      getOpsContentList().then(setExisting).catch(() => undefined)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const createPreview = async () => {
    setPreviewLoading(true)
    try {
      const res = await createOpsContentPreview({ locale, ttlMinutes: 60 })
      setPreview({ url: res.url, expiresAt: res.expiresAt })
      setNow(Date.now())
      setCopied(false)
      toast.success('预览链接已生成，60 分钟内有效')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成预览链接失败')
    } finally {
      setPreviewLoading(false)
    }
  }

  const copyPreview = async () => {
    if (!preview) return
    try {
      await navigator.clipboard.writeText(preview.url)
      setCopied(true)
      toast.success('预览链接已复制')
    } catch {
      toast.error('复制失败，请手动选中链接复制')
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

  const coverageData = coverage.data
  const coveragePct =
    coverageData && coverageData.totalKeys > 0
      ? Math.round((coverageData.translatedKeys / coverageData.totalKeys) * 1000) / 10
      : 0

  const remainingSeconds = preview
    ? Math.max(0, Math.floor((new Date(preview.expiresAt).getTime() - now) / 1000))
    : 0
  const countdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(
    remainingSeconds % 60,
  ).padStart(2, '0')}`

  const localeLabel = LOCALES.find((item) => item.value === locale)?.label ?? locale
  const highlightedKeys = useMemo(
    () => SUGGESTED_KEYS.filter((item) => existing.every((row) => row.contentKey !== item || row.locale !== locale)),
    [existing, locale],
  )

  return (
    <div>
      <PageHeader
        title="落地页内容"
        description="在不发版的前提下覆盖落地页文案；未覆盖的键使用内置文案兜底"
        actions={
          canManage ? (
            <div className="flex flex-col items-end gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="发布备注（选填，写入版本记录）"
                className="h-8 w-64 text-xs"
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={saveDraft} disabled={saving}>
                  {saving ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
                  保存草稿
                </Button>
                <Button onClick={publish} disabled={saving}>
                  <Rocket className="mr-1.5 size-4" />
                  发布
                </Button>
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">当前账号为只读权限</span>
          )
        }
      />

      {!canManage && (
        <p className="mb-4 text-xs text-muted-foreground">
          你只有查看权限：可以浏览文案、生成预览链接，但无法保存草稿 / 发布 / 回滚 / 导入。
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>文案编辑</CardTitle>
              <CardDescription>
                内容键「{key}」· {localeLabel} · 当前 {keyCount} 条覆盖
                {dirty ? ' · 有未保存的修改' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border p-0.5">
                  {LOCALES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => switchLocale(item.value)}
                      className={`rounded-md px-3 py-1 text-sm ${
                        locale === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <input
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onBlur={() => switchKey(keyDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') switchKey(keyDraft)
                  }}
                  className="w-56 rounded-md border bg-background px-3 py-1.5 text-sm"
                  placeholder="landing.copy"
                />
                {highlightedKeys.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => switchKey(item)}
                    className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {item}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="flex h-40 items-center justify-center text-muted-foreground">
                  <LoaderCircle className="size-5 animate-spin" />
                </div>
              ) : (
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  spellCheck={false}
                  rows={22}
                  readOnly={!canManage}
                  className="w-full rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed read-only:opacity-70"
                  placeholder={'{\n  "home.hero-cta-primary": "立即体验"\n}'}
                />
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {dirty ? '有未保存的修改，切换内容键或语言前会先确认。' : '草稿与已保存内容一致。'}
                </p>
                {canManage && (
                  <Button variant="outline" size="sm" onClick={openImport}>
                    <Upload className="mr-1.5 size-4" />
                    从内置文案导入
                  </Button>
                )}
              </div>

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
              <CardTitle className="flex items-center gap-2">
                <Check className="size-4 text-muted-foreground" />
                覆盖率
              </CardTitle>
              <CardDescription>
                {localeLabel} 下「源键清单」的翻译覆盖情况；源键清单只有落地页应用知道，需要手动维护
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>源键清单（每行一个点分键，保存在浏览器本地）</Label>
                <Textarea
                  value={keysDraft}
                  rows={5}
                  spellCheck={false}
                  className="font-mono text-xs"
                  placeholder={'home.hero.title\nhome.hero.cta'}
                  onChange={(e) => setKeysDraft(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={applyKeys}>
                    应用清单
                  </Button>
                  <span className="text-xs text-muted-foreground">已应用 {appliedKeys.length} 个键</span>
                </div>
              </div>

              {appliedKeys.length === 0 ? (
                <Alert>
                  <AlertTitle>还没有配置源键清单</AlertTitle>
                  <AlertDescription>
                    <p>
                      覆盖率需要一份「源码里到底有哪些 i18n 键」的清单，后台拿不到落地页的
                      resources.ts，因此需要你把键列表粘到上面的文本框。
                    </p>
                    <p className="mt-2">可以在仓库根目录执行下面这条命令生成（示例路径，按实际文件调整）：</p>
                    <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-[11px]">
                      {KEYS_HINT_COMMAND}
                    </code>
                    <p className="mt-2">把输出整段粘进上面的文本框，再点「应用清单」即可。</p>
                  </AlertDescription>
                </Alert>
              ) : (
                <DataState
                  loading={coverage.loading}
                  error={coverage.error}
                  empty={!coverageData}
                  emptyText="暂无覆盖率数据"
                  rows={2}
                  onRetry={coverage.reload}
                >
                  {coverageData && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">源键总数</p>
                          <p className="mt-1 text-xl font-semibold tabular-nums">{coverageData.totalKeys}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">已翻译</p>
                          <p className="mt-1 text-xl font-semibold tabular-nums">{coverageData.translatedKeys}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">覆盖率</p>
                          <p className="mt-1 text-xl font-semibold tabular-nums">{coveragePct.toFixed(2)}%</p>
                        </div>
                      </div>

                      <Progress value={coveragePct} />

                      <div>
                        <button
                          type="button"
                          onClick={() => setShowMissing((prev) => !prev)}
                          className="text-sm font-medium hover:underline"
                        >
                          缺失 {coverageData.missingKeys.length} 个键 {showMissing ? '（收起）' : '（展开）'}
                        </button>
                        {showMissing &&
                          (coverageData.missingKeys.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">太好了，没有缺失的键。</p>
                          ) : (
                            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                              {coverageData.missingKeys.map((item) => (
                                <li key={item} className="font-mono text-xs text-muted-foreground">
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ))}
                      </div>

                      <div>
                        <p className="text-sm font-medium">多余 {coverageData.orphanKeys.length} 个键</p>
                        {coverageData.orphanKeys.length === 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">没有源码里不存在的多余键。</p>
                        ) : (
                          <ul className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                            {coverageData.orphanKeys.map((item) => (
                              <li key={item} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs">
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </DataState>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                历史版本
              </CardTitle>
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
                      <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                        暂无历史版本
                      </TableCell>
                    </TableRow>
                  )}
                  {revisions.map((rev) => (
                    <TableRow key={rev.id}>
                      <TableCell className="font-medium">
                        v{rev.contentVersion}
                        {rev.note && (
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{rev.note}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(rev.createTime)}</TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <Button variant="outline" size="sm" onClick={() => rollback(rev.contentVersion)}>
                            <RotateCcw className="mr-1 size-3.5" />
                            回滚
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="size-4 text-muted-foreground" />
                预览链接
              </CardTitle>
              <CardDescription>生成 60 分钟内有效的草稿预览地址，可直接发给评审人</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" onClick={createPreview} disabled={previewLoading}>
                {previewLoading ? (
                  <LoaderCircle className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Link2 className="mr-1.5 size-4" />
                )}
                生成预览链接
              </Button>

              {preview && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5">
                    <code className="flex-1 truncate font-mono text-xs" title={preview.url}>
                      {preview.url}
                    </code>
                    <Button variant="ghost" size="sm" onClick={copyPreview}>
                      {copied ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}
                      复制
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3.5" />
                      {remainingSeconds > 0 ? `剩余 ${countdown}` : '链接已过期，请重新生成'}
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <a href={preview.url} target="_blank" rel="noreferrer">
                        打开
                        <ExternalLink className="ml-1 size-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 未保存变更守卫 */}
      <Dialog open={Boolean(pendingSwitch)} onOpenChange={(open) => !open && keepEditing()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>存在未保存的修改</DialogTitle>
            <DialogDescription>
              当前草稿还没有保存，切换到
              {pendingSwitch?.locale ? ` ${LOCALES.find((item) => item.value === pendingSwitch.locale)?.label ?? pendingSwitch.locale}` : ''}
              {pendingSwitch?.locale && pendingSwitch?.key ? ' · ' : ''}
              {pendingSwitch?.key ? `「${pendingSwitch.key}」` : ''}
              会丢失这些修改。要放弃还是继续编辑？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={keepEditing}>
              继续编辑
            </Button>
            <Button variant="destructive" onClick={discardAndSwitch}>
              放弃修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 从内置文案导入 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>从内置文案导入</DialogTitle>
            <DialogDescription>
              把落地页 resources.ts 里 {localeLabel} 的 translation 对象整段粘进来（
              {'{ "键": "文案" }'} 形式的扁平 JSON），导入后生成草稿，需再发布才生效。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>translation JSON</Label>
              <Textarea
                value={importText}
                rows={12}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder={'{\n  "home.hero.title": "Kotion",\n  "home.hero.cta": "免费获取"\n}'}
                onChange={(e) => setImportText(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={importOverwrite} onCheckedChange={setImportOverwrite} />
              <span className="text-sm text-muted-foreground">
                {importOverwrite ? '覆盖已有项' : '只补齐缺失项（保留已有草稿）'}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              取消
            </Button>
            <Button onClick={confirmImport} disabled={importing || !canManage}>
              {importing && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
              确认导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
