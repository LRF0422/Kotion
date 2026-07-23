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
  Switch,
  Separator,
  useToast,
} from '@kn/ui'
import { Save } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'

export const SystemSettings = () => {
  const { toast } = useToast()
  const [platformName, setPlatformName] = useState('Kotion 知识平台')
  const [registerEnabled, setRegisterEnabled] = useState(true)
  const [inviteOnly, setInviteOnly] = useState(false)
  const [maxUploadSize, setMaxUploadSize] = useState('50')
  const [defaultLanguage, setDefaultLanguage] = useState('zh-CN')
  const [wsUrl, setWsUrl] = useState('ws://kotion.top:1234')

  const save = () => {
    toast({ title: '系统设置已保存' })
  }

  return (
    <div>
      <PageHeader
        title="系统设置"
        description="平台基础信息、注册策略与运行参数"
        actions={(
          <Button onClick={save}>
            <Save className="mr-1 size-4" />
            保存设置
          </Button>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
            <CardDescription>平台名称与默认展示配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>平台名称</Label>
              <Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>默认语言</Label>
              <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                  <SelectItem value="en-US">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>协同服务地址（Hocuspocus）</Label>
              <Input value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} className="font-mono" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>注册与安全</CardTitle>
            <CardDescription>账户注册策略与资源限制</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>开放注册</Label>
                <p className="text-xs text-muted-foreground">关闭后仅管理员可创建账户</p>
              </div>
              <Switch checked={registerEnabled} onCheckedChange={setRegisterEnabled} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>仅邀请制</Label>
                <p className="text-xs text-muted-foreground">新用户须持有效邀请码方可注册</p>
              </div>
              <Switch checked={inviteOnly} onCheckedChange={setInviteOnly} disabled={!registerEnabled} />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>单文件上传上限（MB）</Label>
              <Input value={maxUploadSize} onChange={(e) => setMaxUploadSize(e.target.value)} />
              <p className="text-xs text-muted-foreground">超出上限的附件将被 OSS 网关拒绝</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
