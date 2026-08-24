import { APIS } from "../../../api";
import { useApi, useTranslation } from "@kn/common";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
    ScrollArea, Badge, Button, Skeleton, toast,
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@kn/ui";
import { History, LoaderCircle, RotateCcw } from "@kn/icon";
import React, { useCallback, useEffect, useState } from "react";

type PageHistoryKind = 'AUTO' | 'USER' | 'RESTORE' | 'IMPORT' | string

/** One checkpoint-backed entry returned by GET /page/:id/history. */
interface PageHistoryItem {
    rev: number | string
    kind: PageHistoryKind
    label?: string | null
    actor?: unknown
    createdAt?: string | number | null
    current: boolean
    restoredFromRev?: number | string | null
}

export interface PageVersionHistoryProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    pageId?: string
    /** Identity of the editor session that currently holds the page write lease. */
    clientId: string
    /** Flush pending editor changes before the server changes the current rev. */
    saveNow: () => Promise<void>
    /** Called after a successful restore so the host can refresh the editor. */
    onRestored?: (rev?: number | string | null) => void
}

const formatTime = (value?: string | number | null): string => {
    if (!value) return ''
    try {
        const d = new Date(value)
        if (isNaN(d.getTime())) return String(value)
        return d.toLocaleString()
    } catch {
        return String(value)
    }
}

const formatActor = (actor: unknown): string => {
    if (actor == null || actor === '') return ''
    if (typeof actor === 'object') {
        const value = actor as Record<string, unknown>
        const name = value.name ?? value.displayName ?? value.username ?? value.id
        return name == null ? '' : String(name)
    }
    return String(actor)
}

const kindLabel = (kind: PageHistoryKind, t: ReturnType<typeof useTranslation>['t']): string => {
    switch (kind) {
        case 'USER': return t('editor.version.kind.user', 'Manual save')
        case 'AUTO': return t('editor.version.kind.auto', 'Automatic checkpoint')
        case 'RESTORE': return t('editor.version.kind.restore', 'Restore')
        case 'IMPORT': return t('editor.version.kind.import', 'Import')
        default: return String(kind || t('editor.version.kind.unknown', 'Checkpoint'))
    }
}

/**
 * Right-side panel listing checkpoint-backed page history. Restoring is
 * non-destructive: the backend writes the selected document forward to a new rev.
 */
export const PageVersionHistory: React.FC<PageVersionHistoryProps> = ({
    open, onOpenChange, pageId, clientId, saveNow, onRestored,
}) => {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [history, setHistory] = useState<PageHistoryItem[]>([])
    const [total, setTotal] = useState(0)
    const [confirmTarget, setConfirmTarget] = useState<PageHistoryItem | null>(null)
    const [restoring, setRestoring] = useState(false)

    const fetchHistory = useCallback(async () => {
        if (!pageId) return
        setLoading(true)
        try {
            const res = await useApi(APIS.PAGE_HISTORY, { id: pageId, limit: 50 })
            const data = res?.data
            const raw = Array.isArray(data) ? data : (data?.records || [])
            const records: PageHistoryItem[] = raw.map((item: any) => ({
                rev: item?.rev,
                kind: item?.kind || '',
                label: item?.label,
                actor: item?.actor,
                createdAt: item?.createdAt,
                current: item?.current === true,
                restoredFromRev: item?.restoredFromRev,
            })).filter((item: PageHistoryItem) => item.rev != null)
            setHistory(records)
            setTotal(Array.isArray(data) ? records.length : (data?.total ?? records.length))
        } catch (err) {
            console.error('Failed to load page history:', err)
            toast.error(t('editor.version.loadFailed', 'Failed to load version history'))
        } finally {
            setLoading(false)
        }
    }, [pageId, t])

    useEffect(() => {
        if (open) fetchHistory()
        else {
            setConfirmTarget(null)
            setRestoring(false)
        }
    }, [open, fetchHistory])

    const handleRestore = useCallback(async () => {
        if (!pageId || !confirmTarget || confirmTarget.current || restoring) return
        setRestoring(true)
        try {
            try {
                await saveNow()
            } catch (err) {
                console.error('Failed to flush page before restore:', err)
                toast.error(t('editor.version.restoreSaveFailed', 'Save failed — restore was cancelled'))
                return
            }

            try {
                const response = await useApi(APIS.PAGE_RESTORE, { id: pageId }, {
                    targetRev: confirmTarget.rev,
                    clientId,
                })
                toast.success(t('editor.version.restoreSuccess', 'Restored to revision {{version}}', { version: confirmTarget.rev }))
                setConfirmTarget(null)
                await fetchHistory()
                onRestored?.(response?.data?.rev)
            } catch (err) {
                console.error('Failed to restore page revision:', err)
                toast.error(t('editor.version.restoreFailed', 'Failed to restore version'))
            }
        } finally {
            setRestoring(false)
        }
    }, [pageId, confirmTarget, restoring, saveNow, clientId, fetchHistory, onRestored, t])

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
                <SheetHeader className="px-4 py-3 border-b text-left">
                    <SheetTitle className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        <span>{t('editor.versionHistory', 'Version history')}</span>
                        {total > 0 && (
                            <span className="text-xs font-normal text-muted-foreground">({total})</span>
                        )}
                    </SheetTitle>
                </SheetHeader>
                <ScrollArea className="flex-1 min-h-0">
                    <div className="flex flex-col p-2">
                        {loading ? (
                            <div className="flex flex-col gap-3 p-2">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="flex flex-col gap-2">
                                        <Skeleton className="h-4 w-2/3" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                ))}
                            </div>
                        ) : history.length === 0 ? (
                            <div className="py-12 text-center text-sm text-muted-foreground">
                                {t('editor.version.empty', 'No versions yet')}
                            </div>
                        ) : (
                            history.map((item) => {
                                const actor = formatActor(item.actor)
                                return (
                                    <div
                                        key={String(item.rev)}
                                        className="group flex flex-row items-start justify-between gap-2 rounded-md px-3 py-2.5 hover:bg-muted/60 transition-colors"
                                    >
                                        <div className="flex flex-col gap-0.5 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">r{item.rev}</span>
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                    {kindLabel(item.kind, t)}
                                                </Badge>
                                                {item.current && (
                                                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                                        {t('editor.version.current', 'Current')}
                                                    </Badge>
                                                )}
                                            </div>
                                            {item.label && (
                                                <span className="text-xs text-muted-foreground truncate max-w-[260px]" title={item.label}>
                                                    {item.label}
                                                </span>
                                            )}
                                            {item.restoredFromRev != null && (
                                                <span className="text-[11px] text-muted-foreground">
                                                    {t('editor.version.restoredFrom', 'Restored from r{{rev}}', { rev: item.restoredFromRev })}
                                                </span>
                                            )}
                                            <span className="text-[11px] text-muted-foreground/70">
                                                {[actor, formatTime(item.createdAt)].filter(Boolean).join(' · ')}
                                            </span>
                                        </div>
                                        {!item.current && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                                onClick={() => setConfirmTarget(item)}
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                                <span className="text-xs">{t('editor.version.restore', 'Restore')}</span>
                                            </Button>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </ScrollArea>

                <AlertDialog open={!!confirmTarget} onOpenChange={(next) => { if (!next) setConfirmTarget(null) }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t('editor.version.confirmTitle', 'Restore this version?')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {t('editor.version.confirmDesc',
                                    'The page will be restored to revision {{version}}. This creates a new revision — the current content is kept in history and nothing is lost.',
                                    { version: confirmTarget?.rev })}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={restoring}>
                                {t('editor.version.cancel', 'Cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRestore() }} disabled={restoring}>
                                {restoring && <LoaderCircle className="h-3.5 w-3.5 animate-spin mr-1" />}
                                {t('editor.version.restore', 'Restore')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </SheetContent>
        </Sheet>
    )
}
