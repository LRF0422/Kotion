import React, { useState } from 'react'
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent,
    Input, Label, Switch, Button, cn,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@kn/ui'
import { usePluginConfig } from "@kn/common"
import type { NeteaseMusicPluginConfig } from '../types/config'
import { DEFAULT_NETEASE_MUSIC_CONFIG } from '../types/config'
import { NETEASE_MUSIC_PLUGIN_KEY } from '../hooks/use-netease-config'
import { testApiConnection } from '../services/netease-client'
import { RefreshCw, CheckCircle2, XCircle, Eye, EyeOff } from '@kn/icon'

export const NeteaseMusicSettings: React.FC<{ pluginKey?: string }> = () => {
    const { config, updateConfig, saving, saveError, isDirty } = usePluginConfig<NeteaseMusicPluginConfig>({
        pluginKey: NETEASE_MUSIC_PLUGIN_KEY,
        defaultConfig: DEFAULT_NETEASE_MUSIC_CONFIG,
    })

    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)
    const [showCookie, setShowCookie] = useState(false)

    const handleTestApi = async () => {
        if (!config.apiBaseUrl) return
        setTesting(true)
        setTestResult(null)
        const result = await testApiConnection(config.apiBaseUrl)
        setTestResult(result)
        setTesting(false)
    }

    return (
        <div className="space-y-4">
            {/* API Service */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">API 服务</CardTitle>
                    <CardDescription className="text-xs">
                        配置 NeteaseCloudMusicApi 服务地址，用于搜索歌曲等高级功能。
                        需要自行部署服务，参考{' '}
                        <a href="https://binaryify.github.io/NeteaseCloudMusicApi/" target="_blank" rel="noopener noreferrer" className="underline">
                            NeteaseCloudMusicApi
                        </a>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">API 服务地址</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="http://localhost:3000"
                                value={config.apiBaseUrl}
                                onChange={(e) => updateConfig({ apiBaseUrl: e.target.value })}
                                className="flex-1"
                            />
                            <Button size="sm" variant="outline" onClick={handleTestApi} disabled={testing || !config.apiBaseUrl}>
                                {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : '测试'}
                            </Button>
                        </div>
                        {testResult && (
                            <div className={cn('flex items-center gap-1 text-xs', testResult.success ? 'text-green-600' : 'text-red-500')}>
                                {testResult.success ? (
                                    <><CheckCircle2 className="h-3 w-3" /> 连接成功</>
                                ) : (
                                    <><XCircle className="h-3 w-3" /> {testResult.error}</>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Account Cookie */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">账号</CardTitle>
                    <CardDescription className="text-xs">
                        配置网易云音乐 Cookie，用于访问需要登录的接口（如私人FM、每日推荐等）。
                        可从浏览器开发者工具中获取。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Cookie</Label>
                        <div className="relative">
                            <Input
                                type={showCookie ? 'text' : 'password'}
                                placeholder="MUSIC_U=xxxxxxxx; __csrf=xxxxxxxx"
                                value={config.cookie}
                                onChange={(e) => updateConfig({ cookie: e.target.value })}
                                className="pr-8"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCookie(!showCookie)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showCookie ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            提示：在浏览器中登录网易云音乐后，从 DevTools → Application → Cookies 中复制 MUSIC_U 字段
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Display Preferences */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">显示偏好</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">默认显示模式</Label>
                        <Select
                            value={config.defaultDisplayMode}
                            onValueChange={(value) => updateConfig({ defaultDisplayMode: value as 'player' | 'card' })}
                        >
                            <SelectTrigger className="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="player">嵌入播放器</SelectItem>
                                <SelectItem value="card">卡片模式</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-xs">自动播放</Label>
                            <p className="text-[11px] text-muted-foreground">嵌入播放器插入时自动开始播放</p>
                        </div>
                        <Switch
                            checked={config.autoPlay}
                            onCheckedChange={(checked) => updateConfig({ autoPlay: checked })}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Status */}
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                {saving && (
                    <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> 保存中...
                    </span>
                )}
                {!saving && !isDirty && !saveError && (
                    <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> 已保存
                    </span>
                )}
                {saveError && (
                    <span className="flex items-center gap-1 text-red-500">
                        <XCircle className="h-3 w-3" /> 保存失败: {saveError}
                    </span>
                )}
            </div>
        </div>
    )
}
