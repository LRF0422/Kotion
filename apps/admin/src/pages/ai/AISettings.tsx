import { useState } from 'react'
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
import { Save } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'

export const AISettings = () => {
  const { toast } = useToast()
  const [model, setModel] = useState('deepseek-chat')
  const [temperature, setTemperature] = useState([0.7])
  const [maxTokens, setMaxTokens] = useState('4096')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [webSearchEnabled, setWebSearchEnabled] = useState(true)
  const [imageGenEnabled, setImageGenEnabled] = useState(false)

  const save = () => {
    toast({ title: '配置已保存', description: `默认模型：${model}，temperature=${temperature[0]}` })
  }

  return (
    <div>
      <PageHeader
        title="AI 配置"
        description="管理平台 AI 能力开关、默认模型与调用参数"
        actions={(
          <Button onClick={save}>
            <Save className="mr-1 size-4" />
            保存配置
          </Button>
        )}
      />

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
              <Input type="password" placeholder="sk-********（存于后端，不回显）" />
              <p className="text-xs text-muted-foreground">密钥保存后仅在服务端使用，前端不再展示明文</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
