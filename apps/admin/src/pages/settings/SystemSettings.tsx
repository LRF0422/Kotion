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
  Switch,
  Separator,
  useToast,
} from '@kn/ui'
import { Loader2, Save } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { getParamValues, saveParamValues } from '@/api'

const PARAM_KEYS = [
  'system.platformName',
  'system.defaultLanguage',
  'system.wsUrl',
  'system.registerEnabled',
  'system.inviteOnly',
  'system.maxUploadSize',
] as const

const PARAM_NAMES: Record<string, string> = {
  'system.platformName': '平台名称',
  'system.defaultLanguage': '默认语言',
  'system.wsUrl': '协同服务地址',
  'system.registerEnabled': '开放注册',
  'system.inviteOnly': '仅邀请制',
  'system.maxUploadSize': '单文件上传上限(MB)',
}

export const SystemSettings = () => {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [platformName, setPlatformName] = useState('Kotion 知识平台')
  const [registerEnabled, setRegisterEnabled] = useState(true)
  const [inviteOnly, setInviteOnly] = useState(false)
  const [maxUploadSize, setMaxUploadSize] = useState('50')
  const [defaultLanguage, setDefaultLanguage] = useState('zh-CN')
  const [wsUrl, setWsUrl] = useState('ws://kotion.top:1234')

  useEffect(() => {
    let cancelled = false
    getParamValues([...PARAM_KEYS])
      .then((values) => {
        if (cancelled) return
        if (values['system.platformName']) setPlatformName(values['system.platformName'])
        if (values['system.defaultLanguage']) setDefaultLanguage(values['system.defaultLanguage'])
        if (values['system.wsUrl']) setWsUrl(values['system.wsUrl'])
        if (values['system.registerEnabled'] != null) setRegisterEnabled(values['system.registerEnabled'] === 'true')
        if (values['system.inviteOnly'] != null) setInviteOnly(values['system.inviteOnly'] === 'true')
        if (values['system.maxUploadSize']) setMaxUploadSize(values['system.maxUploadSize'])
      })
      .catch(() => {
        if (!cancelled) toast({ title: '加载设置失败', variant: 'destructive' })
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
      await saveParamValues(
        {
          'system.platformName': platformName,
          'system.defaultLanguage': defaultLanguage,
          'system.wsUrl': wsUrl,
          'system.registerEnabled': String(registerEnabled),
          'system.inviteOnly': String(inviteOnly),
          'system.maxUploadSize': maxUploadSize,
        },
        PARAM_NAMES,
      )
      toast({ title: '系统设置已保存' })
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="系统设置"
        description="平台基础信息、注册策略与运行参数"
        actions={(
          <Button onClick={save} disabled={loading || saving}>
            {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
            保存设置
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
      )}
    </div>
  )
}
