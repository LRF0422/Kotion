import React, { useState } from 'react'
import { Card, Input, Label, Switch, Button, cn } from '@kn/ui'
import { usePluginConfig } from '@kn/common'
import type { GitHubPluginConfig } from '../types/config'
import { DEFAULT_GITHUB_CONFIG } from '../types/config'
import { testConnection } from '../services/github-client'
import { GITHUB_PLUGIN_KEY } from '../hooks/use-github-config'
import { RefreshCw, CheckCircle2, XCircle, Eye, EyeOff, KeyRound, FolderGit2, Database } from '@kn/icon'
import { GitHubLogo } from './GitHubLogo'

const SectionCard: React.FC<{
    icon: React.ReactNode
    title: string
    description?: string
    children: React.ReactNode
}> = ({ icon, title, description, children }) => (
    <Card className="overflow-hidden">
        <div className="flex items-center gap-2.5 border-b bg-muted/30 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm ring-1 ring-inset ring-border">
                {icon}
            </span>
            <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{title}</p>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
        </div>
        <div className="space-y-3 p-4">{children}</div>
    </Card>
)

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
            {/* Brand header */}
            <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-br from-muted/60 to-transparent p-4">
                <GitHubLogo size={44} className="shrink-0" />
                <div className="min-w-0">
                    <p className="text-sm font-medium">GitHub Integration</p>
                    <p className="text-xs text-muted-foreground">
                        Embed issues, pull requests, repositories and code, and generate changelogs and project docs from repository history.
                    </p>
                </div>
            </div>

            {/* Authentication */}
            <SectionCard
                icon={<KeyRound className="h-4 w-4" />}
                title="Authentication"
                description="Connect with a GitHub Personal Access Token"
            >
                <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="github-pat">Personal Access Token</Label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input
                                id="github-pat"
                                type={showToken ? 'text' : 'password'}
                                placeholder="ghp_xxxxxxxxxxxx"
                                value={config.personalAccessToken}
                                onChange={(e) => updateConfig({ personalAccessToken: e.target.value })}
                                className="pr-9 font-mono text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                                aria-label={showToken ? 'Hide token' : 'Show token'}
                            >
                                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                        </div>
                        <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !config.personalAccessToken} className="shrink-0">
                            {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
                        </Button>
                    </div>

                    {testResult && (
                        <div
                            className={cn(
                                'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                                testResult.success
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-destructive/10 text-destructive'
                            )}
                        >
                            {testResult.success
                                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Connected as @{testResult.login}</>
                                : <><XCircle className="h-3.5 w-3.5" /> {testResult.error}</>}
                        </div>
                    )}

                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                        The token needs the <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">repo</code> scope to read private repositories.
                    </p>
                </div>
            </SectionCard>

            {/* Default Repository */}
            <SectionCard
                icon={<FolderGit2 className="h-4 w-4" />}
                title="Default Repository"
                description="Pre-fill owner/repo for new cards and AI tools"
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Owner / Organization</Label>
                        <Input
                            placeholder="octocat"
                            value={config.defaultOwner}
                            onChange={(e) => updateConfig({ defaultOwner: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Repository</Label>
                        <Input
                            placeholder="hello-world"
                            value={config.defaultRepo}
                            onChange={(e) => updateConfig({ defaultRepo: e.target.value })}
                        />
                    </div>
                </div>
            </SectionCard>

            {/* Cache & Refresh */}
            <SectionCard
                icon={<Database className="h-4 w-4" />}
                title="Cache & Auto Refresh"
                description="Control how often card data is re-fetched"
            >
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
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <div className="min-w-0">
                        <p className="text-xs font-medium">Auto Refresh</p>
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
            </SectionCard>

            {/* Save status */}
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                {saving && (
                    <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Saving…
                    </span>
                )}
                {!saving && !isDirty && !saveError && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Saved
                    </span>
                )}
                {saveError && (
                    <span className="flex items-center gap-1 text-destructive">
                        <XCircle className="h-3 w-3" /> Sync failed: {saveError}
                    </span>
                )}
            </div>
        </div>
    )
}
