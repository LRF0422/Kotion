import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, Switch, Button, cn } from '@kn/ui'
import { usePluginConfig } from "@kn/common"
import type { GitHubPluginConfig } from '../types/config'
import { DEFAULT_GITHUB_CONFIG } from '../types/config'
import { testConnection } from '../services/github-client'
import { GITHUB_PLUGIN_KEY } from '../hooks/use-github-config'
import { RefreshCw, CheckCircle2, XCircle, Eye, EyeOff } from '@kn/icon'

export const GitHubSettings: React.FC<{ pluginKey?: string }> = () => {
    const { config, updateConfig, saving, saveError, isDirty } = usePluginConfig<GitHubPluginConfig>({
        pluginKey: GITHUB_PLUGIN_KEY,
        defaultConfig: DEFAULT_GITHUB_CONFIG,
    })

    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; login?: string; error?: string } | null>(null)
    const [showToken, setShowToken] = useState(false)

    const handleTest = async () => {
        if (!config.personalAccessToken) return
        setTesting(true)
        setTestResult(null)
        const result = await testConnection(config.personalAccessToken)
        setTestResult(result)
        setTesting(false)
    }

    return (
        <div className="space-y-4">
            {/* Authentication */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Authentication</CardTitle>
                    <CardDescription className="text-xs">Configure your GitHub Personal Access Token</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Personal Access Token</Label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    type={showToken ? 'text' : 'password'}
                                    placeholder="ghp_xxxxxxxxxxxx"
                                    value={config.personalAccessToken}
                                    onChange={(e) => updateConfig({ personalAccessToken: e.target.value })}
                                    className="pr-8"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken(!showToken)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                            <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !config.personalAccessToken}>
                                {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
                            </Button>
                        </div>
                        {testResult && (
                            <div className={cn('flex items-center gap-1 text-xs', testResult.success ? 'text-green-600' : 'text-red-500')}>
                                {testResult.success ? (
                                    <><CheckCircle2 className="h-3 w-3" /> Connected as @{testResult.login}</>
                                ) : (
                                    <><XCircle className="h-3 w-3" /> {testResult.error}</>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Default Repository */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Default Repository</CardTitle>
                    <CardDescription className="text-xs">Pre-fill owner/repo for new cards</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Owner / Organization</Label>
                            <Input
                                placeholder="octocat"
                                value={config.defaultOwner}
                                onChange={(e) => updateConfig({ defaultOwner: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Repository (optional)</Label>
                            <Input
                                placeholder="hello-world"
                                value={config.defaultRepo}
                                onChange={(e) => updateConfig({ defaultRepo: e.target.value })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Cache & Refresh */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Cache & Auto Refresh</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Cache TTL (minutes)</Label>
                        <Input
                            type="number"
                            min={1}
                            max={60}
                            value={config.cacheTTLMinutes}
                            onChange={(e) => updateConfig({ cacheTTLMinutes: parseInt(e.target.value) || 5 })}
                            className="w-24"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-xs">Auto Refresh</Label>
                            <p className="text-[11px] text-muted-foreground">Periodically refresh card data</p>
                        </div>
                        <Switch
                            checked={config.autoRefreshEnabled}
                            onCheckedChange={(checked) => updateConfig({ autoRefreshEnabled: checked })}
                        />
                    </div>
                    {config.autoRefreshEnabled && (
                        <div className="space-y-1.5">
                            <Label className="text-xs">Refresh Interval (minutes)</Label>
                            <Input
                                type="number"
                                min={1}
                                max={120}
                                value={config.autoRefreshIntervalMinutes}
                                onChange={(e) => updateConfig({ autoRefreshIntervalMinutes: parseInt(e.target.value) || 15 })}
                                className="w-24"
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Status */}
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                {saving && (
                    <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Saving...
                    </span>
                )}
                {!saving && !isDirty && !saveError && (
                    <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> Saved
                    </span>
                )}
                {saveError && (
                    <span className="flex items-center gap-1 text-red-500">
                        <XCircle className="h-3 w-3" /> Sync failed: {saveError}
                    </span>
                )}
            </div>
        </div>
    )
}
