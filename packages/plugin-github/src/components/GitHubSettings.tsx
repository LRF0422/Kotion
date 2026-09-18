import React, { useState } from 'react'
import { Card, Input, Label, Switch, Button, cn } from '@kn/ui'
import { usePluginConfig, SECRET_MASK } from '@kn/common'
import type { GitHubPluginConfig } from '../types/config'
import { DEFAULT_GITHUB_CONFIG } from '../types/config'
import { testConnection, checkRepoWriteAccess } from '../services/github-client'
import { GITHUB_PLUGIN_KEY, GITHUB_SECRET_FIELDS } from '../hooks/use-github-config'
import { RefreshCw, CheckCircle2, XCircle, Eye, EyeOff, KeyRound, FolderGit2, Database, Tag, Rocket } from '@kn/icon'
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
    const { config, updateConfig, saving, saveError, isDirty, getSecret, isConfigured } = usePluginConfig<GitHubPluginConfig>({
        pluginKey: GITHUB_PLUGIN_KEY,
        defaultConfig: DEFAULT_GITHUB_CONFIG,
        secretFields: GITHUB_SECRET_FIELDS,
    })

    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; login?: string; error?: string } | null>(null)
    const [showToken, setShowToken] = useState(false)
    const [checkingWrite, setCheckingWrite] = useState(false)
    const [writeResult, setWriteResult] = useState<{ success: boolean; canPush: boolean; permission?: string; error?: string } | null>(null)

    // The stored PAT is masked; "configured" means a value exists server-side.
    const tokenConfigured = isConfigured('personalAccessToken')

    const handleCheckWrite = async () => {
        const token = await getSecret('personalAccessToken')
        if (!token || !config.defaultOwner || !config.defaultRepo) return
        setCheckingWrite(true)
        setWriteResult(null)
        setWriteResult(await checkRepoWriteAccess(token, config.defaultOwner, config.defaultRepo))
        setCheckingWrite(false)
    }

    const handleTest = async () => {
        const token = await getSecret('personalAccessToken')
        if (!token) return
        setTesting(true)
        setTestResult(null)
        const result = await testConnection(token)
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
                                autoComplete="new-password"
                                placeholder={tokenConfigured ? 'Configured — leave blank to keep' : 'ghp_xxxxxxxxxxxx'}
                                value={config.personalAccessToken === SECRET_MASK ? '' : config.personalAccessToken}
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
                        <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !tokenConfigured} className="shrink-0">
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
                        Publishing releases requires write access — a classic token with <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">repo</code>,
                        or a fine-grained token with <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Contents: Read and write</code>.
                        GitHub's native generate-notes endpoint needs Contents write; when unavailable the plugin falls back to a commit-based changelog.
                    </p>

                    {config.defaultOwner && config.defaultRepo && (
                        <div className="space-y-1.5 rounded-lg border px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-medium">Release write access</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        Verify the token can publish releases in {config.defaultOwner}/{config.defaultRepo}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={handleCheckWrite}
                                    disabled={checkingWrite || !tokenConfigured}
                                >
                                    {checkingWrite ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Check'}
                                </Button>
                            </div>
                            {writeResult && (
                                <div
                                    className={cn(
                                        'flex items-start gap-1.5 rounded-md px-2 py-1 text-xs',
                                        writeResult.canPush
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                            : 'bg-destructive/10 text-destructive'
                                    )}
                                >
                                    {writeResult.canPush
                                        ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                                    <span className="min-w-0 break-words">
                                        {writeResult.canPush
                                            ? 'Can publish releases (permission: ' + (writeResult.permission || 'write') + ')'
                                            : 'Cannot publish releases' + (writeResult.error ? ' — ' + writeResult.error : ' — token lacks write access')}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
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
                            autoComplete="off"
                            placeholder="octocat"
                            value={config.defaultOwner}
                            onChange={(e) => updateConfig({ defaultOwner: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Repository</Label>
                        <Input
                            autoComplete="off"
                            placeholder="hello-world"
                            value={config.defaultRepo}
                            onChange={(e) => updateConfig({ defaultRepo: e.target.value })}
                        />
                    </div>
                </div>
            </SectionCard>

            {/* Release Defaults */}
            <SectionCard
                icon={<Rocket className="h-4 w-4" />}
                title="Release Defaults"
                description="Pre-fill the release composer and control how versions are published"
            >
                <div className="space-y-1.5">
                    <Label className="text-xs">
                        <Tag className="mr-1 inline h-3 w-3" /> Tag prefix
                    </Label>
                    <Input
                        autoComplete="off"
                        placeholder="v"
                        value={config.releaseTagPrefix}
                        onChange={(e) => updateConfig({ releaseTagPrefix: e.target.value })}
                        className="w-24 font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Pre-filled when composing a release, e.g. <code className="rounded bg-muted px-1 font-mono text-[10px]">v</code> → v1.2.0.
                    </p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <div className="min-w-0">
                        <p className="text-xs font-medium">Auto-generate release notes</p>
                        <p className="text-[11px] text-muted-foreground">Use GitHub's native generated notes by default</p>
                    </div>
                    <Switch
                        checked={config.releaseAutoGenerateNotes}
                        onCheckedChange={(checked) => updateConfig({ releaseAutoGenerateNotes: checked })}
                    />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <div className="min-w-0">
                        <p className="text-xs font-medium">Default to draft</p>
                        <p className="text-[11px] text-muted-foreground">Start new releases as unpublished drafts</p>
                    </div>
                    <Switch
                        checked={config.releaseDraftDefault}
                        onCheckedChange={(checked) => updateConfig({ releaseDraftDefault: checked })}
                    />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <div className="min-w-0">
                        <p className="text-xs font-medium">Default to pre-release</p>
                        <p className="text-[11px] text-muted-foreground">Mark new releases as pre-release by default</p>
                    </div>
                    <Switch
                        checked={config.releasePrereleaseDefault}
                        onCheckedChange={(checked) => updateConfig({ releasePrereleaseDefault: checked })}
                    />
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
                        autoComplete="off"
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
                            autoComplete="off"
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
