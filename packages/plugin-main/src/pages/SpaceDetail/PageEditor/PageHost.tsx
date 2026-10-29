import React, { useCallback, useEffect, useState } from 'react'
import {
    hasPermission,
    isPageInTrashError,
    type PageRecord,
    type ResolvedPageType,
    useNavigator,
    usePageTabs,
    usePageType,
    useSpacePageService,
    useTranslation,
} from '@kn/common'
import { AlertCircle, Copy, Link, Loader2, Puzzle, Star, Trash2, UserPlus } from '@kn/icon'
import { Button, Separator, toast } from '@kn/ui'
import { PageBreadcrumb } from '../../../components/PageBreadcrumb'
import { SharePanel } from '../../components/SharePanel'
import { usePublishPageContext } from '../../../utils/use-publish-page-context'
import { PageEditor } from './index'
import { TrashedPageNotice } from './TrashedPageNotice'

interface PageHostProps {
    pageId: string
    spaceId?: string
    active?: boolean
}

export interface PluginPageBoundaryProps {
    pageType: ResolvedPageType
    children: React.ReactNode
}

interface PluginPageBoundaryState {
    error: Error | null
    retryKey: number
}

export class PluginPageBoundary extends React.Component<PluginPageBoundaryProps, PluginPageBoundaryState> {
    state: PluginPageBoundaryState = { error: null, retryKey: 0 }

    static getDerivedStateFromError(error: Error): Partial<PluginPageBoundaryState> {
        return { error }
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex h-full items-center justify-center p-6">
                    <div className="flex max-w-lg flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
                        <AlertCircle className="h-10 w-10 text-destructive" />
                        <div>
                            <h2 className="font-semibold">Plugin page failed to render</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {this.props.pageType.owner} · {this.props.pageType.id}
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
                        <Button
                            variant="outline"
                            onClick={() => this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }))}
                        >
                            Retry
                        </Button>
                    </div>
                </div>
            )
        }
        return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>
    }
}

interface ComponentPageFrameProps {
    page: PageRecord
    pageType?: ResolvedPageType
    spaceId: string
    active: boolean
    editableTitle?: boolean
    children: React.ReactNode
}

const ComponentPageFrame: React.FC<ComponentPageFrameProps> = ({
    page,
    spaceId,
    active,
    editableTitle,
    children,
}) => {
    const { t } = useTranslation()
    const service = useSpacePageService()
    const navigator = useNavigator()
    const { updateMeta } = usePageTabs(spaceId)
    const [title, setTitle] = useState(page.title)
    const [savedTitle, setSavedTitle] = useState(page.title)
    const [favorite, setFavorite] = useState(Boolean(page.favorite))
    const [savingTitle, setSavingTitle] = useState(false)

    useEffect(() => {
        setTitle(page.title)
        setSavedTitle(page.title)
        setFavorite(Boolean(page.favorite))
    }, [page.id, page.title, page.favorite])

    const saveTitle = useCallback(async () => {
        const next = title.trim() || t('page.untitled', 'Untitled')
        if (!editableTitle || next === savedTitle || savingTitle) {
            if (!next) setTitle(savedTitle)
            return
        }
        setSavingTitle(true)
        try {
            await service.pages.updatePageTitle({ pageId: page.id, title: next })
            setTitle(next)
            setSavedTitle(next)
            updateMeta(page.id, { title: next })
        } catch (error) {
            console.error('Failed to update component page title:', error)
            setTitle(savedTitle)
            toast.error(t('page.titleUpdateFailed', 'Failed to update page title'))
        } finally {
            setSavingTitle(false)
        }
    }, [editableTitle, page.id, savedTitle, savingTitle, service, t, title, updateMeta])

    const toggleFavorite = useCallback(async () => {
        const previous = favorite
        setFavorite(!previous)
        try {
            if (previous) await service.pages.unfavoritePage(page.id)
            else await service.pages.favoritePage(page.id)
        } catch (error) {
            console.error('Failed to update favorite state:', error)
            setFavorite(previous)
            toast.error(t('favorites.updateFailed', 'Failed to update favorite'))
        }
    }, [favorite, page.id, service, t])

    const copyLink = useCallback(async () => {
        try {
            await window.navigator.clipboard.writeText(`${window.location.origin}/space-detail/${spaceId}/page/edit/${page.id}`)
            toast.success(t('editor.linkCopied', 'Link copied'))
        } catch (error) {
            console.error('Failed to copy page link:', error)
            toast.error(t('editor.linkCopyFailed', 'Failed to copy link'))
        }
    }, [page.id, spaceId, t])

    const moveToTrash = useCallback(async () => {
        try {
            await service.pages.movePageToTrash(page.id)
            navigator.go({ to: `/space-detail/${spaceId}` })
        } catch (error) {
            console.error('Failed to move component page to trash:', error)
            toast.error(t('editor.moveToTrashFailed', 'Failed to move to trash'))
        }
    }, [navigator, page.id, service, spaceId, t])

    return (
        <div className="flex h-full w-full flex-col bg-background">
            <header className="flex h-11 shrink-0 items-center justify-between border-b px-1">
                <div className="min-w-0 flex-1 overflow-hidden px-1 text-sm">
                    <PageBreadcrumb
                        currentPageId={page.id}
                        pageTree={(page as any).parents}
                        spaceId={spaceId}
                        currentTitle={savedTitle}
                    />
                </div>
                <div className="flex shrink-0 items-center gap-1 px-1">
                    <SharePanel pageTitle={savedTitle}>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground">
                            <UserPlus className="h-3.5 w-3.5" />
                            <span className="hidden text-xs sm:inline">{t('editor.share', 'Share')}</span>
                        </Button>
                    </SharePanel>
                    <Separator orientation="vertical" className="h-5" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => void toggleFavorite()}
                        title={favorite ? t('favorites.remove', 'Remove from favorites') : t('favorites.add', 'Add to favorites')}
                    >
                        <Star className={`h-3.5 w-3.5 ${favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void copyLink()} title={t('editor.copyLink', 'Copy link')}>
                        <Link className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => void moveToTrash()} title={t('editor.moveToTrash', 'Move to trash')}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </header>
            <main className="flex min-h-0 flex-1 flex-col overflow-auto">
                <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-8">
                    {editableTitle ? (
                        <input
                            value={title}
                            disabled={savingTitle}
                            onChange={(event) => setTitle(event.target.value)}
                            onBlur={() => void saveTitle()}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') event.currentTarget.blur()
                                if (event.key === 'Escape') {
                                    setTitle(savedTitle)
                                    event.currentTarget.blur()
                                }
                            }}
                            className="mb-6 w-full bg-transparent text-3xl font-bold tracking-tight outline-none disabled:opacity-60"
                            aria-label={t('page.title', 'Page title')}
                        />
                    ) : (
                        <h1 className="mb-6 text-3xl font-bold tracking-tight">{savedTitle}</h1>
                    )}
                    <div aria-hidden={!active} className="min-h-0 flex-1">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    )
}

const MissingPageType: React.FC<{ page: PageRecord; spaceId: string; active: boolean }> = ({ page, spaceId, active }) => {
    const { t } = useTranslation()
    const copyType = async () => {
        try {
            await window.navigator.clipboard.writeText(page.pageType ?? '')
            toast.success(t('page.typeCopied', 'Page type copied'))
        } catch {
            toast.error(t('page.typeCopyFailed', 'Failed to copy page type'))
        }
    }

    return (
        <ComponentPageFrame page={page} spaceId={spaceId} active={active}>
            <div className="flex h-full items-center justify-center p-6">
                <div className="flex max-w-xl flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
                    <Puzzle className="h-10 w-10 text-muted-foreground" />
                    <div>
                        <h2 className="font-semibold">{t('page.rendererUnavailable', 'Page renderer unavailable')}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t('page.rendererUnavailableDescription', 'The plugin that provides this page type may be disabled, missing, or incompatible.')}
                        </p>
                    </div>
                    <code className="max-w-full overflow-auto rounded bg-muted px-3 py-2 text-xs">{page.pageType}</code>
                    <Button variant="outline" className="gap-2" onClick={() => void copyType()}>
                        <Copy className="h-4 w-4" />
                        {t('page.copyTypeId', 'Copy page type ID')}
                    </Button>
                </div>
            </div>
        </ComponentPageFrame>
    )
}

/** A page in the trash is never handed to an editor renderer. */
const isTrashedStatus = (status?: string | null): boolean => status === 'TRASH' || status === 'DELETED'

export const PageHost: React.FC<PageHostProps> = ({ pageId, spaceId: explicitSpaceId, active = true }) => {
    const service = useSpacePageService()
    const navigator = useNavigator()
    const { t } = useTranslation()
    const { updateMeta } = usePageTabs(explicitSpaceId)
    const [page, setPage] = useState<PageRecord | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    // The page may be trashed while it is open (tree context menu, another tab,
    // another client). The row we loaded says it is live, so the lifecycle
    // change is the only signal that the editor must stop being reachable.
    const [trashed, setTrashed] = useState(false)
    const [restoring, setRestoring] = useState(false)
    const [reloadKey, setReloadKey] = useState(0)
    const pageType = usePageType(page?.pageType)

    // "The page the user is looking at" is the page surface's signal, not the
    // editor's. This component is what every page route renders through, so it
    // is also what plugin page types (no `PageEditor`), loading states and the
    // trashed-page notice publish from — the agent must know which page the user
    // means even when there is no document editor to bind to. Published as soon
    // as the ids are known (the title follows when the record loads), withdrawn
    // while the page is trashed or the tab is backgrounded.
    usePublishPageContext(
        pageId
            ? {
                pageId,
                spaceId: explicitSpaceId ?? page?.spaceId,
                title: page?.title,
                parentId: page?.parentId,
            }
            : null,
        active !== false && !trashed,
    )

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(false)
        service.pages.getPage(pageId)
            .then((record) => {
                if (cancelled) return
                setPage(record)
                updateMeta(pageId, {
                    title: record.title,
                    icon: (record.icon as any)?.type === 'IMAGE' ? undefined : (record.icon as any)?.icon,
                })
            })
            .catch((loadError) => {
                if (cancelled) return
                // The backend refuses trashed pages with PAGE_IN_TRASH (the
                // status is no longer part of the payload once the read guard is
                // authoritative). Turn that into the restore state instead of a
                // broken editor; the request layer already toasted the reason.
                if (isPageInTrashError(loadError)) {
                    setTrashed(true)
                    setError(false)
                    return
                }
                console.error('Failed to load page host metadata:', loadError)
                setError(true)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
    }, [pageId, reloadKey, service, updateMeta])

    useEffect(() => {
        // The component is reused across page switches: never carry the previous
        // page's trashed state into the next one.
        setTrashed(false)
        setRestoring(false)
    }, [pageId])

    useEffect(() => {
        const isThisPage = (eventPageId: unknown) => String(eventPageId) === String(pageId)
        const unsubscribers = [
            service.changes.subscribe('page.trashed', ({ payload }) => {
                if (isThisPage(payload.pageId)) setTrashed(true)
            }),
            service.changes.subscribe('page.deleted', ({ payload }) => {
                if (isThisPage(payload.pageId)) setTrashed(true)
            }),
            service.changes.subscribe('page.restoredFromTrash', ({ payload }) => {
                if (!isThisPage(payload.pageId)) return
                setTrashed(false)
                setReloadKey((key) => key + 1)
            }),
        ]
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
    }, [pageId, service])

    const handleRestore = useCallback(async () => {
        if (restoring) return
        setRestoring(true)
        try {
            await service.pages.restorePageFromTrash(pageId)
            // The restore event above also refreshes the record; this keeps the
            // button responsive even if the stream has no subscriber yet.
            setTrashed(false)
            setReloadKey((key) => key + 1)
            toast.success(t('editor.trash.restoreSuccess', 'Page restored'))
        } catch (restoreError) {
            console.error('Failed to restore page from trash:', restoreError)
            toast.error(t('editor.trash.restoreFailed', 'Failed to restore the page'))
        } finally {
            setRestoring(false)
        }
    }, [pageId, restoring, service, t])

    const handleBackToSpace = useCallback(() => {
        const targetSpaceId = explicitSpaceId ?? page?.spaceId
        if (targetSpaceId) navigator.go({ to: `/space-detail/${targetSpaceId}` })
    }, [explicitSpaceId, navigator, page?.spaceId])

    // A trashed page must not open like a normal one. Two ways in: the loaded
    // row still carries the status (older backends, in-memory event state), or
    // the backend refused the read with PAGE_IN_TRASH (the authoritative gate).
    // This sits before the generic error branch because the refused read leaves
    // `page` null but is not an error the user should see as "broken".
    if (trashed || isTrashedStatus(page?.status)) {
        return (
            <TrashedPageNotice
                pageTitle={page?.title}
                restoring={restoring}
                onRestore={() => void handleRestore()}
                onBack={handleBackToSpace}
            />
        )
    }

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        )
    }

    if (error || !page) {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border p-8 text-center">
                    <AlertCircle className="h-9 w-9 text-destructive" />
                    <p className="font-medium">Failed to load page</p>
                </div>
            </div>
        )
    }

    const spaceId = explicitSpaceId ?? page.spaceId
    if (!spaceId) return null

    const readOnly = page.permission != null && !hasPermission(page.permission, 'WRITE')

    if (!page.pageType) {
        return <PageEditor pageId={pageId} spaceId={spaceId} active={active} initialPage={page} readOnly={readOnly} />
    }

    if (!pageType) {
        return <MissingPageType page={page} spaceId={spaceId} active={active} />
    }

    if (pageType.renderer.type === 'editor-component') {
        return (
            <PageEditor
                pageId={pageId}
                spaceId={spaceId}
                active={active}
                initialPage={page}
                presentation="component"
                readOnly={readOnly}
            />
        )
    }

    const Component = pageType.renderer.component

    return (
        <ComponentPageFrame page={page} pageType={pageType} spaceId={spaceId} active={active} editableTitle={!readOnly}>
            <PluginPageBoundary pageType={pageType}>
                <Component
                    page={page}
                    pageId={page.id}
                    spaceId={spaceId}
                    active={active}
                    readOnly={readOnly}
                    mode={readOnly ? 'view' : 'edit'}
                />
            </PluginPageBoundary>
        </ComponentPageFrame>
    )
}
