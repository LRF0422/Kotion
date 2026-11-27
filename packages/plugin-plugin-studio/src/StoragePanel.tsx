/**
 * Plugin Studio — "Data" pane.
 *
 * The storage service exists so third-party plugins can keep data across
 * restarts; the studio is where those plugins are written. This pane closes the
 * loop: it shows exactly what the selected project's `plugin.<pluginKey>`
 * namespace currently contains, lets the author inspect one value, delete a key
 * or clear the namespace between runs, and reports which backend is answering
 * (`sqlite` vs session memory).
 *
 * Read-only reads + explicit deletes. The pane never invents keys: everything
 * it shows was written by the plugin itself.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Button, ConfirmDialog, ScrollArea, cn } from '@kn/ui'
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Trash2 } from '@kn/icon'
import { resolveStorage, useTranslation, type StorageScope } from '@kn/common'
import { formatBytes } from './studio-service'

/** Rows fetched per refresh. A dev namespace is small; cap it anyway.
 *  `list()` decodes values, so keep this conservative. */
const MAX_ROWS = 50
/** Longest value preview rendered (the rest is elided). */
const MAX_PREVIEW_CHARS = 8000

interface StudioStorageRow {
    key: string
    bytes: number
    updatedAt: number
    rev: number
}

interface StudioStoragePanelProps {
    /** The selected project's registry key; absent until the manifest is read. */
    pluginKey?: string
    /** `plugin.<pluginKey>` scope, or `undefined` when the host has no storage. */
    storage?: StorageScope
}

const byteLength = (text: string): number => {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length
    return text.length
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const formatTime = (at: number): string => {
    if (!Number.isFinite(at) || at <= 0) return ''
    try {
        return new Date(at).toLocaleString()
    } catch {
        return ''
    }
}

const formatValue = (value: unknown): string => {
    let text: string
    try {
        text = JSON.stringify(value, null, 2) ?? String(value)
    } catch {
        text = String(value)
    }
    return text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}\n…` : text
}

export const StudioStoragePanel: React.FC<StudioStoragePanelProps> = ({ pluginKey, storage }) => {
    const { t } = useTranslation()
    const [rows, setRows] = useState<StudioStorageRow[]>([])
    const [backend, setBackend] = useState<{
        engine: string
        durable: boolean
    } | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [preview, setPreview] = useState('')
    const [previewLoading, setPreviewLoading] = useState(false)
    const [clearOpen, setClearOpen] = useState(false)

    const refresh = useCallback(async (): Promise<void> => {
        if (!storage) {
            setRows([])
            setBackend(null)
            setExpanded(null)
            return
        }
        setLoading(true)
        setError(null)
        try {
            // `engine`/`durable` come from the service itself: calling info()
            // would aggregate every plugin database just to paint a badge.
            const service = resolveStorage()
            setBackend(service ? { engine: service.engine, durable: service.durable } : null)
            const page = await storage.list({ limit: MAX_ROWS })
            setRows(
                page.entries.map((entry) => ({
                    key: entry.key,
                    bytes: byteLength(JSON.stringify(entry.value) ?? ''),
                    updatedAt: entry.updatedAt,
                    rev: entry.rev,
                })),
            )
        } catch (cause) {
            setRows([])
            setError(errorMessage(cause))
        } finally {
            setLoading(false)
        }
    }, [storage])

    useEffect(() => {
        // A different project means a different namespace: drop the open value
        // rather than showing project A's data under project B's key.
        setExpanded(null)
        setPreview('')
        setPreviewLoading(false)
        void refresh()
    }, [refresh])

    const toggle = async (key: string): Promise<void> => {
        if (expanded === key) {
            setExpanded(null)
            return
        }
        setExpanded(key)
        setPreview('')
        if (!storage) return
        setPreviewLoading(true)
        try {
            const entry = await storage.get(key)
            setPreview(entry ? formatValue(entry.value) : '')
        } catch (cause) {
            setPreview(`${t('pluginStudio.dataReadFailed')}: ${errorMessage(cause)}`)
        } finally {
            setPreviewLoading(false)
        }
    }

    const remove = async (key: string): Promise<void> => {
        if (!storage) return
        try {
            await storage.delete(key)
            if (expanded === key) setExpanded(null)
            await refresh()
        } catch (cause) {
            setError(errorMessage(cause))
        }
    }

    const clear = async (): Promise<void> => {
        setClearOpen(false)
        if (!storage) return
        try {
            await storage.clear()
            setExpanded(null)
            await refresh()
        } catch (cause) {
            setError(errorMessage(cause))
        }
    }

    if (!pluginKey) {
        return (
            <p className="px-4 py-8 text-center text-[11px] text-muted-foreground/70">
                {t('pluginStudio.dataNoPlugin')}
            </p>
        )
    }

    if (!storage) {
        return (
            <p className="px-4 py-8 text-center text-[11px] text-muted-foreground/70">
                {t('pluginStudio.dataUnavailable')}
            </p>
        )
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1">
                <span className="min-w-0 truncate font-mono text-[10.5px] text-muted-foreground">
                    {storage.namespace}
                </span>
                {backend ? (
                    <span
                        className={cn(
                            'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                            backend.durable
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                        )}
                        title={backend.durable ? undefined : t('pluginStudio.dataSessionOnly')}
                    >
                        {backend.engine}
                        {backend.durable ? '' : ' · session'}
                    </span>
                ) : null}
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
                    {t('pluginStudio.dataKeys', { n: rows.length })}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
                    onClick={() => void refresh()}
                    disabled={loading}
                    title={t('pluginStudio.refresh')}
                >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {t('pluginStudio.refresh')}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                    onClick={() => setClearOpen(true)}
                    disabled={loading || rows.length === 0}
                >
                    <Trash2 className="h-3 w-3" />
                    {t('pluginStudio.dataClear')}
                </Button>
            </div>

            {error ? (
                <pre className="m-2 whitespace-pre-wrap rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[10.5px] leading-relaxed text-destructive">
                    {t('pluginStudio.dataReadFailed')}: {error}
                </pre>
            ) : null}

            <ScrollArea className="min-h-0 flex-1">
                {rows.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[11px] leading-snug text-muted-foreground/70">
                        {loading ? (
                            <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                        ) : (
                            t('pluginStudio.dataEmpty')
                        )}
                    </p>
                ) : (
                    <div>
                        {rows.map((row) => (
                            <div key={row.key} className="border-b last:border-b-0">
                                <div className="flex items-center gap-2 px-2 py-1">
                                    <button
                                        type="button"
                                        className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent/60"
                                        onClick={() => void toggle(row.key)}
                                        title={t('pluginStudio.dataInspect')}
                                    >
                                        {expanded === row.key ? (
                                            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="truncate font-mono text-[11px]">{row.key}</span>
                                    </button>
                                    <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground/70">
                                        rev {row.rev}
                                    </span>
                                    <span className="shrink-0 text-[9.5px] text-muted-foreground/70">
                                        {formatBytes(row.bytes)}
                                    </span>
                                    <span className="hidden shrink-0 text-[9.5px] text-muted-foreground/70 sm:inline">
                                        {formatTime(row.updatedAt)}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        title={t('pluginStudio.dataDeleteKey')}
                                        onClick={() => void remove(row.key)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                                {expanded === row.key ? (
                                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t bg-muted/20 px-3 py-2 font-mono text-[10.5px] leading-relaxed">
                                        {previewLoading ? t('pluginStudio.dataLoading') : preview}
                                    </pre>
                                ) : null}
                            </div>
                        ))}
                        {rows.length >= MAX_ROWS ? (
                            <p className="px-3 py-2 text-[10px] text-muted-foreground/70">
                                {t('pluginStudio.dataTruncated', { n: MAX_ROWS })}
                            </p>
                        ) : null}
                    </div>
                )}
            </ScrollArea>

            <ConfirmDialog
                open={clearOpen}
                title={t('pluginStudio.dataClearTitle')}
                description={t('pluginStudio.dataClearDesc', {
                    namespace: storage.namespace,
                })}
                confirmLabel={t('pluginStudio.dataClearAction')}
                cancelLabel={t('pluginStudio.cancel')}
                variant="destructive"
                onOpenChange={setClearOpen}
                onConfirm={() => void clear()}
            />
        </div>
    )
}
