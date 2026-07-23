import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch,
  useToast,
} from '@kn/ui'
import { Blocks, Download, Upload } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { MOCK_PLUGINS, type AdminPlugin } from '@/mock/data'

export const PluginList = () => {
  const { toast } = useToast()
  const [plugins, setPlugins] = useState<AdminPlugin[]>(MOCK_PLUGINS)

  const toggle = (id: string) => {
    setPlugins((prev) => prev.map((plugin) => {
      if (plugin.id !== id || plugin.status === 'reviewing') return plugin
      return { ...plugin, status: plugin.status === 'enabled' ? 'disabled' : 'enabled' }
    }))
    toast({ title: '插件状态已更新' })
  }

  return (
    <div>
      <PageHeader
        title="插件管理"
        description="管理编辑器插件的上架、启停与审核"
        actions={(
          <Button onClick={() => toast({ title: '上传插件', description: '对接插件发布接口后开放' })}>
            <Upload className="mr-1 size-4" />
            上传插件
          </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plugins.map((plugin) => (
          <Card key={plugin.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Blocks className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{plugin.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{plugin.packageName}</CardDescription>
                  </div>
                </div>
                {plugin.status === 'reviewing'
                  ? <StatusBadge variant="warning">审核中</StatusBadge>
                  : (
                    <Switch
                      checked={plugin.status === 'enabled'}
                      onCheckedChange={() => toggle(plugin.id)}
                    />
                  )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">v{plugin.version}</Badge>
                  <Badge variant={plugin.author === '官方' ? 'secondary' : 'outline'}>{plugin.author}</Badge>
                </div>
                <span className="flex items-center gap-1">
                  <Download className="size-3.5" />
                  {plugin.installCount}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">更新于 {plugin.updateTime}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
