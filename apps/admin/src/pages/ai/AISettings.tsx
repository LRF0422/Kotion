import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Separator,
  useToast,
} from '@kn/ui'
import { Loader2, Save } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { getParamValues, saveParamValues } from '@/api'

const PARAM_KEYS = [
  'ai.enabled',
  'ai.webSearchEnabled',
  'ai.imageGenEnabled',
  'ai.model',
  'ai.temperature',
  'ai.maxTokens',
] as const

const PARAM_NAMES: Record<string, string> = {
  'ai.enabled': 'AI 助手总开关',
  'ai.webSearchEnabled': 'AI 联网搜索开关',
  'ai.imageGenEnabled': 'AI 图片生成开关',
  'ai.model': 'AI 默认模型',
  'ai.temperature': 'AI Temperature',
  'ai.maxTokens': 'AI 最大输出 Tokens',
  'ai.apiKey': 'AI API Key',
}

export const AISettings = () => {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [model, setModel] = useState('deepseek-chat')
  const [temperature, setTemperature] = useState([0.7])
  const [maxTokens, setMaxTokens] = useState('4096')
  const [apiKey, setApiKey] = useState('')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [webSearchEnabled, setWebSearchEnabled] = useState(true)
  const [imageGenEnabled, setImageGenEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    getParamValues([...PARAM_KEYS])
      .then((values) => {
        if (cancelled) return
        if (values['ai.enabled'] != null) setAiEnabled(values['ai.enabled'] === 'true')
        if (values['ai.webSearchEnabled'] != null) setWebSearchEnabled(values['ai.webSearchEnabled'] === 'true')
        if (values['ai.imageGenEnabled'] != null) setImageGenEnabled(values['ai.imageGenEnabled'] === 'true')
        if (values['ai.model']) setModel(values['ai.model'])
        if (values['ai.temperature']) setTemperature([Number(values['ai.temperature']) || 0.7])
        if (values['ai.maxTokens']) setMaxTokens(values['ai.maxTokens'])
      })
      .catch(() => {
        if (!cancelled) toast({ title: '加载配置失败', variant: 'destructive' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const entries: Record<string, string> = {
        'ai.enabled': String(aiEnabled),
        'ai.webSearchEnabled': String(webSearchEnabled),
        'ai.imageGenEnabled': String(imageGenEnabled),
        'ai.model': model,
        'ai.temperature': String(temperature[0]),
        'ai.maxTokens': maxTokens,
      }
      // API Key 留空表示不修改
      if (apiKey.trim()) entries['ai.apiKey'] = apiKey.trim()
      await saveParamValues(entries, PARAM_NAMES)
      setApiKey('')
      toast({ title: '配置已保存', description: `默认模型：${model}，temperature=${temperature[0]}` })
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="AI 配置"
        description="管理平台 AI 能力开关、默认模型与调用参数"
        actions={(
          <Button onClick={save} disabled={loading || saving}>
            {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
            保存配置
          </Button>
        )}
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>能力开关</CardTitle>
              <CardDescription>控制前台可用的 AI 功能范围</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>AI 助手总开关</Label>
                  <p className="text-xs text-muted-foreground">关闭后前台隐藏所有 AI 入口</p>
                </div>
                <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>联网搜索</Label>
                  <p className="text-xs text-muted-foreground">允许 AI 调用 Tavily / Bocha 搜索</p>
                </div>
                <Switch checked={webSearchEnabled} onCheckedChange={setWebSearchEnabled} disabled={!aiEnabled} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>图片生成</Label>
                  <p className="text-xs text-muted-foreground">允许 AI 生成图片并插入文档</p>
                </div>
                <Switch checked={imageGenEnabled} onCheckedChange={setImageGenEnabled} disabled={!aiEnabled} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>模型参数</CardTitle>
              <CardDescription>Agent 会话使用的默认模型与推理参数</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>默认模型</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deepseek-chat">deepseek-chat</SelectItem>
                    <SelectItem value="deepseek-reasoner">deepseek-reasoner</SelectItem>
                    <SelectItem value="claude-sonnet">claude-sonnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Temperature</Label>
                  <span className="text-sm text-muted-foreground">{temperature[0]}</span>
                </div>
                <Slider value={temperature} onValueChange={setTemperature} min={0} max={2} step={0.1} />
              </div>
              <div className="space-y-2">
                <Label>最大输出 Tokens</Label>
                <Input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  placeholder="sk-********（留空表示不修改）"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">密钥保存后仅在服务端使用，前端不再展示明文</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
