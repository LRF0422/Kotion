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

/** Shape of a wiki_page_version row as returned by the version endpoints. */
interface PageVersionItem {
    id: string | number
    version: string
    subjectId?: string | number
    status: string
    title?: string
    changeSummary?: string
    createTime?: string | number
    createUser?: string | number
}

export interface PageVersionHistoryProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    pageId?: string
    /** Called after a successful rollback so the host can refresh the editor. */
    onRestored?: () => void
}

const PAGE_SIZE = 50

const formatTime = (value?: string | number): string => {
    if (!value) return ''
    try {
        const d = new Date(value)
        if (isNaN(d.getTime())) return String(value)
        return d.toLocaleString()
    } catch {
        return String(value)
    }
}

/**
 * Right-side panel listing the page's version history with a
 * non-destructive restore action (rollback creates a NEW version,
 * so nothing is ever lost).
 */
export const PageVersionHistory: React.FC<PageVersionHistoryProps> = ({
    open, onOpenChange, pageId, onRestored,
}) => {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [versions, setVersions] = useState<PageVersionItem[]>([])
    const [total, setTotal] = useState(0)
    // Version awaiting rollback confirmation (null = dialog closed)
    const [confirmTarget, setConfirmTarget] = useState<PageVersionItem | null>(null)
    const [restoring, setRestoring] = useState(false)

    const fetchVersions = useCallback(async () => {
        if (!pageId) return
        setLoading(true)
        try {
            const res = await useApi(APIS.GET_PAGE_VERSIONS, {
                pageId, current: 1, pageSize: PAGE_SIZE,
            })
            const data = res?.data
            setVersions(data?.records || [])
            setTotal(data?.total ?? (data?.records?.length || 0))
        } catch (err) {
            console.error('Failed to load version history:', err)
            toast.error(t('editor.version.loadFailed', 'Failed to load version history'))
        } finally {
            setLoading(false)
        }
    }, [pageId, t])

    useEffect(() => {
        if (open) fetchVersions()
        else {
            setConfirmTarget(null)
            setRestoring(false)
        }
    }, [open, fetchVersions])

    const handleRestore = useCallback(async () => {
        if (!pageId || !confirmTarget || restoring) return
        setRestoring(true)
        try {
            await useApi(APIS.ROLLBACK_PAGE_VERSION, { pageId }, {
                pageId,
                targetVersionId: confirmTarget.id,
            })
            toast.success(t('editor.version.restoreSuccess', 'Restored to version {{version}}', { version: confirmTarget.version }))
            setConfirmTarget(null)
            await fetchVersions()
            onRestored?.()
        } catch (err) {
            console.error('Failed to restore version:', err)
            toast.error(t('editor.version.restoreFailed', 'Failed to restore version'))
        } finally {
            setRestoring(false)
        }
    }, [pageId, confirmTarget, restoring, fetchVersions, onRestored, t])

    const statusBadge = (v: PageVersionItem) => {
        if (v.status === 'ACTIVE') {
            return <Badge variant="default" className="text-[10px] px-1.5 py-0">{t('editor.version.current', 'Current')}</Badge>
        }
        if (v.status === 'DRAFT') {
            return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t('editor.version.draft', 'Draft')}</Badge>
        }
        return null
    }

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
                        ) : versions.length === 0 ? (
                            <div className="py-12 text-center text-sm text-muted-foreground">
                                {t('editor.version.empty', 'No versions yet')}
                            </div>
                        ) : (
                            versions.map((v) => (
                                <div
                                    key={String(v.id)}
                                    className="group flex flex-row items-start justify-between gap-2 rounded-md px-3 py-2.5 hover:bg-muted/60 transition-colors"
                                >
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">v{v.version}</span>
                                            {statusBadge(v)}
                                        </div>
                                        {(v.changeSummary || v.title) && (
                                            <span className="text-xs text-muted-foreground truncate max-w-[260px]" title={v.changeSummary || v.title}>
                                                {v.changeSummary || v.title}
                                            </span>
                                        )}
                                        <span className="text-[11px] text-muted-foreground/70">
                                            {formatTime(v.createTime)}
                                        </span>
                                    </div>
                                    {v.status !== 'ACTIVE' && v.status !== 'DRAFT' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                            onClick={() => setConfirmTarget(v)}
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                            <span className="text-xs">{t('editor.version.restore', 'Restore')}</span>
                                        </Button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>

                <AlertDialog open={!!confirmTarget} onOpenChange={(o) => { if (!o) setConfirmTarget(null) }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t('editor.version.confirmTitle', 'Restore this version?')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {t('editor.version.confirmDesc',
                                    'The page will be restored to version {{version}}. This creates a new version — the current content is kept in history and nothing is lost.',
                                    { version: confirmTarget?.version })}
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
