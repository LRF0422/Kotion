/**
 * Plugin Studio — side-dock panel.
 *
 * A compact build monitor: which project is being watched, the last build's
 * size and duration, and the tail of its log. It shares the studio's project
 * list with the settings panel through localStorage, so opening the dock is
 * enough to see what the last session is doing.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Button, ScrollArea, Separator, cn } from '@kn/ui'
import { Loader2, RefreshCw, Upload, Wrench, X } from '@kn/icon'
import type { DevLogEntry, DevSessionStatus, DockPanelProps } from '@kn/common'
import {
    formatBytes,
    useBuildEvents,
    useDevCapability,
    useHasDesktop,
    useInstallBundle,
    readStudioProjects,
} from './studio-service'

export const StudioDockPanel: React.FC<DockPanelProps> = ({ close }) => {
    const capability = useDevCapability()
    const isDesktop = useHasDesktop()
    const installBundle = useInstallBundle()
    const [root] = useState(() => readStudioProjects()[0]?.root)
    const [status, setStatus] = useState<DevSessionStatus | undefined>()
    const [logs, setLogs] = useState<DevLogEntry[]>([])
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const refresh = useCallback(async () => {
        if (!capability || !root) return
        try {
            const [statuses, entries] = await Promise.all([
                capability.dev.status({ root }),
                capability.dev.logs({ root, limit: 60 }),
            ])
            setStatus(statuses[0])
            setLogs(entries)
        } catch (cause) {
            setError(String((cause as Error)?.message ?? cause))
        }
    }, [capability, root])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const onBuild = useCallback(
        (next: DevSessionStatus) => {
            setStatus(next)
            void refresh()
        },
        [refresh],
    )
    useBuildEvents(onBuild, root)

    const buildAndInstall = async () => {
        if (!capability || !root) return
        setBusy(true)
        setError(null)
        try {
            const next = await capability.dev.build({ root })
            setStatus(next)
            if (next.build) await installBundle(next)
            await refresh()
        } catch (cause) {
            setError(String((cause as Error)?.message ?? cause))
        } finally {
            setBusy(false)
        }
    }

    if (!isDesktop || !capability || !root) {
        return (
            <div className="flex h-full flex-col">
                <header className="flex items-center justify-between border-b px-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-medium">
                        <Wrench className="h-3.5 w-3.5" />
                        插件开发台
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={close}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </header>
                <div className="p-3 text-xs text-muted-foreground">
                    {!isDesktop
                        ? '插件开发台仅在桌面客户端可用。'
                        : !capability
                          ? '当前桌面版本缺少 dev.* 能力，请升级客户端。'
                          : '还没有插件工程：在「设置 → 插件开发台」里添加。'}
                </div>
            </div>
        )
    }

    const state = status?.state ?? 'idle'

    return (
        <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b px-3 py-2">
                <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{status?.plugin?.name ?? root}</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={buildAndInstall}
                        disabled={busy}
                        title="构建并热更"
                    >
                        {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Upload className="h-3.5 w-3.5" />
                        )}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => void refresh()}>
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={close}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </header>

            <div className="space-y-2 p-3 text-xs">
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">状态</span>
                    <span
                        className={cn(
                            state === 'watching' && 'text-emerald-600 dark:text-emerald-400',
                            state === 'starting' && 'text-amber-600 dark:text-amber-400',
                            state === 'failed' && 'text-destructive',
                        )}
                    >
                        {state === 'watching' ? '监听中' : state === 'starting' ? '构建中' : state === 'failed' ? '构建失败' : '未启动'}
                    </span>
                </div>
                {status?.build && (
                    <>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">产物</span>
                            <span>
                                #{status.buildCount} · {formatBytes(status.build.bytes)} · {status.build.durationMs}ms
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">pluginKey</span>
                            <code className="truncate rounded bg-muted px-1">{status.plugin.pluginKey}</code>
                        </div>
                    </>
                )}
                {status?.error && (
                    <pre className="max-h-24 overflow-auto rounded bg-destructive/10 p-1.5 text-[11px] text-destructive">
                        {status.error}
                    </pre>
                )}
                {error && (
                    <pre className="max-h-24 overflow-auto rounded bg-destructive/10 p-1.5 text-[11px] text-destructive">
                        {error}
                    </pre>
                )}
            </div>

            <Separator />

            <ScrollArea className="flex-1">
                <div className="space-y-0.5 p-3 font-mono text-[11px] leading-relaxed">
                    {logs.length === 0 ? (
                        <p className="text-muted-foreground">暂无日志</p>
                    ) : (
                        logs.map((entry, index) => (
                            <div
                                key={`${entry.at}-${index}`}
                                className={cn(
                                    entry.level === 'error' && 'text-destructive',
                                    entry.level === 'warn' && 'text-amber-600 dark:text-amber-400',
                                )}
                            >
                                {entry.message}
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}
